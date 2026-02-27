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

export function buildRouteQuery(routeId: string): string {
	return ROUTE_QUERY.replace('__ROUTE_ID__', routeId);
}

export function buildStopQuery(stopId: string): string {
	return STOP_QUERY.replace('__STOP_ID__', stopId);
}
