import { PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/public';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { buildBatchRouteQuery, buildRouteStopsQuery } from './queries/route';
import type { VehicleEntity, RouteDetails } from './types';
import { CapacitorHttp } from '@capacitor/core';

const HSL_VEHICLE_POSITIONS_URL = 'https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl';
const DIGITRANSIT_ROUTING_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

export async function fetchVehicles(): Promise<VehicleEntity[]> {
	// Use CapacitorHttp to bypass CORS on native
	const response = await CapacitorHttp.get({
		url: HSL_VEHICLE_POSITIONS_URL,
		headers: {
			'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
		},
		responseType: 'arraybuffer'
	});

	if (response.status !== 200) {
		throw new Error(`Failed to fetch vehicle positions: ${response.status}`);
	}

	let uint8Array: Uint8Array;
	// On native (and sometimes web depending on version), arraybuffer response is base64 string
	if (typeof response.data === 'string') {
		const binaryString = atob(response.data);
		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		uint8Array = bytes;
	} else {
		// If it's already an object/buffer (e.g. on some web environments)
		// Note: CapacitorHttp on web might still use fetch and return ArrayBuffer directly
		// but the plugin interface usually normalizes to base64 for consistency if possible,
		// or returns the raw object.
		// Safe fallback:
		uint8Array = new Uint8Array(response.data);
	}

	const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(uint8Array);
	// @ts-ignore - toJSON returns a plain object that matches our VehicleEntity structure roughly
	return feed.toJSON().entity ?? [];
}

export async function fetchRoutes(routeIds: string[]): Promise<Record<string, RouteDetails>> {
	if (routeIds.length === 0) return {};

	const uniqueIds = [...new Set(routeIds)];
	const query = buildBatchRouteQuery(uniqueIds);

	const response = await CapacitorHttp.post({
		url: DIGITRANSIT_ROUTING_URL,
		headers: {
			'Content-Type': 'application/graphql',
			'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
		},
		data: query
	});

	if (response.status !== 200) {
		console.error('Digitransit API error:', response.status, response.data);
		throw new Error(`Failed to fetch route details: ${response.status}`);
	}

	const data = response.data;
	const result: Record<string, RouteDetails> = {};

	for (const id of uniqueIds) {
		const key = `r_${id}`;
		// @ts-ignore
		const route = data.data?.[key];
		if (route) {
			result[id] = route;
		}
	}

	return result;
}

export async function fetchRouteStops(
	routeId: string
): Promise<{ gtfsId: string; name: string; lat: number; lon: number }[]> {
	if (!routeId) return [];

	const query = buildRouteStopsQuery(routeId);

	const response = await CapacitorHttp.post({
		url: DIGITRANSIT_ROUTING_URL,
		headers: {
			'Content-Type': 'application/graphql',
			'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
		},
		data: query
	});

	if (response.status !== 200) {
		console.error('Digitransit API error:', response.status, response.data);
		throw new Error(`Failed to fetch route stops: ${response.status}`);
	}

	const data = response.data;
	// @ts-ignore
	const stops = data.data?.route?.stops ?? [];
	return stops;
}
