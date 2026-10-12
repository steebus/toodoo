// Where a docket dropped between two neighbours sorts: halfway, or one step past a lone neighbour.
export function sortOrderBetween(prev?: number, next?: number): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1;
  if (next !== undefined) return next - 1;
  return Date.now() / 1000;
}
