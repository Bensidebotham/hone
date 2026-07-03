/** Inclusive id range between anchor and target within the given row order. */
export function rangeIds(rowIds: string[], anchorId: string, targetId: string): string[] {
  const a = rowIds.indexOf(anchorId);
  const b = rowIds.indexOf(targetId);
  if (a === -1 || b === -1) return [targetId];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return rowIds.slice(lo, hi + 1);
}
