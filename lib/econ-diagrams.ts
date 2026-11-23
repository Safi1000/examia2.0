/**
 * The Economics diagram bank: every diagram the Cambridge IGCSE 0455 and
 * O Level 2281 syllabuses (2027 to 2029) ask students to draw, as data.
 * Coordinates run 0 to 100 on both axes; components/tools/EconDiagram.tsx draws them.
 * Curve styles: "a" the first curve, "b" the second (gold), "c" a faded original.
 */
export type Pt = [number, number];
export type Label = [string, number, number];

export type El =
  | { t: "line"; p: [number, number, number, number]; k?: "a" | "b" | "c"; label?: Label }
  | { t: "path"; pts: Pt[]; k?: "a" | "b" | "c"; label?: Label }
  | { t: "guide"; at: Pt; xl?: string; yl?: string; noH?: boolean; noV?: boolean }
  | { t: "dot"; at: Pt; label?: Label }
  | { t: "arrow"; p: [number, number, number, number] }
  | { t: "area"; pts: Pt[] }
  | { t: "span"; y: number; x1: number; x2: number; label: string }
  | { t: "text"; label: Label };

export interface Chart {
  y: string;
  x: string;
  els: El[];
  /** Caption under a small chart. */
  cap?: string;
}

export interface Diagram {
  id: string;
  title: string;
  /** Syllabus section number. */
  ref: string;
  /** One chart, or a row of small ones. */
  charts: Chart[];
  shows: string;
  steps: string[];
}

export interface DiagramGroup {
  id: string;
  title: string;
  diagrams: Diagram[];
}

/* ───────── building blocks ───────── */
const line = (x1: number, y1: number, x2: number, y2: number, label?: Label, k: "a" | "b" | "c" = "a"): El => ({ t: "line", p: [x1, y1, x2, y2], k, ...(label ? { label } : {}) });
const guide = (x: number, y: number, xl?: string, yl?: string, o: { noH?: boolean; noV?: boolean } = {}): El => ({ t: "guide", at: [x, y], xl, yl, ...o });
const arrow = (x1: number, y1: number, x2: number, y2: number): El => ({ t: "arrow", p: [x1, y1, x2, y2] });
const dot = (x: number, y: number, label?: Label): El => ({ t: "dot", at: [x, y], ...(label ? { label } : {}) });
const text = (s: string, x: number, y: number): El => ({ t: "text", label: [s, x, y] });
const sample = (f: (x: number) => number, from: number, to: number, n = 40): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / n;
    return [x, f(x)] as Pt;
  });
const arc = (r: number): Pt[] => Array.from({ length: 41 }, (_, i) => [r * Math.cos((Math.PI / 2) * (1 - i / 40)), r * Math.sin((Math.PI / 2) * (1 - i / 40))] as Pt);

// Demand: P = 100 − Q. Supply: P = Q. They cross at (50, 50).
const D = (label = "D", k: "a" | "b" | "c" = "a") => line(15, 85, 85, 15, [label, 89, 11], k);
const S = (label = "S", k: "a" | "b" | "c" = "b") => line(15, 15, 85, 85, [label, 89, 89], k);
// Shifted by 20: right and left.
const D_RIGHT = (label: string) => line(30, 90, 92, 28, [label, 96, 24], "a");
const D_LEFT = (label: string) => line(10, 70, 70, 10, [label, 74, 6], "a");
const S_RIGHT = (label: string) => line(30, 10, 92, 72, [label, 96, 76], "b");
const S_LEFT = (label: string) => line(10, 30, 70, 90, [label, 74, 94], "b");

const PQ = { y: "Price", x: "Quantity" };
const LAB = { y: "Wage rate", x: "Quantity of labour" };
const PPC = { y: "Capital goods", x: "Consumer goods" };
const MINI = { y: "P", x: "Q" };

export const ECON_DIAGRAM_GROUPS: DiagramGroup[] = [
  {
    id: "ppc",
    title: "Production possibility curves",
    diagrams: [
      {
        id: "ppc-points",
        title: "PPC: points on, under and beyond the curve",
        ref: "1.4.2",
        charts: [{ ...PPC, els: [{ t: "path", pts: arc(80), label: ["PPC", 88, 6] }, dot(56.6, 56.6, ["A", 62, 61]), dot(30, 30, ["B", 35, 34]), dot(74, 72, ["C", 79, 76])] }],
        shows: "A is on the curve: every resource is in use and used well. B is under the curve: some resources are unemployed or wasted. C is beyond the curve: it cannot be reached with the resources the economy has now.",
        steps: ["Label one axis capital goods and the other consumer goods.", "Draw a curve that bows outward and touches both axes.", "Mark one point on the curve, one inside it and one outside it."],
      },
      {
        id: "ppc-movement",
        title: "PPC: movement along the curve and opportunity cost",
        ref: "1.4.3",
        charts: [{ ...PPC, els: [{ t: "path", pts: arc(80), label: ["PPC", 88, 6] }, guide(40, 69.3, "C1", "K1"), guide(69.3, 40, "C2", "K2"), dot(40, 69.3, ["X", 45, 74]), dot(69.3, 40, ["Y", 74, 45])] }],
        shows: "Moving from X to Y means more consumer goods (C1 to C2) and fewer capital goods (K1 to K2). The capital goods given up are the opportunity cost of the extra consumer goods.",
        steps: ["Draw the PPC and mark two points on it, X and Y.", "Drop dotted lines from each point to both axes.", "Label what is gained on one axis and what is given up on the other."],
      },
      {
        id: "ppc-shift",
        title: "PPC: an outward shift (economic growth)",
        ref: "1.4.4",
        charts: [{ ...PPC, els: [{ t: "path", pts: arc(62), k: "c" }, { t: "path", pts: arc(86) }, arrow(46, 46, 58, 58), text("PPC1", 52, 6), text("PPC2", 96, 6)] }],
        shows: "The whole curve moves outward when the economy gains more or better resources, such as new technology, a bigger labour force or better education. The economy can now produce more of both goods. A fall in resources, for example after a natural disaster, shifts the curve inward.",
        steps: ["Draw the first curve and label it PPC1.", "Draw a second curve further from the origin and label it PPC2.", "Add an arrow from PPC1 to PPC2 to show the direction."],
      },
    ],
  },
  {
    id: "demand",
    title: "Demand",
    diagrams: [
      {
        id: "demand-curve",
        title: "The demand curve",
        ref: "2.2.1",
        charts: [{ ...PQ, els: [D(), guide(50, 50, "Q", "P")] }],
        shows: "The demand curve slopes down from left to right. At a lower price, consumers are willing and able to buy a larger quantity.",
        steps: ["Label the vertical axis price and the horizontal axis quantity.", "Draw a line sloping down from left to right and label it D.", "Pick a point on it and show its price and quantity with dotted lines."],
      },
      {
        id: "demand-movement",
        title: "Movement along a demand curve (extension and contraction)",
        ref: "2.2.2",
        charts: [{ ...PQ, els: [D(), guide(35, 65, "Q1", "P1"), guide(65, 35, "Q2", "P2"), arrow(40, 67, 62, 45)] }],
        shows: "Only a change in the price of the good itself causes a movement along the curve. A fall in price from P1 to P2 extends demand from Q1 to Q2. A rise in price from P2 to P1 contracts it.",
        steps: ["Draw one demand curve. Do not draw a second one.", "Mark two prices and the quantity demanded at each.", "Add an arrow along the curve to show the direction of the move."],
      },
      {
        id: "demand-shift",
        title: "Shifts of a demand curve (increase and decrease)",
        ref: "2.2.3",
        charts: [{ ...PQ, els: [line(15, 85, 85, 15, ["D", 89, 11], "c"), D_RIGHT("D1"), D_LEFT("D2"), arrow(52, 52, 58, 58), arrow(48, 48, 42, 42)] }],
        shows: "A change in anything other than the price of the good shifts the whole curve. More income, a successful advert or a dearer substitute shifts demand right, from D to D1. The opposite changes shift it left, from D to D2.",
        steps: ["Draw the original demand curve, D.", "Draw a new curve to the right for an increase, or to the left for a decrease.", "Label each curve and add an arrow to show the shift."],
      },
    ],
  },
  {
    id: "supply",
    title: "Supply",
    diagrams: [
      {
        id: "supply-curve",
        title: "The supply curve",
        ref: "2.3.1",
        charts: [{ ...PQ, els: [S(), guide(50, 50, "Q", "P")] }],
        shows: "The supply curve slopes up from left to right. At a higher price, firms are willing and able to sell a larger quantity.",
        steps: ["Label the vertical axis price and the horizontal axis quantity.", "Draw a line sloping up from left to right and label it S.", "Pick a point on it and show its price and quantity with dotted lines."],
      },
      {
        id: "supply-movement",
        title: "Movement along a supply curve (extension and contraction)",
        ref: "2.3.2",
        charts: [{ ...PQ, els: [S(), guide(35, 35, "Q1", "P1"), guide(65, 65, "Q2", "P2"), arrow(42, 36, 64, 58)] }],
        shows: "Only a change in the price of the good itself causes a movement along the curve. A rise in price from P1 to P2 extends supply from Q1 to Q2. A fall in price from P2 to P1 contracts it.",
        steps: ["Draw one supply curve. Do not draw a second one.", "Mark two prices and the quantity supplied at each.", "Add an arrow along the curve to show the direction of the move."],
      },
      {
        id: "supply-shift",
        title: "Shifts of a supply curve (increase and decrease)",
        ref: "2.3.3",
        charts: [{ ...PQ, els: [line(15, 15, 85, 85, ["S", 89, 89], "c"), S_RIGHT("S1"), S_LEFT("S2"), arrow(52, 48, 58, 42), arrow(48, 52, 42, 58)] }],
        shows: "A change in anything other than the price of the good shifts the whole curve. Lower costs, better technology or a subsidy shift supply right, from S to S1. Higher costs or a new tax shift it left, from S to S2.",
        steps: ["Draw the original supply curve, S.", "Draw a new curve to the right for an increase, or to the left for a decrease.", "Label each curve and add an arrow to show the shift."],
      },
    ],
  },
  {
    id: "price",
    title: "Price determination and price changes",
    diagrams: [
      {
        id: "equilibrium",
        title: "Market equilibrium",
        ref: "2.4.2",
        charts: [{ ...PQ, els: [D(), S(), guide(50, 50, "Qe", "Pe")] }],
        shows: "The market is in equilibrium where demand equals supply. At price Pe, the quantity consumers want to buy is exactly the quantity firms want to sell, Qe.",
        steps: ["Draw a demand curve and a supply curve that cross.", "Drop dotted lines from the crossing point to both axes.", "Label the equilibrium price and the equilibrium quantity."],
      },
      {
        id: "surplus",
        title: "Disequilibrium: a surplus",
        ref: "2.4.3",
        charts: [{ ...PQ, els: [D(), S(), guide(30, 70, "Qd", "P1"), guide(70, 70, "Qs", undefined), { t: "span", y: 76, x1: 30, x2: 70, label: "Surplus" }] }],
        shows: "At a price above equilibrium, firms supply more (Qs) than consumers demand (Qd). The gap is a surplus. Unsold goods push the price down toward equilibrium.",
        steps: ["Draw demand and supply, then a price line above the crossing point.", "Mark where the price line meets each curve and drop lines to the quantity axis.", "Label the gap between Qd and Qs as the surplus."],
      },
      {
        id: "shortage",
        title: "Disequilibrium: a shortage",
        ref: "2.4.3",
        charts: [{ ...PQ, els: [D(), S(), guide(30, 30, "Qs", "P1"), guide(70, 30, "Qd", undefined), { t: "span", y: 24, x1: 30, x2: 70, label: "Shortage" }] }],
        shows: "At a price below equilibrium, consumers demand more (Qd) than firms supply (Qs). The gap is a shortage. Buyers compete for the good and the price rises toward equilibrium.",
        steps: ["Draw demand and supply, then a price line below the crossing point.", "Mark where the price line meets each curve and drop lines to the quantity axis.", "Label the gap between Qs and Qd as the shortage."],
      },
      {
        id: "demand-increase",
        title: "An increase in demand: price and quantity both rise",
        ref: "2.5.2",
        charts: [{ ...PQ, els: [line(15, 85, 85, 15, ["D", 89, 11], "c"), D_RIGHT("D1"), S(), guide(50, 50, "Q1", "P1"), guide(60, 60, "Q2", "P2"), arrow(37, 67, 43, 73)] }],
        shows: "Demand shifts right from D to D1. The equilibrium price rises from P1 to P2 and the quantity traded rises from Q1 to Q2.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift the demand curve to the right and label it D1.", "Label the new equilibrium P2 and Q2."],
      },
      {
        id: "demand-decrease",
        title: "A decrease in demand: price and quantity both fall",
        ref: "2.5.2",
        charts: [{ ...PQ, els: [line(15, 85, 85, 15, ["D", 89, 11], "c"), D_LEFT("D1"), S(), guide(50, 50, "Q1", "P1"), guide(40, 40, "Q2", "P2"), arrow(33, 63, 27, 57)] }],
        shows: "Demand shifts left from D to D1. The equilibrium price falls from P1 to P2 and the quantity traded falls from Q1 to Q2.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift the demand curve to the left and label it D1.", "Label the new equilibrium P2 and Q2."],
      },
      {
        id: "supply-increase",
        title: "An increase in supply: price falls, quantity rises",
        ref: "2.5.2",
        charts: [{ ...PQ, els: [D(), line(15, 15, 85, 85, ["S", 89, 89], "c"), S_RIGHT("S1"), guide(50, 50, "Q1", "P1"), guide(60, 40, "Q2", "P2"), arrow(67, 63, 73, 57)] }],
        shows: "Supply shifts right from S to S1. The equilibrium price falls from P1 to P2 and the quantity traded rises from Q1 to Q2.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift the supply curve to the right and label it S1.", "Label the new equilibrium P2 and Q2."],
      },
      {
        id: "supply-decrease",
        title: "A decrease in supply: price rises, quantity falls",
        ref: "2.5.2",
        charts: [{ ...PQ, els: [D(), line(15, 15, 85, 85, ["S", 89, 89], "c"), S_LEFT("S1"), guide(50, 50, "Q1", "P1"), guide(40, 60, "Q2", "P2"), arrow(63, 67, 57, 73)] }],
        shows: "Supply shifts left from S to S1. The equilibrium price rises from P1 to P2 and the quantity traded falls from Q1 to Q2.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift the supply curve to the left and label it S1.", "Label the new equilibrium P2 and Q2."],
      },
    ],
  },
  {
    id: "elasticity",
    title: "Elasticity",
    diagrams: [
      {
        id: "ped-curves",
        title: "Demand curves for each PED value",
        ref: "2.6.2",
        charts: [
          { ...MINI, cap: "Perfectly inelastic: PED = 0", els: [line(50, 8, 50, 92, ["D", 58, 90])] },
          { ...MINI, cap: "Inelastic: PED between 0 and 1", els: [line(38, 90, 62, 10, ["D", 70, 12])] },
          { ...MINI, cap: "Unitary: PED = 1", els: [{ t: "path", pts: sample((x) => 1800 / x, 20, 92), label: ["D", 94, 28] }] },
          { ...MINI, cap: "Elastic: PED greater than 1", els: [line(8, 62, 92, 38, ["D", 92, 28])] },
          { ...MINI, cap: "Perfectly elastic: PED is infinite", els: [line(4, 50, 94, 50, ["D", 92, 60])] },
        ],
        shows: "The steeper the demand curve, the less quantity responds to price. A vertical curve means quantity does not change at all. A horizontal curve means any price rise loses every sale. PED is a negative number; these values ignore the minus sign.",
        steps: ["For inelastic demand, draw a steep curve.", "For elastic demand, draw a shallow curve.", "Write the PED value beside each diagram."],
      },
      {
        id: "ped-revenue",
        title: "PED and revenue when the price falls",
        ref: "2.6.4",
        charts: [
          {
            ...MINI,
            cap: "Elastic demand: revenue rises",
            els: [{ t: "area", pts: [[0, 0], [70, 0], [70, 45], [0, 45]] }, line(10, 75, 90, 35, ["D", 93, 26]), guide(30, 65, "Q1", "P1"), guide(70, 45, "Q2", "P2")],
          },
          {
            ...MINI,
            cap: "Inelastic demand: revenue falls",
            els: [{ t: "area", pts: [[0, 0], [60, 0], [60, 30], [0, 30]] }, line(30, 90, 70, 10, ["D", 78, 12]), guide(40, 70, "Q1", "P1"), guide(60, 30, "Q2", "P2")],
          },
        ],
        shows: "Revenue is price times quantity, the rectangle under each point. The shaded rectangle is revenue after the price falls from P1 to P2. With elastic demand, the quantity gained outweighs the lower price, so revenue rises. With inelastic demand, it does not, so revenue falls.",
        steps: ["Draw the demand curve and mark the two prices and quantities.", "Each price and its quantity form a rectangle. That rectangle is the revenue.", "Compare the two rectangles and say which is bigger."],
      },
      {
        id: "pes-curves",
        title: "Supply curves for each PES value",
        ref: "2.7.2",
        charts: [
          { ...MINI, cap: "Perfectly inelastic: PES = 0", els: [line(50, 8, 50, 92, ["S", 58, 90], "b")] },
          { ...MINI, cap: "Inelastic: PES between 0 and 1", els: [line(38, 10, 62, 90, ["S", 70, 88], "b")] },
          { ...MINI, cap: "Unitary: PES = 1", els: [line(0, 0, 88, 88, ["S", 92, 78], "b")] },
          { ...MINI, cap: "Elastic: PES greater than 1", els: [line(8, 38, 92, 62, ["S", 92, 72], "b")] },
          { ...MINI, cap: "Perfectly elastic: PES is infinite", els: [line(4, 50, 94, 50, ["S", 92, 60], "b")] },
        ],
        shows: "The steeper the supply curve, the less firms can change output when the price changes. Any straight supply curve that starts at the origin has a PES of exactly 1.",
        steps: ["For inelastic supply, draw a steep curve.", "For elastic supply, draw a shallow curve.", "For unitary supply, start the straight line at the origin."],
      },
    ],
  },
  {
    id: "intervention",
    title: "Government intervention",
    diagrams: [
      {
        id: "maximum-price",
        title: "Maximum price",
        ref: "2.10.3",
        charts: [{ ...PQ, els: [D(), S(), guide(50, 50, undefined, "Pe", { noV: true }), line(0, 30, 92, 30, undefined, "c"), guide(30, 30, "Qs", "Pmax", { noH: true }), guide(70, 30, "Qd", undefined, { noH: true }), { t: "span", y: 22, x1: 30, x2: 70, label: "Shortage" }] }],
        shows: "A maximum price is a legal limit that sellers cannot charge above. To have any effect it must be set below the equilibrium price. At Pmax, demand extends to Qd and supply contracts to Qs, which leaves a shortage.",
        steps: ["Draw D and S and label the equilibrium price.", "Draw a horizontal line below equilibrium and label it Pmax, the maximum price.", "Mark Qs and Qd on the quantity axis and label the shortage between them."],
      },
      {
        id: "minimum-price",
        title: "Minimum price",
        ref: "2.10.3",
        charts: [{ ...PQ, els: [D(), S(), guide(50, 50, undefined, "Pe", { noV: true }), line(0, 70, 92, 70, undefined, "c"), guide(30, 70, "Qd", "Pmin", { noH: true }), guide(70, 70, "Qs", undefined, { noH: true }), { t: "span", y: 78, x1: 30, x2: 70, label: "Surplus" }] }],
        shows: "A minimum price is a legal limit that sellers cannot charge below. To have any effect it must be set above the equilibrium price. At Pmin, supply extends to Qs and demand contracts to Qd, which leaves a surplus.",
        steps: ["Draw D and S and label the equilibrium price.", "Draw a horizontal line above equilibrium and label it Pmin, the minimum price.", "Mark Qd and Qs on the quantity axis and label the surplus between them."],
      },
      {
        id: "indirect-tax",
        title: "Indirect tax",
        ref: "2.10.3",
        charts: [{ ...PQ, els: [{ t: "area", pts: [[0, 40], [40, 40], [40, 60], [0, 60]] }, D(), line(15, 15, 85, 85, ["S", 89, 89], "c"), S_LEFT("S + tax"), guide(50, 50, "Q1", "P1"), guide(40, 60, "Q2", "P2"), arrow(63, 67, 57, 73)] }],
        shows: "An indirect tax raises firms' costs, so supply shifts left from S to S + tax. The price rises from P1 to P2 and the quantity falls from Q1 to Q2. The vertical gap between the two supply curves is the tax on each unit, and the shaded area is the tax revenue the government collects.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift supply to the left and label the new curve S + tax.", "Label the new equilibrium P2 and Q2."],
      },
      {
        id: "subsidy",
        title: "Subsidy",
        ref: "2.10.3",
        charts: [{ ...PQ, els: [D(), line(15, 15, 85, 85, ["S", 89, 89], "c"), S_RIGHT("S + subsidy"), guide(50, 50, "Q1", "P1"), guide(60, 40, "Q2", "P2"), arrow(67, 63, 73, 57)] }],
        shows: "A subsidy is a payment from the government to producers. It lowers firms' costs, so supply shifts right from S to S + subsidy. The price falls from P1 to P2 and the quantity rises from Q1 to Q2.",
        steps: ["Draw D and S and label the first equilibrium P1 and Q1.", "Shift supply to the right and label the new curve S + subsidy.", "Label the new equilibrium P2 and Q2."],
      },
    ],
  },
  {
    id: "labour",
    title: "The labour market",
    diagrams: [
      {
        id: "labour-demand-increase",
        title: "An increase in the demand for labour",
        ref: "3.3.2",
        charts: [{ ...LAB, els: [line(15, 85, 85, 15, ["DL", 89, 11], "c"), D_RIGHT("DL1"), S("SL"), guide(50, 50, "Q1", "W1"), guide(60, 60, "Q2", "W2"), arrow(37, 67, 43, 73)] }],
        shows: "When firms want more workers, for example because demand for the product has risen, the demand for labour shifts right from DL to DL1. The wage rate rises from W1 to W2 and employment rises from Q1 to Q2.",
        steps: ["Label the axes wage rate and quantity of labour.", "Draw DL and SL and label the first equilibrium W1 and Q1.", "Shift DL to the right and label the new wage W2 and quantity Q2."],
      },
      {
        id: "labour-supply-increase",
        title: "An increase in the supply of labour",
        ref: "3.3.2",
        charts: [{ ...LAB, els: [D("DL"), line(15, 15, 85, 85, ["SL", 89, 89], "c"), S_RIGHT("SL1"), guide(50, 50, "Q1", "W1"), guide(60, 40, "Q2", "W2"), arrow(67, 63, 73, 57)] }],
        shows: "When more people are willing and able to do the job, for example after more workers gain the qualification, the supply of labour shifts right from SL to SL1. The wage rate falls from W1 to W2 and employment rises from Q1 to Q2.",
        steps: ["Label the axes wage rate and quantity of labour.", "Draw DL and SL and label the first equilibrium W1 and Q1.", "Shift SL to the right and label the new wage W2 and quantity Q2."],
      },
      {
        id: "minimum-wage",
        title: "National minimum wage",
        ref: "3.3.2",
        charts: [{ ...LAB, els: [D("DL"), S("SL"), guide(50, 50, "Qe", "We"), line(0, 70, 92, 70, ["NMW", 86, 64], "c"), guide(30, 70, "Qd", "Wmin", { noH: true }), guide(70, 70, "Qs", undefined, { noH: true }), { t: "span", y: 78, x1: 30, x2: 70, label: "Excess supply of labour" }] }],
        shows: "A national minimum wage set above the equilibrium wage raises pay from We to Wmin. Firms demand fewer workers (Qd) while more people want to work (Qs). The gap is an excess supply of labour, which means unemployment.",
        steps: ["Draw DL and SL and label the equilibrium wage We.", "Draw a horizontal line above We and label it NMW.", "Mark Qd and Qs and label the gap between them."],
      },
    ],
  },
  {
    id: "costs",
    title: "Costs of production",
    diagrams: [
      {
        id: "economies-of-scale",
        title: "Economies and diseconomies of scale (ATC curve)",
        ref: "3.4.3",
        charts: [{ y: "Average total cost", x: "Output", els: [{ t: "path", pts: sample((x) => 30 + 0.02 * (x - 50) ** 2, 8, 92), label: ["ATC", 94, 72] }, guide(50, 30, "Q", undefined, { noH: true }), text("Economies of scale", 22, 84), text("Diseconomies of scale", 78, 84), arrow(14, 74, 30, 46), arrow(70, 46, 86, 74)] }],
        shows: "As a firm grows, average total cost first falls because of economies of scale. Past output Q, the firm becomes harder to manage and average total cost rises because of diseconomies of scale.",
        steps: ["Label the axes average total cost and output.", "Draw a U shaped curve and label it ATC.", "Label the falling part economies of scale and the rising part diseconomies of scale."],
      },
      {
        id: "total-costs",
        title: "Total cost, fixed cost and variable cost",
        ref: "3.6.2",
        charts: [{ y: "Costs", x: "Output", els: [line(0, 25, 90, 25, ["FC", 94, 25], "c"), line(0, 0, 90, 60, ["VC", 94, 60], "b"), line(0, 25, 90, 85, ["TC", 94, 85], "a")] }],
        shows: "Fixed cost is the same at every output, so it is a horizontal line. Variable cost starts at zero and rises with output. Total cost is the two added together, so it starts at the level of fixed cost and stays that far above variable cost.",
        steps: ["Draw a horizontal line for fixed cost.", "Draw variable cost rising from the origin.", "Draw total cost starting where fixed cost meets the vertical axis, parallel to variable cost."],
      },
      {
        id: "average-costs",
        title: "Average costs as output changes",
        ref: "3.6.2",
        charts: [
          {
            y: "Costs",
            x: "Output",
            els: [
              { t: "path", pts: sample((x) => 900 / x, 12, 92), k: "c", label: ["AFC", 95, 6] },
              { t: "path", pts: sample((x) => 22 + 0.01 * (x - 45) ** 2, 12, 92), k: "b", label: ["AVC", 95, 38] },
              { t: "path", pts: sample((x) => 900 / x + 22 + 0.01 * (x - 45) ** 2, 12, 92), k: "a", label: ["ATC", 95, 58] },
            ],
          },
        ],
        shows: "Average fixed cost keeps falling as output rises, because the same fixed cost is spread over more units. Average total cost is average fixed cost plus average variable cost, so the gap between ATC and AVC narrows as output grows.",
        steps: ["Draw AFC falling all the way and never touching the axis.", "Draw AVC as a shallow U.", "Draw ATC above AVC, with the gap between them getting smaller."],
      },
    ],
  },
];

export const ECON_DIAGRAM_CODES = ["0455", "2281"] as const;
export const econDiagramCount = ECON_DIAGRAM_GROUPS.reduce((n, g) => n + g.diagrams.length, 0);
