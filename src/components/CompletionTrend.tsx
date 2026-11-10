/**
 * Completion per session over time.
 *
 * Bars rather than a line: sessions are discrete events at irregular intervals,
 * and a line between 19 Sep and 5 Nov would draw six weeks of training that
 * never happened. One hue, because it's one series — the 100% rule does the
 * comparing, and the part of a bar above it rides in a lighter tone so beating
 * the plan reads as "full, plus extra". The list underneath carries the same
 * numbers as text, so nothing here is colour-only.
 */
const W = 320;
const H = 110;
const TOP = 14;
const BOTTOM = 18;
const GAP = 3;

export type TrendPoint = { date: Date; percent: number };

export function CompletionTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null;

  const plotH = H - TOP - BOTTOM;
  const peak = Math.max(120, ...points.map((p) => p.percent));
  const max = Math.ceil(peak / 20) * 20;
  const y = (v: number) => TOP + plotH * (1 - v / max);
  // Thin marks: with three sessions a full-width bar is a slab, so cap the
  // width and centre the row rather than stretching to fill.
  const barW = Math.min(44, (W - GAP * (points.length - 1)) / points.length);
  const rowW = barW * points.length + GAP * (points.length - 1);
  const x0 = (W - rowW) / 2;
  const baseline = TOP + plotH;
  const planY = y(100);

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const last = points[points.length - 1];

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-label">completion over time</h2>
        <span className="display-num text-sm text-zinc-400">
          latest {last.percent}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="mt-3 overflow-visible"
        role="img"
        aria-label={`Completion for the last ${points.length} sessions, most recent ${last.percent} percent`}
      >
        {points.map((p, i) => {
          const x = x0 + i * (barW + GAP);
          const top = y(Math.min(100, p.percent));
          const over = p.percent > 100 ? y(p.percent) : null;
          return (
            <g key={i}>
              <title>{`${fmt(p.date)} — ${p.percent}%`}</title>
              {/* Bars start at zero; a cut baseline would exaggerate every gap. */}
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(1, baseline - top)}
                rx={2}
                className="fill-lime-400"
              />
              {over != null && (
                <rect
                  x={x}
                  y={over}
                  width={barW}
                  height={Math.max(1, planY - over)}
                  rx={2}
                  className="fill-lime-400/40"
                />
              )}
            </g>
          );
        })}

        {/* The plan line sits above the bars so it stays readable across them. */}
        <line
          x1={0}
          x2={W}
          y1={planY}
          y2={planY}
          strokeDasharray="3 3"
          className="stroke-zinc-500"
          strokeWidth={1}
        />
        <text x={0} y={planY - 4} className="fill-zinc-500" fontSize={9}>
          plan
        </text>

        {/* Only the ends are dated — a label per bar would be unreadable. */}
        <text x={0} y={H - 5} className="fill-zinc-500" fontSize={9}>
          {fmt(points[0].date)}
        </text>
        <text x={W} y={H - 5} textAnchor="end" className="fill-zinc-500" fontSize={9}>
          {fmt(last.date)}
        </text>
      </svg>
    </section>
  );
}
