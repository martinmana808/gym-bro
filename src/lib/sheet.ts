export type SheetTargetCell = { target: string; sessions: string[] };
export type SheetRow = {
  key: string;
  name: string;
  sectionName: string | null;
  weightUnit: "kg" | "bricks";
  /** Rows sharing a group are one superset. 1 = a plain exercise. */
  groupSize: number;
  /** 1-based position inside that group, so the bracket knows its ends. */
  groupPos: number;
  byWeek: (SheetTargetCell | null)[];
};
export type SheetWeekMeta = { position: number; name: string; sessions: { id: string; label: string }[] };

/** Align exercises across weeks into ordered rows. `weeks[i].exercises` are that
 * week's exercises in order; `cell(exId, weekIndex)` renders that exercise's cell
 * for the week. Rows are keyed by lineageId (falling back to name when lineages
 * differ); row order = first appearance scanning weeks in order. */
function csvEsc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Serialize the whole workout to a spreadsheet CSV mirroring the on-screen
 * table: a block per day, with a header row of "<Week> · Target" + session date
 * columns, muscle-section rows, then one row per exercise across the weeks. */
export function programSheetToCsv(
  programName: string,
  days: { name: string; weeks: SheetWeekMeta[]; rows: SheetRow[] }[],
): string {
  const lines: string[] = [csvEsc(programName)];
  for (const day of days) {
    lines.push("");
    lines.push(csvEsc(day.name));
    const header = ["Exercise"];
    for (const w of day.weeks) {
      header.push(`${w.name} · Target`);
      for (const s of w.sessions) header.push(s.label);
    }
    lines.push(header.map(csvEsc).join(","));
    let prevSection: string | null = null;
    for (const row of day.rows) {
      if (row.sectionName && row.sectionName !== prevSection) lines.push(csvEsc(row.sectionName));
      prevSection = row.sectionName;
      const cells = [row.name];
      row.byWeek.forEach((c, wi) => {
        cells.push(c?.target ?? "");
        day.weeks[wi].sessions.forEach((_, si) => cells.push(c?.sessions[si] ?? ""));
      });
      lines.push(cells.map(csvEsc).join(","));
    }
  }
  return lines.join("\n");
}

export function buildSheetRows(
  weeks: {
    exercises: {
      id: string;
      lineageId: string;
      name: string;
      sectionName: string | null;
      weightUnit: "kg" | "bricks";
      /** Exercises sharing this key are performed back to back. */
      supersetKey: string | null;
    }[];
  }[],
  cell: (exId: string, weekIndex: number) => SheetTargetCell,
): SheetRow[] {
  const rows: SheetRow[] = [];
  const groupKeyByRow = new Map<number, string>();
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
          groupSize: 1,
          groupPos: 1,
          byWeek: weeks.map(() => null),
        });
        // Grouping comes from the first week that places this exercise.
        if (e.supersetKey) groupKeyByRow.set(idx, e.supersetKey);
        indexByName.set(e.name.toLowerCase(), idx);
      }
      indexByKey.set(k, idx);
      rows[idx].byWeek[wi] = cell(e.id, wi);
    }
  });

  // Mark each row with the size of its superset and where it sits inside it,
  // so the sheet can draw one bracket per group instead of a label per row.
  // Only runs of adjacent rows count — a group split apart isn't a superset.
  let i = 0;
  while (i < rows.length) {
    const key = groupKeyByRow.get(i);
    let j = i + 1;
    if (key) while (j < rows.length && groupKeyByRow.get(j) === key) j++;
    const size = j - i;
    for (let k = i; k < j; k++) {
      rows[k].groupSize = size;
      rows[k].groupPos = k - i + 1;
    }
    i = j;
  }
  return rows;
}
