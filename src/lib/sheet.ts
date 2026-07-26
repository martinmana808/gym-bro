export type SheetTargetCell = { target: string; sessions: string[] };
export type SheetRow = {
  key: string;
  name: string;
  sectionName: string | null;
  weightUnit: "kg" | "bricks";
  byWeek: (SheetTargetCell | null)[];
};
export type SheetWeekMeta = { position: number; name: string; sessions: { id: string; label: string }[] };

/** Align exercises across weeks into ordered rows. `weeks[i].exercises` are that
 * week's exercises in order; `cell(exId, weekIndex)` renders that exercise's cell
 * for the week. Rows are keyed by lineageId (falling back to name when lineages
 * differ); row order = first appearance scanning weeks in order. */
export function buildSheetRows(
  weeks: {
    exercises: {
      id: string;
      lineageId: string;
      name: string;
      sectionName: string | null;
      weightUnit: "kg" | "bricks";
    }[];
  }[],
  cell: (exId: string, weekIndex: number) => SheetTargetCell,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const indexByKey = new Map<string, number>();
  const indexByName = new Map<string, number>();
  const keyOf = (e: { lineageId: string; name: string }) => `${e.lineageId}|${e.name.toLowerCase()}`;
  weeks.forEach((week, wi) => {
    for (const e of week.exercises) {
      const k = keyOf(e);
      let idx = indexByKey.get(k);
      if (idx == null) idx = indexByName.get(e.name.toLowerCase());
      if (idx == null) {
        idx = rows.length;
        rows.push({
          key: k,
          name: e.name,
          sectionName: e.sectionName,
          weightUnit: e.weightUnit,
          byWeek: weeks.map(() => null),
        });
        indexByName.set(e.name.toLowerCase(), idx);
      }
      indexByKey.set(k, idx);
      rows[idx].byWeek[wi] = cell(e.id, wi);
    }
  });
  return rows;
}
