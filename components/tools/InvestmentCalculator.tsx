"use client";

import { useState } from "react";
import { AskHamza, NumberField, Result, fmt, num } from "@/components/tools/ToolBits";

/**
 * Payback, accounting rate of return (ARR) and net present value (NPV) for
 * one project, as A Level Business 9609 asks for them. ARR is average profit
 * ÷ average investment × 100, average investment being (cost + residual
 * value) ÷ 2: dividing by the cost instead is the error the 9609 examiner
 * report names.
 */
export function InvestmentCalculator() {
  const [cost, setCost] = useState("");
  const [rate, setRate] = useState("10");
  const [residual, setResidual] = useState("");
  const [flows, setFlows] = useState<string[]>(["", "", "", "", ""]);
  const I = num(cost);
  const RV = num(residual) ?? 0;
  const r = num(rate);
  const cf = flows.map(num);
  const years = cf.reduce<number>((n, x, i) => (x !== null ? i + 1 : n), 0);
  const ready = I !== null && I > 0 && years > 0 && cf.slice(0, years).every((x) => x !== null);

  let payback: string | null = null;
  let arr = 0;
  let npv = 0;
  if (ready) {
    let cum = -I!;
    for (let y = 0; y < years; y++) {
      const before = cum;
      cum += cf[y]!;
      if (payback === null && cum >= 0) {
        const part = -before / cf[y]!;
        const months = Math.round(part * 12);
        payback = months === 12 ? `${y + 1} years` : `${y} years ${months} months`;
      }
    }
    const total = cf.slice(0, years).reduce<number>((s, x) => s + x!, 0);
    // Profit over the life = inflows minus the part of the cost not recovered.
    const avgProfit = (total - (I! - RV)) / years;
    arr = (avgProfit / ((I! + RV) / 2)) * 100;
    npv = cf.slice(0, years).reduce<number>((s, x, i) => s + x! / Math.pow(1 + (r ?? 0) / 100, i + 1), 0) - I!;
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Initial investment" value={cost} onChange={setCost} />
        <NumberField label="Residual value at the end" value={residual} onChange={setResidual} hint="Leave empty if none" />
        <NumberField label="Discount rate" value={rate} onChange={setRate} suffix="%" />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Net cash inflow each year</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {flows.map((f, i) => (
            <NumberField key={i} label={`Year ${i + 1}`} value={f} onChange={(x) => setFlows((s) => s.map((y, j) => (j === i ? x : y)))} />
          ))}
        </div>
        <button type="button" onClick={() => setFlows((s) => [...s, ""])} className="mt-3 text-sm font-semibold text-gold hover:underline">
          Add a year
        </button>
      </div>
      {ready && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result strong label="Payback" value={payback ?? "Not within these years"} note="Time until the cash inflows add up to the investment, assuming cash comes in evenly through each year." />
          <Result label="Net present value" value={fmt(npv)} note={`Each year's cash discounted at ${rate}% (÷ (1 + r) to the power of the year), minus the investment. Positive means it beats that rate.`} />
          <Result
            label="Accounting rate of return (ARR)"
            value={`${fmt(arr, 1)}%`}
            note="Average annual profit ÷ average investment × 100, where average investment is (cost + residual value) ÷ 2. Dividing by the cost instead is the most common ARR mistake."
          />
        </div>
      )}
      {ready && <AskHamza tool="investment appraisal calculator" summary={`Investment ${cost}: payback ${payback ?? "not reached"}, NPV ${fmt(npv)} at ${rate}%, ARR ${fmt(arr, 1)}%.`} />}
    </div>
  );
}
