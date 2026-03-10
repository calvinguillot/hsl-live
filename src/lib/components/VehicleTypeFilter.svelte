<script lang="ts">
	import { BusFront, TramFront, TrainFront, TrainFrontTunnel, Ship, Tractor } from 'lucide-svelte';
	import { MODE_COLORS } from '$lib/map-icons';

	export const MODES = ['BUS', 'TRAM', 'SUBWAY', 'RAIL', 'FERRY', 'default'] as const;

	let { enabledModes = $bindable() } = $props<{
		enabledModes: Record<string, boolean>;
	}>();

	const items: Array<{ mode: (typeof MODES)[number]; Icon: typeof BusFront; color: string }> = [
		{ mode: 'BUS', Icon: BusFront, color: MODE_COLORS.BUS },
		{ mode: 'TRAM', Icon: TramFront, color: MODE_COLORS.TRAM },
		{ mode: 'SUBWAY', Icon: TrainFront, color: MODE_COLORS.SUBWAY },
		{ mode: 'RAIL', Icon: TrainFrontTunnel, color: MODE_COLORS.RAIL },
		{ mode: 'FERRY', Icon: Ship, color: MODE_COLORS.FERRY },
		{ mode: 'default', Icon: Tractor, color: '#eeeeee' }
	];

	function toggle(mode: (typeof MODES)[number]) {
		enabledModes = { ...enabledModes, [mode]: !enabledModes[mode] };
	}
</script>

<!-- Mobile: horizontal pill nav bar at bottom. Desktop: vertical sidebar on right -->
<div
	class="flex flex-row items-center gap-2 rounded-full bg-black/20 p-2 backdrop-blur md:flex-col md:gap-3 md:rounded-lg"
>
	{#each items as { mode, Icon, color }}
		<button
			type="button"
			class="p-1 transition-colors hover:opacity-90"
			aria-label="Toggle {mode}"
			onclick={() => toggle(mode)}
		>
			<Icon size={28} strokeWidth={2} color={enabledModes[mode] ? color : '#6b7280'} />
		</button>
	{/each}
</div>
