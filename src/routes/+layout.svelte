<script lang="ts">
	import './layout.css';
	import { base } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={`${base}/favicon.ico`} /></svelte:head>
<div class="min-h-screen bg-gray-950 text-gray-100">
	{@render children()}
</div>
