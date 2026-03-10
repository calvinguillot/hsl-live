import { PUBLIC_DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/public';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { buildBatchRouteQuery, buildRouteStopsQuery } from './queries/route';
import type { VehicleEntity, RouteDetails } from './types';
import { CapacitorHttp, Capacitor } from '@capacitor/core';

// Determine if we are running natively (Android/iOS)
const isNative = Capacitor.isNativePlatform();
const isDev = import.meta.env.DEV;

const HSL_BASE_URL = 'https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl';
const DIGITRANSIT_BASE_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

// List of CORS proxies to try in order
const PROXIES = [
	(url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
	(url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
	(url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

export async function fetchVehicles(): Promise<VehicleEntity[]> {
	if (isNative) {
		// Native: Use CapacitorHttp to bypass CORS
		const response = await CapacitorHttp.get({
			url: HSL_BASE_URL,
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
		// Web Environment
		if (isDev) {
			// Dev: Use local proxy defined in vite.config.ts
			const url = '/api/hsl/realtime/vehicle-positions/v2/hsl';
			const response = await fetch(url, {
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
		} else {
			// Prod Web: Try multiple CORS proxies
			let lastError: any;
			
			// Add timestamp to prevent caching
			const targetUrl = `${HSL_BASE_URL}?_t=${Date.now()}`;

			for (const proxyFactory of PROXIES) {
				try {
					const url = proxyFactory(targetUrl);
					// Note: We DO NOT send the subscription key here because proxies might strip it
					// or HSL might block requests with it coming from known proxy IPs.
					const response = await fetch(url);

					if (!response.ok) {
						console.warn(`Proxy ${url} failed with status ${response.status}`);
						continue;
					}

					const buffer = await response.arrayBuffer();
					if (buffer.byteLength === 0) {
						console.warn(`Proxy ${url} returned empty response`);
						continue;
					}

					const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
					// @ts-ignore
					return feed.toJSON().entity ?? [];
				} catch (err) {
					console.warn(`Proxy failed:`, err);
					lastError = err;
				}
			}

			throw lastError || new Error('All proxies failed to fetch vehicle positions');
		}
	}
}

export async function fetchRoutes(routeIds: string[]): Promise<Record<string, RouteDetails>> {
	if (routeIds.length === 0) return {};

	const uniqueIds = [...new Set(routeIds)];
	const query = buildBatchRouteQuery(uniqueIds);

	if (isNative) {
		const response = await CapacitorHttp.post({
			url: DIGITRANSIT_BASE_URL,
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
		const url = isDev ? '/api/digitransit/routing/v2/hsl/gtfs/v1' : DIGITRANSIT_BASE_URL;

		const response = await fetch(url, {
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
			url: DIGITRANSIT_BASE_URL,
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
		const url = isDev ? '/api/digitransit/routing/v2/hsl/gtfs/v1' : DIGITRANSIT_BASE_URL;

		const response = await fetch(url, {
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
