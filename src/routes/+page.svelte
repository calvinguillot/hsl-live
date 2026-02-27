<script lang="ts">
	import { onMount } from 'svelte';
	import type { MapMouseEvent } from 'maplibre-gl';
	import { MapLibre, GeoJSONSource, SymbolLayer, CircleLayer, ImageLoader } from 'svelte-maplibre-gl';
	import { generateVehicleIcons } from '$lib/map-icons';

	type VehicleEntity = {
		id: string;
		vehicle: {
			trip: {
				routeId: string;
				startTime: string;
				startDate: string;
				directionId: number;
				scheduleRelationship: string;
			};
			position: {
				latitude: number;
				longitude: number;
				bearing: number;
				speed: number;
				odometer: number;
			};
			currentStatus: string;
			timestamp: string;
			stopId: string;
			vehicle: {
				id: string;
			};
		};
	};

	type RouteDetails = {
		gtfsId: string;
		shortName: string;
		longName: string;
		mode: string;
	};

	type StopDetails = {
		gtfsId: string;
		name: string;
		lat: number;
		lon: number;
	};

	const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

	let vehicles = $state<VehicleEntity[]>([]);
	let routeCache = $state<Record<string, RouteDetails>>({});
	let loading = $state(true);
	let errorMsg = $state('');
	let view = $state<'map' | 'table'>('map');

	let expandedId = $state<string | null>(null);
	let stopDetails = $state<Record<string, StopDetails>>({});
	let routeLoading = $state<Record<string, boolean>>({});

	let selectedRouteStops = $state<{ gtfsId: string; name: string; lat: number; lon: number }[]>([]);
	let selectedRouteId = $state<string | null>(null);
	let stopsLoading = $state(false);

	let modeIcons = $state<Record<string, string>>({});

	let geojsonData = $derived.by(() => {
		const features = vehicles
			.filter(
				(e) => e.vehicle?.position?.latitude != null && e.vehicle?.position?.longitude != null
			)
			.map((e) => {
				const routeId = e.vehicle?.trip?.routeId ?? '';
				const route = routeCache[routeId];
			const mode = route?.mode ?? 'default';
			const shortName = route?.shortName ?? '';
			const stopped = e.vehicle?.currentStatus === 'STOPPED_AT';
			const iconKey = `${mode}_${shortName}${stopped ? '_stopped' : ''}`;
			return {
				type: 'Feature' as const,
				geometry: {
					type: 'Point' as const,
					coordinates: [e.vehicle!.position!.longitude, e.vehicle!.position!.latitude]
				},
				properties: {
					id: e.id,
					mode,
					shortName: shortName || '?',
					iconKey,
					bearing: e.vehicle?.position?.bearing ?? 0,
					routeId
				}
				};
			});
		return { type: 'FeatureCollection' as const, features };
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

	$effect(() => {
		if (typeof document === 'undefined') return;
		const entries = vehicles
			.filter(
				(e) =>
					e.vehicle?.position?.latitude != null &&
					e.vehicle?.position?.longitude != null
			)
			.map((e) => {
				const routeId = e.vehicle?.trip?.routeId ?? '';
				const route = routeCache[routeId];
				const mode = route?.mode ?? 'default';
				const shortName = route?.shortName ?? '';
				return { mode, shortName };
			});
		const unique = Array.from(
			new Map(entries.map((e) => [`${e.mode}_${e.shortName}`, e])).values()
		);
		if (unique.length === 0) {
			unique.push({ mode: 'default', shortName: '' });
		}
		modeIcons = generateVehicleIcons(unique);
	});

	onMount(() => {
		async function fetchVehicles(): Promise<VehicleEntity[]> {
			const res = await fetch('/api/vehicles');
			if (!res.ok) throw new Error(`API error: ${res.status}`);
			const data = await res.json();
			return data.entity ?? [];
		}

		async function fetchRoutes(routeIds: string[]) {
			if (routeIds.length === 0) return;
			const res = await fetch('/api/routes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ routeIds })
			});
			if (!res.ok) return;
			const data = await res.json();
			routeCache = { ...routeCache, ...data };
		}

		async function loadInitial() {
			try {
				const list = await fetchVehicles();
				vehicles = list;

				const routeIds = [
					...new Set(list.map((e) => e.vehicle?.trip?.routeId).filter(Boolean))
				] as string[];
				await fetchRoutes(routeIds);
			} catch (err) {
				errorMsg = `Failed to load: ${err}`;
			} finally {
				loading = false;
			}
		}

		loadInitial();

		const interval = setInterval(async () => {
			try {
				const list = await fetchVehicles();
				vehicles = list;

				const cachedIds = new Set(Object.keys(routeCache));
				const newIds = list
					.map((e) => e.vehicle?.trip?.routeId)
					.filter((id): id is string => Boolean(id) && !cachedIds.has(id ?? ''));
				const uniqueNew = [...new Set(newIds)];
				if (uniqueNew.length > 0) {
					await fetchRoutes(uniqueNew);
				}
			} catch {
				// ignore refresh errors
			}
		}, 1500);

		return () => clearInterval(interval);
	});

	async function toggleVehicle(entity: VehicleEntity) {
		const id = entity.id;

		if (expandedId === id) {
			expandedId = null;
			return;
		}

		expandedId = id;

		const routeId = entity.vehicle?.trip?.routeId;
		const stopId = entity.vehicle?.stopId;

		if (routeId && !routeCache[routeId]) {
			const route = await fetchRoute(routeId);
			if (route) routeCache = { ...routeCache, [routeId]: route };
		}

		if (stopId && !stopDetails[id]) {
			routeLoading[id] = true;
			try {
				const res = await fetch('/api/stop', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ stopId })
				});
				const data = await res.json();
				if (data.data?.stop) stopDetails[id] = data.data.stop;
			} catch (err) {
				console.error('Failed to fetch stop details:', err);
			} finally {
				routeLoading[id] = false;
			}
		}
	}

	async function fetchRoute(routeId: string): Promise<RouteDetails | undefined> {
		const res = await fetch('/api/route', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ routeId })
		});
		const data = await res.json();
		return data.data?.route;
	}

	function formatSpeed(speed: number | undefined): string {
		if (speed == null) return '—';
		return `${(speed * 3.6).toFixed(0)} km/h`;
	}

	function modeLabel(mode: string | undefined): string {
		switch (mode) {
			case 'BUS':
				return 'Bus';
			case 'TRAM':
				return 'Tram';
			case 'RAIL':
				return 'Rail';
			case 'SUBWAY':
				return 'Metro';
			case 'FERRY':
				return 'Ferry';
			default:
				return mode ?? '—';
		}
	}

	function getRouteForEntity(entity: VehicleEntity): RouteDetails | undefined {
		return routeCache[entity.vehicle?.trip?.routeId ?? ''];
	}

	async function handleMapClick(ev: MapMouseEvent) {
		const features = ev.target.queryRenderedFeatures(ev.point, {
			layers: ['vehicle-icons', 'vehicle-labels']
		});
		if (features.length === 0) {
			selectedRouteStops = [];
			selectedRouteId = null;
			return;
		}
		const routeId = features[0].properties?.routeId as string | undefined;
		if (!routeId) return;
		if (selectedRouteId === routeId) {
			selectedRouteStops = [];
			selectedRouteId = null;
			return;
		}
		selectedRouteId = routeId;
		stopsLoading = true;
		try {
			const res = await fetch('/api/route-stops', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ routeId })
			});
			const data = await res.json();
			selectedRouteStops = Array.isArray(data) ? data : [];
		} catch (err) {
			console.error('Failed to fetch route stops:', err);
			selectedRouteStops = [];
		} finally {
			stopsLoading = false;
		}
	}
</script>

<div class="flex h-screen flex-col">
	<header class="flex items-center justify-between border-b border-gray-700 px-4 py-2">
		<h1 class="text-xl font-bold text-white">HSL Live Vehicle Tracker</h1>
		<div class="flex gap-2">
			<button
				class="rounded px-3 py-1.5 text-sm font-medium transition {view === 'map'
					? 'bg-blue-600 text-white'
					: 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
				onclick={() => (view = 'map')}
			>
				Map
			</button>
			<button
				class="rounded px-3 py-1.5 text-sm font-medium transition {view === 'table'
					? 'bg-blue-600 text-white'
					: 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
				onclick={() => (view = 'table')}
			>
				Table
			</button>
		</div>
	</header>

	{#if loading}
		<div class="flex flex-1 items-center justify-center text-gray-400">
			Loading vehicle positions...
		</div>
	{:else if errorMsg}
		<div class="flex flex-1 items-center justify-center text-red-400">{errorMsg}</div>
	{:else if view === 'map'}
		<div class="relative flex-1">
			<MapLibre
				class="h-full w-full"
				style={DARK_STYLE}
				center={{ lng: 24.94, lat: 60.17 }}
				zoom={11}
				onclick={handleMapClick}
			>
				{#if Object.keys(modeIcons).length > 0}
					<ImageLoader images={modeIcons}>
						<GeoJSONSource id="vehicles" data={geojsonData}>
							<SymbolLayer
								id="vehicle-icons"
								layout={{
									'icon-image': ['coalesce', ['get', 'iconKey'], 'default_'],
									'icon-size': 0.6,
									'icon-rotate': ['get', 'bearing'],
									'icon-allow-overlap': true,
									'icon-ignore-placement': true,
									'icon-anchor': 'center'
								}}
							/>
							<SymbolLayer
								id="vehicle-labels"
								layout={{
									'text-field': ['get', 'shortName'],
									'text-size': 11,
									'text-anchor': 'center',
									'text-allow-overlap': true,
									'text-ignore-placement': true
								}}
								paint={{
									'text-color': '#ffffff'
								}}
							/>
						</GeoJSONSource>
					</ImageLoader>
				{/if}
				{#if routeStopsGeoJSON.features.length > 0}
					<GeoJSONSource id="route-stops" data={routeStopsGeoJSON}>
						<CircleLayer
							id="route-stops-circles"
							paint={{
								'circle-radius': 5,
								'circle-color': '#ffffff',
								'circle-opacity': 0.8,
								'circle-stroke-width': 1,
								'circle-stroke-color': '#333333'
							}}
						/>
					</GeoJSONSource>
				{/if}
			</MapLibre>
			<div class="absolute bottom-2 left-2 space-y-1">
				<div class="rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-300">
					{vehicles.length} vehicles · refreshes every 2s
				</div>
				{#if stopsLoading}
					<div class="rounded bg-gray-900/80 px-2 py-1 text-xs text-blue-400">
						Loading stops...
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="flex-1 overflow-auto p-4">
			<p class="mb-4 text-sm text-gray-400">
				{vehicles.length} vehicles — click a row to fetch route/stop details
			</p>

			<table class="w-full border-collapse text-sm text-gray-200">
				<thead>
					<tr class="border-b border-gray-700 text-left text-gray-400">
						<th class="p-2">Vehicle ID</th>
						<th class="p-2">Route</th>
						<th class="p-2">Status</th>
						<th class="p-2">Speed</th>
						<th class="p-2">Lat</th>
						<th class="p-2">Lng</th>
					</tr>
				</thead>
				<tbody>
					{#each vehicles as entity (entity.id)}
						{@const v = entity.vehicle}
						<tr
							class="cursor-pointer border-b border-gray-800 hover:bg-gray-800/50"
							onclick={() => toggleVehicle(entity)}
						>
							<td class="p-2 font-mono text-xs">{v?.vehicle?.id ?? '—'}</td>
							<td class="p-2 font-semibold">{v?.trip?.routeId ?? '—'}</td>
							<td class="p-2">{v?.currentStatus ?? '—'}</td>
							<td class="p-2">{formatSpeed(v?.position?.speed)}</td>
							<td class="p-2 font-mono text-xs">{v?.position?.latitude?.toFixed(5) ?? '—'}</td>
							<td class="p-2 font-mono text-xs">{v?.position?.longitude?.toFixed(5) ?? '—'}</td>
						</tr>

						{#if expandedId === entity.id}
							<tr class="border-b border-gray-800 bg-gray-900/60">
								<td colspan="6" class="p-3">
									{#if routeLoading[entity.id]}
										<p class="text-gray-400">Loading stop details...</p>
									{:else}
										{@const route = getRouteForEntity(entity)}
										{#if route}
											<div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
												<div><span class="text-gray-500">GTFS ID:</span> {route.gtfsId}</div>
												<div><span class="text-gray-500">Short Name:</span> {route.shortName}</div>
												<div><span class="text-gray-500">Mode:</span> {modeLabel(route.mode)}</div>
												<div class="col-span-2">
													<span class="text-gray-500">Route:</span>
													{route.longName}
												</div>
											</div>

											<div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-400">
												<div>Start: {v?.trip?.startTime} ({v?.trip?.startDate})</div>
												<div>Direction: {v?.trip?.directionId}</div>
												<div>
													Stop: {#if stopDetails[entity.id]}
														{stopDetails[entity.id].name} ({v?.stopId})
													{:else}
														{v?.stopId ?? '—'}
													{/if}
												</div>
												<div>Bearing: {v?.position?.bearing ?? '—'}°</div>
											</div>
										{:else}
											<p class="text-gray-500">No route details available.</p>
										{/if}
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
