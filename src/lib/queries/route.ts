export const ROUTE_QUERY = `
{
  route(id: "HSL:__ROUTE_ID__") {
    gtfsId
    shortName
    longName
    mode
  }
}
`;

export const STOP_QUERY = `
{
  stop(id: "HSL:__STOP_ID__") {
    gtfsId
    name
    lat
    lon
  }
}
`;

export const ROUTE_STOPS_QUERY = `
{
  route(id: "HSL:__ROUTE_ID__") {
    stops {
      gtfsId
      name
      lat
      lon
    }
  }
}
`;

export function buildRouteQuery(routeId: string): string {
	return ROUTE_QUERY.replace('__ROUTE_ID__', routeId);
}

export function buildStopQuery(stopId: string): string {
	return STOP_QUERY.replace('__STOP_ID__', stopId);
}

export function buildRouteStopsQuery(routeId: string): string {
	return ROUTE_STOPS_QUERY.replace('__ROUTE_ID__', routeId);
}

export function buildBatchRouteQuery(routeIds: string[]): string {
	if (routeIds.length === 0) return '{}';
	const entries = routeIds.map(
		(id) => `r_${id}: route(id: "HSL:${id}") { gtfsId shortName longName mode }`
	);
	return `{ ${entries.join(' ')} }`;
}
