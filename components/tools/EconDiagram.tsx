import type { Chart, El, Pt } from "@/lib/econ-diagrams";

/**
 * Draws one economics diagram as SVG from data (lib/econ-diagrams.ts).
 * Colours come from the text colour, so the print sheet turns every line black.
 */
const STROKE: Record<"a" | "b" | "c", string> = { a: "text-foreground", b: "text-gold", c: "text-muted-foreground" };

export function EconDiagram({ chart, small, title }: { chart: Chart; small?: boolean; title: string }) {
  const W = small ? 170 : 340;
  const H = small ? 150 : 280;
  const L = small ? 26 : 46;
  const R = small ? 14 : 30;
  const T = small ? 18 : 26;
  const B = small ? 24 : 34;
  const fs = small ? 11 : 12.5;
  const X = (x: number) => L + (x / 100) * (W - L - R);
  const Y = (y: number) => H - B - (y / 100) * (H - T - B);
  const d = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join(" ");

  const label = (l: [string, number, number] | undefined, key: string, cls = "text-foreground") =>
    l ? (
      <text key={key} x={X(l[1])} y={Y(l[2])} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={600} fill="currentColor" className={cls}>
        {l[0]}
      </text>
    ) : null;

  const draw = (e: El, i: number) => {
    const k = `e${i}`;
    switch (e.t) {
      case "line": {
        const c = STROKE[e.k ?? "a"];
        return (
          <g key={k}>
            <line x1={X(e.p[0])} y1={Y(e.p[1])} x2={X(e.p[2])} y2={Y(e.p[3])} stroke="currentColor" strokeWidth={e.k === "c" ? 1.6 : 2.2} strokeLinecap="round" className={c} />
            {label(e.label, `${k}l`, c)}
          </g>
        );
      }
      case "path": {
        const c = STROKE[e.k ?? "a"];
        return (
          <g key={k}>
            <path d={d(e.pts)} fill="none" stroke="currentColor" strokeWidth={e.k === "c" ? 1.6 : 2.2} strokeLinecap="round" strokeLinejoin="round" className={c} />
            {label(e.label, `${k}l`, c)}
          </g>
        );
      }
      case "guide": {
        const [x, y] = e.at;
        return (
          <g key={k} className="text-muted-foreground">
            {!e.noH && <line x1={X(0)} y1={Y(y)} x2={X(x)} y2={Y(y)} stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" />}
            {!e.noV && <line x1={X(x)} y1={Y(y)} x2={X(x)} y2={Y(0)} stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" />}
            {e.yl && (
              <text x={L - 6} y={Y(y)} textAnchor="end" dominantBaseline="middle" fontSize={fs} fontWeight={600} fill="currentColor" className="text-foreground">
                {e.yl}
              </text>
            )}
            {e.xl && (
              <text x={X(x)} y={H - B + 15} textAnchor="middle" fontSize={fs} fontWeight={600} fill="currentColor" className="text-foreground">
                {e.xl}
              </text>
            )}
          </g>
        );
      }
      case "dot":
        return (
          <g key={k} className="text-foreground">
            <circle cx={X(e.at[0])} cy={Y(e.at[1])} r={3.6} fill="currentColor" />
            {label(e.label, `${k}l`)}
          </g>
        );
      case "arrow": {
        const [x1, y1, x2, y2] = [X(e.p[0]), Y(e.p[1]), X(e.p[2]), Y(e.p[3])];
        const a = Math.atan2(y2 - y1, x2 - x1);
        const h = 7;
        const p1 = `${x2 - h * Math.cos(a - 0.45)},${y2 - h * Math.sin(a - 0.45)}`;
        const p2 = `${x2 - h * Math.cos(a + 0.45)},${y2 - h * Math.sin(a + 0.45)}`;
        return (
          <g key={k} className="text-muted-foreground">
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            <polygon points={`${x2},${y2} ${p1} ${p2}`} fill="currentColor" />
          </g>
        );
      }
      case "area":
        return e.k === "b" ? (
          <path key={k} d={`${d(e.pts)} Z`} fill="currentColor" fillOpacity={0.12} className="dg-area-b text-foreground" />
        ) : (
          <path key={k} d={`${d(e.pts)} Z`} fill="currentColor" fillOpacity={0.18} className="text-gold" />
        );
      case "span": {
        const [x1, x2, y] = [X(e.x1), X(e.x2), Y(e.y)];
        const up = e.y >= 50;
        return (
          <g key={k} className="text-foreground">
            <line x1={x1} y1={y} x2={x2} y2={y} stroke="currentColor" strokeWidth={1.4} />
            <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="currentColor" strokeWidth={1.4} />
            <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="currentColor" strokeWidth={1.4} />
            <text x={(x1 + x2) / 2} y={up ? y - 8 : y + 15} textAnchor="middle" fontSize={fs} fontWeight={600} fill="currentColor">
              {e.label}
            </text>
          </g>
        );
      }
      case "text":
        return label(e.label, k, "text-muted-foreground");
    }
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="h-auto w-full">
      {chart.els.filter((e) => e.t === "area").map(draw)}
      <g className="text-body">
        <path d={`M${L} ${T - 6} V${H - B} H${W - R + 8}`} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <text x={small ? L - 4 : 6} y={small ? T - 10 : 13} textAnchor={small ? "middle" : "start"} fontSize={fs} fill="currentColor">
          {chart.y}
        </text>
        <text x={W - 4} y={H - 5} textAnchor="end" fontSize={fs} fill="currentColor">
          {chart.x}
        </text>
        <text x={L - 7} y={H - B + 14} textAnchor="end" fontSize={fs} fill="currentColor">
          0
        </text>
      </g>
      {chart.els.filter((e) => e.t !== "area").map(draw)}
    </svg>
  );
}
