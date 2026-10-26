/**
 * The Starting Point Check question bank (The Blueprint, day one).
 * Edit questions here; the screens read everything from this file.
 *
 * Three parts:
 *  1. PROFILE: how the student learns. No right answers; each answer has a
 *     code, and codes in TIPS turn into advice for the student and a note
 *     for Hamza.
 *  2. CORE: numbers and reading/reasoning, asked once for everyone, at the
 *     level's difficulty (O Level: about grade 8; AS: harder; A2: A Level).
 *  3. SUBJECTS: the real prerequisites for each subject at each level.
 *     O Level and AS assume a day-one student who has not studied the
 *     subject; A2 is built on AS content. The last questions (area "P")
 *     are a preview of what comes next.
 *
 * Every multiple-choice question: q (question), o (options), a (index of
 * the right option, counting from 0), skill, area, and `why`: what a wrong
 * option usually means (the misconception behind it), for Hamza's report.
 * `context` is a short passage shown above the question.
 *
 * Areas: N numbers, L reading and reasoning, B basics (concepts),
 * R applying ideas, P preview.
 */
export type Area = "N" | "L" | "B" | "R" | "P";
export interface Mcq {
  q: string;
  o: string[];
  a: number;
  skill: string;
  area: Area;
  context?: string;
  why?: Record<number, string>;
}
export interface SubjectSet {
  w: string;
  /** How to mark the written answer (for Hamza, never shown to students). */
  ms: string;
  q: Mcq[];
}
export type LevelKey = "igcse" | "as" | "a2";
export type SubjectKey = "Accounting" | "Business" | "Economics";

export const LEVELS: Record<LevelKey, string> = { igcse: "IGCSE or O Level", as: "AS", a2: "A2" };
export const SUBJECTS: SubjectKey[] = ["Accounting", "Business", "Economics"];
export const AREA: Record<Exclude<Area, "P">, string> = { N: "Numbers", L: "Reading and reasoning", B: "Basics", R: "Applying ideas" };

/* ------------------------------------------------------------------ */
/* Part 1: how you learn                                                */
/* ------------------------------------------------------------------ */
export interface ProfileQ {
  id: string;
  q: string;
  o: Array<{ t: string; code: string }>;
}

export const PROFILE: ProfileQ[] = [
  {
    id: "revise",
    q: "When you revise for a test, what do you spend most of the time doing?",
    o: [
      { t: "Reading my notes or the book again", code: "reread" },
      { t: "Highlighting or copying notes neatly", code: "copy" },
      { t: "Testing myself without looking at my notes", code: "retrieval" },
      { t: "Doing past paper questions", code: "practice" },
      { t: "Watching videos on the topic", code: "video" },
    ],
  },
  {
    id: "start",
    q: "When do you usually start revising for a test?",
    o: [
      { t: "The night before", code: "cram" },
      { t: "Two or three days before", code: "short" },
      { t: "A week or more before, a little each day", code: "spaced" },
      { t: "I don’t usually revise", code: "norevise" },
    ],
  },
  {
    id: "mistakes",
    q: "You get a test back with some answers wrong. What do you usually do next?",
    o: [
      { t: "Look at the mark and move on", code: "ignore" },
      { t: "Read the correct answers", code: "readfix" },
      { t: "Redo the wrong questions until I can get them right", code: "redo" },
      { t: "Ask the teacher or a friend to explain", code: "askfix" },
    ],
  },
  {
    id: "stuck",
    q: "In class, you don’t understand something. What do you usually do?",
    o: [
      { t: "Ask straight away", code: "asknow" },
      { t: "Ask after class or message the teacher", code: "asklater" },
      { t: "Search online or use AI later", code: "search" },
      { t: "Leave it and hope it makes sense later", code: "leave" },
    ],
  },
  {
    id: "timing",
    q: "In a timed test, what usually happens?",
    o: [
      { t: "I finish with time to check my answers", code: "early" },
      { t: "I just about finish", code: "tight" },
      { t: "I run out of time and leave questions out", code: "runout" },
      { t: "I rush and make careless mistakes", code: "rush" },
    ],
  },
  {
    id: "reading",
    q: "A question starts with a long passage about a business. How do you usually begin?",
    o: [
      { t: "Read the whole passage carefully first", code: "readall" },
      { t: "Read the question first, then look for what I need", code: "qfirst" },
      { t: "Skim it quickly and start writing", code: "skim" },
      { t: "Long passages are hard for me to follow", code: "hardread" },
    ],
  },
  {
    id: "english",
    q: "How easy is it for you to read long exam questions in English?",
    o: [
      { t: "Easy", code: "engeasy" },
      { t: "Mostly fine, but some words slow me down", code: "engmid" },
      { t: "Hard: I often need to read them twice", code: "enghard" },
    ],
  },
  {
    id: "explain",
    q: "A question says “explain” and is worth 4 marks. What do you usually write?",
    o: [
      { t: "One short line", code: "oneline" },
      { t: "A few separate points", code: "points" },
      { t: "A point, then why it happens, then what it leads to", code: "chain" },
      { t: "I’m not sure what is expected", code: "unsure" },
    ],
  },
  {
    id: "nerves",
    q: "How do you feel before an important test?",
    o: [
      { t: "Calm", code: "calm" },
      { t: "A bit nervous, and it helps me focus", code: "somenerves" },
      { t: "Very nervous, and it makes me forget things", code: "anxious" },
    ],
  },
  {
    id: "hours",
    q: "Outside class, how many hours a week do you usually study these subjects?",
    o: [
      { t: "Less than 2", code: "lowhours" },
      { t: "2 to 4", code: "midhours" },
      { t: "5 to 10", code: "goodhours" },
      { t: "More than 10", code: "highhours" },
    ],
  },
  {
    id: "phone",
    q: "When you study at home, where is your phone?",
    o: [
      { t: "In another room, or switched off", code: "phoneaway" },
      { t: "Next to me, on silent", code: "phonenear" },
      { t: "In my hand, and I check it often", code: "phonehand" },
    ],
  },
  {
    id: "struggle",
    q: "Which of these sounds most like you?",
    o: [
      { t: "I understand in class, but forget it later", code: "forget" },
      { t: "I understand the ideas, but lose marks in exams", code: "technique" },
      { t: "The calculations are the hard part for me", code: "calcs" },
      { t: "Theory and long written answers are the hard part", code: "writing" },
      { t: "I’m doing well and want the top grade", code: "stretch" },
    ],
  },
  {
    id: "belief",
    q: "How sure are you that you can reach the grade you want?",
    o: [
      { t: "Not sure at all", code: "lowbelief" },
      { t: "A little sure", code: "lowbelief" },
      { t: "Fairly sure", code: "midbelief" },
      { t: "Very sure", code: "highbelief" },
    ],
  },
];

/**
 * What each profile answer means. `student` is shown on the finish screen
 * (the three most important ones); `teacher` goes into Hamza's report.
 * Codes not listed here are healthy habits.
 */
export const TIPS: Record<string, { rank: number; student: string; teacher: string }> = {
  reread: { rank: 2, student: "Close your notes, write down everything you remember on a blank page, then check what you missed. Do this instead of reading again.", teacher: "Revises by reading notes again: teach retrieval practice (blank page recall, flashcards)." },
  copy: { rank: 2, student: "Turn each topic into five questions and answer them from memory the next day.", teacher: "Revises by copying or highlighting: switch to testing yourself." },
  video: { rank: 3, student: "After every video, answer three questions on it without looking back.", teacher: "Leans on videos: pair every video with practice questions." },
  cram: { rank: 1, student: "Revise each topic for 20 minutes on three different days, not once the night before.", teacher: "Crams the night before: set short weekly checks to force spacing." },
  norevise: { rank: 1, student: "Spend 20 minutes, four days a week, on the topic from your last lesson. I set a short check every week.", teacher: "Does not revise: needs structure and weekly accountability." },
  ignore: { rank: 1, student: "Redo every question you get wrong, without looking, until you can do it alone.", teacher: "Ignores mistakes: require corrections on every marked test." },
  readfix: { rank: 3, student: "When you check a wrong answer, cover it and redo the question yourself.", teacher: "Reads corrections but does not redo them: set redo tasks." },
  search: { rank: 3, student: "When something does not make sense, ask me in class or on WhatsApp before searching online.", teacher: "Relies on search or AI when stuck: encourage asking, check understanding directly." },
  leave: { rank: 1, student: "Ask me the same day, in class or on WhatsApp. One missed idea makes the next lesson harder.", teacher: "Leaves gaps unasked: check in with them in early lessons." },
  runout: { rank: 2, student: "Give each question about one minute per mark. I time your practice from week one.", teacher: "Runs out of time: timed practice and minutes per mark from the start." },
  rush: { rank: 2, student: "Read each question twice and underline the command word before you write.", teacher: "Rushes and makes careless errors: teach a checking routine." },
  skim: { rank: 2, student: "Read the question first, underline what it asks, then find the evidence in the passage.", teacher: "Skims case material: teach question first reading with evidence." },
  hardread: { rank: 1, student: "Read the question first, then the passage one paragraph at a time, underlining anything that answers it.", teacher: "Finds long passages hard: possible reading load issue, scaffold case studies." },
  points: { rank: 2, student: "Develop one point fully: the point, because, which leads to. One developed point earns more than three listed ones.", teacher: "Lists points without developing them: teach point, because, so." },
  enghard: { rank: 1, student: "Keep a list of exam words you do not know, with their meanings. I go through the key terms with you before each topic.", teacher: "English reading is a barrier: pre teach key terms, start with shorter texts." },
  oneline: { rank: 1, student: "Write every “explain” answer as a chain: the point, because, which leads to. I mark this every week.", teacher: "Writes one line answers: teach point, because, so (chains of reasoning)." },
  unsure: { rank: 1, student: "Learn what each command word asks for. I show you a full mark answer for each one.", teacher: "Unsure what command words need: teach command words early." },
  anxious: { rank: 2, student: "Do short timed questions often, so exam conditions feel normal long before the exam.", teacher: "High test anxiety: frequent low pressure timed practice, reassurance." },
  lowhours: { rank: 2, student: "Aim for three to five focused hours a week outside class.", teacher: "Studies under 2 hours a week: set a weekly study target." },
  phonehand: { rank: 2, student: "Put your phone in another room while you study.", teacher: "Phone in hand while studying: suggest phone away study blocks." },
  forget: { rank: 2, student: "Each week, spend ten minutes testing yourself on topics from earlier weeks.", teacher: "Forgets after class: use spaced retrieval quizzes on past topics." },
  technique: { rank: 2, student: "After each answer, check the mark scheme to see exactly where the marks come from. I show you how in class.", teacher: "Understands but loses marks: focus on exam technique and mark schemes." },
  calcs: { rank: 2, student: "Do five calculation questions a day and write down every step.", teacher: "Finds calculations hard: numeracy support and worked examples." },
  writing: { rank: 2, student: "Learn one answer structure for each type of question. I give you model answers to follow.", teacher: "Finds written answers hard: answer structures and model answers." },
  stretch: { rank: 3, student: "Work on evaluation and timing: that is where the last marks are. I give you stretch questions.", teacher: "Aiming for the top: stretch work, evaluation, A* technique." },
  lowbelief: { rank: 2, student: "Write down every test score. I go through them with you so you can see the progress for yourself.", teacher: "Low confidence about reaching target: show small wins early, track progress visibly." },
};

/* ------------------------------------------------------------------ */
/* Part 2: core skills (asked once)                                     */
/* ------------------------------------------------------------------ */
export const CORE: Record<LevelKey, Mcq[]> = {
  igcse: [
    { q: "What is 25% of $360?", o: ["$90", "$25", "$36", "$9"], a: 0, skill: "Percentages", area: "N", why: { 1: "Writes the percentage as the answer", 2: "Finds 10% instead", 3: "Divides by 40" } },
    { q: "A jacket costs $80. Its price rises by 10%. What is the new price?", o: ["$81", "$90", "$88", "$8"], a: 2, skill: "Percentage increase", area: "N", why: { 0: "Adds 1 instead of 10%", 1: "Adds 10 dollars instead of 10%", 3: "Gives only the increase" } },
    { q: "A shop had $150 in its bank account and paid a bill of $210 from it. What is its bank balance now?", o: ["$60", "$360", "Minus $60", "$0"], a: 2, skill: "Negative numbers", area: "N", why: { 0: "Ignores that the balance is negative", 1: "Adds instead of subtracting", 3: "Assumes a balance cannot go below zero" } },
    { q: "Amir and Bina share $90 in the ratio 2:1. How much does Amir get?", o: ["$45", "$30", "$180", "$60"], a: 3, skill: "Ratios", area: "N", why: { 0: "Shares equally", 1: "Gives the smaller share", 2: "Multiplies instead of sharing" } },
    { q: "Sales rise from $400 to $500. What is the percentage increase?", o: ["20%", "25%", "100%", "125%"], a: 1, skill: "Percentage change", area: "N", why: { 0: "Divides by the new value", 2: "Treats the $100 rise as a percentage", 3: "Divides the new value by the old" } },
    { q: "Rana scores 60, 70 and 80 in three tests. What is her mean score?", o: ["210", "70", "60", "75"], a: 1, skill: "Averages", area: "N", why: { 0: "Gives the total, not the mean", 2: "Picks the lowest", 3: "Guesses between values" } },
    {
      q: "Which statement is true?",
      context: "A shop’s sales: January $2,000. February $2,600. March $2,300.",
      o: ["Sales rose every month", "Sales were highest in March", "Sales doubled from January to February", "Sales fell from February to March"],
      a: 3,
      skill: "Reading data",
      area: "L",
      why: { 0: "Does not compare each pair of months", 1: "Picks the latest month as the highest", 2: "Misjudges the size of a change" },
    },
    {
      q: "What can you tell from this?",
      context: "Zara runs a small bakery. Last month the price of flour went up, so she raised the price of her cakes. Her regular customers kept buying, but fewer new customers came in.",
      o: ["The bakery made a loss", "Higher prices may have put off some new customers", "Customers stopped buying cakes", "Flour became cheaper"],
      a: 1,
      skill: "Reading for meaning",
      area: "L",
      why: { 0: "Concludes more than the text says", 2: "Misreads what happened to regular customers", 3: "Misreads the text" },
    },
    { q: "Which of these is a fact rather than an opinion?", o: ["Selling 200 cakes a week is too few", "The new shop is too expensive", "Sales rose by 10% last month", "Customers love the bakery"], a: 2, skill: "Fact and opinion", area: "L", why: { 0: "Treats a judgement with a number in it as a fact", 1: "Treats a judgement as a fact", 3: "Treats a general claim as a fact" } },
  ],
  as: [
    { q: "A price falls from $50 to $40. What is the percentage change?", o: ["Minus 20%", "Minus 10%", "Minus 25%", "Plus 20%"], a: 0, skill: "Percentage change", area: "N", why: { 1: "Uses the $10 fall as the percentage", 2: "Divides by the new value", 3: "Ignores the direction of the change" } },
    { q: "A price rises by 10% and then falls by 10%. Compared with where it started, the price is now:", o: ["The same", "1% higher", "10% lower", "1% lower"], a: 3, skill: "Successive percentages", area: "N", why: { 0: "Thinks percentage changes cancel out", 1: "Gets the direction wrong", 2: "Applies only the second change" } },
    { q: "Profit equals revenue minus costs. If profit is $12,000 and costs are $30,000, what is revenue?", o: ["$18,000", "$42,000", "$360,000", "$2.50"], a: 1, skill: "Rearranging a formula", area: "N", why: { 0: "Subtracts instead of adding", 2: "Multiplies", 3: "Divides" } },
    { q: "A price index was 100 in 2024 and 108 in 2025. What does this show?", o: ["Prices are now $108", "Prices rose by 108%", "Prices rose by 8%", "Prices fell by 8%"], a: 2, skill: "Index numbers", area: "N", why: { 0: "Reads an index as a price", 1: "Reads the index as the change", 3: "Gets the direction wrong" } },
    { q: "Fixed costs are $6,000. Each item sells for $10 and costs $7 to make. How many items must be sold to cover all costs?", o: ["600", "857", "6,000", "2,000"], a: 3, skill: "Calculation in steps", area: "N", why: { 0: "Divides by the price, ignoring costs per item", 1: "Divides by the cost per item", 2: "Treats costs as items" } },
    { q: "Over the same years, line A on a graph rises from 20 to 40 and line B rises from 100 to 150. Which grew faster in percentage terms?", o: ["Line A, by 100% compared with 50%", "Line B, because it rose by more", "Both grew at the same rate", "It cannot be worked out"], a: 0, skill: "Comparing growth", area: "N", why: { 1: "Compares the size of the rise, not the percentage", 2: "Guesses", 3: "Does not see that percentages can be found" } },
    {
      q: "What is the most likely reason revenue fell?",
      context: "A mobile network cut its prices by 15%. Over the next year its number of customers rose by 5%, but its total revenue fell.",
      o: ["Customers left the network", "Its costs went up", "The cut in price outweighed the rise in customers", "It raised its prices"],
      a: 2,
      skill: "Reasoning with data",
      area: "L",
      why: { 0: "Ignores that customers rose", 1: "Confuses revenue with costs", 3: "Misreads the passage" },
    },
    { q: "Towns that sell more ice cream also have more drowning accidents. What is the best conclusion?", o: ["Ice cream causes drowning", "Drowning causes ice cream sales", "There is no link at all", "Something else, such as hot weather, may cause both"], a: 3, skill: "Correlation and cause", area: "L", why: { 0: "Treats a link as a cause", 1: "Reverses cause and effect", 2: "Ignores a clear pattern" } },
  ],
  a2: [
    { q: "Nominal GDP grows by 9% and inflation is 4%. What is the approximate real growth?", o: ["13%", "5%", "2.25%", "36%"], a: 1, skill: "Real and nominal", area: "N", why: { 0: "Adds inflation instead of taking it away", 2: "Divides", 3: "Multiplies" } },
    { q: "With 2020 as the base year (100), a price index is 125 in 2025 and 130 in 2026. What is the percentage change from 2025 to 2026?", o: ["5%", "30%", "4%", "3.8%"], a: 2, skill: "Index numbers", area: "N", why: { 0: "Subtracts index points instead of finding a percentage", 1: "Measures from the base year", 3: "Divides by the later value" } },
    { q: "A firm’s revenue is $200,000 and its profit is $30,000. What percentage of revenue is profit?", o: ["15%", "6.7%", "30%", "85%"], a: 0, skill: "Percentages and margins", area: "N", why: { 1: "Divides the wrong way round", 2: "Reads $30,000 as 30%", 3: "Gives the share that is costs" } },
    { q: "You score 60% on a paper worth 30% of the grade and 80% on a paper worth 70%. What is your overall percentage?", o: ["70%", "66%", "140%", "74%"], a: 3, skill: "Weighted averages", area: "N", why: { 0: "Takes a simple average, ignoring the weights", 1: "Weights the papers the wrong way round", 2: "Adds the percentages" } },
    { q: "A firm’s costs are 40% wages, 35% materials and 25% other. Total costs are $80,000. How much are materials?", o: ["$35,000", "$28,000", "$32,000", "$20,000"], a: 1, skill: "Percentages of totals", area: "N", why: { 0: "Reads the percentage as dollars in thousands", 2: "Uses the wages share", 3: "Uses the other share" } },
    { q: "A firm’s sales rose by 20% last year, but its market share fell. Which must be true?", o: ["The firm lost customers", "The firm cut its prices", "The whole market grew by more than 20%", "Competitors made losses"], a: 2, skill: "Reasoning with data", area: "L", why: { 0: "Ignores that sales rose", 1: "Adds a cause that is not given", 3: "Adds a conclusion that is not given" } },
    {
      q: "Which is the strongest way to evaluate this claim?",
      context: "An article says: “Raising the minimum wage will reduce unemployment.”",
      o: ["Agree: workers will spend more", "Disagree: firms always cut jobs", "Agree: the government knows best", "It depends on the size of the rise"],
      a: 3,
      skill: "Evaluation",
      area: "L",
      why: { 0: "Takes one side without weighing it", 1: "Uses “always”, a one sided absolute", 2: "Appeals to authority instead of evidence" },
    },
    { q: "Which statement is normative (a value judgement)?", o: ["The inflation rate is 6%", "The government should cut taxes", "Unemployment rose last year", "Exports fell by 3%"], a: 1, skill: "Positive and normative", area: "L", why: { 0: "Confuses a fact with a judgement", 2: "Confuses a fact with a judgement", 3: "Confuses a fact with a judgement" } },
  ],
};

/* ------------------------------------------------------------------ */
/* Part 3: subjects                                                     */
/* ------------------------------------------------------------------ */
export const BANK: Record<LevelKey, Record<SubjectKey, SubjectSet>> = {
  igcse: {
    Accounting: {
      w: "In one month, a small shop sold goods for $5,000. Those goods had cost it $2,500. It also paid rent of $1,000 and electricity of $300. Did it make a profit or a loss, and how much? Show your working.",
      ms: "Profit of $1,200 (5,000 - 2,500 - 1,000 - 300). Full credit: correct figure with working and the word profit. Partly there: right method with one slip, or gross profit of $2,500 only. Needs work: adds costs to sales, or no method.",
      q: [
        { q: "Sara lends Ahmed $50. Which statement is true?", o: ["Sara owes Ahmed $50", "Ahmed owes Sara $50", "Nobody owes anything", "They both owe $50"], a: 1, skill: "Owing and owed", area: "R", why: { 0: "Reverses who owes whom", 2: "Does not see that a loan creates a debt", 3: "Confused about the direction of a debt" } },
        { q: "A shop sells goods for $300 that cost it $200. What is the $100 difference called?", o: ["Revenue", "Capital", "Profit", "Cash"], a: 2, skill: "Profit", area: "B", why: { 0: "Confuses revenue with profit", 1: "Confuses capital with profit", 3: "Confuses cash with profit" } },
        { q: "Which list contains only things a business owns?", o: ["Cash, a bank loan, a van", "Cash, a van, money customers owe it", "A van, rent it owes, inventory", "Inventory, wages it owes, cash"], a: 1, skill: "What a business owns (assets)", area: "B", why: { 0: "Thinks borrowed money is owned", 2: "Mixes what it owes with what it owns", 3: "Mixes what it owes with what it owns" } },
        { q: "Mr Ali puts $10,000 of his own savings into his new shop. From the shop’s point of view, this $10,000 is:", o: ["Profit for the shop", "Income from sales", "Money the shop owes back to Mr Ali", "A loan from a bank"], a: 2, skill: "The owner’s money (capital)", area: "R", why: { 0: "Treats the owner’s money as profit", 1: "Treats the owner’s money as income", 3: "Confuses the owner’s money with a bank loan" } },
        { q: "A shop buys goods today and agrees to pay next month. Which is true?", o: ["It has paid for the goods", "The supplier owes it money", "It has made a profit", "It owes money to the supplier"], a: 3, skill: "Buying on credit", area: "R", why: { 0: "Confuses buying with paying", 1: "Reverses who owes whom", 2: "Confuses buying with profit" } },
        { q: "Every transaction changes at least two things. A business pays $500 in cash for a computer. What changes?", o: ["Cash goes down and computers go up", "Cash goes up and computers go down", "Only cash goes down", "Profit goes down by $500"], a: 0, skill: "Two sides of a transaction", area: "R", why: { 1: "Gets both directions wrong", 2: "Sees only one side of the transaction", 3: "Treats buying an asset as an expense" } },
        { q: "A business pays $300 to a supplier it already owed. What changes?", o: ["Cash goes down and profit goes down", "Only cash goes down", "Cash goes down and the amount it owes goes down", "Cash goes up and the amount it owes goes down"], a: 2, skill: "Two sides of a transaction", area: "R", why: { 0: "Treats paying off a debt as an expense", 1: "Sees only one side of the transaction", 3: "Gets the direction of cash wrong" } },
        { q: "A business owns things worth $8,000 and owes $3,000. How much of the business belongs to the owner?", o: ["$11,000", "$5,000", "$3,000", "$8,000"], a: 1, skill: "What belongs to the owner", area: "N", why: { 0: "Adds what is owed instead of taking it away", 2: "Gives what is owed", 3: "Ignores what is owed" } },
        { q: "A shop starts the day with $1,000 cash. It receives $400 from sales and pays $250 rent. How much cash does it have now?", o: ["$1,650", "$850", "$1,150", "$750"], a: 2, skill: "Keeping a running total", area: "N", why: { 0: "Adds the payment instead of subtracting it", 1: "Subtracts the receipt", 3: "Ignores the money received" } },
        { q: "The owner takes $200 cash from the shop for personal use. What happens?", o: ["The shop’s expenses rise by $200", "Nothing changes, because the owner owns the shop", "The shop’s cash rises", "The shop’s cash falls and the owner’s capital falls"], a: 3, skill: "Drawings (owner and business are separate)", area: "R", why: { 0: "Treats the owner’s spending as a business expense", 1: "Does not separate the owner from the business", 2: "Gets the direction of cash wrong" } },
        { q: "In accounting, what is an expense?", o: ["Money the owner puts into the business", "A cost of running the business, such as rent", "Something the business owns", "Money from sales"], a: 1, skill: "Expenses", area: "P", why: { 0: "Confuses capital with expenses", 2: "Confuses assets with expenses", 3: "Confuses income with expenses" } },
        { q: "Which of these is a liability?", o: ["Inventory", "Cash", "Equipment", "A bank loan"], a: 3, skill: "Liabilities", area: "P", why: { 0: "Confuses assets with liabilities", 1: "Confuses assets with liabilities", 2: "Confuses assets with liabilities" } },
        { q: "Which is the accounting equation?", o: ["Assets = Capital + Liabilities", "Capital = Assets + Liabilities", "Assets = Liabilities minus Capital", "Profit = Assets minus Liabilities"], a: 0, skill: "Accounting equation", area: "P" },
      ],
    },
    Business: {
      w: "Think of a business you visit often, such as a shop, café or tuition centre. Name it, and give two reasons why customers choose it over others nearby.",
      ms: "Names a real business and gives two different reasons customers choose it (for example price, quality, location, service). Strong: each reason is explained (why it matters to customers). Partly there: two reasons, not explained. Needs work: one reason or describes the business only.",
      q: [
        { q: "A new business has just opened. What is usually its most important aim in the first year?", o: ["To become the biggest in the country", "To survive", "To pay the highest wages in town", "To lower its prices every month"], a: 1, skill: "Business objectives", area: "B", why: { 0: "Sets an unrealistic aim for a new business", 2: "Confuses a cost with an aim", 3: "Confuses a tactic with an aim" } },
        { q: "A farmer sells vegetables to a restaurant. To the restaurant, the farmer is a:", o: ["Supplier", "Customer", "Competitor", "Manager"], a: 0, skill: "Business words", area: "B", why: { 1: "Looks from the farmer’s side, not the restaurant’s", 2: "Confuses suppliers with competitors" } },
        { q: "Shop A sells a phone for $410 with a one year warranty. Shop B sells it for $400 with no warranty. Why might a customer choose Shop A?", o: ["It is cheaper", "It sells more phones", "Shop A is closer to the customer’s home", "The warranty lowers the risk of paying for repairs"], a: 3, skill: "Judging value", area: "R", why: { 0: "Misreads the prices", 1: "Gives a reason that is not in the question", 2: "Adds a reason that is not in the question" } },
        { q: "A juice stall near a college sells twice as much in summer as in winter. What is the stall’s main challenge?", o: ["Its prices are too high", "Its sales change a lot with the seasons", "It has too many customers", "The college is too far away"], a: 1, skill: "Reading a situation", area: "R", why: { 0: "Gives a cause that is not in the question", 2: "Misreads the situation", 3: "Gives a cause that is not in the question" } },
        { q: "A café wants more customers on weekday mornings. Which action is most likely to help?", o: ["Cut prices on weekend evenings", "Paint the café a new colour", "Offer a breakfast deal to nearby offices", "Hire an extra cook for lunchtime"], a: 2, skill: "Solving a problem", area: "R", why: { 0: "Targets the wrong time", 1: "Does not give customers a reason to come", 3: "Targets the wrong time" } },
        { q: "A pen costs a shop $3 and sells for $5. The shop sells 200 pens. How much profit does it make on the pens in total?", o: ["$1,000", "$1,600", "$600", "$400"], a: 3, skill: "Profit from sales", area: "N", why: { 0: "Gives revenue, not profit", 1: "Adds cost and price", 2: "Uses cost instead of profit per pen" } },
        { q: "What is a business owned and run by one person called?", o: ["A partnership", "A sole trader", "A company", "A franchise"], a: 1, skill: "Business ownership", area: "P" },
        { q: "Advertising is part of which department?", o: ["Marketing", "Finance", "Production", "Human resources"], a: 0, skill: "Business functions", area: "P" },
        { q: "Which of these is a fixed cost?", o: ["Raw materials", "Packaging for each order", "Rent", "Delivery charge per order"], a: 2, skill: "Costs", area: "P", why: { 0: "Confuses variable and fixed costs", 1: "Confuses variable and fixed costs", 3: "Confuses variable and fixed costs" } },
      ],
    },
    Economics: {
      w: "Prices of many everyday items have gone up over the last two years. Explain two ways this affects a family.",
      ms: "Two separate effects on a family, for example less can be bought with the same income, savings fall, switching to cheaper goods, harder to pay rent or fees. Strong: each effect explained as a chain. Partly there: two effects listed. Needs work: one effect or restates the question.",
      q: [
        { q: "You have $10 and choose a movie ticket instead of a meal. What did you give up?", o: ["The meal", "The ticket", "$20", "Nothing"], a: 0, skill: "Choices and what is given up", area: "R", why: { 1: "Names what was chosen, not what was given up", 2: "Adds the costs", 3: "Does not see that every choice has a cost" } },
        { q: "Heavy rain destroys much of the mango crop. What is most likely to happen to the price of mangoes?", o: ["It falls", "It stays the same", "Mangoes become free", "It rises"], a: 3, skill: "Cause and effect", area: "R", why: { 0: "Reverses the effect of a shortage", 1: "Does not link supply to price" } },
        { q: "Which is a need rather than a want?", o: ["A smartphone", "Clean water", "A holiday", "Designer shoes"], a: 1, skill: "Needs and wants", area: "B", why: { 0: "Treats something common as a need", 2: "Confuses a want with a need", 3: "Confuses a want with a need" } },
        { q: "A line on a graph slopes down from left to right. As the value on the horizontal axis increases, the value on the vertical axis:", o: ["Increases", "Stays the same", "Decreases", "Doubles"], a: 2, skill: "Reading graphs", area: "N", why: { 0: "Reads the graph the wrong way", 1: "Does not read the slope" } },
        { q: "A new factory opens in a town and hires 500 people. What is most likely to happen to spending in local shops?", o: ["It rises", "It falls", "It stays the same", "The shops close"], a: 0, skill: "Chains of effects", area: "R", why: { 1: "Reverses the effect of more income", 2: "Does not follow the chain from jobs to spending" } },
        { q: "A town has land for either a hospital or a park, but not both. This shows that:", o: ["The town council is wasteful", "Parks are more important than hospitals", "Land has no cost", "Resources are limited, so choices must be made"], a: 3, skill: "Scarcity and choice", area: "B", why: { 0: "Blames people instead of scarcity", 1: "Gives an opinion, not the economic idea", 2: "Does not see that land has a cost" } },
        { q: "What is economics mainly the study of?", o: ["Running a business", "How people use scarce resources", "The stock market", "Money and banks only"], a: 1, skill: "Scarcity", area: "P", why: { 0: "Confuses economics with business", 2: "Thinks economics is only about finance", 3: "Thinks economics is only about finance" } },
        { q: "What does demand mean in economics?", o: ["What firms produce", "What people would like to buy", "What people are willing and able to buy", "The price of a good"], a: 2, skill: "Demand", area: "P", why: { 0: "Confuses demand with supply", 1: "Confuses wants with demand", 3: "Confuses demand with price" } },
        { q: "Which of these is usually provided by the government?", o: ["Street lighting", "Clothes", "A bakery", "Mobile phones"], a: 0, skill: "Role of government", area: "P", why: { 1: "Does not see why some goods are left to firms", 2: "Does not see why some goods are left to firms", 3: "Does not see why some goods are left to firms" } },
      ],
    },
  },
  as: {
    Accounting: {
      w: "Ayesha starts a business with $10,000 in the bank. She buys furniture for $3,000 by bank transfer and goods for resale worth $2,000 on credit. List what the business owns and what it owes after these transactions, and work out how much of the business belongs to Ayesha.",
      ms: "Owns: furniture $3,000, goods (inventory) $2,000, bank $7,000, total $12,000. Owes: supplier $2,000. Belongs to Ayesha: $10,000. Strong: all three correct with labels. Partly there: lists are right but the owner figure is missing or wrong. Needs work: mixes owns and owes.",
      q: [
        { q: "A business buys a machine for $20,000 that will be used for 5 years. Why might it not count the whole $20,000 as a cost this year?", o: ["Because it paid in cash", "Because the machine will help earn income for 5 years", "Because machines are not taxed", "Because it might sell the machine tomorrow"], a: 1, skill: "Matching costs to years", area: "R", why: { 0: "Links cost to how it was paid", 3: "Ignores the expected use" } },
        { q: "A business sells goods on credit in December. The customer pays in January. In which month did the sale happen?", o: ["January", "Both months", "December", "Neither month"], a: 2, skill: "When a sale counts", area: "R", why: { 0: "Thinks a sale counts only when cash arrives", 1: "Double counts the sale" } },
        { q: "A shop sells goods for $400 to a customer who will pay next month. What does the shop have now?", o: ["$400 more cash", "A $400 debt to the customer", "$400 owed to it by the customer", "Nothing until the customer pays"], a: 2, skill: "Credit sales", area: "R", why: { 0: "Thinks a sale always brings cash", 1: "Reverses who owes whom", 3: "Thinks a sale counts only when cash arrives" } },
        { q: "Which of these increases a business’s profit for the year?", o: ["The owner putting in more money", "Taking out a bank loan", "Buying new equipment", "Selling goods for more than they cost"], a: 3, skill: "What profit is", area: "B", why: { 0: "Treats the owner’s money as profit", 1: "Treats a loan as income", 2: "Treats buying an asset as profit" } },
        { q: "Revenue is $120,000, the goods sold cost $70,000, and other expenses are $30,000. What is the profit?", o: ["$50,000", "$20,000", "$90,000", "$100,000"], a: 1, skill: "Working out profit", area: "N", why: { 0: "Stops at gross profit", 2: "Subtracts only the other expenses", 3: "Gives total costs, not profit" } },
        { q: "The owner puts $25,000 of personal savings into the business. To the business, this money is:", o: ["Income for the year", "An amount the business owes the owner", "Profit", "A current asset only"], a: 1, skill: "The business and its owner are separate", area: "B", why: { 0: "Treats the owner’s money as income", 2: "Treats the owner’s money as profit", 3: "Sees only one side: the cash, not where it came from" } },
        { q: "Which of these is a liability of a business?", o: ["Money customers owe the business", "Inventory", "The owner’s own car", "A loan the business must repay"], a: 3, skill: "Assets and liabilities", area: "B", why: { 0: "Confuses money owed to the business with money it owes", 1: "Confuses assets with liabilities", 2: "Does not separate the owner from the business" } },
        { q: "A business pays $3,000 to a supplier it already owed. Which two things change?", o: ["Cash falls and expenses rise", "Cash falls and the amount owed to the supplier falls", "Cash falls and profit falls", "Only cash falls"], a: 1, skill: "Two sides of every transaction", area: "R", why: { 0: "Treats paying off a debt as an expense", 2: "Treats paying off a debt as a cost", 3: "Sees only one side of the transaction" } },
        { q: "A customer who owes $2,000 goes out of business and will never pay. What should the business do?", o: ["Add it to sales", "Keep the $2,000 as something it owns", "Treat the $2,000 as a loss", "Count it as an expense next year"], a: 2, skill: "Debts that won’t be paid", area: "R", why: { 0: "Confuses a loss with income", 1: "Keeps an asset that has no value", 3: "Gets the timing of the loss wrong" } },
        { q: "An increase in an asset is recorded on which side of its account?", o: ["Debit", "Credit", "Either side", "Neither side"], a: 0, skill: "Double entry", area: "P" },
        { q: "Goods are bought on credit from Zain. What is the double entry?", o: ["Debit Zain, credit Purchases", "Debit Purchases, credit Cash", "Debit Inventory, credit Sales", "Debit Purchases, credit Zain"], a: 3, skill: "Double entry", area: "P" },
        { q: "Rent still owing at the year end is shown as:", o: ["A current asset", "A current liability", "Income", "A non current asset"], a: 1, skill: "Accruals", area: "P" },
      ],
    },
    Business: {
      w: "A popular café in your city wants to open a second branch. Explain two ways it could pay for this, and one risk of each.",
      ms: "Two ways to pay, for example retained profit, bank loan, new partner or investor, leasing, each with one fitting risk (interest and repayments, loss of control, using up cash reserves). Strong: both sources with a specific risk each. Partly there: sources named, risks vague. Needs work: one source or no risks.",
      q: [
        { q: "A small bakery sells out by noon every day. Why might it raise its prices slightly?", o: ["To attract more customers", "Because its costs fell", "Demand is higher than it can supply", "To lower its quality"], a: 2, skill: "Demand and price", area: "R", why: { 0: "Thinks higher prices attract customers", 1: "Gives a reason that points the other way" } },
        { q: "A business can afford either a new oven or a new baker, but not both. What is the cost of choosing the oven?", o: ["The baker it could have hired", "The price of the oven only", "Nothing, because it chose the oven", "Its total costs"], a: 0, skill: "Opportunity cost", area: "R", why: { 1: "Sees only the money cost", 2: "Does not see that choices have a cost" } },
        { q: "A firm sells 400 items at $25 each. What is its revenue?", o: ["$425", "$1,600", "$100,000", "$10,000"], a: 3, skill: "Revenue", area: "N", why: { 0: "Adds instead of multiplying", 1: "Divides", 2: "Misplaces zeros" } },
        { q: "A firm’s sales are $3 million in a market worth $20 million. What is its market share?", o: ["6.7%", "15%", "30%", "1.5%"], a: 1, skill: "Market share", area: "N", why: { 0: "Divides the wrong way round", 2: "Doubles the answer", 3: "Misplaces the decimal" } },
        { q: "Owners of a company can only lose the money they put in. Why does this encourage people to invest?", o: ["It guarantees a profit", "It removes all taxes", "It protects their personal savings and home", "It gives them control of the company"], a: 2, skill: "Limited liability", area: "B", why: { 0: "Confuses limited risk with guaranteed profit", 3: "Confuses ownership with control" } },
        { q: "A factory plans to move production abroad to cut costs. Which group is most likely to oppose this?", o: ["Shareholders", "Customers looking for lower prices", "Overseas suppliers", "Local workers"], a: 3, skill: "Stakeholders", area: "R", why: { 0: "Misses that owners gain from lower costs", 1: "Misses that customers may gain" } },
        { q: "Which of these is primary market research?", o: ["Government statistics", "A questionnaire", "A trade journal", "An online industry report"], a: 1, skill: "Market research", area: "P" },
        { q: "A factory produces 6,000 units and could produce 8,000. What is its capacity utilisation?", o: ["75%", "133%", "25%", "80%"], a: 0, skill: "Capacity utilisation", area: "P" },
        { q: "Which theory says pay and working conditions prevent dissatisfaction but do not, by themselves, motivate?", o: ["Maslow", "Taylor", "Herzberg", "Mayo"], a: 2, skill: "Motivation", area: "P" },
      ],
    },
    Economics: {
      w: "The government sets a minimum wage above the current wage. Explain one benefit and one problem for workers.",
      ms: "Benefit: higher pay for workers who keep their jobs, better living standards. Problem: firms may cut jobs or hours because labour costs more, or may raise prices. Strong: both explained as cause and effect. Partly there: both named. Needs work: one side only.",
      q: [
        { q: "Floods destroy part of the wheat harvest. What happens to the price and the amount of wheat sold?", o: ["Price rises, amount sold rises", "Price falls, amount sold falls", "Both stay the same", "Price rises, amount sold falls"], a: 3, skill: "Supply shocks", area: "R", why: { 0: "Moves price and quantity together", 1: "Reverses the price effect" } },
        { q: "The price of coffee rises sharply. What is likely to happen to the demand for tea?", o: ["It rises", "It falls", "It stays the same", "Tea becomes dearer to make"], a: 0, skill: "Related goods", area: "R", why: { 1: "Treats tea as going with coffee, not instead of it", 3: "Confuses demand with costs" } },
        { q: "The price of a good rises by 10% and the amount bought falls by 20%. What happens to spending on it?", o: ["It rises", "It stays the same", "It falls", "It cannot be known"], a: 2, skill: "Price, quantity and spending", area: "N", why: { 0: "Looks only at the price rise", 1: "Thinks the changes cancel out", 3: "Does not see it can be worked out" } },
        { q: "Why might a government tax cigarettes?", o: ["To raise money only", "To protect tobacco farmers", "To cut smoking and raise money", "To make smokers buy cheaper brands"], a: 2, skill: "Why governments step in", area: "B", why: { 0: "Misses the aim of cutting harm", 1: "Reverses the effect on producers", 3: "Misreads the aim of the tax" } },
        { q: "Prices rise by 6% in a year while wages rise by 3%. What happens to what workers can buy?", o: ["It falls", "It rises", "It stays the same", "It doubles"], a: 0, skill: "Real income", area: "R", why: { 1: "Looks at the wage rise only", 2: "Does not compare the two rises" } },
        { q: "A good’s price falls from $20 to $18. What is the percentage change?", o: ["Minus 2%", "Minus 11.1%", "Minus 20%", "Minus 10%"], a: 3, skill: "Percentage change", area: "N", why: { 0: "Uses the $2 fall as the percentage", 1: "Divides by the new value", 2: "Misplaces the decimal" } },
        { q: "What does a point inside a production possibility curve show?", o: ["Some resources are unemployed", "The output is impossible", "Maximum efficiency", "Economic growth"], a: 0, skill: "Production possibility curve", area: "P" },
        { q: "Price falls by 10% and quantity demanded rises by 15%. What is the price elasticity of demand (ignoring the sign)?", o: ["0.67", "15", "1.5", "25"], a: 2, skill: "Elasticity", area: "P" },
        { q: "Which of these is a public good?", o: ["Bread", "Street lighting", "A car", "A mobile phone"], a: 1, skill: "Public goods", area: "P" },
      ],
    },
  },
  a2: {
    Accounting: {
      w: "Calculate the closing balance of the sales ledger control account. Opening balance $18,000; credit sales $90,000; cash received from credit customers $85,000; discounts allowed $1,000; irrecoverable debts written off $500. Show your working.",
      ms: "Closing balance $21,500 (18,000 + 90,000 - 85,000 - 1,000 - 500). Strong: correct figure with the debit and credit sides shown. Partly there: right method with one item on the wrong side. Needs work: treats receipts or discounts as increases.",
      q: [
        { q: "What does the prudence concept require?", o: ["Profits are shared equally", "Losses are recognised when foreseen; gains only when realised", "Assets are always shown at selling price", "Expenses are recorded when paid"], a: 1, skill: "Accounting concepts", area: "B", why: { 2: "Confuses prudence with selling price valuation", 3: "Confuses accruals with cash accounting" } },
        { q: "Rent paid during the year was $11,000 and $1,000 is still owing at the year end. What is the rent expense for the year?", o: ["$10,000", "$11,000", "$12,000", "$1,000"], a: 2, skill: "Accruals", area: "N", why: { 0: "Subtracts the accrual instead of adding it", 1: "Uses cash paid, not the expense", 3: "Gives only the accrual" } },
        { q: "A machine costs $50,000 and is depreciated at 20% a year on the reducing balance. What is the charge in year 2?", o: ["$10,000", "$20,000", "$40,000", "$8,000"], a: 3, skill: "Depreciation", area: "N", why: { 0: "Uses straight line instead of reducing balance", 1: "Charges 40% in year 2", 2: "Gives the carrying amount, not the charge" } },
        { q: "Inventory is valued at the lower of:", o: ["Cost and net realisable value", "Cost and selling price", "Net realisable value and replacement cost", "Cost and replacement cost"], a: 0, skill: "Inventory valuation", area: "B", why: { 1: "Confuses net realisable value with selling price" } },
        { q: "Which error causes a balance in the suspense account?", o: ["An error of omission", "An error of principle", "A debit entry that does not equal its credit entry", "A complete reversal of entries"], a: 2, skill: "Correction of errors", area: "B", why: { 0: "Does not see that omission keeps the trial balance equal", 1: "Does not see that principle errors keep it equal", 3: "Does not see that reversals keep it equal" } },
        { q: "The allowance for irrecoverable debts is 5% of trade receivables of $40,000. Last year’s allowance was $1,500. How much is charged to the income statement this year?", o: ["$2,000", "$500", "$1,500", "$3,500"], a: 1, skill: "Irrecoverable debts", area: "N", why: { 0: "Charges the whole allowance, not the change", 2: "Uses last year’s figure", 3: "Adds the two allowances" } },
        { q: "Selling price is $50, variable cost is $30 a unit and fixed costs are $40,000. What is the break even output?", o: ["800 units", "1,333 units", "500 units", "2,000 units"], a: 3, skill: "Break even", area: "N", why: { 0: "Divides by the selling price", 1: "Divides by the variable cost" } },
        { q: "Under marginal costing, closing inventory is valued at:", o: ["Full production cost", "Variable production cost only", "Selling price", "Fixed cost only"], a: 1, skill: "Marginal and absorption costing", area: "B", why: { 0: "Confuses marginal with absorption costing" } },
        { q: "Current assets are $60,000, including inventory of $20,000. Current liabilities are $40,000. What is the liquid (acid test) ratio?", o: ["1.5 : 1", "2 : 1", "1 : 1", "0.5 : 1"], a: 2, skill: "Liquidity ratios", area: "N", why: { 0: "Gives the current ratio, keeping inventory in" } },
        { q: "Which of these is capital expenditure?", o: ["Paying the van driver’s wages", "Buying a delivery van", "Fuel for the van", "Repairing a broken van mirror"], a: 1, skill: "Capital and revenue expenditure", area: "B", why: { 0: "Confuses running costs with buying an asset", 2: "Confuses running costs with buying an asset", 3: "Treats a repair as an improvement" } },
        { q: "Purchased goodwill is recorded when:", o: ["A business is bought for more than the fair value of its net assets", "A business makes a profit", "Assets are revalued downwards", "Customers are loyal"], a: 0, skill: "Goodwill", area: "P" },
        { q: "A project costs $100,000 and brings in $40,000 of net cash each year. What is the payback period?", o: ["4 years", "2 years", "3 years", "2 years 6 months"], a: 3, skill: "Investment appraisal", area: "P" },
      ],
    },
    Business: {
      w: "A textile firm is thinking of moving from batch production to flow production. Analyse one advantage and one disadvantage of this change.",
      ms: "Advantage: lower unit costs, faster output, less labour per unit. Disadvantage: high set up cost, less flexibility for different designs, repetitive work lowers motivation. Strong: each point developed with a result for the firm. Partly there: points named. Needs work: confuses batch with flow.",
      q: [
        { q: "Price is $50 and variable cost is $30 a unit. What is the contribution per unit?", o: ["$80", "$30", "$20", "$50"], a: 2, skill: "Contribution", area: "N", why: { 0: "Adds instead of subtracting" } },
        { q: "12 employees left during a year in which the average workforce was 80. What is labour turnover?", o: ["15%", "12%", "6.7%", "8%"], a: 0, skill: "HR measures", area: "N", why: { 1: "Gives the number, not the rate", 2: "Divides the wrong way round" } },
        { q: "Which of these is an internal source of finance?", o: ["A bank loan", "Trade credit from suppliers", "Retained profit", "A bank overdraft"], a: 2, skill: "Sources of finance", area: "B", why: { 0: "Thinks borrowing comes from inside the business", 1: "Confuses supplier credit with the firm’s own funds", 3: "Thinks borrowing comes from inside the business" } },
        { q: "Which is a benefit of just in time inventory control?", o: ["Protection against supply delays", "Bulk buying discounts", "A large buffer stock", "Lower inventory holding costs"], a: 3, skill: "Inventory control", area: "B", why: { 0: "Confuses JIT with holding buffer stock", 1: "Confuses JIT with bulk buying", 2: "Thinks JIT means holding more stock" } },
        { q: "According to Herzberg, which is a motivator rather than a hygiene factor?", o: ["Salary", "Recognition for achievement", "Working conditions", "Company policy"], a: 1, skill: "Motivation theory", area: "B", why: { 0: "Confuses hygiene factors with motivators", 2: "Confuses hygiene factors with motivators", 3: "Confuses hygiene factors with motivators" } },
        { q: "Which management style best suits an emergency that needs quick decisions?", o: ["Autocratic", "Laissez faire", "Democratic", "Paternalistic"], a: 0, skill: "Management styles", area: "R", why: { 1: "Does not match style to situation", 2: "Does not see that consulting takes time" } },
        { q: "Opening cash is $5,000, receipts are $12,000 and payments are $14,500. What is the closing cash balance?", o: ["$7,500", "Minus $2,500", "$31,500", "$2,500"], a: 3, skill: "Cash flow forecasts", area: "N", why: { 0: "Adds the net outflow instead of subtracting it", 1: "Leaves out the opening balance", 2: "Adds everything" } },
        { q: "In the product life cycle, which stage usually has the highest sales?", o: ["Introduction", "Growth", "Maturity", "Decline"], a: 2, skill: "Product life cycle", area: "B", why: { 1: "Confuses the fastest growth with the highest sales" } },
        { q: "20 workers produce 1,000 units a day. What is labour productivity?", o: ["50 units per worker per day", "20,000 units", "0.02 units per worker", "1,020 units"], a: 0, skill: "Labour productivity", area: "N", why: { 1: "Multiplies instead of dividing", 2: "Divides the wrong way round", 3: "Adds instead of dividing" } },
        { q: "Which part of a SWOT analysis looks at the external environment?", o: ["Strengths and weaknesses", "Opportunities and threats", "Strengths and threats", "Weaknesses and opportunities"], a: 1, skill: "Strategic analysis", area: "P" },
        { q: "A decision has a 60% chance of earning $100,000 and a 40% chance of earning $50,000. What is the expected value?", o: ["$75,000", "$150,000", "$80,000", "$60,000"], a: 2, skill: "Decision trees", area: "P" },
      ],
    },
    Economics: {
      w: "The government gives a subsidy to producers of wheat flour. Explain why the price consumers pay may not fall by the full amount of the subsidy.",
      ms: "The subsidy shifts supply right, but how much the price falls depends on elasticity: some of the subsidy goes to producers as higher revenue per unit. Strong: diagram idea or elasticity named, with incidence explained. Partly there: says producers keep some. Needs work: says price falls by the full subsidy.",
      q: [
        { q: "Two goods have a positive cross elasticity of demand. They are:", o: ["Complements", "Substitutes", "Inferior goods", "Normal goods"], a: 1, skill: "Cross elasticity", area: "B", why: { 0: "Reverses the sign rule for complements and substitutes" } },
        { q: "A good has a negative income elasticity of demand. It is:", o: ["A luxury", "A necessity", "An inferior good", "A normal good"], a: 2, skill: "Income elasticity", area: "B", why: { 1: "Confuses a necessity (low positive) with an inferior good" } },
        { q: "Most of an indirect tax falls on consumers when demand is:", o: ["Price elastic", "Perfectly elastic", "Unit elastic", "Price inelastic"], a: 3, skill: "Tax incidence", area: "B", why: { 0: "Reverses the incidence rule", 1: "Reverses the incidence rule" } },
        { q: "Why is a merit good underconsumed in a free market?", o: ["Consumers underestimate its benefits", "It is non excludable", "It is too cheap", "It is a public good"], a: 0, skill: "Merit goods", area: "B", why: { 1: "Confuses merit goods with public goods", 3: "Confuses merit goods with public goods" } },
        { q: "A maximum price set below the equilibrium price causes:", o: ["A surplus", "A shortage", "No change", "A fall in demand"], a: 1, skill: "Price controls", area: "R", why: { 0: "Confuses maximum and minimum prices", 2: "Does not see the price is binding" } },
        { q: "The exchange rate moves from $1 = 250 rupees to $1 = 280 rupees. The rupee has:", o: ["Appreciated", "Stayed the same", "Been revalued", "Depreciated"], a: 3, skill: "Exchange rates", area: "R", why: { 0: "Reads more rupees per dollar as a stronger rupee", 2: "Reads more rupees per dollar as a stronger rupee" } },
        { q: "A country’s currency appreciates. What happens to its exports?", o: ["They become cheaper abroad", "They become more expensive abroad", "They are unaffected", "They become free of tariffs"], a: 1, skill: "Exchange rates", area: "B", why: { 0: "Reverses the effect of appreciation" } },
        { q: "Which of these shifts aggregate demand to the right?", o: ["A rise in government spending", "A rise in interest rates", "A rise in income tax", "A fall in exports"], a: 0, skill: "Aggregate demand", area: "B", why: { 1: "Reverses the effect of interest rates", 2: "Reverses the effect of tax", 3: "Reverses the effect of exports" } },
        { q: "Which is a supply side policy?", o: ["Raising interest rates", "Increasing benefit payments", "Training schemes to improve workers’ skills", "Devaluing the currency"], a: 2, skill: "Supply side policy", area: "B", why: { 0: "Confuses monetary with supply side policy", 1: "Confuses demand side with supply side policy", 3: "Confuses exchange rate with supply side policy" } },
        { q: "Which is most likely to cause demand pull inflation?", o: ["Rising prices of imported oil", "Higher labour productivity", "Rising consumer spending when the economy is near full capacity", "A rise in interest rates"], a: 2, skill: "Inflation", area: "B", why: { 0: "Confuses cost push with demand pull", 1: "Thinks higher productivity raises prices", 3: "Reverses the effect of interest rates" } },
        { q: "Allocative efficiency is achieved where:", o: ["Average cost is lowest", "Price equals marginal cost", "Profit is highest", "Revenue is highest"], a: 1, skill: "Efficiency", area: "P" },
        { q: "In the long run, a firm in perfect competition makes:", o: ["Supernormal profit", "A loss", "Normal profit", "Monopoly profit"], a: 2, skill: "Market structures", area: "P" },
      ],
    },
  },
};
