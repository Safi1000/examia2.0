"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { AskHamza, NumberField, fmt, num } from "@/components/tools/ToolBits";

/** A year-by-year depreciation schedule: straight line or reducing balance. */
export function DepreciationCalculator() {
  const [method, setMethod] = useState<"straight" | "reducing">("straight");
  const [cost, setCost] = useState("");
  const [residual, setResidual] = useState("");
  const [life, setLife] = useState("");
  const [rate, setRate] = useState("");
  const C = num(cost);
  const R = num(residual) ?? 0;
  const L = num(life);
  const r = num(rate);
  const years = method === "straight" ? (L && L > 0 && L <= 50 ? Math.round(L) : 0) : L && L > 0 && L <= 50 ? Math.round(L) : 5;

  const rows: Array<{ year: number; charge: number; acc: number; nbv: number }> = [];
  if (C !== null && C > 0) {
    let acc = 0;
    for (let y = 1; y <= years; y++) {
      const nbv0 = C - acc;
      const charge = method === "straight" ? (C - R) / years : r !== null && r > 0 && r < 100 ? (nbv0 * r) / 100 : 0;
      acc += charge;
      rows.push({ year: y, charge, acc, nbv: C - acc });
    }
  }
  const ok = rows.length > 0 && rows[0].charge > 0;

  return (
    <div className="space-y-8">
      <div className="inline-flex gap-1 rounded-full border border-hairline bg-card p-1">
        {(
          [
            ["straight", "Straight line"],
            ["reducing", "Reducing balance"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMethod(k)}
            aria-pressed={method === k}
            className={cn("min-h-10 rounded-full px-4 text-sm font-semibold", method === k ? "bg-gold text-[#1b1e21]" : "text-body hover:text-foreground")}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Cost of the asset" value={cost} onChange={setCost} />
        {method === "straight" ? (
          <>
            <NumberField label="Residual value" value={residual} onChange={setResidual} hint="Leave empty if none" />
            <NumberField label="Useful life (years)" value={life} onChange={setLife} />
          </>
        ) : (
          <>
            <NumberField label="Rate" value={rate} onChange={setRate} suffix="% a year" />
            <NumberField label="Years to show" value={life} onChange={setLife} hint="Default 5" />
          </>
        )}
      </div>
      {ok && (
        <div className="overflow-x-auto rounded-[16px] border border-hairline">
          <table className="w-full min-w-[420px] text-left text-[15px]">
            <thead className="bg-card-raised text-[13px] text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Year</th>
                <th scope="col" className="px-4 py-3">Depreciation charge</th>
                <th scope="col" className="px-4 py-3">Accumulated depreciation</th>
                <th scope="col" className="px-4 py-3">Net book value (carrying amount)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year} className="border-t border-hairline tabular-nums">
                  <th scope="row" className="px-4 py-3 font-semibold text-foreground">{row.year}</th>
                  <td className="px-4 py-3 text-body">{fmt(row.charge)}</td>
                  <td className="px-4 py-3 text-body">{fmt(row.acc)}</td>
                  <td className="px-4 py-3 text-foreground">{fmt(row.nbv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ok && (
        <AskHamza
          tool="depreciation calculator"
          summary={`${method === "straight" ? "Straight line" : `Reducing balance at ${rate}%`}, cost ${cost}: year 1 charge ${fmt(rows[0].charge)}.`}
        />
      )}
    </div>
  );
}
