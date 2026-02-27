export const MODE_COLORS: Record<string, string> = {
	BUS: '#007ac9',
	TRAM: '#008151',
	SUBWAY: '#ca4000',
	RAIL: '#8c4799',
	FERRY: '#007a97'
};

export const SIZE = 70;
const CENTER = SIZE / 2;
export const CIRCLE_RADIUS = 18;
const ARROW_WIDTH = 16;
const ARROW_HEIGHT = 13;
const ARROW_GAP = 4;

function hexToRgba(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r},${g},${b},1)`;
}

function drawCircle(ctx: CanvasRenderingContext2D, fillColor: string, shortName: string) {
	const fill = hexToRgba(fillColor);

	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.arc(CENTER, CENTER, CIRCLE_RADIUS, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 18px sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(shortName, CENTER, CENTER);
}

function drawArrow(ctx: CanvasRenderingContext2D, fillColor: string) {
	const fill = hexToRgba(fillColor);
	const arrowBaseY = CENTER - CIRCLE_RADIUS - ARROW_GAP;
	const arrowTipY = arrowBaseY - ARROW_HEIGHT;
	const halfW = ARROW_WIDTH / 2;

	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.moveTo(CENTER, arrowTipY);
	ctx.lineTo(CENTER + halfW, arrowBaseY);
	ctx.lineTo(CENTER - halfW, arrowBaseY);
	ctx.closePath();
	ctx.fill();
}

/**
 * Generate vehicle icons for each unique (mode, shortName) pair.
 * Returns data URLs keyed by `${mode}_${shortName}` for circle+text
 * and `${mode}_${shortName}_arrow` for the directional arrow.
 */
export function generateVehicleIcons(
	entries: Array<{ mode: string; shortName: string }>
): Record<string, string> {
	const canvas = document.createElement('canvas');
	canvas.width = SIZE;
	canvas.height = SIZE;
	const ctx = canvas.getContext('2d')!;

	const seen = new Set<string>();
	const result: Record<string, string> = {};

	for (const { mode, shortName } of entries) {
		const key = `${mode}_${shortName}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const fillColor = MODE_COLORS[mode] ?? '#888888';

		ctx.clearRect(0, 0, SIZE, SIZE);
		drawCircle(ctx, fillColor, shortName);
		result[key] = canvas.toDataURL('image/png');

		ctx.clearRect(0, 0, SIZE, SIZE);
		drawArrow(ctx, fillColor);
		result[`${key}_arrow`] = canvas.toDataURL('image/png');
	}

	return result;
}
