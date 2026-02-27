<script lang="ts">
	import { onMount } from 'svelte';

	type VehicleEntity = {
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

	type RouteDetails = {
		gtfsId: string;
		shortName: string;
		longName: string;
		mode: string;
	};

	type StopDetails = {
		gtfsId: string;
		name: string;
		lat: number;
		lon: number;
	};

	let vehicles = $state<VehicleEntity[]>([]);
	let loading = $state(true);
	let errorMsg = $state('');

	let expandedId = $state<string | null>(null);
	let routeDetails = $state<Record<string, RouteDetails>>({});
	let stopDetails = $state<Record<string, StopDetails>>({});
	let routeLoading = $state<Record<string, boolean>>({});

	onMount(async () => {
		try {
			const response = await fetch('/api/vehicles');
			if (!response.ok) {
				errorMsg = `API error: ${response.status} ${response.statusText}`;
				return;
			}
			const data = await response.json();
			vehicles = data.entity ?? [];
			console.log('Loaded', vehicles.length, 'vehicles');
		} catch (err) {
			errorMsg = `Failed to fetch vehicle positions: ${err}`;
			console.error(errorMsg);
		} finally {
			loading = false;
		}
	});

	async function toggleVehicle(entity: VehicleEntity) {
		const id = entity.id;

		if (expandedId === id) {
			expandedId = null;
			return;
		}

		expandedId = id;

		if (routeDetails[id] && stopDetails[id]) return;

		routeLoading[id] = true;

		const routeId = entity.vehicle?.trip?.routeId;
		const stopId = entity.vehicle?.stopId;

		const fetches: Promise<void>[] = [];

		if (routeId && !routeDetails[id]) {
			fetches.push(
				fetch('/api/route', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ routeId })
				})
					.then((r) => r.json())
					.then((data) => {
						if (data.data?.route) routeDetails[id] = data.data.route;
					})
					.catch((err) => console.error('Failed to fetch route details:', err))
			);
		}

		if (stopId && !stopDetails[id]) {
			fetches.push(
				fetch('/api/stop', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ stopId })
				})
					.then((r) => r.json())
					.then((data) => {
						if (data.data?.stop) stopDetails[id] = data.data.stop;
					})
					.catch((err) => console.error('Failed to fetch stop details:', err))
			);
		}

		await Promise.all(fetches);
		routeLoading[id] = false;
	}

	function formatSpeed(speed: number | undefined): string {
		if (speed == null) return '—';
		return `${(speed * 3.6).toFixed(0)} km/h`;
	}

	function modeEmoji(mode: string | undefined): string {
		switch (mode) {
			case 'BUS':
				return 'Bus';
			case 'TRAM':
				return 'Tram';
			case 'RAIL':
				return 'Rail';
			case 'SUBWAY':
				return 'Metro';
			case 'FERRY':
				return 'Ferry';
			default:
				return mode ?? '—';
		}
	}
</script>

<div class="mx-auto max-w-5xl p-4">
	<h1 class="mb-4 text-2xl font-bold text-white">HSL Live Vehicle Tracker</h1>

	{#if loading}
		<p class="text-gray-400">Loading vehicle positions...</p>
	{:else if errorMsg}
		<p class="text-red-400">{errorMsg}</p>
	{:else}
		<p class="mb-4 text-sm text-gray-400">
			{vehicles.length} vehicles — click a row to fetch route details
		</p>

		<table class="w-full border-collapse text-sm text-gray-200">
			<thead>
				<tr class="border-b border-gray-700 text-left text-gray-400">
					<th class="p-2">Vehicle ID</th>
					<th class="p-2">Route</th>
					<th class="p-2">Status</th>
					<th class="p-2">Speed</th>
					<th class="p-2">Lat</th>
					<th class="p-2">Lng</th>
				</tr>
			</thead>
			<tbody>
				{#each vehicles as entity (entity.id)}
					{@const v = entity.vehicle}
					<tr
						class="cursor-pointer border-b border-gray-800 hover:bg-gray-800/50"
						onclick={() => toggleVehicle(entity)}
					>
						<td class="p-2 font-mono text-xs">{v?.vehicle?.id ?? '—'}</td>
						<td class="p-2 font-semibold">{v?.trip?.routeId ?? '—'}</td>
						<td class="p-2">{v?.currentStatus ?? '—'}</td>
						<td class="p-2">{formatSpeed(v?.position?.speed)}</td>
						<td class="p-2 font-mono text-xs">{v?.position?.latitude?.toFixed(5) ?? '—'}</td>
						<td class="p-2 font-mono text-xs">{v?.position?.longitude?.toFixed(5) ?? '—'}</td>
					</tr>

					{#if expandedId === entity.id}
						<tr class="border-b border-gray-800 bg-gray-900/60">
							<td colspan="6" class="p-3">
								{#if routeLoading[entity.id]}
									<p class="text-gray-400">Loading route details...</p>
								{:else if routeDetails[entity.id]}
									{@const route = routeDetails[entity.id]}
									<div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
										<div><span class="text-gray-500">GTFS ID:</span> {route.gtfsId}</div>
										<div><span class="text-gray-500">Short Name:</span> {route.shortName}</div>
										<div><span class="text-gray-500">Mode:</span> {modeEmoji(route.mode)}</div>
										<div class="col-span-2">
											<span class="text-gray-500">Route:</span>
											{route.longName}
										</div>
									</div>

									<div class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-400">
										<div>Start: {v?.trip?.startTime} ({v?.trip?.startDate})</div>
										<div>Direction: {v?.trip?.directionId}</div>
										<div>
											Stop: {#if stopDetails[entity.id]}
												{stopDetails[entity.id].name} ({v?.stopId})
											{:else}
												{v?.stopId ?? '—'}
											{/if}
										</div>
										<div>Bearing: {v?.position?.bearing ?? '—'}°</div>
									</div>
								{:else}
									<p class="text-gray-500">No route details available.</p>
								{/if}
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	{/if}
</div>
