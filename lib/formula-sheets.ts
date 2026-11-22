/**
 * Formula sheets: one per syllabus, at /tools/formula-sheet/<syllabus slug>.
 *
 * Accounting and Business sheets hold exactly the formulas Cambridge prints in
 * the syllabus, nothing added. Economics syllabuses name the calculations but
 * print no formulas, so those sheets give the standard forms and say so.
 * Minus signs are the real minus character (U+2212), never a dash.
 */
import { SYLLABI, type SyllabusInfo } from "@/lib/syllabus";

export interface Formula {
  name: string;
  /** Top line of the fraction, or the whole expression when there is no bottom. */
  top: string;
  bottom?: string;
  /** What follows the fraction, like "× 100". */
  times?: string;
  /** How the answer is given: %, days, times, $ ... */
  unit?: string;
  /** A second accepted form. */
  or?: { top: string; bottom?: string; times?: string };
  /** A definition the formula depends on. */
  where?: string;
  /** One plain line: what the answer tells you. */
  tells: string;
  /** "A Level only" and similar. */
  tag?: string;
}

export interface FormulaGroup {
  title: string;
  formulas: Formula[];
}

export interface FormulaSheet {
  code: string;
  /** Short heading and the title tag. */
  h1: string;
  title: string;
  description: string;
  /** Where the formulas come from, in one honest line. */
  source: string;
  /** True when Cambridge prints these formulas in the syllabus itself. */
  official: boolean;
  /** Rules that apply to the whole sheet. */
  rules: string[];
  groups: FormulaGroup[];
  links: Array<{ href: string; label: string }>;
}

const f = (name: string, top: string, bottom: string | undefined, times: string | undefined, unit: string | undefined, tells: string, extra: Partial<Formula> = {}): Formula => ({
  name,
  top,
  ...(bottom ? { bottom } : {}),
  ...(times ? { times } : {}),
  ...(unit ? { unit } : {}),
  tells,
  ...extra,
});

const CAPITAL_EMPLOYED = "Capital employed = issued shares + reserves + non-current liabilities";

/* ───────── Accounting 0452 and 7707 (same list in both syllabuses) ───────── */
const ACCOUNTING_OL: FormulaGroup[] = [
  {
    title: "Profitability ratios",
    formulas: [
      f("Gross profit margin", "Gross profit", "Revenue", "× 100", "%", "How much gross profit the business keeps from each $100 of sales."),
      f("Mark-up", "Gross profit", "Cost of sales", "× 100", "%", "How much is added to the cost of the goods to reach the selling price."),
      f("Profit margin", "Profit for the year", "Revenue", "× 100", "%", "How much of each $100 of sales is left after all expenses."),
      f("Return on capital employed (ROCE)", "Profit for the year before interest", "Capital employed", "× 100", "%", "How much profit the business earns from the long term money invested in it.", { where: CAPITAL_EMPLOYED }),
    ],
  },
  {
    title: "Liquidity ratios",
    formulas: [
      f("Current (working capital) ratio", "Current assets", "Current liabilities", undefined, "ratio", "Whether the business can pay its short term debts from its short term assets."),
      f("Acid test (liquid) ratio", "Current assets − inventory", "Current liabilities", undefined, "ratio", "The same test without inventory, because inventory takes time to sell."),
    ],
  },
  {
    title: "Efficiency ratios",
    formulas: [
      f("Rate of inventory turnover", "Cost of sales", "Average inventory", undefined, "times", "How many times the business sold and replaced its inventory in the year."),
      f("Inventory turnover", "Average inventory", "Cost of sales", "× 365", "days", "How many days, on average, goods sit in the business before they are sold."),
      f("Trade receivables turnover", "Trade receivables", "Credit sales", "× 365", "days", "How many days credit customers take to pay."),
      f("Trade payables turnover", "Trade payables", "Credit purchases", "× 365", "days", "How many days the business takes to pay its credit suppliers."),
    ],
  },
];

/* ───────── Business 0264 and 7081 (same list in both syllabuses) ───────── */
const BUSINESS_OL: FormulaGroup[] = [
  {
    title: "Marketing",
    formulas: [f("Market share", "Sales revenue of a business", "Total sales revenue for the whole market", "× 100", "%", "How much of the whole market's sales belong to this one business.")],
  },
  {
    title: "Production",
    formulas: [
      f("Labour productivity", "Output per period (units)", "Number of employees", undefined, "units per employee", "How much each worker produces, on average."),
      f("Total variable cost", "Variable cost per unit × number of units", undefined, undefined, "$", "The costs that rise and fall with output, for all units together."),
      f("Variable cost per unit", "Total variable cost", "Number of units", undefined, "$", "The variable cost of making one unit."),
      f("Total cost", "Total fixed costs + total variable costs", undefined, undefined, "$", "Everything the business spends to make that output."),
      f("Average cost", "Total cost", "Number of units", undefined, "$", "The cost of making one unit, on average."),
      f("Break-even output", "Fixed costs", "Contribution per unit", undefined, "units", "How many units must be sold before the business stops making a loss.", {
        where: "Contribution per unit = selling price per unit − variable cost per unit",
      }),
      f("Margin of safety", "Actual number of sales − break-even number of sales", undefined, undefined, "units", "How far sales can fall before the business starts making a loss."),
    ],
  },
  {
    title: "Business finance",
    formulas: [
      f("Revenue", "Selling price per unit × number of units sold", undefined, undefined, "$", "The money that comes in from sales."),
      f("Gross profit", "Revenue − cost of sales", undefined, undefined, "$", "Profit from buying and selling, before expenses."),
      f("Profit", "Total revenue − total costs", undefined, undefined, "$", "What is left once every cost is paid.", { or: { top: "Gross profit − expenses" } }),
      f("Working capital", "Current assets − current liabilities", undefined, undefined, "$", "The money available for the day to day running of the business."),
      f("Profit margin", "Profit", "Revenue", "× 100", "%", "How much of each $100 of sales ends up as profit."),
      f("Gross profit margin", "Gross profit", "Revenue", "× 100", "%", "How much gross profit comes from each $100 of sales."),
      f("Return on capital employed (ROCE)", "Profit", "Capital employed", "× 100", "%", "How much profit the business earns from the money invested in it."),
    ],
  },
  {
    title: "Liquidity ratios",
    formulas: [
      f("Current ratio", "Current assets : current liabilities", undefined, undefined, "ratio : 1 or a number", "Whether the business can pay its short term debts.", {
        or: { top: "Current assets", bottom: "Current liabilities" },
      }),
      f("Acid test ratio", "Current assets − inventory : current liabilities", undefined, undefined, "ratio : 1 or a number", "The same test without inventory, which may be slow to sell.", {
        or: { top: "Current assets − inventory", bottom: "Current liabilities" },
      }),
    ],
  },
];

/* ───────── Accounting 9706 (appendix: summary of commonly used ratios) ───────── */
const A2 = { tag: "A Level only" };
const ACCOUNTING_AL: FormulaGroup[] = [
  {
    title: "Profitability ratios",
    formulas: [
      f("Gross profit margin", "Gross profit", "Revenue", "× 100", "%", "How much gross profit the business keeps from each $100 of sales."),
      f("Mark-up", "Gross profit", "Cost of sales", "× 100", "%", "How much is added to cost to reach the selling price."),
      f("Profit margin", "Profit for the year", "Revenue", "× 100", "%", "How much of each $100 of sales is left as profit for the year.", {
        or: { top: "Profit for the year (after interest)", bottom: "Revenue", times: "× 100" },
      }),
      f("Return on capital employed", "Profit from operations", "Capital employed", "× 100", "%", "How much operating profit the business earns from its long term funds.", { where: CAPITAL_EMPLOYED }),
      f("Expenses to revenue ratio", "Expenses", "Revenue", "× 100", "%", "How much of each $100 of sales is used up by expenses."),
      f("Operating expenses to revenue ratio", "Operating expenses", "Revenue", "× 100", "%", "How much of each $100 of sales is used up by operating expenses."),
    ],
  },
  {
    title: "Liquidity ratios",
    formulas: [
      f("Current ratio", "Current assets", "Current liabilities", undefined, "ratio", "Whether short term assets cover short term debts."),
      f("Acid test ratio", "Current assets − inventory", "Current liabilities", undefined, "ratio", "The same test without inventory."),
    ],
  },
  {
    title: "Efficiency ratios",
    formulas: [
      f("Non-current asset turnover", "Net revenue", "Total net book value of non-current assets", undefined, "times", "How much revenue each $1 of non-current assets produces."),
      f("Trade receivables turnover", "Trade receivables", "Credit sales", "× 365", "days", "How many days credit customers take to pay."),
      f("Trade payables turnover", "Trade payables", "Credit purchases", "× 365", "days", "How many days the business takes to pay its suppliers."),
      f("Rate of inventory turnover", "Cost of sales", "Average inventory", undefined, "times", "How many times inventory was sold and replaced in the year."),
      f("Inventory turnover", "Average inventory", "Cost of sales", "× 365", "days", "How many days inventory is held before it is sold."),
    ],
  },
  {
    title: "Solvency and other ratios",
    formulas: [
      f("Working capital cycle", "Trade receivables turnover (days) + inventory turnover (days) − trade payables turnover (days)", undefined, undefined, "days", "How long cash is tied up between paying suppliers and collecting from customers.", A2),
      f("Net working assets to revenue (sales)", "Net working assets", "Revenue (sales)", "× 100", "%", "How much working capital is needed to support each $100 of sales.", {
        ...A2,
        where: "Net working assets = inventories + trade receivables − trade payables",
      }),
      f("Interest cover", "Profit from operations", "Interest payable", undefined, "times", "How many times over the business can pay its interest from operating profit.", A2),
      f("Gearing", "Fixed cost capital", "Total capital", "× 100", "%", "How much of the long term funding is borrowed.", {
        ...A2,
        or: { top: "Non-current liabilities", bottom: "Issued ordinary share capital + all reserves + non-current liabilities", times: "× 100" },
      }),
    ],
  },
  {
    title: "Investment ratios (stock exchange ratios)",
    formulas: [
      f("Earnings per share", "Profit for the year", "Number of issued ordinary shares", undefined, undefined, "The profit earned for each ordinary share.", A2),
      f("Price/earnings", "Market price per share", "Earnings per share", undefined, undefined, "How many years of current earnings investors pay for one share.", A2),
      f("Dividend per share", "Annual ordinary dividend", "Number of issued ordinary shares", undefined, undefined, "The dividend for each ordinary share.", {
        ...A2,
        where: "Annual ordinary dividend = interim dividend paid + final dividend proposed",
      }),
      f("Dividend yield", "Dividend per share", "Market price per share", undefined, undefined, "The dividend an investor receives compared with the price paid for the share.", A2),
      f("Dividend cover", "Profit for the year available to pay ordinary dividend", "Annual ordinary dividend", undefined, undefined, "How many times the profit could pay the ordinary dividend.", A2),
    ],
  },
];

/* ───────── Business 9609 (ratios to support analysis of published accounts) ───────── */
const BUSINESS_AL: FormulaGroup[] = [
  {
    title: "Liquidity ratios",
    formulas: [
      f("Current ratio", "Current assets", "Current liabilities", undefined, "ratio", "Whether short term assets cover short term debts."),
      f("Acid test ratio", "Current assets − inventory", "Current liabilities", undefined, "ratio", "The same test without inventory."),
    ],
  },
  {
    title: "Profitability ratios",
    formulas: [
      f("Gross profit margin", "Gross profit", "Revenue", "× 100", "%", "How much gross profit comes from each $100 of sales."),
      f("Operating profit margin", "Profit from operations", "Revenue", "× 100", "%", "How much operating profit comes from each $100 of sales."),
      f("Return on capital employed", "Profit from operations", "Capital employed", "× 100", "%", "How much operating profit the business earns from its long term funds.", { where: CAPITAL_EMPLOYED }),
    ],
  },
  {
    title: "Financial efficiency ratios",
    formulas: [
      f("Trade receivables turnover", "Trade receivables", "Credit sales", "× 365", "days", "How many days credit customers take to pay."),
      f("Trade payables turnover", "Trade payables", "Credit purchases", "× 365", "days", "How many days the business takes to pay its suppliers."),
      f("Rate of inventory turnover", "Cost of sales", "Average inventory", undefined, "times", "How many times inventory was sold and replaced in the year."),
    ],
  },
  {
    title: "Gearing ratio",
    formulas: [f("Gearing", "Non-current liabilities", "Capital employed", "× 100", "%", "How much of the long term funding is borrowed.")],
  },
  {
    title: "Investment ratios",
    formulas: [
      f("Price/earnings ratio", "Market price per share", "Earnings per share", undefined, undefined, "How many years of current earnings investors pay for one share."),
      f("Dividend yield", "Dividend per share", "Market price per share", "× 100", "%", "The dividend an investor receives compared with the share price."),
      f("Dividend cover", "Profit for the year", "Annual dividend", undefined, undefined, "How many times the profit could pay the dividend."),
    ],
  },
];

/* ───────── Economics 0455 and 2281 (calculations the syllabus names; standard forms) ───────── */
const ECONOMICS_OL: FormulaGroup[] = [
  {
    title: "Elasticity",
    formulas: [
      f("Price elasticity of demand (PED)", "% change in quantity demanded", "% change in price", undefined, undefined, "How strongly demand responds when the price changes."),
      f("Price elasticity of supply (PES)", "% change in quantity supplied", "% change in price", undefined, undefined, "How strongly supply responds when the price changes."),
    ],
  },
  {
    title: "Costs of production",
    formulas: [
      f("Total cost (TC)", "Fixed cost + variable cost", undefined, undefined, "$", "Everything the firm spends to make that output."),
      f("Average total cost (ATC)", "Total cost", "Output", undefined, "$", "The cost of one unit, on average."),
      f("Average fixed cost (AFC)", "Fixed cost", "Output", undefined, "$", "The fixed cost carried by each unit."),
      f("Average variable cost (AVC)", "Variable cost", "Output", undefined, "$", "The variable cost of each unit."),
    ],
  },
  {
    title: "Revenue",
    formulas: [
      f("Total revenue (TR)", "Price × quantity sold", undefined, undefined, "$", "The money the firm receives from sales."),
      f("Average revenue (AR)", "Total revenue", "Quantity sold", undefined, "$", "The revenue from each unit, which is the price."),
    ],
  },
  {
    title: "The economy",
    formulas: [
      f("Government budget balance", "Government revenue − government spending", undefined, undefined, "$", "A positive answer is a budget surplus. A negative answer is a budget deficit."),
      f("Unemployment rate", "Number of people unemployed", "Labour force", "× 100", "%", "The share of the labour force that wants a job and does not have one."),
    ],
  },
];

/* ───────── Economics 9708 (calculations the syllabus names; standard forms) ───────── */
const ECONOMICS_AL: FormulaGroup[] = [
  {
    title: "Elasticity (AS Level)",
    formulas: [
      f("Price elasticity of demand (PED)", "% change in quantity demanded", "% change in price", undefined, undefined, "How strongly demand responds to a change in price."),
      f("Income elasticity of demand (YED)", "% change in quantity demanded", "% change in income", undefined, undefined, "How demand responds to a change in income. The sign shows normal or inferior."),
      f("Cross elasticity of demand (XED)", "% change in quantity demanded of good A", "% change in price of good B", undefined, undefined, "How demand for one good responds to the price of another. The sign shows substitutes or complements."),
      f("Price elasticity of supply (PES)", "% change in quantity supplied", "% change in price", undefined, undefined, "How strongly supply responds to a change in price."),
    ],
  },
  {
    title: "Balance of trade (AS Level)",
    formulas: [
      f("Balance of trade in goods", "Exports of goods − imports of goods", undefined, undefined, "$", "A positive answer is a surplus, a negative answer is a deficit."),
      f("Balance of trade in services", "Exports of services − imports of services", undefined, undefined, "$", "The same test for services."),
      f("Balance of trade in goods and services", "Balance of trade in goods + balance of trade in services", undefined, undefined, "$", "The two trade balances added together."),
    ],
  },
  {
    title: "Utility, costs and benefits",
    formulas: [
      f("Marginal utility (MU)", "Change in total utility", "Change in quantity consumed", undefined, undefined, "The extra satisfaction from one more unit.", A2),
      f("Social cost (SC)", "Private cost + external cost", undefined, undefined, undefined, "The full cost to society of producing or consuming.", A2),
      f("Social benefit (SB)", "Private benefit + external benefit", undefined, undefined, undefined, "The full benefit to society.", A2),
    ],
  },
  {
    title: "Production, costs and revenue",
    formulas: [
      f("Average product (AP)", "Total product", "Quantity of the variable factor", undefined, undefined, "Output for each unit of the variable factor, such as each worker.", A2),
      f("Marginal product (MP)", "Change in total product", "Change in quantity of the variable factor", undefined, undefined, "The extra output from one more unit of the variable factor.", A2),
      f("Total cost (TC)", "Fixed cost + variable cost", undefined, undefined, "$", "Everything the firm spends to make that output.", A2),
      f("Average cost (AC)", "Total cost", "Output", undefined, "$", "The cost of one unit, on average. It also equals AFC + AVC.", A2),
      f("Average fixed cost (AFC)", "Fixed cost", "Output", undefined, "$", "The fixed cost carried by each unit.", A2),
      f("Average variable cost (AVC)", "Variable cost", "Output", undefined, "$", "The variable cost of each unit.", A2),
      f("Marginal cost (MC)", "Change in total cost", "Change in output", undefined, "$", "The cost of producing one more unit.", A2),
      f("Total revenue (TR)", "Price × quantity sold", undefined, undefined, "$", "The money the firm receives from sales.", A2),
      f("Average revenue (AR)", "Total revenue", "Quantity sold", undefined, "$", "Revenue for each unit, which is the price.", A2),
      f("Marginal revenue (MR)", "Change in total revenue", "Change in quantity sold", undefined, "$", "The extra revenue from selling one more unit.", A2),
      f("Profit", "Total revenue − total cost", undefined, undefined, "$", "Total cost includes normal profit, so a positive answer is supernormal profit and a negative answer is subnormal profit.", A2),
    ],
  },
  {
    title: "Markets",
    formulas: [
      f("Concentration ratio", "Market shares of the largest firms, added together", undefined, undefined, "%", "How much of the market the biggest few firms hold. A three firm ratio adds the top three.", A2),
      f("Marginal revenue product (MRP)", "Marginal product × marginal revenue", undefined, undefined, "$", "The extra revenue a firm earns from employing one more worker.", A2),
    ],
  },
  {
    title: "The multiplier and national income",
    formulas: [
      f("Multiplier, closed economy without government", "1", "mps", undefined, undefined, "How many times an injection is multiplied when saving is the only withdrawal.", { ...A2, or: { top: "1", bottom: "1 − mpc" } }),
      f("Multiplier, closed economy with government", "1", "mps + mrt", undefined, undefined, "Saving and tax are the withdrawals.", A2),
      f("Multiplier, open economy without government", "1", "mps + mpm", undefined, undefined, "Saving and imports are the withdrawals.", A2),
      f("Multiplier, open economy with government", "1", "mps + mrt + mpm", undefined, undefined, "Saving, tax and imports are all withdrawals.", A2),
      f("Change in national income", "Change in aggregate demand × multiplier", undefined, undefined, "$", "The final change in national income after an injection or a withdrawal.", A2),
      f("Average propensity to save (aps)", "Saving", "Income", undefined, undefined, "The share of total income that is saved. Swap saving for consumption (apc), imports (apm) or tax (art).", A2),
      f("Marginal propensity to save (mps)", "Change in saving", "Change in income", undefined, undefined, "The share of extra income that is saved. Swap saving for consumption (mpc), imports (mpm) or tax (mrt).", A2),
    ],
  },
];

const ACC_RULE = "Cambridge says these are the only formulas accepted in your answers.";

const SHEETS: FormulaSheet[] = [
  {
    code: "7707",
    h1: "O Level Accounting 7707 formula sheet",
    title: "7707 Formula Sheet 2027: Every Accounting Ratio Formula",
    description: "Every accounting ratio formula in the O Level Accounting 7707 syllabus for 2027 to 2029, exactly as Cambridge prints them. Free, and it prints on one page.",
    source: "The accounting ratios list in the Cambridge O Level Accounting 7707 syllabus for 2027, 2028 and 2029.",
    official: true,
    rules: [ACC_RULE, "Give liquidity answers as a ratio."],
    groups: ACCOUNTING_OL,
    links: [{ href: "/tools/ratio-calculator", label: "Accounting ratio calculator" }],
  },
  {
    code: "0452",
    h1: "IGCSE Accounting 0452 formula sheet",
    title: "0452 Formula Sheet 2027: Every Accounting Ratio Formula",
    description: "Every accounting ratio formula in the IGCSE Accounting 0452 syllabus for 2027 to 2029, exactly as Cambridge prints them. Free, and it prints on one page.",
    source: "The accounting ratios list in the Cambridge IGCSE Accounting 0452 syllabus for 2027, 2028 and 2029.",
    official: true,
    rules: [ACC_RULE, "Give liquidity answers as a ratio."],
    groups: ACCOUNTING_OL,
    links: [{ href: "/tools/ratio-calculator", label: "Accounting ratio calculator" }],
  },
  {
    code: "7081",
    h1: "O Level Business 7081 formula sheet",
    title: "7081 Formula Sheet 2027: Every O Level Business Formula",
    description: "Every formula and ratio in the O Level Business 7081 syllabus for 2027 to 2029: market share, break-even, profit margins, ROCE and liquidity. Free to print.",
    source: "The Formulas and ratios pages of the Cambridge O Level Business 7081 syllabus for 2027, 2028 and 2029.",
    official: true,
    rules: ["Current ratio and acid test answers can be given as a ratio : 1 or as a number."],
    groups: BUSINESS_OL,
    links: [{ href: "/tools/break-even-calculator", label: "Break-even calculator" }],
  },
  {
    code: "0264",
    h1: "IGCSE Business 0264 formula sheet",
    title: "0264 Formula Sheet 2027: Every IGCSE Business Formula",
    description: "Every formula and ratio in the IGCSE Business 0264 syllabus for 2027 to 2029: market share, break-even, profit margins, ROCE and liquidity. Free to print.",
    source: "The Formulas and ratios pages of the Cambridge IGCSE Business 0264 syllabus for 2027, 2028 and 2029.",
    official: true,
    rules: ["Current ratio and acid test answers can be given as a ratio : 1 or as a number."],
    groups: BUSINESS_OL,
    links: [{ href: "/tools/break-even-calculator", label: "Break-even calculator" }],
  },
  {
    code: "2281",
    h1: "O Level Economics 2281 formula sheet",
    title: "2281 Formula Sheet 2027: O Level Economics Formulas",
    description: "The formulas for every calculation named in the O Level Economics 2281 syllabus for 2027 to 2029: PED, PES, costs, revenue and the unemployment rate.",
    source: "The Cambridge O Level Economics 2281 syllabus for 2027, 2028 and 2029 names these calculations but does not print the formulas. These are the standard forms.",
    official: false,
    rules: [],
    groups: ECONOMICS_OL,
    links: [{ href: "/tools/elasticity-calculator", label: "Elasticity calculator" }],
  },
  {
    code: "0455",
    h1: "IGCSE Economics 0455 formula sheet",
    title: "0455 Formula Sheet 2027: IGCSE Economics Formulas",
    description: "The formulas for every calculation named in the IGCSE Economics 0455 syllabus for 2027 to 2029: PED, PES, costs, revenue and the unemployment rate.",
    source: "The Cambridge IGCSE Economics 0455 syllabus for 2027, 2028 and 2029 names these calculations but does not print the formulas. These are the standard forms.",
    official: false,
    rules: [],
    groups: ECONOMICS_OL,
    links: [{ href: "/tools/elasticity-calculator", label: "Elasticity calculator" }],
  },
  {
    code: "9706",
    h1: "A Level Accounting 9706 formula sheet",
    title: "9706 Formula Sheet: Every A Level Accounting Ratio",
    description: "Every ratio formula in the AS and A Level Accounting 9706 syllabus for 2026 to 2028, exactly as Cambridge prints them, with the A Level only ratios marked.",
    source: "The appendix, Summary of commonly used ratios, in the Cambridge AS and A Level Accounting 9706 syllabus for 2026, 2027 and 2028.",
    official: true,
    rules: [
      "Cambridge says these are the only formulas accepted in your answers.",
      "Use the balances at the end of the year unless the question asks for average figures.",
      "Round to the number of decimal places the question asks for.",
    ],
    groups: ACCOUNTING_AL,
    links: [{ href: "/tools/ratio-calculator", label: "Accounting ratio calculator" }],
  },
  {
    code: "9609",
    h1: "A Level Business 9609 formula sheet",
    title: "9609 Formula Sheet: Every A Level Business Ratio",
    description: "Every ratio Cambridge prints in the AS and A Level Business 9609 syllabus for 2026 to 2028: liquidity, profitability, efficiency, gearing and investment ratios.",
    source: "The page Ratios to support analysis of published accounts in the Cambridge AS and A Level Business 9609 syllabus for 2026, 2027 and 2028. These belong to A Level topic 10.2.",
    official: true,
    rules: ["Give current ratio and acid test answers as a ratio."],
    groups: BUSINESS_AL,
    links: [
      { href: "/tools/investment-appraisal-calculator", label: "Investment appraisal calculator" },
      { href: "/tools/break-even-calculator", label: "Break-even calculator" },
    ],
  },
  {
    code: "9708",
    h1: "A Level Economics 9708 formula sheet",
    title: "9708 Formula Sheet: Every A Level Economics Formula",
    description: "The formulas for every calculation named in the AS and A Level Economics 9708 syllabus for 2026 to 2028: elasticity, costs, revenue, the multiplier and more.",
    source: "The Cambridge AS and A Level Economics 9708 syllabus for 2026, 2027 and 2028 names these calculations but does not print the formulas, and it says formulae are not given in the question papers. These are the standard forms.",
    official: false,
    rules: ["Formulas are not given in the exam, so learn them."],
    groups: ECONOMICS_AL,
    links: [{ href: "/tools/elasticity-calculator", label: "Elasticity calculator" }],
  },
];

export type SheetWithSyllabus = FormulaSheet & { syllabus: SyllabusInfo; slug: string };

export const FORMULA_SHEETS: SheetWithSyllabus[] = SHEETS.flatMap((s) => {
  const syllabus = SYLLABI.find((x) => x.code === s.code);
  return syllabus ? [{ ...s, syllabus, slug: syllabus.slug }] : [];
});

export const formulaSheetBySlug = (slug: string) => FORMULA_SHEETS.find((s) => s.slug === slug) ?? null;
export const formulaCount = (s: FormulaSheet) => s.groups.reduce((n, g) => n + g.formulas.length, 0);
