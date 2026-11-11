"use client";

import { useState } from "react";
import { breakEven } from "@/components/tools/calc";
import { AskHamza, NumberField, Result, amount, fmt } from "@/components/tools/ToolBits";

/** Break-even, contribution and margin of safety, the way Business papers ask for them. */
export function BreakEvenCalculator() {
  const [fc, setFc] = useState("");
  const [price, setPrice] = useState("");
  const [vc, setVc] = useState("");
  const [out, setOut] = useState("");
  const F = amount(fc);
  const P = amount(price);
  const V = amount(vc);
  const Q = amount(out);
  const res = F !== null && P !== null && V !== null ? breakEven(F, P, V, Q) : null;
  const be = res?.ok ? res : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Total fixed costs" value={fc} onChange={setFc} />
        <NumberField label="Selling price per unit" value={price} onChange={setPrice} />
        <NumberField label="Variable cost per unit" value={vc} onChange={setVc} />
        <NumberField label="Planned output (units)" value={out} onChange={setOut} hint="Optional: for profit and margin of safety" />
      </div>
      <div aria-live="polite" className="space-y-8">
        {res && !be && (
          <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-body">
            The price does not cover the variable cost, so every unit sold adds to the loss. There is no break-even point.
          </p>
        )}
        {be && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Result
              strong
              label="Break-even output"
              value={`${fmt(be.units, 0)} units`}
              note={`Fixed costs ÷ contribution per unit = ${fmt(F!)} ÷ ${fmt(be.contribution)} = ${fmt(be.exact)}.${Math.abs(be.units - be.exact) > 1e-9 ? " Round up: a part unit cannot be sold." : ""}`}
            />
            <Result label="Contribution per unit" value={fmt(be.contribution)} note="Selling price minus variable cost: what each unit adds towards fixed costs, then profit." />
            <Result label="Break-even revenue" value={fmt(be.revenue)} note="Break-even output × selling price." />
            {be.planned && (
              <>
                <Result
                  label={be.planned.margin >= 0 ? "Margin of safety" : "Short of break-even by"}
                  value={`${fmt(Math.abs(be.planned.margin), 0)} units`}
                  note={
                    be.planned.margin >= 0
                      ? be.planned.marginPct !== null
                        ? `Sales could fall by this much before a loss: ${fmt(be.planned.marginPct, 1)}% of planned output.`
                        : "Sales could fall by this much before a loss."
                      : "Planned output is below break-even, so the plan makes a loss."
                  }
                />
                <Result label={be.planned.profit >= 0 ? "Profit at planned output" : "Loss at planned output"} value={fmt(Math.abs(be.planned.profit))} note="Total contribution minus fixed costs." />
              </>
            )}
          </div>
        )}
      </div>
      {be && <AskHamza tool="break-even calculator" summary={`Fixed costs ${fc}, price ${price}, variable cost ${vc}: break-even ${fmt(be.units, 0)} units.`} />}
    </div>
  );
}
