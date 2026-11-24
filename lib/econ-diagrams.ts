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
  | { t: "area"; pts: Pt[]; k?: "a" | "b" }
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

const OL_GROUPS: DiagramGroup[] = [
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

/* ───────── AS Level Economics 9708 (topics 1 to 5) ───────── */
const ol = (id: string, ref: string, patch: Partial<Diagram> = {}): Diagram => {
  const d = OL_GROUPS.flatMap((g) => g.diagrams).find((x) => x.id === id);
  if (!d) throw new Error(`No diagram ${id}`);
  return { ...d, ref, ...patch };
};
const AD_AS = { y: "Price level", x: "Real output" };
const AD = (label = "AD", k: "a" | "b" | "c" = "a") => line(15, 85, 85, 15, [label, 89, 11], k);
const SRAS = (label = "SRAS", k: "a" | "b" | "c" = "b") => line(15, 15, 85, 85, [label, 91, 89], k);
const GOODS = { y: "Good B", x: "Good A" };

const AS_GROUPS: DiagramGroup[] = [
  {
    id: "ppc",
    title: "Production possibility curves",
    diagrams: [
      {
        id: "ppc-shape",
        title: "PPC shape: constant and increasing opportunity cost",
        ref: "1.5.2",
        charts: [
          { ...GOODS, cap: "Constant opportunity cost", els: [line(0, 80, 80, 0, ["PPC", 86, 10])] },
          { ...GOODS, cap: "Increasing opportunity cost", els: [{ t: "path", pts: arc(80), label: ["PPC", 88, 10] }] },
        ],
        shows: "A straight line PPC means each extra unit of good A always costs the same amount of good B, because resources are equally good at making both. A PPC that bows outward means each extra unit of good A costs more and more of good B, because the resources moved last are the ones least suited to making it.",
        steps: ["For constant opportunity cost, draw a straight line between the axes.", "For increasing opportunity cost, draw a curve that bows outward.", "Label the axes with the two goods and the curve PPC."],
      },
      ol("ppc-movement", "1.5.1"),
      ol("ppc-points", "1.5.4"),
      ol("ppc-shift", "1.5.3"),
    ],
  },
  {
    id: "demand-supply",
    title: "Demand and supply curves",
    diagrams: [ol("demand-movement", "2.1.7"), ol("demand-shift", "2.1.5"), ol("supply-movement", "2.1.7"), ol("supply-shift", "2.1.6")],
  },
  {
    id: "elasticity",
    title: "Elasticity",
    diagrams: [
      ol("ped-curves", "2.2.4"),
      {
        id: "ped-straight-line",
        title: "PED along a straight line demand curve",
        ref: "2.2.5",
        charts: [{ ...PQ, els: [line(0, 90, 90, 0, ["D", 94, 4]), dot(45, 45, ["PED = 1", 60, 50]), text("Elastic", 30, 74), text("Inelastic", 82, 24)] }],
        shows: "The slope of a straight line demand curve stays the same, but PED does not. Near the top, a price change is a small percentage of a high price and the quantity change is a large percentage of a small quantity, so demand is elastic. At the midpoint PED equals 1. Below the midpoint, demand is inelastic.",
        steps: ["Draw a straight demand curve that touches both axes.", "Mark the midpoint and label it PED = 1.", "Label the top half elastic and the bottom half inelastic."],
      },
      ol("ped-revenue", "2.2.7", { title: "PED and total expenditure when the price falls" }),
      ol("pes-curves", "2.3.3"),
    ],
  },
  {
    id: "market",
    title: "The interaction of demand and supply",
    diagrams: [
      ol("equilibrium", "2.4.1"),
      ol("surplus", "2.4.1"),
      ol("shortage", "2.4.1"),
      ol("demand-increase", "2.4.2"),
      ol("demand-decrease", "2.4.2"),
      ol("supply-increase", "2.4.2"),
      ol("supply-decrease", "2.4.2"),
      {
        id: "consumer-producer-surplus",
        title: "Consumer surplus and producer surplus",
        ref: "2.5",
        charts: [
          {
            ...PQ,
            els: [
              { t: "area", pts: [[0, 50], [0, 95], [45, 50]] },
              { t: "area", pts: [[0, 5], [0, 50], [45, 50]], k: "b" },
              line(0, 95, 85, 10, ["D", 89, 6]),
              line(0, 5, 85, 90, ["S", 89, 94], "b"),
              guide(45, 50, "Qe", "Pe"),
              text("CS", 14, 64),
              text("PS", 14, 36),
            ],
          },
        ],
        shows: "Consumer surplus is the gap between what consumers are willing to pay and what they actually pay: the area under the demand curve and above the price (CS). Producer surplus is the gap between the price firms receive and the lowest price they would accept: the area above the supply curve and below the price (PS).",
        steps: ["Draw D and S and label the equilibrium price and quantity.", "Shade the triangle between the demand curve and the price line and label it CS, consumer surplus.", "Shade the triangle between the price line and the supply curve and label it PS, producer surplus."],
      },
    ],
  },
  {
    id: "intervention",
    title: "Government microeconomic intervention",
    diagrams: [
      {
        id: "tax-incidence",
        title: "Specific indirect tax: impact and incidence",
        ref: "3.2.1",
        charts: [
          {
            ...PQ,
            els: [
              { t: "area", pts: [[0, 50], [40, 50], [40, 60], [0, 60]] },
              { t: "area", pts: [[0, 40], [40, 40], [40, 50], [0, 50]], k: "b" },
              D(),
              line(15, 15, 85, 85, ["S", 89, 89], "c"),
              S_LEFT("S + tax"),
              guide(50, 50, "Q1", "P1"),
              guide(40, 60, "Q2", "P2"),
              guide(40, 40, undefined, "P3", { noV: true }),
            ],
          },
        ],
        shows: "A specific tax adds a fixed amount to each unit, so supply shifts up by the tax, from S to S + tax. Consumers now pay P2 and firms keep P3 after paying the tax. The tax per unit is P2 minus P3. The upper shaded band (P1 to P2) is the part of the tax paid by consumers and the lower band (P3 to P1) is the part paid by producers. The more inelastic the demand, the more of the tax falls on consumers.",
        steps: ["Draw D and S, then a second supply curve shifted up by the tax.", "Label P1 and Q1 at the old equilibrium, P2 and Q2 at the new one.", "Mark P3 on the original supply curve at Q2, then shade the consumer and producer shares."],
      },
      {
        id: "subsidy-incidence",
        title: "Subsidy: impact and incidence",
        ref: "3.2.2",
        charts: [
          {
            ...PQ,
            els: [
              { t: "area", pts: [[0, 40], [60, 40], [60, 60], [0, 60]] },
              D(),
              line(15, 15, 85, 85, ["S", 89, 89], "c"),
              S_RIGHT("S + subsidy"),
              guide(50, 50, "Q1", "P1"),
              guide(60, 40, "Q2", "P2"),
              guide(60, 60, undefined, "P3", { noV: true }),
            ],
          },
        ],
        shows: "A specific subsidy lowers each unit's cost, so supply shifts down by the subsidy, from S to S + subsidy. Consumers now pay P2, lower than P1. Firms receive P3, the price plus the subsidy, which is higher than P1. The shaded area, the subsidy per unit times Q2, is what the subsidy costs the government.",
        steps: ["Draw D and S, then a second supply curve shifted down by the subsidy.", "Label P1 and Q1 at the old equilibrium, P2 and Q2 at the new one.", "Mark P3 on the original supply curve at Q2 and shade the cost to the government."],
      },
      ol("maximum-price", "3.2.4"),
      ol("minimum-price", "3.2.4"),
      {
        id: "buffer-stock",
        title: "Buffer stock scheme",
        ref: "3.2.5",
        charts: [
          {
            ...PQ,
            els: [
              D(),
              line(0, 65, 92, 65, undefined, "c"),
              line(0, 35, 92, 35, undefined, "c"),
              guide(0, 65, undefined, "Max", { noV: true }),
              guide(0, 35, undefined, "Min", { noV: true }),
              line(75, 4, 75, 92, ["S1", 80, 92], "b"),
              line(25, 4, 25, 92, ["S2", 20, 92], "b"),
              guide(65, 35, undefined, undefined, { noH: true }),
              guide(35, 65, undefined, undefined, { noH: true }),
              { t: "span", y: 10, x1: 65, x2: 75, label: "Buys" },
              { t: "span", y: 10, x1: 25, x2: 35, label: "Sells" },
            ],
          },
        ],
        shows: "A buffer stock agency keeps the price of a crop between a minimum and a maximum. After a good harvest (S1), the price would fall below the minimum, so the agency buys the extra crop at the minimum price and stores it. After a bad harvest (S2), the price would rise above the maximum, so the agency sells from its store at the maximum price.",
        steps: ["Draw demand and two horizontal lines for the minimum and maximum prices.", "Draw a vertical supply curve for a good harvest and one for a bad harvest.", "Show the quantity the agency buys at the minimum and sells at the maximum."],
      },
    ],
  },
  {
    id: "ad-as",
    title: "Aggregate demand and aggregate supply",
    diagrams: [
      {
        id: "ad-as-equilibrium",
        title: "AD/AS equilibrium",
        ref: "4.3.11",
        charts: [{ ...AD_AS, els: [AD(), SRAS(), guide(50, 50, "Y", "PL")] }],
        shows: "The AD curve slopes down: at a lower price level, the total quantity of goods and services demanded in the economy is higher. SRAS slopes up. Where they cross, the economy is in equilibrium at price level PL and real output Y, which sets the level of employment.",
        steps: ["Label the axes price level and real output.", "Draw AD sloping down and SRAS sloping up.", "Label the equilibrium price level and real output."],
      },
      {
        id: "lras-shapes",
        title: "The two shapes of the LRAS curve",
        ref: "4.3.8",
        charts: [
          { ...AD_AS, y: "PL", x: "Y", cap: "Vertical LRAS", els: [line(60, 4, 60, 92, ["LRAS", 76, 92], "b"), guide(60, 6, "Yf", undefined, { noH: true })] },
          {
            ...AD_AS,
            y: "PL",
            x: "Y",
            cap: "LRAS in three sections",
            els: [{ t: "path", pts: [[4, 25], [40, 25], [50, 27], [58, 32], [65, 40], [70, 50], [73, 60], [75, 72], [75, 94]], k: "b", label: ["LRAS", 90, 86] }, guide(75, 72, "Yf", undefined, { noH: true })],
          },
        ],
        shows: "The syllabus accepts two shapes. Drawn as a vertical line, LRAS sits at the full employment level of output (Yf): in the long run, output depends on the quantity and quality of resources, not on the price level. Drawn in three sections, it is highly elastic when there is a lot of spare capacity, slopes upward as resources become scarce, and turns vertical at full employment.",
        steps: ["For the vertical shape, draw a straight line up from Yf.", "For the three section shape, draw it flat, then curving up, then vertical.", "Label full employment output Yf."],
      },
      {
        id: "ad-increase",
        title: "An increase in AD: expansionary policy and demand-pull inflation",
        ref: "4.3.12, 4.6.4, 5.2.7, 5.3.4",
        charts: [{ ...AD_AS, els: [AD("AD", "c"), D_RIGHT("AD1"), SRAS(), guide(50, 50, "Y1", "PL1"), guide(60, 60, "Y2", "PL2"), arrow(37, 67, 43, 73)] }],
        shows: "AD shifts right from AD to AD1, for example after lower interest rates, higher government spending or lower taxes. Real output rises from Y1 to Y2, so employment usually rises, and the price level rises from PL1 to PL2. This is how expansionary fiscal and monetary policy work. When the rise in AD pulls the price level up, it is demand-pull inflation.",
        steps: ["Draw AD and SRAS and label PL1 and Y1.", "Shift AD to the right and label it AD1.", "Label the new price level PL2 and real output Y2."],
      },
      {
        id: "ad-decrease",
        title: "A decrease in AD: contractionary policy",
        ref: "4.3.12, 5.2.7, 5.3.4",
        charts: [{ ...AD_AS, els: [AD("AD", "c"), D_LEFT("AD1"), SRAS(), guide(50, 50, "Y1", "PL1"), guide(40, 40, "Y2", "PL2"), arrow(33, 63, 27, 57)] }],
        shows: "AD shifts left from AD to AD1, for example after higher interest rates, lower government spending or higher taxes. The price level falls from PL1 to PL2 and real output falls from Y1 to Y2, so employment usually falls. This is how contractionary fiscal and monetary policy reduce inflation.",
        steps: ["Draw AD and SRAS and label PL1 and Y1.", "Shift AD to the left and label it AD1.", "Label the new price level PL2 and real output Y2."],
      },
      {
        id: "sras-decrease",
        title: "A decrease in SRAS: cost-push inflation",
        ref: "4.3.12, 4.6.4",
        charts: [{ ...AD_AS, els: [AD(), SRAS("SRAS", "c"), S_LEFT("SRAS1"), guide(50, 50, "Y1", "PL1"), guide(40, 60, "Y2", "PL2"), arrow(63, 67, 57, 73)] }],
        shows: "A rise in costs of production, such as higher wages or a higher oil price, shifts SRAS left from SRAS to SRAS1. The price level rises from PL1 to PL2 while real output falls from Y1 to Y2. This is cost-push inflation.",
        steps: ["Draw AD and SRAS and label PL1 and Y1.", "Shift SRAS to the left and label it SRAS1.", "Label the new price level PL2 and real output Y2."],
      },
      {
        id: "lras-increase",
        title: "An increase in LRAS: supply-side policy",
        ref: "4.3.12, 5.4.4",
        charts: [{ ...AD_AS, els: [AD(), line(50, 4, 50, 92, ["LRAS", 44, 96], "c"), line(70, 4, 70, 92, ["LRAS1", 78, 96], "b"), guide(50, 50, "Y1", "PL1"), guide(70, 30, "Y2", "PL2"), arrow(53, 80, 66, 80)] }],
        shows: "Supply-side policy, such as training, better infrastructure or support for new technology, raises the economy's productive capacity. LRAS shifts right from LRAS to LRAS1. Real output rises from Y1 to Y2 and the price level falls from PL1 to PL2.",
        steps: ["Draw AD and a vertical LRAS and label PL1 and Y1.", "Draw a second LRAS to the right and label it LRAS1.", "Label the new price level PL2 and real output Y2."],
      },
    ],
  },
];

/* ───────── A Level Economics 9708 (topics 7 to 11) ───────── */
const solve = (f: (x: number) => number, lo: number, hi: number) => {
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (Math.sign(f(m)) === Math.sign(f(lo))) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
// One set of short run cost curves, used by every firm diagram, so MC always cuts AVC and ATC at their lowest points.
const AVC = (q: number) => 50 - q + 0.0125 * q * q;
const MC = (q: number) => 50 - 2 * q + 0.0375 * q * q;
const ATC = (q: number) => AVC(q) + 600 / q;
const Q_ATC = solve((q) => MC(q) - ATC(q), 30, 80);
const MIN_ATC = ATC(Q_ATC);
const Q_AVC = 40; // AVC is lowest at 40, where it equals MC (30).
const MC_PATH = (k: "a" | "b" | "c" = "a", from = 8): El => ({ t: "path", pts: sample(MC, from, 70), k, label: ["MC", 74, 96] });
const ATC_PATH: El = { t: "path", pts: sample(ATC, 12, 88), label: ["ATC", 95, 66] };
const AVC_PATH: El = { t: "path", pts: sample(AVC, 6, 88), k: "c", label: ["AVC", 95, 56] };
const COSTS = { y: "Costs, revenue", x: "Output" };

// Perfect competition with supernormal profit at a price of 70.
const PC_P = 70;
const PC_Q = solve((q) => MC(q) - PC_P, 30, 70);
const PC_C = ATC(PC_Q);
// Monopoly: AR = 95 − 0.9Q, MR = 95 − 1.8Q.
const M_AR = (q: number) => 95 - 0.9 * q;
const M_Q = solve((q) => MC(q) - (95 - 1.8 * q), 20, 50);
const M_P = M_AR(M_Q);
const M_C = ATC(M_Q);
// Monopolistic competition in the long run: AR just touches ATC at Q = 30, which is also where MR = MC.
const MCQ = 30;
const MC_SLOPE = (ATC(MCQ + 0.001) - ATC(MCQ - 0.001)) / 0.002;
const MC_A = ATC(MCQ) - MC_SLOPE * MCQ;
// Monopsony: ACL = 10 + 0.5L, MCL = 10 + L, MRP = 90 − 0.8L.
const MS_L = 80 / 1.8;
const MS_W = 10 + 0.5 * MS_L;
const MC_L = 80 / 1.3;
const MC_W = 10 + 0.5 * MC_L;
// Income and substitution effects: budget lines and indifference curves xy = k touch at the middle of each line.
const IC = (k: number, from: number, to: number, label?: Label, kind: "a" | "b" | "c" = "a"): El => ({ t: "path", pts: sample((x) => k / x, from, to), k: kind, ...(label ? { label } : {}) });
const HYP_A = 60; // parallel to BL2 (slope 80/90) and touching IC1 (xy = 800)
const HYP_B = 160 / 3;
// Business cycle: actual output swings around a rising trend.
const TREND = (x: number) => 25 + ((x - 5) * 45) / 87;
const ACTUAL = (x: number) => TREND(x) + 12 * Math.sin((2 * Math.PI * (x - 5)) / 40);
const MRP_L = (w: number) => 5 + ((90 - w) * 85) / 80;
const LORENZ = sample((x) => 90 * (x / 90) ** 2.5, 0, 90);
const MONEY = (x: number) => 12 + 1500 / (x + 10);
const PH = (k: number) => (x: number) => k + 600 / x - 15;

const A2_GROUPS: DiagramGroup[] = [
  {
    id: "a2-indifference",
    title: "A Level: Indifference curves and budget lines",
    diagrams: [
      {
        id: "indifference-optimum",
        title: "Indifference curves, the budget line and the consumer's best choice",
        ref: "7.2.1",
        charts: [{ ...GOODS, els: [line(0, 80, 80, 0, ["BL", 84, 6], "b"), IC(900, 12, 90, ["IC1", 95, 10], "c"), IC(1600, 20, 92, ["IC2", 96, 22]), IC(2500, 30, 92, ["IC3", 96, 34], "c"), dot(40, 40, ["E", 45, 46]), guide(40, 40, "A1", "B1")] }],
        shows: "An indifference curve joins every mix of two goods that gives the consumer the same satisfaction. Curves further from the origin give more satisfaction. The budget line shows every mix the consumer can just afford with their income. The best choice is E, where the budget line just touches the highest indifference curve it can reach (IC2). IC3 would be better but cannot be afforded.",
        steps: ["Label the axes with the two goods and draw a straight budget line between them.", "Draw indifference curves that bow in toward the origin and never cross.", "Mark the point where the budget line just touches one curve and label it the consumer's best choice."],
      },
      {
        id: "budget-line-shift",
        title: "Shifts of the budget line",
        ref: "7.2.2",
        charts: [
          { ...GOODS, cap: "Income rises: parallel shift", els: [line(0, 50, 50, 0, ["BL1", 52, 10], "c"), line(0, 80, 80, 0, ["BL2", 84, 12], "b"), arrow(30, 30, 40, 40)] },
          { ...GOODS, cap: "Price of good A falls: pivot", els: [line(0, 60, 50, 0, ["BL1", 52, 12], "c"), line(0, 60, 90, 0, ["BL2", 90, 14], "b"), arrow(40, 6, 70, 6)] },
        ],
        shows: "A rise in income, with prices unchanged, lets the consumer buy more of both goods, so the budget line moves out parallel. A fall in the price of one good pivots the line outward along that good's axis only, because the most of the other good the consumer can buy has not changed.",
        steps: ["For a change in income, draw a second budget line parallel to the first.", "For a change in one price, keep the line fixed on the other good's axis and pivot it.", "Label the old line BL1 and the new line BL2."],
      },
      {
        id: "income-substitution",
        title: "Income and substitution effects of a price fall (normal good)",
        ref: "7.2.3",
        charts: [
          {
            ...GOODS,
            els: [
              line(0, 80, 40, 0, ["BL1", 40, -7], "c"),
              line(0, 80, 90, 0, ["BL2", 86, -7], "b"),
              line(0, r1(HYP_B), r1(HYP_A), 0, undefined, "c"),
              IC(800, 10, 75, ["IC1", 75, 17]),
              IC(1800, 21, 92, ["IC2", 93, 26]),
              dot(20, 40, ["A", 16, 36]),
              dot(r1(HYP_A / 2), r1(HYP_B / 2), ["B", r1(HYP_A / 2) - 3, r1(HYP_B / 2) - 6]),
              dot(45, 40, ["C", 49, 46]),
              guide(20, 40, undefined, undefined, { noH: true }),
              guide(r1(HYP_A / 2), r1(HYP_B / 2), undefined, undefined, { noH: true }),
              guide(45, 40, undefined, undefined, { noH: true }),
            ],
          },
        ],
        shows: "The price of good A falls, so the budget line pivots from BL1 to BL2 and the consumer moves from A to C. The faint unlabelled line is parallel to BL2 but just touches the old curve IC1: it shows the new prices with the consumer no better off. A to B is the substitution effect, because good A is now relatively cheaper. B to C is the income effect, because the consumer's real income has risen. For a normal good both effects raise the quantity of good A. For an inferior good the income effect works the other way, and for a Giffen good it is bigger than the substitution effect, so less is bought when the price falls.",
        steps: ["Draw BL1 and the curve it touches, then pivot to BL2 and the higher curve it touches.", "Draw a line parallel to BL2 that just touches the first curve.", "Label A to B the substitution effect and B to C the income effect."],
      },
    ],
  },
  {
    id: "a2-externalities",
    title: "A Level: Externalities",
    diagrams: [
      {
        id: "negative-production-externality",
        title: "Negative externality in production",
        ref: "7.4.4, 7.4.5",
        charts: [{ ...PQ, els: [{ t: "area", pts: [[40, 60], [50, 70], [50, 50]] }, line(10, 90, 80, 20, ["MPB = MSB", 86, 14]), line(10, 10, 85, 85, ["MPC", 89, 89], "c"), line(10, 30, 70, 90, ["MSC", 76, 94], "b"), guide(50, 50, "Qm", "Pm"), guide(40, 60, "Q*", "P*")] }],
        shows: "A factory's pollution is an external cost, so the marginal social cost (MSC) is above the marginal private cost (MPC). The market produces Qm, where MPC meets demand. The best output for society is Q*, where MSC equals MSB. Between Q* and Qm each unit costs society more than it is worth, and the shaded triangle is the deadweight welfare loss.",
        steps: ["Draw MPB = MSB sloping down and MPC sloping up.", "Draw MSC above MPC, the gap being the marginal external cost.", "Mark Qm and Q*, then shade the triangle between MSC and MSB from Q* to Qm."],
      },
      {
        id: "positive-consumption-externality",
        title: "Positive externality in consumption",
        ref: "7.4.4, 7.4.5",
        charts: [{ ...PQ, els: [{ t: "area", pts: [[50, 70], [50, 50], [60, 60]] }, line(10, 90, 85, 15, ["MPB", 89, 11], "c"), line(30, 90, 92, 28, ["MSB", 96, 24]), line(10, 10, 85, 85, ["MPC = MSC", 84, 94], "b"), guide(50, 50, "Qm", "Pm"), guide(60, 60, "Q*", "P*")] }],
        shows: "When people use a good such as education or a vaccine, others gain too, so the marginal social benefit (MSB) is above the marginal private benefit (MPB). The market produces only Qm, where MPB meets MPC. The best output for society is Q*, where MSB equals MSC. The good is underconsumed, and the shaded triangle is the deadweight welfare loss.",
        steps: ["Draw MPB sloping down and MPC = MSC sloping up.", "Draw MSB above MPB, the gap being the marginal external benefit.", "Mark Qm and Q*, then shade the triangle between MSB and MSC from Qm to Q*."],
      },
      {
        id: "negative-consumption-externality",
        title: "Negative externality in consumption",
        ref: "7.4.4, 7.4.5",
        charts: [{ ...PQ, els: [{ t: "area", pts: [[40, 40], [50, 50], [50, 30]] }, line(10, 90, 85, 15, ["MPB", 89, 11], "c"), line(10, 70, 70, 10, ["MSB", 74, 6]), line(10, 10, 85, 85, ["MPC = MSC", 84, 94], "b"), guide(50, 50, "Qm", "Pm"), guide(40, 40, "Q*", "P*")] }],
        shows: "When using a good harms others, as with smoking, the marginal social benefit (MSB) is below the marginal private benefit (MPB). The market produces Qm, where MPB meets MPC. The best output for society is Q*, where MSB equals MSC. The good is overconsumed, and the shaded triangle is the deadweight welfare loss.",
        steps: ["Draw MPB sloping down and MPC = MSC sloping up.", "Draw MSB below MPB, the gap being the marginal external cost.", "Mark Qm and Q*, then shade the triangle between MSC and MSB from Q* to Qm."],
      },
      {
        id: "positive-production-externality",
        title: "Positive externality in production",
        ref: "7.4.4, 7.4.5",
        charts: [{ ...PQ, els: [{ t: "area", pts: [[50, 50], [50, 30], [60, 40]] }, line(10, 90, 85, 15, ["MPB = MSB", 84, 8]), line(10, 10, 85, 85, ["MPC", 89, 89], "c"), line(30, 10, 92, 72, ["MSC", 96, 76], "b"), guide(50, 50, "Qm", "Pm"), guide(60, 40, "Q*", "P*")] }],
        shows: "When a firm's production benefits others, for example by training workers who later move to other firms, the marginal social cost (MSC) is below the marginal private cost (MPC). The market produces only Qm. The best output for society is Q*, where MSC equals MSB. The good is underproduced, and the shaded triangle is the deadweight welfare loss.",
        steps: ["Draw MPB = MSB sloping down and MPC sloping up.", "Draw MSC below MPC, the gap being the marginal external benefit.", "Mark Qm and Q*, then shade the triangle between MSB and MSC from Qm to Q*."],
      },
    ],
  },
  {
    id: "a2-costs",
    title: "A Level: Costs",
    diagrams: [
      {
        id: "short-run-costs",
        title: "Short run cost curves: MC, AVC and ATC",
        ref: "7.5.2",
        charts: [{ y: "Costs", x: "Output", els: [MC_PATH(), ATC_PATH, AVC_PATH, dot(Q_AVC, 30), dot(r1(Q_ATC), r1(MIN_ATC))] }],
        shows: "Marginal cost first falls, then rises because of the law of diminishing returns. MC cuts both AVC and ATC at their lowest points: while the extra unit costs less than the average, it pulls the average down, and once it costs more, it pulls the average up. The gap between ATC and AVC is average fixed cost, which narrows as output grows.",
        steps: ["Draw AVC and ATC as U shapes, with ATC above AVC and the gap narrowing.", "Draw MC as a tick shape rising steeply.", "Make MC pass through the lowest point of AVC first, then the lowest point of ATC."],
      },
      {
        id: "long-run-average-cost",
        title: "Long run average cost and minimum efficient scale",
        ref: "7.5.4",
        charts: [{ y: "Average cost", x: "Output", els: [{ t: "path", pts: sample((x) => (x < 45 ? 35 + 0.025 * (45 - x) ** 2 : x < 75 ? 35 : 35 + 0.05 * (x - 75) ** 2), 8, 92), label: ["LRAC", 94, 56] }, guide(45, 35, "MES", undefined, { noH: true }), text("Economies of scale", 26, 84), text("Diseconomies", 84, 84)] }],
        shows: "In the long run every factor can change. Average cost falls at first because of economies of scale, may stay flat for a range of output, then rises because of diseconomies of scale. The minimum efficient scale (MES) is the lowest output at which long run average cost reaches its minimum.",
        steps: ["Label the axes average cost and output.", "Draw LRAC falling, then flat, then rising.", "Mark the output where LRAC first reaches its lowest level and label it MES."],
      },
    ],
  },
  {
    id: "a2-market-structures",
    title: "A Level: Revenue and market structures",
    diagrams: [
      {
        id: "revenue-curves",
        title: "AR, MR and TR along a downward sloping demand curve",
        ref: "7.5.8, 7.8.5",
        charts: [
          { y: "P", x: "Q", cap: "AR and MR", els: [line(0, 90, 90, 0, ["AR", 94, 8]), line(0, 90, 45, 0, ["MR", 50, 8], "b"), guide(45, 45, "Q1", undefined, { noH: true }), text("Elastic", 48, 62), text("Inelastic", 78, 28)] },
          { y: "TR", x: "Q", cap: "Total revenue", els: [{ t: "path", pts: sample((q) => (q * (90 - q) * 80) / 2025, 0, 90), label: ["TR", 92, 14] }, guide(45, 80, "Q1", undefined, { noH: true })] },
        ],
        shows: "Average revenue is the demand curve. MR falls twice as fast. Where MR is positive, demand is price elastic and a price cut raises total revenue. At Q1, MR is zero, PED equals 1 and total revenue is at its highest. Beyond Q1, MR is negative and demand is price inelastic, so a further price cut lowers total revenue.",
        steps: ["Draw AR sloping down, then MR starting at the same point and twice as steep.", "Below it, draw TR as a hill.", "Line up the top of the TR hill with the point where MR crosses the output axis."],
      },
      {
        id: "perfect-competition-short-run",
        title: "Perfect competition: supernormal profit in the short run",
        ref: "7.6.4",
        charts: [{ ...COSTS, els: [{ t: "area", pts: [[0, r1(PC_C)], [r1(PC_Q), r1(PC_C)], [r1(PC_Q), PC_P], [0, PC_P]] }, MC_PATH(), ATC_PATH, line(0, PC_P, 94, PC_P, ["AR = MR", 84, 76], "b"), guide(r1(PC_Q), PC_P, "Q", "P"), guide(r1(PC_Q), r1(PC_C), undefined, "C", { noV: true }), text("Supernormal profit", 30, 58)] }],
        shows: "The firm is a price taker, so its demand curve is horizontal at the market price: AR = MR. It produces Q, where MC = MR. Price P is above average cost C at that output, so the shaded rectangle is supernormal profit. New firms are free to enter, so in the long run this profit is competed away.",
        steps: ["Draw MC and ATC, then a horizontal line at the market price labelled AR = MR.", "Find where MC crosses MR and drop a line to the output axis.", "Read ATC at that output and shade the rectangle between price and ATC."],
      },
      {
        id: "perfect-competition-long-run",
        title: "Perfect competition: normal profit in the long run",
        ref: "7.6.4",
        charts: [{ ...COSTS, els: [MC_PATH(), ATC_PATH, line(0, r1(MIN_ATC), 94, r1(MIN_ATC), ["AR = MR", 86, r1(MIN_ATC) - 6], "b"), guide(r1(Q_ATC), r1(MIN_ATC), "Q", "P")] }],
        shows: "Entry of new firms lowers the market price until it equals the lowest point of ATC. The firm produces where MC = MR, which is now also where AR = ATC, so it makes only normal profit. It produces at the lowest average cost, so it is productively efficient, and price equals MC, so it is allocatively efficient.",
        steps: ["Draw MC and ATC.", "Draw AR = MR as a horizontal line that just touches the lowest point of ATC.", "Mark the output where MC, ATC and AR = MR all meet."],
      },
      {
        id: "shutdown-and-supply",
        title: "Shutdown price and the firm's supply curve",
        ref: "7.6.4",
        charts: [{ ...COSTS, els: [{ t: "path", pts: sample(MC, 8, Q_AVC), k: "c" }, { t: "path", pts: sample(MC, Q_AVC, 70), k: "b", label: ["MC", 74, 96] }, ATC_PATH, AVC_PATH, dot(Q_AVC, 30), dot(r1(Q_ATC), r1(MIN_ATC)), guide(Q_AVC, 30, undefined, "P1", { noV: true }), guide(r1(Q_ATC), r1(MIN_ATC), undefined, "P2", { noV: true })] }],
        shows: "In the short run the firm keeps producing as long as price covers average variable cost. P1, the lowest point of AVC, is the short run shutdown price. In the long run price must cover average total cost, so P2, the lowest point of ATC, is the long run shutdown price. The firm's short run supply curve is its MC curve above the lowest point of AVC, drawn as the bold upper section.",
        steps: ["Draw MC, AVC and ATC.", "Mark the lowest point of AVC as the short run shutdown price and the lowest point of ATC as the long run one.", "Highlight the MC curve above AVC and label it the firm's supply curve."],
      },
      {
        id: "monopoly-profit",
        title: "Monopoly: profit maximising price and output",
        ref: "7.6.4",
        charts: [
          {
            ...COSTS,
            els: [
              { t: "area", pts: [[0, r1(M_C)], [r1(M_Q), r1(M_C)], [r1(M_Q), r1(M_P)], [0, r1(M_P)]] },
              line(0, 95, 92, r1(M_AR(92)), ["AR = D", 88, 4]),
              line(0, 95, 50, 5, ["MR", 55, 4], "b"),
              MC_PATH("c"),
              { ...ATC_PATH, k: "c" },
              guide(r1(M_Q), r1(M_P), "Q", "P"),
              guide(r1(M_Q), r1(M_C), undefined, "C", { noV: true }),
            ],
          },
        ],
        shows: "A monopolist faces the whole downward sloping market demand curve, so MR is below AR. It produces Q, where MC = MR, and charges P, the highest price consumers will pay for that output, read off the AR curve. Price is above average cost C, so the shaded rectangle is supernormal profit. Barriers to entry mean it can last into the long run.",
        steps: ["Draw AR and MR sloping down, with MR twice as steep.", "Draw MC and ATC, then find where MC crosses MR.", "Go up to AR for the price, read ATC at that output and shade the profit rectangle."],
      },
      {
        id: "monopolistic-competition-long-run",
        title: "Monopolistic competition: normal profit in the long run",
        ref: "7.6.4",
        charts: [
          {
            ...COSTS,
            els: [
              line(0, r1(MC_A), 80, r1(MC_A + MC_SLOPE * 80), ["AR = D", 88, 8]),
              line(0, r1(MC_A), 40, r1(MC_A + 2 * MC_SLOPE * 40), ["MR", 44, 2], "b"),
              MC_PATH("c"),
              ATC_PATH,
              guide(MCQ, r1(ATC(MCQ)), "Q", "P"),
              guide(MCQ, r1(MC(MCQ)), undefined, undefined, { noH: true }),
            ],
          },
        ],
        shows: "Each firm sells a slightly different product, so it faces a downward sloping demand curve. Firms can enter freely, so in the long run demand for each firm falls until AR just touches ATC. At output Q, MC = MR and price equals average cost, so the firm makes normal profit. Q is below the output where ATC is lowest, so the firm has excess capacity and is not productively efficient.",
        steps: ["Draw ATC as a U shape.", "Draw AR so it just touches the falling part of ATC, then MR below it.", "Show that MC crosses MR at the same output where AR touches ATC."],
      },
      {
        id: "kinked-demand",
        title: "Oligopoly: the kinked demand curve",
        ref: "7.6.4, 7.8.5",
        charts: [
          {
            ...COSTS,
            els: [
              { t: "path", pts: [[0, 70], [40, 60], [92, 23.6]], label: ["AR = D", 92, 32] },
              line(0, 70, 40, 50, undefined, "b"),
              line(40, 32, 62, 1.2, ["MR", 68, 4], "b"),
              line(40, 50, 40, 32, undefined, "c"),
              line(10, 20, 75, 75, ["MC2", 80, 80], "c"),
              line(10, 12, 75, 67, ["MC1", 80, 66], "c"),
              guide(40, 60, "Q", "P"),
            ],
          },
        ],
        shows: "Rivals are expected to match a price cut but ignore a price rise. Above the current price P, demand is elastic, so a rise loses many customers. Below P, demand is inelastic, so a cut gains few. The kink leaves a vertical gap in MR. MC can move anywhere within that gap, from MC1 to MC2, and the profit maximising price and output stay at P and Q, which helps explain why prices in oligopoly are sticky.",
        steps: ["Draw a demand curve that is shallow above the current price and steep below it.", "Draw the two MR sections and join the gap with a vertical dotted line.", "Draw MC passing through the gap and mark P and Q at the kink."],
      },
    ],
  },
  {
    id: "a2-labour",
    title: "A Level: Labour markets",
    diagrams: [
      {
        id: "mrp-demand-for-labour",
        title: "Marginal revenue product: the firm's demand for labour",
        ref: "8.3.4",
        charts: [{ ...LAB, els: [line(5, 90, 90, 10, ["MRP = DL", 30, 86]), line(0, 60, 92, 60, undefined, "c"), line(0, 40, 92, 40, undefined, "c"), guide(r1(MRP_L(60)), 60, "L1", "W1"), guide(r1(MRP_L(40)), 40, "L2", "W2")] }],
        shows: "Marginal revenue product is the extra revenue from employing one more worker. It falls as more workers are employed because of diminishing returns. A firm hiring in a competitive labour market employs workers until MRP equals the wage. When the wage falls from W1 to W2, it employs more, from L1 to L2, so the MRP curve is the firm's demand curve for labour.",
        steps: ["Label the axes wage rate and quantity of labour.", "Draw MRP sloping down and label it MRP = DL.", "Draw two wage lines and mark the number of workers employed at each."],
      },
      {
        id: "monopsony",
        title: "Monopsony employer",
        ref: "8.3.8",
        charts: [{ ...LAB, els: [line(0, 10, 90, 55, ["ACL = SL", 84, 62], "b"), line(0, 10, 80, 90, ["MCL", 84, 94]), line(0, 90, 90, 18, ["MRP", 92, 12], "c"), guide(r1(MS_L), r1(10 + MS_L), "Lm", undefined, { noH: true }), guide(r1(MS_L), r1(MS_W), undefined, "Wm", { noV: true }), guide(r1(MC_L), r1(MC_W), "Lc", "Wc")] }],
        shows: "A monopsony is the only employer of a type of labour. To hire one more worker it must raise the wage for everyone, so the marginal cost of labour (MCL) is above the average cost (ACL, the supply curve). It employs Lm, where MCL equals MRP, and pays only the wage on the supply curve, Wm. A competitive labour market would employ Lc at Wc, so monopsony means lower wages and fewer jobs.",
        steps: ["Draw ACL = SL sloping up, MCL steeper above it, and MRP sloping down.", "Find where MCL crosses MRP and drop a line to the labour axis (Lm).", "Read the wage from the supply curve at Lm (Wm) and compare with Wc and Lc."],
      },
      {
        id: "trade-union-wage",
        title: "Trade union wage in a competitive labour market",
        ref: "8.3.8",
        charts: [{ ...LAB, els: [D("DL"), line(15, 15, 85, 85, undefined, "c"), { t: "path", pts: [[0, 70], [70, 70], [85, 85]], k: "b", label: ["SL", 89, 89] }, guide(50, 50, "Qe", "We"), guide(30, 70, "Q1", "Wu", { noH: true })] }],
        shows: "A trade union bargains for a wage Wu above the equilibrium wage We. No member will work for less, so the supply curve becomes horizontal at Wu until it meets the old supply curve. Firms move up their demand curve and employ fewer workers, Q1 instead of Qe. The union has raised pay for those in work but reduced employment.",
        steps: ["Draw DL and SL and mark We and Qe.", "Draw a horizontal line at the union wage that joins the old supply curve, making the new supply curve.", "Mark the new, lower employment Q1 where the union wage meets DL."],
      },
      {
        id: "transfer-earnings-economic-rent",
        title: "Transfer earnings and economic rent",
        ref: "8.3.10",
        charts: [{ ...LAB, els: [{ t: "area", pts: [[0, 10], [0, 50], [44, 50]] }, { t: "area", pts: [[0, 0], [0, 10], [44, 50], [44, 0]], k: "b" }, line(0, 10, 88, 90, ["SL", 92, 94], "b"), line(4, 90, 84, 10, ["DL", 88, 6]), guide(44, 50, "L", "W"), text("Economic rent", 17, 43), text("Transfer earnings", 25, 7)] }],
        shows: "Every worker is paid the market wage W. Transfer earnings are the least each worker would accept to stay in the job, shown by the supply curve: the area under SL. Economic rent is anything paid above that: the area above SL and below the wage. The more inelastic the supply of labour, the larger the share of pay that is economic rent.",
        steps: ["Draw DL and SL and mark the wage W and employment L.", "Shade the area under SL up to L and label it transfer earnings.", "Shade the triangle between SL and the wage line and label it economic rent."],
      },
    ],
  },
  {
    id: "a2-macroeconomy",
    title: "A Level: The macroeconomy",
    diagrams: [
      {
        id: "consumption-function",
        title: "The consumption function",
        ref: "9.1.2",
        charts: [{ y: "Consumption", x: "National income", els: [line(0, 0, 90, 90, ["45°", 94, 94], "c"), line(0, 20, 90, 74, ["C", 94, 76]), guide(50, 50, "Y1", undefined, { noH: true }), guide(0, 20, undefined, "a", { noV: true })] }],
        shows: "Consumption has an autonomous part, a, spent even when income is zero, and an induced part that rises with income. The slope of the line is the marginal propensity to consume. On the 45° line, consumption would equal income. Below Y1, people spend more than their income (dissaving). Above Y1, they save part of it.",
        steps: ["Label the axes consumption and national income and draw a 45° line.", "Draw the consumption line starting above the origin at a, flatter than 45°.", "Mark the income Y1 where the two lines cross."],
      },
      {
        id: "deflationary-gap",
        title: "Deflationary gap",
        ref: "9.1.3",
        charts: [{ y: "Aggregate expenditure", x: "National income", els: [line(0, 0, 92, 92, ["45°", 95, 88], "c"), line(0, 30, 90, 75, ["AD", 94, 76]), guide(60, 60, "Ye", undefined, { noH: true }), guide(80, 80, "Yf", undefined, { noH: true }), line(80, 70, 80, 80, undefined, "b"), text("Deflationary gap", 44, 90), arrow(62, 87, 78, 77)] }],
        shows: "Equilibrium national income Ye is where aggregate demand meets the 45° line. Here it is below the full employment level Yf, so there is unemployment. The deflationary gap is the amount by which AD falls short of the 45° line at Yf. Raising AD by that amount would, through the multiplier, lift income all the way to Yf.",
        steps: ["Draw the 45° line and an AD line that crosses it at Ye.", "Mark full employment income Yf to the right of Ye.", "Label the vertical gap between AD and the 45° line at Yf the deflationary gap."],
      },
      {
        id: "inflationary-gap",
        title: "Inflationary gap",
        ref: "9.1.3",
        charts: [{ y: "Aggregate expenditure", x: "National income", els: [line(0, 0, 92, 92, ["45°", 95, 86], "c"), line(0, 45, 90, 90, ["AD", 84, 94]), guide(90, 90, "Ye", undefined, { noH: true }), guide(70, 70, "Yf", undefined, { noH: true }), line(70, 70, 70, 80, undefined, "b"), text("Inflationary gap", 30, 92), arrow(44, 88, 68, 79)] }],
        shows: "Here AD would take national income beyond the full employment level Yf. The economy cannot produce more real output than Yf, so the extra demand pushes up prices instead. The inflationary gap is the amount by which AD exceeds the 45° line at Yf, the fall in AD needed to remove the inflationary pressure.",
        steps: ["Draw the 45° line and an AD line that crosses it at Ye.", "Mark full employment income Yf to the left of Ye.", "Label the vertical gap between AD and the 45° line at Yf the inflationary gap."],
      },
      {
        id: "business-cycle",
        title: "The business cycle and output gaps",
        ref: "9.2.2, 9.2.3",
        charts: [
          {
            y: "Real GDP",
            x: "Time",
            els: [
              line(5, 25, 92, 70, ["Trend", 96, 64], "c"),
              { t: "path", pts: sample(ACTUAL, 5, 92, 80), label: ["Actual", 90, 89] },
              dot(15, r1(ACTUAL(15)), ["Boom", 15, 50]),
              dot(35, r1(ACTUAL(35)), ["Slump", 35, 20]),
              text("Positive gap", 55, 72),
              text("Negative gap", 75, 40),
            ],
          },
        ],
        shows: "The trend line shows the growth of potential output. Actual output swings around it. From the boom, output falls (recession) to the slump, then rises again (recovery). When actual output is above potential, there is a positive output gap and inflation tends to rise. When it is below, there is a negative output gap and unemployment tends to rise.",
        steps: ["Label the axes real GDP and time and draw a rising trend line.", "Draw a wave around it and label the boom, recession, slump and recovery.", "Label a positive output gap above the trend and a negative one below it."],
      },
      {
        id: "liquidity-preference",
        title: "Liquidity preference: the money market",
        ref: "9.4.7, 9.4.8",
        charts: [{ y: "Interest rate", x: "Quantity of money", els: [{ t: "path", pts: sample(MONEY, 8, 92), label: ["LP", 95, 34] }, line(50, 4, 50, 92, ["MS", 50, 97], "b"), line(80, 4, 80, 92, ["MS1", 80, 97], "c"), guide(50, r1(MONEY(50)), undefined, "r1", { noV: true }), guide(80, r1(MONEY(80)), undefined, "r2", { noV: true }), arrow(53, 80, 77, 80)] }],
        shows: "Liquidity preference (LP) is the demand for money: people hold money for transactions, as a precaution and to speculate on bond prices. Holding money means giving up interest, so less is demanded when the rate is high. The money supply (MS) is set by the central bank, so it is drawn vertical. The rate of interest is r1, where the two meet. An increase in the money supply to MS1 lowers it to r2.",
        steps: ["Label the axes interest rate and quantity of money.", "Draw LP sloping down and flattening out, and MS as a vertical line.", "Mark the interest rate where they meet, then show a shift of MS and the new rate."],
      },
      {
        id: "loanable-funds",
        title: "Loanable funds theory",
        ref: "9.4.8",
        charts: [{ y: "Interest rate", x: "Loanable funds", els: [D("D"), S("S"), guide(50, 50, "Q", "r")] }],
        shows: "The demand for loanable funds comes mainly from firms that want to borrow to invest, and it falls as the interest rate rises. The supply comes from saving, which rises as the interest rate rises. The interest rate r is where the demand for and supply of loanable funds are equal.",
        steps: ["Label the axes interest rate and loanable funds.", "Draw demand (borrowing to invest) sloping down and supply (saving) sloping up.", "Mark the equilibrium interest rate r."],
      },
    ],
  },
  {
    id: "a2-policy",
    title: "A Level: Government macroeconomic policy",
    diagrams: [
      {
        id: "phillips-curve",
        title: "The traditional Phillips curve",
        ref: "10.2.5",
        charts: [{ y: "Inflation (%)", x: "Unemployment (%)", els: [{ t: "path", pts: sample((x) => 1200 / (x + 5) - 8, 8, 92), label: ["PC", 95, 12] }, guide(20, 40, "U1", "I1"), guide(50, r1(1200 / 55 - 8), "U2", "I2")] }],
        shows: "The traditional Phillips curve shows a trade off: lower unemployment comes with higher inflation. Moving from U2 to U1 cuts unemployment but raises inflation from I2 to I1. It suggested a government could choose a mix of the two.",
        steps: ["Label the axes inflation and unemployment.", "Draw a curve sloping down and flattening out.", "Mark two points to show the trade off."],
      },
      {
        id: "expectations-phillips-curve",
        title: "The expectations-augmented Phillips curve",
        ref: "10.2.5",
        charts: [
          {
            y: "Inflation (%)",
            x: "Unemployment (%)",
            els: [
              { t: "path", pts: sample(PH(20), 12, 92), k: "c", label: ["SRPC1", 92, 4] },
              { t: "path", pts: sample(PH(35), 14, 92), k: "b", label: ["SRPC2", 88, 34] },
              line(40, 4, 40, 94, ["LRPC", 40, 98]),
              dot(40, 20, ["A", 45, 16]),
              dot(20, 35, ["B", 16, 31]),
              dot(40, 35, ["C", 45, 40]),
              guide(40, 20, "NRU", undefined, { noV: true }),
            ],
          },
        ],
        shows: "The economy starts at A, at the natural rate of unemployment (NRU). A rise in AD cuts unemployment and raises inflation, moving to B along SRPC1. Workers then expect the higher inflation and push for higher wages, so the short run curve shifts up to SRPC2 and unemployment returns to the NRU at C, with higher inflation. In the long run there is no trade off: the long run Phillips curve (LRPC) is vertical at the NRU.",
        steps: ["Draw a vertical LRPC at the natural rate of unemployment.", "Draw SRPC1 through the LRPC, then SRPC2 above it.", "Show the move from A to B along SRPC1, then from B to C on SRPC2."],
      },
      {
        id: "laffer-curve",
        title: "The Laffer curve",
        ref: "10.3.1",
        charts: [{ y: "Tax revenue", x: "Tax rate (%)", els: [{ t: "path", pts: sample((x) => (x * (96 - x) * 85) / 2304, 0, 96), label: ["Laffer curve", 70, 92] }, guide(48, 85, "T*", undefined, { noH: true }), guide(96, 0, "100", undefined, { noH: true })] }],
        shows: "Tax revenue is zero at a tax rate of 0% and, in theory, also at 100%, when no one has a reason to work. Between the two, revenue rises to a peak at T*. Above T*, a lower tax rate could raise more revenue, because people work, earn and declare more. Where T* lies in a real economy is uncertain.",
        steps: ["Label the axes tax revenue and tax rate, from 0% to 100%.", "Draw an upside down U starting and ending on the tax rate axis.", "Mark the tax rate T* where revenue is highest."],
      },
    ],
  },
  {
    id: "a2-international",
    title: "A Level: International economic issues",
    diagrams: [
      {
        id: "j-curve",
        title: "The J curve",
        ref: "11.2.5",
        charts: [
          {
            y: "Current account",
            x: "Time",
            els: [
              line(0, 50, 94, 50, undefined, "c"),
              guide(0, 50, undefined, "0", { noV: true }),
              { t: "path", pts: [[5, 40], [10, 32], [16, 26], [22, 24], [30, 27], [40, 36], [50, 47], [60, 58], [70, 67], [80, 74], [90, 79]], label: ["J curve", 86, 88] },
              dot(5, 40, ["Depreciation", 14, 14]),
              text("Surplus", 30, 62),
              text("Deficit", 60, 34),
            ],
          },
        ],
        shows: "After a depreciation, export prices fall and import prices rise straight away, but buyers take time to change what they buy. At first, demand for exports and imports is price inelastic, so the current account gets worse. Over time demand becomes more elastic, and once the Marshall-Lerner condition holds (the sum of the PEDs for exports and imports is greater than 1), the current account improves.",
        steps: ["Label the axes current account balance and time, with a zero line across the middle.", "Start below the zero line at the depreciation and show the balance getting worse first.", "Then show it rising through the zero line into surplus, making a J shape."],
      },
      {
        id: "lorenz-curve",
        title: "The Lorenz curve and the Gini coefficient",
        ref: "11.4.2",
        charts: [
          {
            y: "% of income",
            x: "% of population",
            els: [
              { t: "area", pts: [[0, 0], [90, 90], ...LORENZ.slice().reverse()] },
              { t: "area", pts: [...LORENZ, [90, 0]], k: "b" },
              line(0, 0, 90, 90, ["Line of equality", 54, 84], "c"),
              { t: "path", pts: LORENZ, label: ["Lorenz curve", 80, 26] },
              text("A", 56, 44),
              text("B", 84, 9),
              guide(90, 90, "100", "100", { noH: true }),
            ],
          },
        ],
        shows: "The line of equality shows every share of the population receiving the same share of income. The Lorenz curve shows the real share: here the poorest half of people receive far less than half the income. The Gini coefficient is area A divided by areas A and B together. It runs from 0 (perfect equality) to 1 (one person has everything). The further the curve bows, the more unequal the country.",
        steps: ["Draw a square with both axes running from 0 to 100%.", "Draw the diagonal line of equality and a Lorenz curve that sags below it.", "Label the area between them A and the area under the curve B."],
      },
      {
        id: "kuznets-curve",
        title: "The Kuznets curve",
        ref: "11.3.3",
        charts: [{ y: "Income inequality", x: "Income per head", els: [{ t: "path", pts: sample((x) => 15 + 70 * (x / 35) * Math.exp(1 - x / 35), 3, 92), label: ["Kuznets curve", 82, 62] }] }],
        shows: "Kuznets suggested that as a country develops, income inequality first rises, as some people move to better paid jobs in industry and towns, and then falls as more people share in growth. Many countries do not follow this pattern, so treat it as a theory to evaluate, not a rule.",
        steps: ["Label the axes income inequality and income per head.", "Draw an upside down U.", "Explain the rising and falling parts in words beside it."],
      },
    ],
  },
];

export interface DiagramSet {
  code: string;
  h1: string;
  title: string;
  description: string;
  /** What the page covers and leaves out, from the syllabus. */
  note: string;
  groups: DiagramGroup[];
}

const count = (g: DiagramGroup[]) => g.reduce((n, x) => n + x.diagrams.length, 0);
const OL_NOTE = "The syllabus says diagrams are not required for market failure, competitive markets or monopoly, so none are included.";

export const DIAGRAM_SETS: DiagramSet[] = [
  {
    code: "0455",
    h1: "IGCSE Economics 0455 diagrams",
    title: "0455 Economics Diagrams: Every IGCSE Diagram to Draw",
    description: `All ${count(OL_GROUPS)} diagrams the IGCSE Economics 0455 syllabus asks you to draw: PPC, demand and supply, elasticity, maximum and minimum prices, tax, subsidy, wages and costs.`,
    note: OL_NOTE,
    groups: OL_GROUPS,
  },
  {
    code: "2281",
    h1: "O Level Economics 2281 diagrams",
    title: "2281 Economics Diagrams: Every O Level Diagram to Draw",
    description: `All ${count(OL_GROUPS)} diagrams the O Level Economics 2281 syllabus asks you to draw: PPC, demand and supply, elasticity, maximum and minimum prices, tax, subsidy, wages and costs.`,
    note: OL_NOTE,
    groups: OL_GROUPS,
  },
  {
    code: "9708",
    h1: "AS and A Level Economics 9708 diagrams",
    title: "9708 Economics Diagrams: Every AS and A Level Diagram",
    description: `All ${count(AS_GROUPS) + count(A2_GROUPS)} diagrams for Economics 9708: AS Level AD/AS, tax and elasticity, then A Level costs, market structures, externalities, monopsony, Phillips and Lorenz curves.`,
    note: "The AS Level part (topics 1 to 5) comes first, then the A Level part (topics 7 to 11).",
    groups: [...AS_GROUPS, ...A2_GROUPS],
  },
];

export const diagramCount = (s: DiagramSet) => count(s.groups);
