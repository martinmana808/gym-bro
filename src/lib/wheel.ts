/** Which row a wheel has landed on, given its scroll offset. Rows are
 * `itemHeight` tall and the list is padded so row N sits at N * itemHeight. */
export function indexFromScroll(scrollTop: number, itemHeight: number, count: number): number {
  if (count <= 0 || itemHeight <= 0) return 0;
  const raw = Math.round(scrollTop / itemHeight);
  return Math.min(count - 1, Math.max(0, raw));
}

/** The scroll offset that centres a given row. */
export function scrollForIndex(index: number, itemHeight: number): number {
  return Math.max(0, index) * itemHeight;
}
