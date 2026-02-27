export type VehicleEntity = {
	id: string;
	vehicle: {
		trip: {
			routeId: string;
			startTime: string;
			startDate: string;
			directionId: number;
			scheduleRelationship: string;
		};
		position: {
			latitude: number;
			longitude: number;
			bearing: number;
			speed: number;
			odometer: number;
		};
		currentStatus: string;
		timestamp: string;
		stopId: string;
		vehicle: {
			id: string;
		};
	};
};

export type RouteDetails = {
	gtfsId: string;
	shortName: string;
	longName: string;
	mode: string;
};

export type StopDetails = {
	gtfsId: string;
	name: string;
	lat: number;
	lon: number;
};
