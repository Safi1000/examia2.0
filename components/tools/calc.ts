/**
 * The sums behind the free calculators, kept apart from the screens so they
 * can be checked against hand-worked answers. No imports on purpose: a plain
 * Node script can load this file.
 */

/* ---------- Break-even ---------- */

export interface BreakEven {
  ok: true;
  contribution: number;
  /** Fixed costs ÷ contribution, before rounding. */
  exact: number;
  /** Rounded up: a part unit cannot be sold. */
  units: number;
  revenue: number;
  planned: null | {
    /** Planned output − break-even output (negative when short). */
    margin: number;
    /** Margin as a % of planned output, or null when output is 0. */
    marginPct: number | null;
    /** Total contribution − fixed costs. */
    profit: number;
  };
}

/** null for any missing figure; `contribution <= 0` means no break-even point. */
export function breakEven(F: number, P: number, V: number, Q: number | null): BreakEven | { ok: false; contribution: number } {
  const contribution = P - V;
  if (!(contribution > 0)) return { ok: false, contribution };
  const exact = F / contribution;
  // 1e-9 stops 1000.0000000001 (a float artefact) rounding up to 1001.
  const units = Math.ceil(exact - 1e-9);
  return {
    ok: true,
    contribution,
    exact,
    units,
    revenue: units * P,
    planned:
      Q === null
        ? null
        : { margin: Q - units, marginPct: Q > 0 ? ((Q - units) / Q) * 100 : null, profit: Q * contribution - F },
  };
}

/* ---------- Depreciation ---------- */

export interface DepRow {
  year: number;
  charge: number;
  acc: number;
  nbv: number;
}

export function straightLine(cost: number, residual: number, life: number): DepRow[] {
  const charge = (cost - residual) / life;
  const rows: DepRow[] = [];
  for (let y = 1; y <= life; y++) {
    // Worked from the year number, not added up, so the last year lands exactly on the residual value.
    const acc = y === life ? cost - residual : charge * y;
    rows.push({ year: y, charge, acc, nbv: cost - acc });
  }
  return rows;
}

export function reducingBalance(cost: number, ratePct: number, years: number): DepRow[] {
  const rows: DepRow[] = [];
  let acc = 0;
  for (let y = 1; y <= years; y++) {
    const charge = ((cost - acc) * ratePct) / 100;
    acc += charge;
    rows.push({ year: y, charge, acc, nbv: cost - acc });
  }
  return rows;
}

/* ---------- Elasticity ---------- */

export const pctChange = (before: number, after: number) => ((after - before) / before) * 100;

/** Rounded to the 2 decimal places shown, so the label always matches the number on screen. */
export const shown = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function pedMeaning(e: number): string {
  const a = Math.abs(shown(e));
  if (a === 0) return "Perfectly inelastic: quantity demanded did not change at all.";
  if (a > 1) return "Elastic: demand changes by a bigger percentage than price.";
  if (a < 1) return "Inelastic: demand changes by a smaller percentage than price.";
  return "Unitary: demand changes by the same percentage as price.";
}

export function yedMeaning(e: number): string {
  const v = shown(e);
  if (v > 1) return "Positive and above 1: a normal good, income elastic (often a luxury).";
  if (v > 0) return "Positive: a normal good.";
  if (v < 0) return "Negative: an inferior good. People buy less as income rises.";
  return "Zero: income has no effect on demand.";
}

export function xedMeaning(e: number): string {
  const v = shown(e);
  if (v > 0) return "Positive: the goods are substitutes.";
  if (v < 0) return "Negative: the goods are complements.";
  return "Zero: the goods are unrelated.";
}

/* ---------- Investment appraisal ---------- */

export interface Appraisal {
  /** Years as a decimal, or null if not paid back within the years given. */
  payback: number | null;
  paybackText: string | null;
  arr: number;
  /** null when no usable discount rate was given. */
  npv: number | null;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function paybackText(years: number, months: number): string {
  if (months === 12) return plural(years + 1, "year");
  if (months === 0) return plural(years, "year");
  if (years === 0) return plural(months, "month");
  return `${plural(years, "year")} ${plural(months, "month")}`;
}

/**
 * The residual value is cash the business gets back at the end, so it is
 * counted in the final year for payback and NPV, and taken off the cost for
 * ARR's profit. Enter it once, in its own box, not inside the last year.
 */
export function appraise(cost: number, residual: number, ratePct: number | null, flows: number[]): Appraisal {
  const cash = flows.map((x, i) => (i === flows.length - 1 ? x + residual : x));
  let payback: number | null = null;
  let text: string | null = null;
  let cum = -cost;
  for (let y = 0; y < cash.length; y++) {
    const before = cum;
    cum += cash[y];
    if (payback === null && cum >= 0) {
      const part = -before / cash[y];
      payback = y + part;
      text = paybackText(y, Math.round(part * 12));
    }
  }
  const total = flows.reduce((s, x) => s + x, 0);
  const avgProfit = (total - (cost - residual)) / flows.length;
  const arr = (avgProfit / ((cost + residual) / 2)) * 100;
  const npv =
    ratePct === null || ratePct < 0
      ? null
      : cash.reduce((s, x, i) => s + x / Math.pow(1 + ratePct / 100, i + 1), 0) - cost;
  return { payback, paybackText: text, arr, npv };
}

/* ---------- Ratios (Cambridge IGCSE 0452 / O Level 7707 appendix) ---------- */

export const ratio = {
  grossMargin: (revenue: number, costOfSales: number) => ((revenue - costOfSales) / revenue) * 100,
  markUp: (revenue: number, costOfSales: number) => ((revenue - costOfSales) / costOfSales) * 100,
  profitMargin: (profit: number, revenue: number) => (profit / revenue) * 100,
  roce: (profitBeforeInterest: number, capitalEmployed: number) => (profitBeforeInterest / capitalEmployed) * 100,
  current: (ca: number, cl: number) => ca / cl,
  acid: (ca: number, inventory: number, cl: number) => (ca - inventory) / cl,
  inventoryTimes: (costOfSales: number, opening: number, closing: number) => costOfSales / ((opening + closing) / 2),
  inventoryDays: (costOfSales: number, opening: number, closing: number) => ((opening + closing) / 2 / costOfSales) * 365,
  receivablesDays: (receivables: number, creditSales: number) => (receivables / creditSales) * 365,
  payablesDays: (payables: number, creditPurchases: number) => (payables / creditPurchases) * 365,
};

/* ---------- Dates (exam countdown, revision planner) ---------- */

/** Whole calendar days from `nowMs` (read in the visitor's own time zone) to a YYYY-MM-DD date. */
export function calendarDaysUntil(ymd: string, nowMs: number): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const check = new Date(target);
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * How the weeks to the first exam are shared out: a final week, about a
 * third (at most 8) for past papers, the rest for learning. Never more
 * weeks than there are.
 */
export function splitWeeks(weeks: number): { learn: number; papers: number; final: number } {
  const papers = weeks >= 3 ? Math.min(8, Math.max(1, Math.round(weeks * 0.3))) : 0;
  return { learn: Math.max(1, weeks - papers - 1), papers, final: 1 };
}

/**
 * Which learn week each item goes in, spreading the weighted load evenly over
 * exactly `weeks` weeks (so a short topic list does not end weeks early).
 */
export function spread(weights: number[], weeks: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const per = total / weeks;
  let before = 0;
  return weights.map((w) => {
    const wk = per > 0 ? Math.min(weeks - 1, Math.floor((before + 1e-9) / per)) : 0;
    before += w;
    return wk;
  });
}
