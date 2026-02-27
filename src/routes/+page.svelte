<script lang="ts">
	import { onMount } from 'svelte';

	onMount(async () => {
		try {
			const response = await fetch('/api/vehicles');
			if (!response.ok) {
				console.error('API error:', response.status, response.statusText);
				return;
			}
			const data = await response.json();
			console.log('Vehicle positions feed:', data);
			console.log('Number of entities:', data.entity?.length ?? 0);

			if (data.entity?.length > 0) {
				console.log('Sample vehicle:', data.entity[0]);
			}
		} catch (err) {
			console.error('Failed to fetch vehicle positions:', err);
		}
	});
</script>

<h1>HSL Live Vehicle Tracker</h1>
<p>Open the browser console to see the vehicle positions data.</p>
