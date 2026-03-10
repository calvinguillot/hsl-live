import { DIGITRANSIT_SUBSCRIPTION_KEY } from '$env/static/private';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { json, error } from '@sveltejs/kit';

const HSL_VEHICLE_POSITIONS_URL =
	'https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl';

export const prerender = true;

export async function GET() {
	const response = await fetch(HSL_VEHICLE_POSITIONS_URL, {
		headers: {
			'digitransit-subscription-key': DIGITRANSIT_SUBSCRIPTION_KEY
		}
	});

	if (!response.ok) {
		error(response.status, 'Failed to fetch vehicle positions from HSL');
	}

	const buffer = await response.arrayBuffer();
	const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
		new Uint8Array(buffer)
	);

	return json(feed.toJSON());
}
