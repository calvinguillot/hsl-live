import { DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/private';
import { buildRouteStopsQuery } from '$lib/queries/route';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DIGITRANSIT_ROUTING_URL =
	'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

export const POST: RequestHandler = async ({ request }) => {
	const { routeId } = await request.json();

	if (!routeId) {
		error(400, 'routeId is required');
	}

	const query = buildRouteStopsQuery(routeId);

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
		error(response.status, 'Failed to fetch route stops');
	}

	const data = await response.json();
	const stops = data.data?.route?.stops ?? [];
	return json(stops);
};
