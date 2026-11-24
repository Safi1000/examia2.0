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
    h1: "AS Level Economics 9708 diagrams",
    title: "9708 AS Level Economics Diagrams: Every Diagram to Draw",
    description: `All ${count(AS_GROUPS)} AS Level diagrams for Economics 9708: PPC, elasticity, consumer and producer surplus, tax incidence, buffer stocks and AD/AS with policy.`,
    note: "This page covers the AS Level part of the syllabus, topics 1 to 5.",
    groups: AS_GROUPS,
  },
];

export const diagramCount = (s: DiagramSet) => count(s.groups);
