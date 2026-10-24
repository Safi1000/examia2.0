"use client";

import { useState } from "react";
import { AskHamza, NumberField, Result, fmt, num } from "@/components/tools/ToolBits";

/** Break-even, contribution and margin of safety, the way Business papers ask for them. */
export function BreakEvenCalculator() {
  const [fc, setFc] = useState("");
  const [price, setPrice] = useState("");
  const [vc, setVc] = useState("");
  const [out, setOut] = useState("");
  const F = num(fc);
  const P = num(price);
  const V = num(vc);
  const Q = num(out);
  const unit = P !== null && V !== null ? P - V : null;
  const be = F !== null && unit !== null && unit > 0 ? F / unit : null;
  const beUnits = be !== null ? Math.ceil(be) : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Total fixed costs" value={fc} onChange={setFc} />
        <NumberField label="Selling price per unit" value={price} onChange={setPrice} />
        <NumberField label="Variable cost per unit" value={vc} onChange={setVc} />
        <NumberField label="Planned output (units)" value={out} onChange={setOut} hint="Optional: for profit and margin of safety" />
      </div>
      {unit !== null && unit <= 0 && (
        <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-body">
          The price does not cover the variable cost, so every unit sold adds to the loss. There is no break-even point.
        </p>
      )}
      {be !== null && unit !== null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result strong label="Break-even output" value={`${fmt(beUnits!, 0)} units`} note={`Fixed costs ÷ contribution per unit = ${fmt(F!)} ÷ ${fmt(unit)} = ${fmt(be)}. Round up: a part unit cannot be sold.`} />
          <Result label="Contribution per unit" value={fmt(unit)} note="Selling price minus variable cost: what each unit adds towards fixed costs, then profit." />
          <Result label="Break-even revenue" value={fmt(beUnits! * P!)} note="Break-even output × selling price." />
          {Q !== null && (
            <>
              <Result
                label={Q >= beUnits! ? "Margin of safety" : "Short of break-even by"}
                value={`${fmt(Math.abs(Q - beUnits!), 0)} units`}
                note={Q >= beUnits! ? `Sales could fall by this much before a loss: ${fmt(((Q - beUnits!) / Q) * 100, 1)}% of planned output.` : "Planned output is below break-even, so the plan makes a loss."}
              />
              <Result label={Q * unit - F! >= 0 ? "Profit at planned output" : "Loss at planned output"} value={fmt(Math.abs(Q * unit - F!))} note="Total contribution minus fixed costs." />
            </>
          )}
        </div>
      )}
      {be !== null && (
        <AskHamza tool="break-even calculator" summary={`Fixed costs ${fc}, price ${price}, variable cost ${vc}: break-even ${fmt(beUnits!, 0)} units.`} />
      )}
    </div>
  );
}
