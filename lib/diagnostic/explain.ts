/**
 * The short explanation shown to a student after the check, for every
 * question, keyed by the question text in bank.ts (keep them in step: the
 * check script in the commit history flags any question without one).
 * Shown only after finishing, so the check itself stays a fair measure.
 */
export const EXPLAIN: Record<string, string> = {
  /* Core skills: O Level / IGCSE */
  "What is 25% of $360?": "25% is a quarter. A quarter of $360 is $360 ÷ 4 = $90.",
  "A jacket costs $80. Its price rises by 10%. What is the new price?": "10% of $80 is $8. Add it on: $80 + $8 = $88.",
  "A shop had $150 in the till and paid out $210. What is its balance now?": "It paid out $60 more than it had: $150 - $210 = -$60. In accounting this is called an overdraft.",
  "Amir and Bina share $90 in the ratio 2:1. How much does Amir get?": "2:1 means 3 equal parts. One part is $90 ÷ 3 = $30, so Amir gets 2 parts: $60.",
  "Sales rise from $400 to $500. What is the percentage increase?": "Always divide the change by the starting value: $100 ÷ $400 = 0.25, which is 25%.",
  "Rana scores 60, 70 and 80 in three tests. What is her mean score?": "Add them and divide by how many there are: 210 ÷ 3 = 70.",
  "Which statement is true?": "Compare each month with the one before: up from January to February ($2,600), then down to $2,300 in March.",
  "What can you tell from this?": "The passage says flour cost more, so Zara raised her prices. Nothing says she made a loss or that customers stopped buying.",
  "Which of these is a fact rather than an opinion?": "A fact can be checked with numbers. “Best”, “too expensive” and “love” are judgements.",

  /* O Level / IGCSE Accounting */
  "Sara lends Ahmed $50. Which statement is true?": "Ahmed has Sara’s money, so Ahmed owes Sara. Getting the direction of a debt right is the base of all accounting.",
  "A shop sells goods for $300 that cost it $200. What is the $100 difference called?": "Revenue is the full $300 from sales. Profit is what is left after the cost: $300 - $200 = $100.",
  "Which list contains only things a business owns?": "Assets are what a business owns, including money customers owe it. A loan, rent owed and wages owed are liabilities: things it owes.",
  "Mr Ali puts $10,000 of his own savings into his new shop. From the shop’s point of view, this $10,000 is:": "In accounting the business is separate from its owner. The owner’s money is capital: the business owes it back to the owner.",
  "A shop buys goods today and agrees to pay next month. Which is true?": "Buying on credit means getting the goods now and paying later, so the shop owes the supplier until it pays.",
  "Every transaction changes at least two things. A business pays $500 in cash for a computer. What changes?": "One thing goes down (cash) and another goes up (computers). This two sided effect is what double entry records.",
  "A business pays $300 to a supplier it already owed. What changes?": "Paying a debt is not an expense. Cash goes down and the debt to the supplier goes down by the same $300.",
  "A business owns things worth $8,000 and owes $3,000. How much of the business belongs to the owner?": "What it owns minus what it owes: $8,000 - $3,000 = $5,000. This is the owner’s capital.",
  "A shop starts the day with $1,000 cash. It receives $400 from sales and pays $250 rent. How much cash does it have now?": "Add money in, take away money out: $1,000 + $400 - $250 = $1,150.",
  "In accounting, what is an expense?": "An expense is a cost of running the business, such as rent, wages or electricity. It reduces profit.",
  "Which of these is a liability?": "A liability is something the business owes. A bank loan has to be repaid; the others are things it owns.",
  "Which is the accounting equation?": "Everything a business owns was paid for by the owner or by borrowing: Assets = Capital + Liabilities.",

  /* O Level / IGCSE Business */
  "Who buys goods from a business?": "Customers buy from a business. Suppliers sell to it, employees work for it, competitors sell the same things.",
  "A farmer sells vegetables to a restaurant. To the restaurant, the farmer is a:": "Look from the restaurant’s side: the farmer supplies its ingredients, so the farmer is its supplier.",
  "Shop A sells a phone for $410 with a one year warranty. Shop B sells it for $400 with no warranty. Why might a customer choose Shop A?": "Customers judge value, not just price. For $10 more, the warranty protects them from a repair bill.",
  "A juice stall near a college sells twice as much in summer as in winter. What is the stall’s main challenge?": "Sales that rise and fall with the seasons make cash, stock and staff hard to plan.",
  "A café wants more customers on weekday mornings. Which action is most likely to help?": "A deal aimed at people who are nearby at that time gives them a reason to come in. The other options push customers away.",
  "A pen costs a shop $3 and sells for $5. The shop sells 200 pens. How much does it make on the pens in total?": "Profit per pen is $5 - $3 = $2. Over 200 pens that is $400. ($1,000 is revenue, not profit.)",
  "What is a business owned and run by one person called?": "A sole trader is owned and run by one person, who keeps all the profit and takes all the risk.",
  "Advertising is part of which department?": "Marketing finds out what customers want and tells them about the product, which includes advertising.",
  "Which of these is a fixed cost?": "A fixed cost stays the same however much is sold, like rent. Materials, packaging and delivery per order are variable costs.",

  /* O Level / IGCSE Economics */
  "You have $10 and choose a movie ticket instead of a meal. What did you give up?": "What you give up is the next best choice: the meal. Economists call this opportunity cost.",
  "Heavy rain destroys much of the mango crop. What is most likely to happen to the price of mangoes?": "Fewer mangoes for the same number of buyers means a shortage, so the price rises.",
  "Which is a need rather than a want?": "A need is something you cannot live without, like clean water. The others are wants.",
  "A line on a graph slopes down from left to right. As the value on the horizontal axis increases, the value on the vertical axis:": "Moving right along a downward slope, the line gets lower. A demand curve is drawn this way.",
  "A new factory opens in a town and hires 500 people. What is most likely to happen to spending in local shops?": "500 new wages means more income in the town, and people spend part of it in local shops.",
  "Why can’t a country produce everything its people want?": "Land, workers and machines are limited but wants are not. This is scarcity, the basic economic problem.",
  "What is economics mainly the study of?": "Economics studies how people, firms and governments choose to use scarce resources to meet their wants.",
  "What does demand mean in economics?": "Demand is not just wanting something: it is the amount people are willing and able to buy at each price.",
  "Which of these is usually provided by the government?": "Street lighting benefits everyone and nobody can be stopped from using it, so firms rarely sell it. Governments provide it.",

  /* Core skills: AS */
  "A price falls from $50 to $40. What is the percentage change?": "Change ÷ starting value: -$10 ÷ $50 = -0.2, a fall of 20%.",
  "A price rises by 10% and then falls by 10%. Compared with where it started, the price is now:": "The fall is 10% of a bigger number. $100 → $110 → $99, so it ends 1% lower.",
  "Profit equals revenue minus costs. If profit is $12,000 and costs are $30,000, what is revenue?": "Rearrange: revenue = profit + costs = $12,000 + $30,000 = $42,000.",
  "A price index was 100 in 2024 and 108 in 2025. What does this show?": "An index shows change from a base of 100. 108 means prices are 8% higher than in 2024.",
  "Fixed costs are $6,000. Each item sells for $10 and costs $7 to make. How many items must be sold to cover all costs?": "Each item leaves $10 - $7 = $3 towards fixed costs. $6,000 ÷ $3 = 2,000 items.",
  "Over the same years, line A on a graph rises from 20 to 40 and line B rises from 100 to 150. Which grew faster in percentage terms?": "A grew 20 on 20 (100%); B grew 50 on 100 (50%). A bigger rise is not always faster growth.",
  "What is the most likely reason revenue fell?": "Revenue is price × customers. A 15% lower price with only 5% more customers means less revenue overall.",
  "Towns that sell more ice cream also have more drowning accidents. What is the best conclusion?": "Two things moving together does not mean one causes the other. Hot weather drives both.",

  /* AS Accounting */
  "A business buys a machine for $20,000 that will be used for 5 years. Why might it not count the whole $20,000 as a cost this year?": "The machine earns income for 5 years, so its cost is spread over those years. This is depreciation.",
  "A business sells goods on credit in December. The customer pays in January. In which month did the sale happen?": "A sale counts when it happens, not when the cash arrives. This is the accruals idea.",
  "A business has assets of $80,000 and owes $30,000. How much of the business belongs to the owner?": "Assets minus liabilities: $80,000 - $30,000 = $50,000 belongs to the owner (capital).",
  "Which of these increases a business’s profit for the year?": "Profit comes from earning more than it costs. Owner’s money and loans add cash, not profit; buying equipment swaps cash for an asset.",
  "Revenue is $120,000, the goods sold cost $70,000, and other expenses are $30,000. What is the profit?": "Gross profit is $120,000 - $70,000 = $50,000. Take off other expenses: $50,000 - $30,000 = $20,000.",
  "The owner puts $25,000 of personal savings into the business. To the business, this money is:": "The business is separate from its owner, so the owner’s money is capital: an amount the business owes the owner.",
  "Which of these is a liability of a business?": "A liability is owed by the business. Money customers owe it and inventory are assets; the owner’s own car is not the business’s at all.",
  "A business pays $3,000 to a supplier it already owed. Which two things change?": "Paying a debt is not an expense: cash falls and the amount owed falls by the same $3,000. Both sides are recorded.",
  "A customer who owes $2,000 goes out of business and will never pay. What should the business do?": "Money that will never arrive is no longer an asset. It is written off as a loss (an irrecoverable debt).",
  "An increase in an asset is recorded on which side of its account?": "Assets increase on the debit side and decrease on the credit side. Lesson one starts here.",
  "Goods are bought on credit from Zain. What is the double entry?": "Purchases go up (debit). Zain is now owed money, so Zain’s account is credited.",
  "Rent still owing at the year end is shown as:": "Rent owed is an amount the business must pay soon, so it is a current liability (an accrual).",

  /* AS Business */
  "A small bakery sells out by noon every day. Why might it raise its prices slightly?": "Selling out shows demand is higher than supply. A small rise is unlikely to lose many customers and earns more on each sale.",
  "A business can afford either a new oven or a new baker, but not both. What is the cost of choosing the oven?": "Opportunity cost is the next best option given up: the baker.",
  "A firm sells 400 items at $25 each. What is its revenue?": "Revenue = price × quantity = $25 × 400 = $10,000.",
  "A firm’s sales are $3 million in a market worth $20 million. What is its market share?": "Firm’s sales ÷ market sales × 100: 3 ÷ 20 × 100 = 15%.",
  "Owners of a company can only lose the money they put in. Why does this encourage people to invest?": "With limited liability, investors’ homes and savings are safe if the company fails, so investing is less risky.",
  "A factory plans to move production abroad to cut costs. Which group is most likely to oppose this?": "Local workers would lose their jobs. Shareholders and customers may gain from lower costs.",
  "Which of these is primary market research?": "Primary research is new data the business collects itself, like a questionnaire. The others already exist.",
  "A factory produces 6,000 units and could produce 8,000. What is its capacity utilisation?": "Output ÷ maximum output × 100: 6,000 ÷ 8,000 × 100 = 75%.",
  "Which theory says pay and working conditions prevent dissatisfaction but do not, by themselves, motivate?": "Herzberg split work into hygiene factors (pay, conditions) and motivators (recognition, responsibility).",

  /* AS Economics */
  "Floods destroy part of the wheat harvest. What happens to the price and the amount of wheat sold?": "Supply falls, so there is a shortage at the old price. The price rises and less wheat is bought.",
  "The price of coffee rises sharply. What is likely to happen to the demand for tea?": "Tea and coffee are substitutes. When coffee gets dearer, some people switch to tea.",
  "The price of a good rises by 10% and the amount bought falls by 20%. What happens to spending on it?": "Spending = price × quantity: 1.1 × 0.8 = 0.88, so spending falls by about 12%.",
  "Why might a government tax cigarettes?": "Smoking harms smokers and the people around them. A tax raises the price to cut smoking, and raises money too.",
  "Prices rise by 6% in a year while wages rise by 3%. What happens to what workers can buy?": "Prices rose faster than wages, so the same wage buys less. Real wages fell by about 3%.",
  "A good’s price falls from $20 to $18. What is the percentage change?": "Change ÷ starting value: -$2 ÷ $20 = -0.1, a fall of 10%.",
  "What does a point inside a production possibility curve show?": "Inside the curve the economy could produce more of both goods, so some resources are not being used.",
  "Price falls by 10% and quantity demanded rises by 15%. What is the price elasticity of demand (ignoring the sign)?": "PED = % change in quantity ÷ % change in price = 15 ÷ 10 = 1.5.",
  "Which of these is a public good?": "Street lighting is non excludable and non rival: one person using it does not stop another.",

  /* Core skills: A2 */
  "Nominal GDP grows by 9% and inflation is 4%. What is the approximate real growth?": "Real growth takes inflation away: about 9% - 4% = 5%.",
  "With 2020 as the base year (100), a price index is 125 in 2025 and 130 in 2026. What is the percentage change from 2025 to 2026?": "Measure from 2025, not the base: (130 - 125) ÷ 125 × 100 = 4%.",
  "A project costs $10,000 and returns $11,000 in one year. At a 10% discount rate, what is its net present value?": "$11,000 in a year is worth $11,000 ÷ 1.1 = $10,000 today. $10,000 - $10,000 = $0.",
  "You score 60% on a paper worth 30% of the grade and 80% on a paper worth 70%. What is your overall percentage?": "Weight each score: 0.3 × 60 + 0.7 × 80 = 18 + 56 = 74%.",
  "A firm’s costs are 40% wages, 35% materials and 25% other. Total costs are $80,000. How much are materials?": "35% of $80,000 = 0.35 × $80,000 = $28,000.",
  "A firm’s sales rose by 20% last year, but its market share fell. Which must be true?": "Share = firm’s sales ÷ market. If share fell while sales rose 20%, the market grew by more than 20%.",
  "Which is the strongest way to evaluate this claim?": "Evaluation weighs both sides and says what the answer depends on. “Always” and “because the government knows best” are not evaluation.",
  "Which statement is normative (a value judgement)?": "Normative statements say what should happen and can’t be tested. The others are facts that can be checked.",

  /* A2 Accounting (AS content) */
  "What does the prudence concept require?": "Prudence means not overstating profit: record losses as soon as you expect them, gains only once they happen.",
  "Rent paid during the year was $11,000 and $1,000 is still owing at the year end. What is the rent expense for the year?": "The expense is what was used, not what was paid: $11,000 paid + $1,000 owing = $12,000.",
  "A machine costs $50,000 and is depreciated at 20% a year on the reducing balance. What is the charge in year 2?": "Year 1: 20% of $50,000 = $10,000, leaving $40,000. Year 2: 20% of $40,000 = $8,000.",
  "Inventory is valued at the lower of:": "Inventory is valued at the lower of cost and net realisable value (selling price less costs to sell), so it is never overstated.",
  "Which error causes a balance in the suspense account?": "A suspense balance appears only when debits and credits are unequal. Omission, principle and reversal errors keep the trial balance equal.",
  "The allowance for irrecoverable debts is 5% of trade receivables of $40,000. Last year’s allowance was $1,500. How much is charged to the income statement this year?": "New allowance: 5% × $40,000 = $2,000. Only the increase is charged: $2,000 - $1,500 = $500.",
  "Selling price is $50, variable cost is $30 a unit and fixed costs are $40,000. What is the break even output?": "Contribution per unit is $50 - $30 = $20. Break even = $40,000 ÷ $20 = 2,000 units.",
  "Under marginal costing, closing inventory is valued at:": "Marginal costing treats fixed costs as period costs, so inventory carries only variable production cost.",
  "Current assets are $60,000, including inventory of $20,000. Current liabilities are $40,000. What is the liquid (acid test) ratio?": "Leave inventory out: ($60,000 - $20,000) ÷ $40,000 = 1 : 1.",
  "Goodwill arises when:": "Goodwill is the extra paid for a business above the fair value of its net assets, for things like reputation and customers.",
  "A project costs $100,000 and brings in $40,000 of net cash each year. What is the payback period?": "After 2 years $80,000 is back; the last $20,000 takes half of year 3. Payback = 2 years 6 months.",

  /* A2 Business (AS content) */
  "Price is $50 and variable cost is $30 a unit. What is the contribution per unit?": "Contribution = price - variable cost per unit = $50 - $30 = $20.",
  "12 employees left during a year in which the average workforce was 80. What is labour turnover?": "Leavers ÷ average workforce × 100 = 12 ÷ 80 × 100 = 15%.",
  "A product’s price elasticity of demand is minus 0.4. If its price rises, revenue will:": "PED of -0.4 is inelastic: quantity falls by less than price rises, so revenue goes up.",
  "Which is a benefit of just in time inventory control?": "JIT keeps very little stock, which cuts storage and holding costs. The downside is less protection from supply delays.",
  "According to Herzberg, which is a motivator rather than a hygiene factor?": "Recognition is a motivator. Salary, conditions and company policy are hygiene factors.",
  "Which leadership style best suits an emergency that needs quick decisions?": "Autocratic leadership is fastest because one person decides. Consulting takes time an emergency doesn’t have.",
  "Opening cash is $5,000, receipts are $12,000 and payments are $14,500. What is the closing cash balance?": "Opening + receipts - payments = $5,000 + $12,000 - $14,500 = $2,500.",
  "In the product life cycle, which stage usually has the highest sales?": "Sales peak in maturity. Growth is when sales rise fastest, not when they are highest.",
  "20 workers produce 1,000 units a day. What is labour productivity?": "Labour productivity is output per worker: 1,000 ÷ 20 = 50 units per worker per day.",
  "Which part of a SWOT analysis looks at the external environment?": "Opportunities and threats are outside the business. Strengths and weaknesses are inside it.",
  "A decision has a 60% chance of earning $100,000 and a 40% chance of earning $50,000. What is the expected value?": "0.6 × $100,000 + 0.4 × $50,000 = $60,000 + $20,000 = $80,000.",

  /* A2 Economics (AS content) */
  "Two goods have a positive cross elasticity of demand. They are:": "Positive XED: a rise in one price raises demand for the other, so they are substitutes. Complements have negative XED.",
  "A good has a negative income elasticity of demand. It is:": "Negative YED means demand falls as income rises: an inferior good. Necessities have low but positive YED.",
  "Most of an indirect tax falls on consumers when demand is:": "When demand is inelastic, buyers keep buying at a higher price, so producers pass most of the tax on.",
  "Why is a merit good underconsumed in a free market?": "People underestimate its benefits (information failure), so they buy less than is best for them.",
  "A maximum price set below the equilibrium price causes:": "Below equilibrium, more is demanded than supplied, so there is a shortage.",
  "The exchange rate moves from $1 = 250 rupees to $1 = 280 rupees. The rupee has:": "It now takes more rupees to buy one dollar, so the rupee is worth less: it has depreciated.",
  "A country’s currency appreciates. What happens to its exports?": "A stronger currency means foreigners need more of their own money to buy the same goods, so exports get dearer.",
  "Which of these shifts aggregate demand to the right?": "Government spending is part of AD (C + I + G + X - M). Higher interest rates, higher taxes and lower exports reduce it.",
  "Which is a supply side policy?": "Supply side policies raise the economy’s productive capacity, like training that makes workers more skilled.",
  "Allocative efficiency is achieved where:": "Allocative efficiency is where price equals marginal cost: what people pay matches the cost of making one more.",
  "In the long run, a firm in perfect competition makes:": "Supernormal profit attracts new firms, which pushes the price down until every firm makes only normal profit.",
};
