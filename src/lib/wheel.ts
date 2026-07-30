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

export const ITEM_H = 44; // px per row (the flat, un-projected spacing)
export const HEIGHT = 300; // visible drum height
export const PAD = (HEIGHT - ITEM_H) / 2; // centres row N at scrollTop = N * ITEM_H
const ANGLE = 20; // degrees of cylinder per row
// Cylinder radius that makes one row subtend ANGLE degrees.
const RADIUS = ITEM_H / (2 * Math.tan((ANGLE * Math.PI) / 360));

/** Where a row sits on the drum: rows curve away from the centre, so they bunch
 * up towards the top and bottom (real cylindrical projection, not just a fade). */
export function rowGeometry(distance: number) {
  const theta = distance * ANGLE;
  if (Math.abs(theta) >= 90) return { hidden: true, translateY: 0, rot: 0, opacity: 0 };
  const rad = (theta * Math.PI) / 180;
  return {
    hidden: false,
    // Project onto the cylinder, then undo the flat layout offset.
    translateY: RADIUS * Math.sin(rad) - distance * ITEM_H,
    rot: -theta,
    opacity: Math.max(0, Math.cos(rad)) ** 0.9,
  };
}
