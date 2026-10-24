"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { AskHamza, NumberField, Result, fmt, num } from "@/components/tools/ToolBits";

type Kind = "ped" | "yed" | "xed";
const LABEL: Record<Kind, { name: string; cause: string }> = {
  ped: { name: "Price elasticity of demand (PED)", cause: "price of the good" },
  yed: { name: "Income elasticity of demand (YED)", cause: "income" },
  xed: { name: "Cross elasticity of demand (XED)", cause: "price of the other good" },
};

/** % change method: (new − old) ÷ old × 100 for each, then divide. */
export function ElasticityCalculator() {
  const [kind, setKind] = useState<Kind>("ped");
  const [q0, setQ0] = useState("");
  const [q1, setQ1] = useState("");
  const [c0, setC0] = useState("");
  const [c1, setC1] = useState("");
  const [qOld, qNew, cOld, cNew] = [num(q0), num(q1), num(c0), num(c1)];
  const pq = qOld && qNew !== null ? ((qNew - qOld) / qOld) * 100 : null;
  const pc = cOld && cNew !== null ? ((cNew - cOld) / cOld) * 100 : null;
  const e = pq !== null && pc ? pq / pc : null;

  let meaning = "";
  if (e !== null) {
    const a = Math.abs(e);
    if (kind === "ped")
      meaning =
        a > 1 ? "Elastic: demand changes by a bigger percentage than price." : a < 1 ? "Inelastic: demand changes by a smaller percentage than price." : "Unitary: demand changes by the same percentage as price.";
    if (kind === "yed") meaning = e > 0 ? (e > 1 ? "Positive and above 1: a normal good, income elastic (often a luxury)." : "Positive: a normal good.") : e < 0 ? "Negative: an inferior good. People buy less as income rises." : "Zero: income has no effect on demand.";
    if (kind === "xed") meaning = e > 0 ? "Positive: the goods are substitutes." : e < 0 ? "Negative: the goods are complements." : "Zero: the goods are unrelated.";
  }
  const revenue =
    kind === "ped" && qOld !== null && qNew !== null && cOld !== null && cNew !== null ? { before: qOld * cOld, after: qNew * cNew } : null;

  return (
    <div className="space-y-8">
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-hairline bg-card p-1">
        {(Object.keys(LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", kind === k ? "bg-gold text-[#1b1e21]" : "text-body hover:text-foreground")}
          >
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Quantity demanded before" value={q0} onChange={setQ0} />
        <NumberField label="Quantity demanded after" value={q1} onChange={setQ1} />
        <NumberField label={`Before: ${LABEL[kind].cause}`} value={c0} onChange={setC0} />
        <NumberField label={`After: ${LABEL[kind].cause}`} value={c1} onChange={setC1} />
      </div>
      {e !== null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result strong label={LABEL[kind].name} value={fmt(e)} note={meaning} />
          <Result label="The working" value={`${fmt(pq!, 1)}% ÷ ${fmt(pc!, 1)}%`} note={`% change in quantity demanded ÷ % change in ${LABEL[kind].cause}.`} />
          {revenue && (
            <Result
              label="Total revenue"
              value={`${fmt(revenue.before)} → ${fmt(revenue.after)}`}
              note={revenue.after > revenue.before ? "Revenue rose." : revenue.after < revenue.before ? "Revenue fell." : "Revenue stayed the same."}
            />
          )}
        </div>
      )}
      {e !== null && <AskHamza tool="elasticity calculator" summary={`${kind.toUpperCase()} came out at ${fmt(e)}.`} />}
    </div>
  );
}
