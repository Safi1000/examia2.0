/**
 * The Starting Point Check question bank (The Blueprint diagnostic).
 * Edit questions here; the screens read everything from this file.
 *
 * Each subject: `w` is the written question; `q` is ten multiple-choice
 * questions, each [question, options, index of the correct option, skill,
 * area]. Areas: N numbers, R reasoning, B basics, P preview (the last
 * three, which students may not have learnt yet).
 */
export type Area = "N" | "R" | "B" | "P";
export type Mcq = readonly [question: string, options: readonly string[], correct: number, skill: string, area: Area];
export interface SubjectSet {
  w: string;
  q: readonly Mcq[];
}
export type LevelKey = "igcse" | "as" | "a2";
export type SubjectKey = "Accounting" | "Business" | "Economics";

export const BANK: Record<LevelKey, Record<SubjectKey, SubjectSet>> = {
 igcse:{
  Accounting:{w:"In one month, Ali’s shop sold goods for PKR 50,000. He bought those goods for PKR 25,000, paid rent of PKR 10,000 and paid PKR 3,000 for electricity. Did he make a profit or a loss, and how much? Show your working.",q:[
   ["A shopkeeper buys a shirt for PKR 800 and sells it for PKR 1,000. How much profit does he make?",["PKR 1,800","PKR 200","PKR 800","PKR 1,000"],1,"Profit sense","N"],
   ["What is 15% of PKR 4,000?",["PKR 400","PKR 150","PKR 600","PKR 60"],2,"Percentages","N"],
   ["You have PKR 2,000 in the bank and spend PKR 3,500. What is your balance now?",["PKR 1,500","PKR 5,500","PKR 0","Minus PKR 1,500"],3,"Negative numbers","N"],
   ["Sara lends Ahmed PKR 500. Which statement is true?",["Ahmed owes Sara PKR 500","Sara owes Ahmed PKR 500","Nobody owes anything","They both owe PKR 500"],0,"Owing and owed","R"],
   ["A shop’s sales were PKR 1,200 on Monday, PKR 800 on Tuesday and PKR 1,500 on Wednesday. What were the total sales?",["PKR 3,000","PKR 3,500","PKR 2,700","PKR 3,200"],1,"Adding totals","N"],
   ["A price rises from PKR 200 to PKR 250. What is the percentage increase?",["50%","20%","25%","250%"],2,"Percentage change","N"],
   ["Bilal and Danish share PKR 600 in the ratio 2:1. How much does Bilal get?",["PKR 200","PKR 300","PKR 500","PKR 400"],3,"Ratios","N"],
   ["Which of these does a business own?",["A bank loan","An unpaid electricity bill","A delivery van","Wages owed to staff"],2,"Assets","P"],
   ["What does buying “on credit” mean?",["Buying now and paying later","Paying by card","Paying in cash","Getting a discount"],0,"Credit","P"],
   ["What is profit?",["Money in the bank","Total sales","Money the owner puts into the business","Income minus expenses"],3,"Profit","P"]]},
  Business:{w:"Think of a business you visit often, such as a shop, café or tuition centre. Name it and give two reasons why customers choose it over other businesses nearby.",q:[
   ["Who buys goods from a business?",["A supplier","An employee","A customer","The owner"],2,"Business words","R"],
   ["A farmer sells vegetables to a restaurant. To the restaurant, the farmer is a:",["Supplier","Customer","Competitor","Manager"],0,"Business words","R"],
   ["20% of a shop’s 500 customers are under 18. How many customers is that?",["20","100","50","400"],1,"Percentages","N"],
   ["A pen costs a shop PKR 30 and it sells for PKR 50. How much does the shop make on each pen?",["PKR 80","PKR 30","PKR 50","PKR 20"],3,"Cost and price","N"],
   ["Shop A sells a phone for PKR 40,000 and Shop B sells the same phone for PKR 38,000. Why might a customer still buy from Shop A?",["It gives a one-year warranty","It charges more","It is further away","It has fewer phones"],0,"Judgement","R"],
   ["“Rehan runs a juice stall near a college. In summer his sales double, but in winter they fall by half.” What is Rehan’s main problem?",["He has too many staff","His sales change a lot with the seasons","The college is closing","His prices are too low"],1,"Reading a case","R"],
   ["A stall sells 30, 50 and 40 juices over three days. What is the average per day?",["120","30","40","45"],2,"Averages","N"],
   ["What is the main aim of most private businesses?",["To pay taxes","To employ people","To buy goods","To make a profit"],3,"Business aims","P"],
   ["What is a business owned and run by one person called?",["A sole trader","A partnership","A company","A franchise"],0,"Business ownership","P"],
   ["Advertising is part of which department?",["Finance","Marketing","Production","Human resources"],1,"Business functions","P"]]},
  Economics:{w:"Prices of many everyday things in Pakistan have gone up over the last two years. Explain two ways this affects a family.",q:[
   ["A graph shows price on the vertical axis and quantity on the horizontal axis. What does a point higher up show?",["A higher quantity","A lower price","A higher price","More time"],2,"Reading graphs","N"],
   ["A line on a graph slopes down from left to right. As the horizontal value increases, what happens to the vertical value?",["It decreases","It increases","It stays the same","It doubles"],0,"Reading graphs","N"],
   ["The price of petrol rises from PKR 250 to PKR 300 a litre. What is the percentage increase?",["50%","16.7%","25%","20%"],3,"Percentage change","N"],
   ["You have PKR 500 and choose a movie ticket instead of a meal. What did you give up?",["The ticket","The meal","PKR 1,000","Nothing"],1,"Choices","R"],
   ["Heavy rain damages most of the mango crop. What is most likely to happen to the price of mangoes?",["It rises","It falls","It stays the same","Mangoes become free"],0,"Cause and effect","R"],
   ["The price of sugar was PKR 100, PKR 110 and PKR 120 over three months. What was the average price?",["PKR 330","PKR 120","PKR 110","PKR 100"],2,"Averages","N"],
   ["Which of these is a need rather than a want?",["A smartphone","Designer shoes","A holiday","Clean water"],3,"Needs and wants","R"],
   ["What is economics mainly the study of?",["Running a business","How people use scarce resources","The stock market","Money only"],1,"Scarcity","P"],
   ["What does demand mean?",["The amount produced","Everything people want","The amount people are willing and able to buy at a given price","The price of a good"],2,"Demand","P"],
   ["Which of these is usually provided by the government?",["Street lighting","Clothes","A bakery","Mobile phones"],0,"Role of government","P"]]}
 },
 as:{
  Accounting:{w:"Ayesha starts a business with PKR 100,000 in the bank. She buys furniture for PKR 30,000 by bank transfer and goods for resale for PKR 20,000 on credit. Prepare her statement of financial position after these transactions.",q:[
   ["A business has assets of PKR 80,000 and liabilities of PKR 30,000. What is its capital?",["PKR 110,000","PKR 30,000","PKR 50,000","PKR 80,000"],2,"Accounting equation","B"],
   ["An increase in an asset is recorded on which side of its account?",["Debit","Credit","Either side","Neither side"],0,"Double entry","B"],
   ["Which of these is a non-current asset?",["Inventory","Trade receivables","Cash at bank","Delivery van"],3,"Classifying items","B"],
   ["Revenue is PKR 120,000, cost of sales PKR 70,000 and expenses PKR 30,000. What is the profit for the year?",["PKR 50,000","PKR 20,000","PKR 90,000","PKR 100,000"],1,"Income statement","B"],
   ["Gross profit is PKR 50,000 and revenue is PKR 200,000. What is gross profit as a percentage of revenue?",["25%","40%","4%","75%"],0,"Percentages","N"],
   ["Goods are bought on credit from Zain. What is the double entry?",["Debit Zain, credit Purchases","Debit Purchases, credit Cash","Debit Purchases, credit Zain","Debit Inventory, credit Sales"],2,"Double entry","B"],
   ["The owner takes PKR 2,000 cash for personal use. What happens to capital?",["It increases","It stays the same","It becomes a liability","It decreases"],3,"Capital and drawings","B"],
   ["Rent still owing at the year end is shown as:",["A current liability","A current asset","A non-current asset","Income"],0,"Accruals","P"],
   ["What is depreciation?",["Money saved to replace an asset","Spreading the cost of a non-current asset over its useful life","A rise in an asset’s value","The cash paid for an asset"],1,"Depreciation","P"],
   ["Current assets are PKR 60,000 and current liabilities PKR 40,000. What is the current ratio?",["0.67:1","2:1","1.5:1","1:1"],2,"Ratios","P"]]},
  Business:{w:"A small bakery in Rawalpindi wants to open a second branch. Explain two ways it could finance the expansion.",q:[
   ["Which business is in the primary sector?",["A bank","A car factory","A restaurant","A wheat farm"],3,"Business sectors","B"],
   ["What is opportunity cost?",["The next best alternative given up","The money spent on a choice","The total cost of production","The cost of raw materials"],0,"Opportunity cost","B"],
   ["What is the main advantage of being a sole trader?",["Limited liability","The owner has full control of decisions","It is easy to raise capital","The business continues if the owner dies"],1,"Business ownership","B"],
   ["What does limited liability mean?",["The business cannot borrow money","Owners are not responsible for decisions","Owners can only lose the amount they invested","Profits are limited by law"],2,"Business ownership","B"],
   ["A business sells 400 units at PKR 250 each. What is its revenue?",["PKR 650","PKR 10,000","PKR 1,000","PKR 100,000"],3,"Revenue","N"],
   ["Which of these is a fixed cost?",["Rent","Raw materials","Packaging","Commission on sales"],0,"Costs","B"],
   ["A firm’s sales are PKR 3 million in a market worth PKR 20 million. What percentage of the market does it have?",["6.7%","15%","30%","1.5%"],1,"Percentages","N"],
   ["Which of these is primary market research?",["Government statistics","A trade journal","A questionnaire","An online industry report"],2,"Market research","P"],
   ["A factory produces 6,000 units and can produce up to 8,000. What percentage of its capacity is it using?",["75%","133%","25%","80%"],0,"Capacity utilisation","P"],
   ["What is the main aim of a social enterprise?",["Maximising shareholder returns","Increasing market share at any cost","Reducing the number of employees","Social or environmental aims alongside trading"],3,"Business objectives","P"]]},
  Economics:{w:"Floods destroy part of the tomato crop in Sindh. Explain what happens to the price and quantity of tomatoes in the market.",q:[
   ["What is the basic economic problem?",["Rising prices","Unemployment","Unlimited wants and limited resources","High taxes"],2,"Economic problem","B"],
   ["When the price of a good rises, what happens to quantity demanded?",["It rises","It falls","It stays the same","It doubles"],1,"Demand","B"],
   ["Incomes rise. What happens to the demand curve for a normal good?",["It shifts right","It shifts left","There is a movement along it","Nothing"],0,"Shifts in demand","B"],
   ["A price falls from PKR 20 to PKR 18. What is the percentage change?",["2%","20%","Minus 10%","Minus 18%"],2,"Percentage change","N"],
   ["A line on a graph slopes down from left to right. As the horizontal value increases, what happens to the vertical value?",["It increases","It stays the same","It doubles","It decreases"],3,"Reading graphs","N"],
   ["Which is a feature of a market economy?",["The government sets all prices","The price mechanism allocates resources","All firms are state-owned","There is no private property"],1,"Economic systems","B"],
   ["What is inflation?",["A sustained rise in the general price level","A fall in the general price level","A rise in the price of one good","A rise in wages"],0,"Inflation","B"],
   ["What does a point inside a production possibility curve show?",["Some resources are unemployed","The output is impossible","Maximum efficiency","Economic growth"],0,"PPC","P"],
   ["Price falls by 10% and quantity demanded rises by 15%. What is the price elasticity of demand?",["0.67","1.5","15","25"],1,"Elasticity","P"],
   ["Which of these is a public good?",["Bread","A mobile phone","Street lighting","A car"],2,"Public goods","P"]]}
 },
 a2:{
  Accounting:{w:"Calculate the closing balance of the sales ledger control account. Opening balance PKR 18,000; credit sales PKR 90,000; cash received from credit customers PKR 85,000; discounts allowed PKR 1,000; irrecoverable debts written off PKR 500. Show your working.",q:[
   ["What does the prudence concept require?",["Profits are shared equally","Losses are recognised when foreseen, gains only when realised","Assets are always shown at selling price","Expenses are recorded when paid"],1,"Accounting concepts","B"],
   ["Rent paid during the year was PKR 11,000 and PKR 1,000 is still owing at the year end. What is the rent expense?",["PKR 10,000","PKR 11,000","PKR 12,000","PKR 1,000"],2,"Accruals","B"],
   ["Where does insurance paid in advance appear in the statement of financial position?",["Current asset","Current liability","Non-current asset","Capital"],0,"Prepayments","B"],
   ["A machine costs PKR 50,000 and is depreciated at 20% per year on the reducing balance. What is the charge in year 2?",["PKR 10,000","PKR 20,000","PKR 40,000","PKR 8,000"],3,"Depreciation","N"],
   ["Current assets are PKR 60,000 and current liabilities PKR 40,000. What is the current ratio?",["0.67:1","1.5:1","2:1","1:1"],1,"Liquidity ratios","N"],
   ["Revenue is PKR 200,000 and gross profit PKR 50,000. What is the gross margin?",["33.3%","20%","25%","75%"],2,"Profitability ratios","N"],
   ["Inventory is valued at the lower of:",["Cost and net realisable value","Cost and selling price","Net realisable value and replacement cost","Cost and market value"],0,"Inventory valuation","B"],
   ["Actual cost is lower than standard cost. What is the variance called?",["Adverse","Favourable","Nil","Fixed"],1,"Standard costing","P"],
   ["What does a cash budget show?",["The profit for the year","Assets and liabilities","Expected cash receipts and payments","Last year’s sales"],2,"Budgeting","P"],
   ["A project costs PKR 100,000 and brings in PKR 40,000 of net cash each year. What is the payback period?",["4 years","2 years","3 years","2 years 6 months"],3,"Investment appraisal","P"]]},
  Business:{w:"A textile firm in Faisalabad is thinking of moving from batch production to flow production. Analyse one advantage and one disadvantage of this change.",q:[
   ["A firm’s sales are PKR 3 million in a market worth PKR 20 million. What is its market share?",["6.7%","30%","15%","1.5%"],2,"Market share","N"],
   ["12 employees left during a year in which the average workforce was 80. What is labour turnover?",["15%","6.7%","12%","8%"],0,"HR measures","N"],
   ["A factory produces 6,000 units and can produce up to 8,000. What is its capacity utilisation?",["133%","75%","25%","80%"],1,"Capacity utilisation","N"],
   ["Price is PKR 50 and variable cost PKR 30 per unit. What is the contribution per unit?",["PKR 80","PKR 30","PKR 10","PKR 20"],3,"Contribution","N"],
   ["A product has a price elasticity of demand of 0.4. What happens to revenue if the price rises?",["It falls","It cannot be known","It rises","It does not change"],2,"Elasticity and revenue","B"],
   ["What is a benefit of just-in-time inventory control?",["Lower inventory holding costs","Protection against supply delays","Bulk buying discounts","A large buffer stock"],0,"Inventory control","B"],
   ["Which describes autocratic leadership?",["Employees make the decisions","The manager consults before deciding","Authority is fully delegated","The manager makes decisions alone"],3,"Leadership","B"],
   ["Which part of a SWOT analysis looks at the external environment?",["Strengths and weaknesses","Opportunities and threats","Strengths and threats","Weaknesses and opportunities"],1,"Strategic analysis","P"],
   ["A decision has a 60% chance of earning PKR 100,000 and a 40% chance of earning PKR 50,000. What is the expected value?",["PKR 150,000","PKR 75,000","PKR 80,000","PKR 60,000"],2,"Decision trees","P"],
   ["A project costs PKR 100,000 and brings in PKR 40,000 of net cash each year. What is the payback period?",["2 years 6 months","4 years","2 years","3 years"],0,"Investment appraisal","P"]]},
  Economics:{w:"The government gives a subsidy to producers of wheat flour. Explain why the price consumers pay may not fall by the full amount of the subsidy.",q:[
   ["What shifts a production possibility curve outward?",["A fall in unemployment","More resources or better technology","A rise in prices","A move along the curve"],1,"PPC","B"],
   ["Two goods have a positive cross elasticity of demand. What are they?",["Complements","Inferior goods","Substitutes","Normal goods"],2,"Cross elasticity","B"],
   ["A good has a negative income elasticity of demand. What type of good is it?",["An inferior good","A luxury","A necessity","A normal good"],0,"Income elasticity","B"],
   ["When does most of an indirect tax fall on consumers?",["When demand is price elastic","When demand is perfectly elastic","When demand is unit elastic","When demand is price inelastic"],3,"Tax incidence","B"],
   ["Why is a merit good under-consumed in a free market?",["It is non-excludable","Consumers lack full information about its benefits","It is too cheap","It is a public good"],1,"Merit goods","B"],
   ["Nominal GDP grows by 12% and inflation is 8%. What is the approximate real growth?",["20%","1.5%","96%","4%"],3,"Real and nominal values","N"],
   ["The rupee depreciates. What is the likely effect, other things equal?",["Imports become cheaper","Pakistan’s exports become cheaper abroad","Exports become more expensive abroad","No effect on trade"],1,"Exchange rates","B"],
   ["Where is allocative efficiency achieved?",["Where price equals marginal cost","Where average cost is lowest","Where profit is highest","Where revenue is highest"],0,"Efficiency","P"],
   ["In perfect competition, firms are:",["Price makers","Monopolies","Price takers","Heavy advertisers"],2,"Market structures","P"],
   ["The marginal propensity to consume is 0.8. What is the multiplier?",["0.8","1.25","8","5"],3,"Multiplier","P"]]}
 }
};

export const LEVELS: Record<LevelKey, string> = { igcse: "IGCSE or O Level", as: "AS", a2: "A2" };
export const SUBJECTS: SubjectKey[] = ["Accounting", "Business", "Economics"];
export const AREA: Record<Exclude<Area, "P">, string> = { N: "Numbers", R: "Reasoning", B: "Basics" };
