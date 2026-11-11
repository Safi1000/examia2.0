"use client";

import { useState } from "react";
import { ratio } from "@/components/tools/calc";
import { AskHamza, NumberField, Result, amount, fmt, num } from "@/components/tools/ToolBits";

/**
 * Accounting ratios exactly as the Cambridge IGCSE 0452 and O Level 7707
 * syllabus appendix defines them. Fill in what you have: each ratio shows
 * as soon as its figures are there.
 */
const FIELDS = [
  ["revenue", "Revenue"],
  ["costOfSales", "Cost of sales"],
  ["profitForYear", "Profit for the year"],
  ["profitBeforeInterest", "Profit for the year before interest"],
  ["capitalEmployed", "Capital employed"],
  ["currentAssets", "Current assets"],
  ["inventory", "Closing inventory"],
  ["openingInventory", "Opening inventory"],
  ["currentLiabilities", "Current liabilities"],
  ["tradeReceivables", "Trade receivables"],
  ["creditSales", "Credit sales"],
  ["tradePayables", "Trade payables"],
  ["creditPurchases", "Credit purchases"],
] as const;
type Key = (typeof FIELDS)[number][0];
const SIGNED = new Set<Key>(["profitForYear", "profitBeforeInterest"]);

export function RatioCalculator() {
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, ""])) as Record<Key, string>);
  // Profits can be losses; every other figure here is 0 or more.
  const n = (k: Key) => (SIGNED.has(k) ? num(v[k]) : amount(v[k]));
  const pos = (x: number | null) => x !== null && x !== 0;
  const out: Array<{ label: string; value: string; note: string }> = [];

  const rev = n("revenue");
  const cos = n("costOfSales");
  if (pos(rev) && cos !== null) {
    const gm = ratio.grossMargin(rev!, cos);
    out.push({ label: "Gross margin", value: `${fmt(gm)}%`, note: `Gross profit of ${fmt(rev! - cos)}, which is ${fmt(gm)} for every 100 of revenue. A rise usually means better selling prices or cheaper buying.` });
    if (pos(cos)) out.push({ label: "Mark-up", value: `${fmt(ratio.markUp(rev!, cos))}%`, note: "Gross profit as a percentage of cost of sales: how much is added to cost to set the price." });
  }
  const pfy = n("profitForYear");
  if (pos(rev) && pfy !== null)
    out.push({ label: "Profit margin", value: `${fmt(ratio.profitMargin(pfy, rev!))}%`, note: "Profit for the year per 100 of revenue. The gap between gross margin and profit margin is what expenses take." });
  const pbi = n("profitBeforeInterest");
  const ce = n("capitalEmployed");
  if (pbi !== null && pos(ce))
    out.push({ label: "Return on capital employed (ROCE)", value: `${fmt(ratio.roce(pbi, ce!))}%`, note: "Profit earned on the long-term money invested in the business. Compare it with what that money could earn elsewhere." });
  const ca = n("currentAssets");
  const cl = n("currentLiabilities");
  const inv = n("inventory");
  if (ca !== null && pos(cl)) {
    out.push({ label: "Current ratio", value: `${fmt(ratio.current(ca, cl!))} : 1`, note: "Current assets for each 1 of current liabilities. Below 1 : 1 the business may struggle to pay short-term debts." });
    if (inv !== null) out.push({ label: "Liquid (acid test) ratio", value: `${fmt(ratio.acid(ca, inv, cl!))} : 1`, note: "The same test without inventory, which may take time to sell. Below 1 : 1 is a warning sign." });
  }
  const open = n("openingInventory");
  if (cos !== null && inv !== null && open !== null && open + inv > 0)
    out.push({ label: "Rate of inventory turnover", value: `${fmt(ratio.inventoryTimes(cos, open, inv))} times`, note: "How many times average inventory is sold in the year. Faster usually means less money tied up in stock." });
  if (pos(cos) && inv !== null && open !== null)
    out.push({ label: "Inventory turnover", value: `${fmt(ratio.inventoryDays(cos!, open, inv), 1)} days`, note: "Average inventory ÷ cost of sales × 365: about how many days goods sit in stock before they are sold." });
  const tr = n("tradeReceivables");
  const cs = n("creditSales");
  if (tr !== null && pos(cs))
    out.push({ label: "Trade receivables turnover", value: `${fmt(ratio.receivablesDays(tr, cs!), 1)} days`, note: "Average days credit customers take to pay. Compare it with the credit period the business allows." });
  const tp = n("tradePayables");
  const cp = n("creditPurchases");
  if (tp !== null && pos(cp))
    out.push({ label: "Trade payables turnover", value: `${fmt(ratio.payablesDays(tp, cp!), 1)} days`, note: "Average days the business takes to pay its suppliers. Much longer than agreed can damage supplier trust." });

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([k, label]) => (
          <NumberField key={k} label={label} value={v[k]} allowNegative={SIGNED.has(k)} onChange={(x) => setV((s) => ({ ...s, [k]: x }))} />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Capital employed = issued shares + reserves + non-current liabilities (for a sole trader: capital + non-current liabilities).
      </p>
      <p className="sr-only" aria-live="polite">
        {out.length > 0 ? `${out.length} ${out.length === 1 ? "ratio" : "ratios"} worked out: ${out.map((r) => r.label).join(", ")}.` : ""}
      </p>
      {out.length === 0 ? (
        <p className="rounded-[16px] border border-hairline bg-card p-5 text-[15px] text-muted-foreground">Fill in the figures you have. Each ratio appears as soon as its figures are in.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {out.map((r, i) => (
            <Result key={r.label} label={r.label} value={r.value} note={r.note} strong={i === 0} />
          ))}
        </div>
      )}
      {out.length > 0 && <AskHamza tool="ratio calculator" summary={out.map((r) => `${r.label}: ${r.value}.`).join(" ")} />}
    </div>
  );
}
