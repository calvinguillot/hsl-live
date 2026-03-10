import { PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/public';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { buildBatchRouteQuery, buildRouteStopsQuery } from './queries/route';
import type { VehicleEntity, RouteDetails } from './types';
import { CapacitorHttp, Capacitor } from '@capacitor/core';

// Determine if we are running natively (Android/iOS)
const isNative = Capacitor.isNativePlatform();
const isDev = import.meta.env.DEV;

// Base URLs
// Native: Direct API access (CapacitorHttp handles CORS)
// Web Dev: Proxy via Vite (see vite.config.ts)
// Web Prod: Direct API access (might fail if API doesn't support CORS, consider a proxy if needed)
// Note: HSL Realtime API and Digitransit API generally require CORS handling or proxy for browser.
// For GitHub Pages (Prod), we might need a CORS proxy if the API doesn't support it.
// Using a public CORS proxy as a fallback for demo purposes in prod web.
const CORS_PROXY = 'https://corsproxy.io/?';

const HSL_BASE = isNative
	? 'https://realtime.hsl.fi'
	: isDev
		? '/api/hsl'
		: `${CORS_PROXY}https://realtime.hsl.fi`;

const DIGITRANSIT_BASE = isNative
	? 'https://api.digitransit.fi'
	: isDev
		? '/api/digitransit'
		: `${CORS_PROXY}https://api.digitransit.fi`;

const HSL_VEHICLE_POSITIONS_URL = `${HSL_BASE}/realtime/vehicle-positions/v2/hsl`;
const DIGITRANSIT_ROUTING_URL = `${DIGITRANSIT_BASE}/routing/v2/hsl/gtfs/v1`;

export async function fetchVehicles(): Promise<VehicleEntity[]> {
	if (isNative) {
		// Native: Use CapacitorHttp
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
		if (typeof response.data === 'string') {
			const binaryString = atob(response.data);
			const len = binaryString.length;
			const bytes = new Uint8Array(len);
			for (let i = 0; i < len; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			uint8Array = bytes;
		} else {
			uint8Array = new Uint8Array(response.data);
		}

		const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(uint8Array);
		// @ts-ignore
		return feed.toJSON().entity ?? [];
	} else {
		// Web: Use fetch (with proxy in dev)
		const response = await fetch(HSL_VEHICLE_POSITIONS_URL, {
			headers: {
				'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch vehicle positions: ${response.status}`);
		}

		const buffer = await response.arrayBuffer();
		const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
		// @ts-ignore
		return feed.toJSON().entity ?? [];
	}
}

export async function fetchRoutes(routeIds: string[]): Promise<Record<string, RouteDetails>> {
	if (routeIds.length === 0) return {};

	const uniqueIds = [...new Set(routeIds)];
	const query = buildBatchRouteQuery(uniqueIds);

	if (isNative) {
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
	} else {
		const response = await fetch(DIGITRANSIT_ROUTING_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/graphql',
				'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
			},
			body: query
		});

		if (!response.ok) {
			const text = await response.text();
			console.error('Digitransit API error:', response.status, text);
			throw new Error(`Failed to fetch route details: ${response.status}`);
		}

		const data = await response.json();
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
}

export async function fetchRouteStops(
	routeId: string
): Promise<{ gtfsId: string; name: string; lat: number; lon: number }[]> {
	if (!routeId) return [];

	const query = buildRouteStopsQuery(routeId);

	if (isNative) {
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
	} else {
		const response = await fetch(DIGITRANSIT_ROUTING_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/graphql',
				'digitransit-subscription-key': PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY
			},
			body: query
		});

		if (!response.ok) {
			const text = await response.text();
			console.error('Digitransit API error:', response.status, text);
			throw new Error(`Failed to fetch route stops: ${response.status}`);
		}

		const data = await response.json();
		// @ts-ignore
		const stops = data.data?.route?.stops ?? [];
		return stops;
	}
}
