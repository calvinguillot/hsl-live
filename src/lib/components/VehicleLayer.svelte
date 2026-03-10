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

	let geojsonData = $derived.by(() => {
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
						speed: e.vehicle?.position?.speed ?? 0,
						color
					}
				};
			});

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

	let speedFieldExpr: ExpressionSpecification = $derived.by(() => [
		'concat',
		['to-string', ['round', ['*', ['coalesce', ['get', 'speed'], ['literal', 0]], 3.6]]],
		' km/h'
	] satisfies ExpressionSpecification);

	let textOpacityExpr: ExpressionSpecification = $derived.by(() => {
		if (!selectedRouteId) return ['literal', 0] satisfies ExpressionSpecification;
		return [
			'case',
			['==', ['get', 'routeId'], selectedRouteId],
			['literal', 1],
			['literal', 0]
		] satisfies ExpressionSpecification;
	});
</script>

{#if Object.keys(modeIcons).length > 0}
	<ImageLoader images={modeIcons}>
		<GeoJSONSource id="vehicles" data={geojsonData}>
			<CircleLayer
				id="vehicle-stopped-ring"
				filter={['==', ['get', 'stopped'], true]}
				paint={{
					'circle-radius': VEHICLE_PIXEL_RADIUS + 3,
					'circle-color': ['get', 'color'],
					'circle-opacity': 0,
					'circle-stroke-width': 3,
					'circle-stroke-color': ['get', 'color'],
					'circle-stroke-opacity': 1
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
					'text-color': '#ffffff',
					'text-opacity': textOpacityExpr,
					'text-opacity-transition': { duration: 300 }
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
