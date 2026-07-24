export type WeekCol = { position: number; name: string };

/** Program-global week columns derived from each day's variations. The number
 * of weeks is the max (position + 1) across all days; each column's label comes
 * from the first day (in order) that has a variation at that position, else
 * "Week {n}". */
export function deriveWeeks(
  daysVariations: { position: number; name: string }[][],
): WeekCol[] {
  let count = 0;
  for (const vars of daysVariations)
    for (const v of vars) count = Math.max(count, v.position + 1);
  const cols: WeekCol[] = [];
  for (let p = 0; p < count; p++) {
    let name = `Week ${p + 1}`;
    for (const vars of daysVariations) {
      const hit = vars.find((v) => v.position === p);
      if (hit) {
        name = hit.name;
        break;
      }
    }
    cols.push({ position: p, name });
  }
  return cols;
}

/** Which (dayIndex, position) cells are absent, so a normalize step can fill
 * them with empty variations. */
export function missingCells(
  daysVariations: { position: number }[][],
  weekCount: number,
): { dayIndex: number; position: number }[] {
  const out: { dayIndex: number; position: number }[] = [];
  daysVariations.forEach((vars, dayIndex) => {
    const have = new Set(vars.map((v) => v.position));
    for (let p = 0; p < weekCount; p++)
      if (!have.has(p)) out.push({ dayIndex, position: p });
  });
  return out;
}
