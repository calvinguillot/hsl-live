<script lang="ts">
	import type { ExpressionSpecification } from 'maplibre-gl';
	import {
		GeoJSONSource,
		SymbolLayer,
		CircleLayer,
		ImageLoader,
		getMapContext
	} from 'svelte-maplibre-gl';
	import { generateVehicleIcons, MODE_COLORS, CIRCLE_RADIUS } from '$lib/map-icons';
	import type { VehicleEntity, RouteDetails } from '$lib/types';

	const ICON_SCALE = 0.6;
	const VEHICLE_PIXEL_RADIUS = CIRCLE_RADIUS * ICON_SCALE;
	const PULSE_DURATION_MS = 1500;

	let {
		vehicles,
		routeCache,
		selectedRouteId,
		enabledModes = { BUS: true, TRAM: true, SUBWAY: true, RAIL: true, FERRY: true, default: true }
	}: {
		vehicles: VehicleEntity[];
		routeCache: Record<string, RouteDetails>;
		selectedRouteId: string | null;
		enabledModes?: Record<string, boolean>;
	} = $props();

	let modeIcons = $state<Record<string, string>>({});

	const mapCtx = getMapContext();
	const stoppedTimestamps = new Map<string, number>();

	let geojsonData = $derived.by(() => {
		const currentlyStoppedIds = new Set<string>();

		const features = vehicles
			.filter(
				(e) => e.vehicle?.position?.latitude != null && e.vehicle?.position?.longitude != null
			)
			.filter((e) => {
				const routeId = e.vehicle?.trip?.routeId ?? '';
				const route = routeCache[routeId];
				const mode = route?.mode ?? 'default';
				return enabledModes[mode] !== false;
			})
			.map((e) => {
				const routeId = e.vehicle?.trip?.routeId ?? '';
				const route = routeCache[routeId];
				const mode = route?.mode ?? 'default';
				const shortName = route?.shortName ?? '';
				const stopped = e.vehicle?.currentStatus === 'STOPPED_AT';
				const color = MODE_COLORS[mode] ?? '#888888';
				const iconKey = `${mode}_${shortName}`;

				let stoppedSince = 0;
				if (stopped) {
					currentlyStoppedIds.add(e.id);
					if (!stoppedTimestamps.has(e.id)) {
						stoppedTimestamps.set(e.id, performance.now());
					}
					stoppedSince = stoppedTimestamps.get(e.id)!;
				}

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
						routeId,
						stopped,
						stoppedSince,
						speed: e.vehicle?.position?.speed ?? 0,
						color
					}
				};
			});

		for (const id of stoppedTimestamps.keys()) {
			if (!currentlyStoppedIds.has(id)) {
				stoppedTimestamps.delete(id);
			}
		}

		return { type: 'FeatureCollection' as const, features };
	});

	$effect(() => {
		if (typeof document === 'undefined') return;
		const entries = vehicles
			.filter(
				(e) => e.vehicle?.position?.latitude != null && e.vehicle?.position?.longitude != null
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

	$effect(() => {
		let frame: number;
		function animate() {
			const now = performance.now();
			const map = mapCtx.map;
			if (map?.getLayer('vehicle-pulse')) {
				const phase: ExpressionSpecification = [
					'/',
					['%', ['-', now, ['get', 'stoppedSince']], PULSE_DURATION_MS],
					PULSE_DURATION_MS
				];
				map.setPaintProperty('vehicle-pulse', 'circle-radius', [
					'+',
					VEHICLE_PIXEL_RADIUS,
					['*', VEHICLE_PIXEL_RADIUS, phase]
				]);
				map.setPaintProperty('vehicle-pulse', 'circle-opacity', ['*', 0.6, ['-', 1, phase]]);
			}
			frame = requestAnimationFrame(animate);
		}
		frame = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(frame);
	});

	let speedFieldExpr: ExpressionSpecification = $derived.by(() => {
		if (!selectedRouteId) return ['literal', ''] satisfies ExpressionSpecification;
		return [
			'case',
			['==', ['get', 'routeId'], selectedRouteId],
			[
				'concat',
				['to-string', ['round', ['*', ['coalesce', ['get', 'speed'], ['literal', 0]], 3.6]]],
				' km/h'
			],
			['literal', '']
		] satisfies ExpressionSpecification;
	});
</script>

{#if Object.keys(modeIcons).length > 0}
	<ImageLoader images={modeIcons}>
		<GeoJSONSource id="vehicles" data={geojsonData}>
			<CircleLayer
				id="vehicle-pulse"
				filter={['==', ['get', 'stopped'], true]}
				paint={{
					'circle-radius': VEHICLE_PIXEL_RADIUS,
					'circle-color': ['get', 'color'],
					'circle-opacity': 0.6,
					'circle-stroke-width': 0
				}}
			/>
			<SymbolLayer
				id="vehicle-circles"
				layout={{
					'icon-image': ['coalesce', ['get', 'iconKey'], 'default_'],
					'icon-size': ICON_SCALE,
					'icon-allow-overlap': true,
					'icon-ignore-placement': true,
					'icon-anchor': 'center',
					'text-field': speedFieldExpr,
					'text-size': 9,
					'text-offset': [0, 2.2],
					'text-anchor': 'center',
					'text-allow-overlap': true,
					'text-ignore-placement': true
				}}
				paint={{
					'text-color': '#ffffff'
				}}
			/>
			<SymbolLayer
				id="vehicle-arrows"
				layout={{
					'icon-image': ['concat', ['get', 'iconKey'], '_arrow'],
					'icon-size': ICON_SCALE,
					'icon-rotate': ['get', 'bearing'],
					'icon-allow-overlap': true,
					'icon-ignore-placement': true,
					'icon-anchor': 'center'
				}}
			/>
		</GeoJSONSource>
	</ImageLoader>
{/if}
