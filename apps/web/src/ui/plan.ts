// The comp's measured day-plan rhythm: one hour is 68.6px, and the first hour line sits 24px into the grid.
export const HOUR_PX = 68.6;
export const LABEL_Y = 22; // an hour label's centre, from the grid top
export const LINE_DROP = 2; // a rule sits this far below its label centre
export const BLOCK_LEAD = 20; // a block starts this far above its hour line
export const BLOCK_TRIM = 4; // and is this much shorter than its span
export const BLOCK_MIN = 40;
export const NOW_LEAD = 7;

// The one minutes -> px function: y (from the grid top) of a minute of the day.
export const minToPx = (m: number, startM: number) => LABEL_Y + ((m - startM) * HOUR_PX) / 60;
export const gridHeight = (startM: number, endM: number) => minToPx(endM, startM) + LABEL_Y;
export const blockTop = (startM: number, gridStartM: number) => minToPx(startM, gridStartM) - BLOCK_LEAD;
export const blockHeight = (mins: number) => Math.max(BLOCK_MIN, (mins * HOUR_PX) / 60 - BLOCK_TRIM);
