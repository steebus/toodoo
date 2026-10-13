// The comp's measured day-plan rhythm: one hour is 68.6px, and the first hour line sits 24px into the grid.
export const HOUR_PX = 68.6;
export const LABEL_Y = 22; // an hour label's centre, from the grid top
// Everything on the line sits on its minute exactly: an hour's rule on the hour, a block's top on its start and its
// foot on its start plus its minutes, so blocks read against the hours like a ruler.
export const LINE_DROP = 0; // a rule sits on its minute
export const BLOCK_LEAD = 0; // a block starts on its start line
export const BLOCK_TRIM = 0; // and runs exactly its minutes
export const BLOCK_MIN = HOUR_PX / 12; // a 5-minute block, the shortest there is
export const NOW_LEAD = 11; // the now-line's rule is the middle of its 22px row: this puts the rule on now

// The one minutes -> px function: y (from the grid top) of a minute of the day.
export const minToPx = (m: number, startM: number) => LABEL_Y + ((m - startM) * HOUR_PX) / 60;
export const gridHeight = (startM: number, endM: number) => minToPx(endM, startM) + LABEL_Y;
export const blockTop = (startM: number, gridStartM: number) => minToPx(startM, gridStartM) - BLOCK_LEAD;
export const blockHeight = (mins: number) => Math.max(BLOCK_MIN, (mins * HOUR_PX) / 60 - BLOCK_TRIM);
