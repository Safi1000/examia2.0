"use client";

import { useState } from "react";
import { appraise } from "@/components/tools/calc";
import { AskHamza, NumberField, Result, amount, fieldError, fmt, num } from "@/components/tools/ToolBits";

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
  const I = amount(cost);
  const RV = amount(residual) ?? 0;
  const r = amount(rate);
  const cf = flows.map(num);
  const years = cf.reduce<number>((n, x, i) => (x !== null ? i + 1 : n), 0);
  const gaps = cf.slice(0, years).some((x) => x === null);
  const ready = I !== null && I > 0 && years > 0 && !gaps && !fieldError(residual);
  const res = ready ? appraise(I!, RV, r, cf.slice(0, years) as number[]) : null;
  const payback = res?.paybackText ?? null;
  const npvText = res?.npv != null ? fmt(res.npv) : "Add a discount rate";

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Initial investment" value={cost} onChange={setCost} />
        <NumberField label="Residual value at the end" value={residual} onChange={setResidual} hint="Leave empty if none. Counted as cash in the final year, so do not add it to that year too." />
        <NumberField label="Discount rate" value={rate} onChange={setRate} suffix="%" />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">Net cash inflow each year</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {flows.map((f, i) => (
            <NumberField key={i} label={`Year ${i + 1}`} value={f} allowNegative onChange={(x) => setFlows((s) => s.map((y, j) => (j === i ? x : y)))} />
          ))}
        </div>
        <button type="button" onClick={() => setFlows((s) => [...s, ""])} className="mt-1 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-gold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          Add a year
        </button>
      </div>
      <div aria-live="polite" className="space-y-8">
      {gaps && (
        <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-body">
          Fill in every year up to the last one you used. Enter 0 for a year with no cash inflow.
        </p>
      )}
      {res && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Result strong label="Payback" value={payback ?? "Not within these years"} note="Time until the cash inflows add up to the investment, assuming cash comes in evenly through each year." />
          <Result label="Net present value" value={npvText} note={res.npv != null ? `Each year's cash discounted at ${r}% (÷ (1 + r) to the power of the year), minus the investment. Positive means it beats that rate.` : "Enter the discount rate from the question to see the NPV."} />
          <Result
            label="Accounting rate of return (ARR)"
            value={`${fmt(res.arr, 1)}%`}
            note="Average annual profit ÷ average investment × 100, where average investment is (cost + residual value) ÷ 2. Dividing by the cost instead is the most common ARR mistake."
          />
        </div>
      )}
      </div>
      {res && <AskHamza tool="investment appraisal calculator" summary={`Investment ${cost}: payback ${payback ?? "not reached"}, NPV ${npvText}${res.npv != null ? ` at ${r}%` : ""}, ARR ${fmt(res.arr, 1)}%.`} />}
    </div>
  );
}
