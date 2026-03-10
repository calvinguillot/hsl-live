<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Capacitor } from '@capacitor/core';
	import { Geolocation } from '@capacitor/geolocation';
	import type { MapMouseEvent } from 'maplibre-gl';
	import type { Map } from 'maplibre-gl';
	import { MapLibre, GeoJSONSource, CircleLayer } from 'svelte-maplibre-gl';
	import VehicleLayer from '$lib/components/VehicleLayer.svelte';
	import VehicleTypeFilter from '$lib/components/VehicleTypeFilter.svelte';
	import { Locate, LocateFixed } from 'lucide-svelte';
	import { CIRCLE_RADIUS } from '$lib/map-icons';
	import type { VehicleEntity, RouteDetails } from '$lib/types';
	import * as api from '$lib/api';

	const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
	const LOCATION_ZOOM = 13;
	// User location: 50% of vehicle circle size, same style (fill + visible border)
	const ICON_SCALE = 0.6;
	const USER_CIRCLE_RADIUS = CIRCLE_RADIUS * ICON_SCALE * 0.5;
	const USER_CIRCLE_STROKE_WIDTH = 2;

	let vehicles = $state<VehicleEntity[]>([]);
	let enabledModes = $state<Record<string, boolean>>({
		BUS: true,
		TRAM: true,
		SUBWAY: true,
		RAIL: true,
		FERRY: true,
		default: true
	});
	let routeCache = $state<Record<string, RouteDetails>>({});
	let loading = $state(true);
	let errorMsg = $state('');

	let selectedRouteStops = $state<{ gtfsId: string; name: string; lat: number; lon: number }[]>([]);
	let selectedRouteId = $state<string | null>(null);
	let stopsLoading = $state(false);

	// User location: requested from browser, updated every refreshTime
	let userLocation = $state<{ lat: number; lng: number } | null>(null);
	let locationGranted = $state(false);
	let locationRequesting = $state(false);
	let locationPulseIcon = $state(false);
	let mapInstance = $state<Map | undefined>(undefined);
	let initialCenterDone = $state(false);

	const refreshTime = 1500;
	const LOCATION_REFRESH_MS = 30_000; // 30s – much slower than vehicle API
	const DEFAULT_CENTER = { lng: 24.94, lat: 60.17 };
	const PULSE_INTERVAL = 400;

	async function getCurrentLocation(options?: {
		maximumAge?: number;
	}): Promise<{ lat: number; lng: number } | null> {
		const maximumAge = options?.maximumAge ?? 0;
		try {
			if (Capacitor.getPlatform() === 'web') {
				return new Promise((resolve) => {
					if (!navigator.geolocation) {
						resolve(null);
						return;
					}
					navigator.geolocation.getCurrentPosition(
						(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
						() => resolve(null), // Silently ignore errors (e.g. timeout)
						{ enableHighAccuracy: true, timeout: 10000, maximumAge }
					);
				});
			}
			const permissionStatus = await Geolocation.checkPermissions();
			if (permissionStatus.location !== 'granted') {
				const request = await Geolocation.requestPermissions();
				if (request.location !== 'granted') return null;
			}
			const pos = await Geolocation.getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge
			});
			return { lat: pos.coords.latitude, lng: pos.coords.longitude };
		} catch {
			return null;
		}
	}

	function centerMapOnUser(loc: { lat: number; lng: number }, zoom = LOCATION_ZOOM) {
		mapInstance?.flyTo({ center: [loc.lng, loc.lat], zoom, bearing: 0 });
	}

	async function requestLocation() {
		locationRequesting = true;
		const loc = await getCurrentLocation();
		locationRequesting = false;
		if (loc) {
			locationGranted = true;
			userLocation = loc;
			centerMapOnUser(loc);
		}
	}

	$effect(() => {
		if (!locationRequesting) return;
		const intervalId = setInterval(() => {
			locationPulseIcon = !locationPulseIcon;
		}, PULSE_INTERVAL);
		return () => clearInterval(intervalId);
	});

	$effect(() => {
		if (!locationGranted) return;
		const intervalId = setInterval(async () => {
			const loc = await getCurrentLocation({
				maximumAge: LOCATION_REFRESH_MS
			});
			if (loc) userLocation = loc;
		}, LOCATION_REFRESH_MS);
		return () => clearInterval(intervalId);
	});

	// Center map on user location when map is ready and we have initial location
	$effect(() => {
		if (initialCenterDone || !mapInstance || !userLocation) return;
		initialCenterDone = true;
		centerMapOnUser(userLocation);
	});

	let routeStopsGeoJSON = $derived.by(() => {
		const features = selectedRouteStops
			.filter((s) => s.lat != null && s.lon != null)
			.map((s) => ({
				type: 'Feature' as const,
				geometry: {
					type: 'Point' as const,
					coordinates: [s.lon, s.lat]
				},
				properties: { gtfsId: s.gtfsId, name: s.name }
			}));
		return { type: 'FeatureCollection' as const, features };
	});

	let userLocationGeoJSON = $derived.by(() => {
		if (!userLocation) return { type: 'FeatureCollection' as const, features: [] };
		return {
			type: 'FeatureCollection' as const,
			features: [
				{
					type: 'Feature' as const,
					geometry: {
						type: 'Point' as const,
						coordinates: [userLocation.lng, userLocation.lat]
					},
					properties: {}
				}
			]
		};
	});

	onMount(() => {
		// Fetch user location on launch (runs in parallel with vehicle data)
		getCurrentLocation().then((loc) => {
			if (loc) {
				locationGranted = true;
				userLocation = loc;
			}
		});

		async function loadInitial() {
			try {
				const list = await api.fetchVehicles();
				vehicles = list;

				const routeIds = [
					...new Set(list.map((e) => e.vehicle?.trip?.routeId).filter(Boolean))
				] as string[];
				const routes = await api.fetchRoutes(routeIds);
				routeCache = { ...routeCache, ...routes };
			} catch (err) {
				errorMsg = `Failed to load: ${err}`;
			} finally {
				loading = false;
			}
		}

		loadInitial();

		const interval = setInterval(async () => {
			try {
				const list = await api.fetchVehicles();
				vehicles = list;

				const cachedIds = new Set(Object.keys(routeCache));
				const newIds = list
					.map((e) => e.vehicle?.trip?.routeId)
					.filter((id): id is string => Boolean(id) && !cachedIds.has(id ?? ''));
				const uniqueNew = [...new Set(newIds)];
				if (uniqueNew.length > 0) {
					const routes = await api.fetchRoutes(uniqueNew);
					routeCache = { ...routeCache, ...routes };
				}
			} catch {
				// ignore refresh errors
			}
		}, refreshTime);

		return () => clearInterval(interval);
	});

	async function handleMapClick(ev: MapMouseEvent) {
		const features = ev.target.queryRenderedFeatures(ev.point, {
			layers: ['vehicle-circles', 'vehicle-arrows']
		});
		if (features.length === 0) {
			selectedRouteId = null;
			return;
		}
		const routeId = features[0].properties?.routeId as string | undefined;
		if (!routeId) return;
		if (selectedRouteId === routeId) {
			selectedRouteId = null;
			return;
		}
		selectedRouteStops = [];
		selectedRouteId = routeId;
		stopsLoading = true;
		try {
			selectedRouteStops = await api.fetchRouteStops(routeId);
		} catch (err) {
			console.error('Failed to fetch route stops:', err);
			selectedRouteStops = [];
		} finally {
			stopsLoading = false;
		}
	}
</script>

{#if loading}
	<div class="flex h-screen items-center justify-center text-gray-400">Loading...</div>
{:else if errorMsg}
	<div class="flex h-screen items-center justify-center text-red-400">{errorMsg}</div>
{:else}
	<div class="relative h-screen">
		<!-- <h1
			class="absolute top-4 left-4 z-50 flex items-center gap-2 rounded-lg p-2 text-xl font-bold text-white backdrop-blur"
		>
			<img src="/icon.webp" alt="" class="h-8 w-8 shrink-0 rounded-full object-cover" />
			HSL-Live
		</h1> -->
		<!-- Desktop: right sidebar with vertical filter + location -->
		<div class="absolute top-0 right-4 bottom-0 z-50 hidden flex-col items-center md:flex">
			<div class="flex flex-1 items-center justify-center">
				<VehicleTypeFilter bind:enabledModes />
			</div>
			<div class="mb-12 rounded-lg bg-black/20 p-2 backdrop-blur">
				<button
					type="button"
					class="flex items-center justify-center rounded p-1 text-white transition-opacity hover:opacity-90"
					aria-label={locationRequesting
						? 'Getting location...'
						: locationGranted
							? 'Location on'
							: 'Locate me'}
					onclick={requestLocation}
				>
					{#if locationRequesting}
						{#if locationPulseIcon}
							<LocateFixed size={28} strokeWidth={2} />
						{:else}
							<Locate size={28} strokeWidth={2} />
						{/if}
					{:else if locationGranted}
						<LocateFixed size={28} strokeWidth={2} />
					{:else}
						<Locate size={28} strokeWidth={2} />
					{/if}
				</button>
			</div>
		</div>

		<!-- Mobile: bottom pill bar with filter icons + location button -->
		<div
			class="absolute right-4 bottom-4 left-4 z-50 flex items-center justify-center gap-3 md:hidden"
		>
			<VehicleTypeFilter bind:enabledModes />
			<div class="rounded-full bg-black/20 p-2 backdrop-blur">
				<button
					type="button"
					class="flex items-center justify-center rounded p-1 text-white transition-opacity hover:opacity-90"
					aria-label={locationRequesting
						? 'Getting location...'
						: locationGranted
							? 'Location on'
							: 'Locate me'}
					onclick={requestLocation}
				>
					{#if locationRequesting}
						{#if locationPulseIcon}
							<LocateFixed size={28} strokeWidth={2} />
						{:else}
							<Locate size={28} strokeWidth={2} />
						{/if}
					{:else if locationGranted}
						<LocateFixed size={28} strokeWidth={2} />
					{:else}
						<Locate size={28} strokeWidth={2} />
					{/if}
				</button>
			</div>
		</div>
		<div class="flex flex-1 items-center justify-center"></div>
		<MapLibre
			bind:map={mapInstance}
			class="h-full w-full"
			style={DARK_STYLE}
			center={DEFAULT_CENTER}
			zoom={11.5}
			onclick={handleMapClick}
		>
			<GeoJSONSource id="route-stops" data={routeStopsGeoJSON}>
				<CircleLayer
					id="route-stops-circles"
					paint={{
						'circle-radius': 5,
						'circle-color': '#ffffff',
						'circle-opacity': selectedRouteId ? 0.8 : 0,
						'circle-opacity-transition': { duration: 300 },
						'circle-stroke-width': 0,
						'circle-stroke-opacity': 0
					}}
				/>
			</GeoJSONSource>
			{#if userLocation}
				<GeoJSONSource id="user-location" data={userLocationGeoJSON}>
					<CircleLayer
						id="user-location-circle"
						paint={{
							'circle-radius': USER_CIRCLE_RADIUS,
							'circle-color': '#facc15',
							'circle-stroke-width': USER_CIRCLE_STROKE_WIDTH,
							'circle-stroke-color': '#ca8a04'
						}}
					/>
				</GeoJSONSource>
			{/if}
			<VehicleLayer {vehicles} {routeCache} {selectedRouteId} {enabledModes} />
		</MapLibre>
		<!-- <div class="absolute bottom-2 left-2 space-y-1">
			<div class="rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-300">
				{vehicles.length} vehicles · Refreshes every {refreshTime / 1000}s
			</div>
			{#if stopsLoading}
				<div class="rounded bg-gray-900/80 px-2 py-1 text-xs text-blue-400">Loading stops...</div>
			{/if}
		</div> -->
	</div>
{/if}
