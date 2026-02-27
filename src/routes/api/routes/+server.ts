import { DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/private';
import { buildBatchRouteQuery } from '$lib/queries/route';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DIGITRANSIT_ROUTING_URL =
	'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

export const POST: RequestHandler = async ({ request }) => {
	const { routeIds } = await request.json();

	if (!Array.isArray(routeIds) || routeIds.length === 0) {
		error(400, 'routeIds must be a non-empty array');
	}

	const uniqueIds = [...new Set(routeIds)] as string[];
	const query = buildBatchRouteQuery(uniqueIds);

	const response = await fetch(DIGITRANSIT_ROUTING_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/graphql',
			'digitransit-subscription-key': DIGITRANSIT_SUBSCRIPTION_KEY
		},
		body: query
	});

	if (!response.ok) {
		const text = await response.text();
		console.error('Digitransit API error:', response.status, text);
		error(response.status, 'Failed to fetch route details');
	}

	const data = await response.json();
	const result: Record<string, { gtfsId: string; shortName: string; longName: string; mode: string }> = {};

	for (const id of uniqueIds) {
		const key = `r_${id}`;
		const route = data.data?.[key];
		if (route) {
			result[id] = route;
		}
	}

	return json(result);
};
