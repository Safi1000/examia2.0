"use client";

import { useState } from "react";
import { reducingBalance, straightLine, type DepRow } from "@/components/tools/calc";
import { AskHamza, NumberField, amount, fieldError, fmt, seg, segGroup } from "@/components/tools/ToolBits";

/** A year-by-year depreciation schedule: straight line or reducing balance. */
export function DepreciationCalculator() {
  const [method, setMethod] = useState<"straight" | "reducing">("straight");
  const [cost, setCost] = useState("");
  const [residual, setResidual] = useState("");
  const [life, setLife] = useState("");
  const [rate, setRate] = useState("");
  const C = amount(cost);
  const R = amount(residual) ?? 0;
  const L = amount(life);
  const r = amount(rate);
  const wholeYears = (n: number | null) => (n !== null && Number.isInteger(n) && n >= 1 && n <= 50 ? n : null);
  const lifeError = life.trim() !== "" && L !== null && wholeYears(L) === null ? "Use a whole number of years, from 1 to 50." : null;
  const residualError = method === "straight" && C !== null && R >= C && C > 0 ? "The residual value must be less than the cost." : null;
  const rateError = rate.trim() !== "" && r !== null && !(r > 0 && r < 100) ? "Enter a rate above 0 and below 100." : null;

  let rows: DepRow[] = [];
  if (C !== null && C > 0) {
    if (method === "straight" && wholeYears(L) && !residualError && !fieldError(residual)) rows = straightLine(C, R, wholeYears(L)!);
    if (method === "reducing" && r !== null && !rateError && !lifeError) rows = reducingBalance(C, r, wholeYears(L) ?? 5);
  }
  const ok = rows.length > 0 && rows[0].charge > 0;

  return (
    <div className="space-y-8">
      <div className={segGroup}>
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
            className={seg(method === k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Cost of the asset" value={cost} onChange={setCost} />
        {method === "straight" ? (
          <>
            <NumberField label="Residual value" value={residual} onChange={setResidual} hint="Leave empty if none" error={residualError} />
            <NumberField label="Useful life (years)" value={life} onChange={setLife} error={lifeError} />
          </>
        ) : (
          <>
            <NumberField label="Rate" value={rate} onChange={setRate} suffix="% a year" error={rateError} />
            <NumberField label="Years to show" value={life} onChange={setLife} hint="Default 5" error={lifeError} />
          </>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {ok ? `Schedule ready: ${rows.length} years, year 1 charge ${fmt(rows[0].charge)}, final net book value ${fmt(rows[rows.length - 1].nbv)}.` : ""}
      </p>
      {ok && (
        <div className="pc-surface overflow-x-auto rounded-tile">
          <table className="w-full text-left text-sm sm:text-base">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-3 align-bottom font-semibold first:pl-3 last:pr-3 sm:px-4">Year</th>
                <th scope="col" className="px-2 py-3 text-right align-bottom font-semibold first:pl-3 last:pr-3 sm:px-4">Depreciation charge</th>
                <th scope="col" className="px-2 py-3 text-right align-bottom font-semibold first:pl-3 last:pr-3 sm:px-4">Accumulated depreciation</th>
                <th scope="col" className="px-2 py-3 text-right align-bottom font-semibold first:pl-3 last:pr-3 sm:px-4">Net book value (carrying amount)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year} className="border-t border-hairline tabular-nums">
                  <th scope="row" className="py-3 pl-3 pr-2 font-semibold text-foreground sm:px-4">{row.year}</th>
                  <td className="px-2 py-3 text-right text-body sm:px-4">{fmt(row.charge)}</td>
                  <td className="px-2 py-3 text-right text-body sm:px-4">{fmt(row.acc)}</td>
                  <td className="py-3 pl-2 pr-3 text-right font-semibold text-foreground sm:px-4">{fmt(row.nbv)}</td>
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
