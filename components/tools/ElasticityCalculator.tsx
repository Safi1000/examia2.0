"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { pctChange, pedMeaning, shown, xedMeaning, yedMeaning } from "@/components/tools/calc";
import { AskHamza, NumberField, Result, amount, fmt } from "@/components/tools/ToolBits";

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
  const [qOld, qNew, cOld, cNew] = [amount(q0), amount(q1), amount(c0), amount(c1)];
  // A starting figure of 0 cannot give a % change (it would divide by zero).
  const pq = qOld && qNew !== null ? pctChange(qOld, qNew) : null;
  const pc = cOld && cNew !== null ? pctChange(cOld, cNew) : null;
  const e = pq !== null && pc ? pq / pc : null;
  const zeroStart = (qOld === 0 && q1.trim() !== "") || (cOld === 0 && c1.trim() !== "");
  const noChange = pq !== null && pc === 0;

  let meaning = "";
  if (e !== null) {
    if (kind === "ped") meaning = pedMeaning(e) + (shown(e) > 0 ? " The sign is positive, so price and quantity moved the same way, which is unusual for demand: check the figures." : "");
    if (kind === "yed") meaning = yedMeaning(e);
    if (kind === "xed") meaning = xedMeaning(e);
  }
  const revenue =
    kind === "ped" && qOld !== null && qNew !== null && cOld !== null && cNew !== null ? { before: qOld * cOld, after: qNew * cNew } : null;
  const revenueMove = revenue ? shown(revenue.after) - shown(revenue.before) : 0;

  return (
    <div className="space-y-8">
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-hairline bg-card p-1">
        {(Object.keys(LABEL) as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn("min-h-11 rounded-full px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold", kind === k ? "bg-gold text-[#1b1e21]" : "text-body hover:text-foreground")}
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
      <div aria-live="polite" className="space-y-8">
      {zeroStart && (
        <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-body">
          A &quot;before&quot; figure of 0 cannot give a percentage change. Enter a before figure above 0.
        </p>
      )}
      {noChange && !zeroStart && (
        <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-body">
          The {LABEL[kind].cause} did not change, so there is no elasticity to work out. Enter different before and after figures.
        </p>
      )}
      {e !== null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result strong label={LABEL[kind].name} value={fmt(e)} note={meaning} />
          <Result label="The working" value={`${fmt(pq!, 1)}% ÷ ${fmt(pc!, 1)}%`} note={`% change in quantity demanded ÷ % change in ${LABEL[kind].cause}.`} />
          {revenue && (
            <Result
              label="Total revenue"
              value={`${fmt(revenue.before)} → ${fmt(revenue.after)}`}
              note={revenueMove > 0 ? "Revenue rose." : revenueMove < 0 ? "Revenue fell." : "Revenue stayed the same."}
            />
          )}
        </div>
      )}
      </div>
      {e !== null && <AskHamza tool="elasticity calculator" summary={`${kind.toUpperCase()} came out at ${fmt(e)}.`} />}
    </div>
  );
}
