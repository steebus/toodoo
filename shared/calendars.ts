// Calendar colours: how a synced calendar's events are drawn. A palette of their own, kept apart from the epic
// colours (tasks are solid, coloured paper; events are hatched glass in these), and clear of the red and green signals.
// "graphite" is the plain grey events had before colours. Hues live in tokens.css (--cal-*).
export const CAL_COLOURS = ["graphite", "rose", "lagoon", "dusk", "clay", "moss", "berry", "harbour"] as const;
export type CalColour = (typeof CAL_COLOURS)[number];
export const CAL_COLOUR_LABEL: Record<CalColour, string> = {
  graphite: "Graphite", rose: "Rose", lagoon: "Lagoon", dusk: "Dusk", clay: "Clay", moss: "Moss", berry: "Berry", harbour: "Harbour",
};
export const isCalColour = (c: unknown): c is CalColour => typeof c === "string" && (CAL_COLOURS as readonly string[]).includes(c);

// A new calendar takes the first colour no other one has (graphite last: it is the uncoloured look).
export function nextCalColour(used: (string | null | undefined)[]): CalColour {
  const taken = new Set(used);
  const order = [...CAL_COLOURS.slice(1), CAL_COLOURS[0]];
  return order.find((c) => !taken.has(c)) ?? order[used.length % order.length];
}
