/**
 * The notes "books": every chapter Hamza is writing, in teaching (syllabus)
 * order, one book per level and subject. Generated from notes/PLAN.md
 * section 8, with unit names from Cambridge's syllabuses. The student Notes
 * page lays uploaded notes out on these chapters and shows the rest as
 * "Coming soon"; the upload screen uses it to recognise a chapter from its
 * file name.
 */
export type NoteLevel = "IGCSE and O Level" | "AS" | "A2";
export type NoteSubject = "Accounting" | "Business" | "Economics";
export interface NoteUnit {
  num: string;
  name: string;
  /** [chapter number, chapter name] */
  chapters: Array<[string, string]>;
}
export interface NoteBook {
  key: string;
  level: NoteLevel;
  subject: NoteSubject;
  units: NoteUnit[];
}

export const NOTE_BOOKS: NoteBook[] = [
  {
    "key": "igcse-economics",
    "level": "IGCSE and O Level",
    "subject": "Economics",
    "units": [
      {
        "num": "1",
        "name": "The basic economic problem",
        "chapters": [
          [
            "1.1",
            "The nature of the basic economic problem"
          ],
          [
            "1.2",
            "Factors of production"
          ],
          [
            "1.3",
            "Opportunity cost"
          ],
          [
            "1.4",
            "Production possibility curve (PPC) diagrams"
          ]
        ]
      },
      {
        "num": "2",
        "name": "The allocation of resources",
        "chapters": [
          [
            "2.1",
            "The role of markets in allocating resources"
          ],
          [
            "2.2",
            "Demand"
          ],
          [
            "2.3",
            "Supply"
          ],
          [
            "2.4",
            "Price determination"
          ],
          [
            "2.5",
            "Price changes"
          ],
          [
            "2.6",
            "Price elasticity of demand (PED)"
          ],
          [
            "2.7",
            "Price elasticity of supply (PES)"
          ],
          [
            "2.8",
            "Market economic system"
          ],
          [
            "2.9",
            "Market failure"
          ],
          [
            "2.10",
            "Mixed economic system"
          ]
        ]
      },
      {
        "num": "3",
        "name": "Microeconomic decision-makers",
        "chapters": [
          [
            "3.1",
            "Money and banking"
          ],
          [
            "3.2",
            "Households"
          ],
          [
            "3.3",
            "Workers"
          ],
          [
            "3.4",
            "Firms"
          ],
          [
            "3.5",
            "Firms and production"
          ],
          [
            "3.6",
            "Firms' costs, revenue and objectives"
          ],
          [
            "3.7",
            "Types of markets"
          ]
        ]
      },
      {
        "num": "4",
        "name": "Government and the macroeconomy",
        "chapters": [
          [
            "4.1",
            "Government macroeconomic intervention"
          ],
          [
            "4.2",
            "Fiscal policy"
          ],
          [
            "4.3",
            "Monetary policy"
          ],
          [
            "4.4",
            "Supply-side policy"
          ],
          [
            "4.5",
            "Economic growth"
          ],
          [
            "4.6",
            "Employment and unemployment"
          ],
          [
            "4.7",
            "Inflation"
          ]
        ]
      },
      {
        "num": "5",
        "name": "Economic development",
        "chapters": [
          [
            "5.1",
            "Living standards"
          ],
          [
            "5.2",
            "Poverty"
          ],
          [
            "5.3",
            "Population"
          ],
          [
            "5.4",
            "Differences in economic development between countries"
          ]
        ]
      },
      {
        "num": "6",
        "name": "International trade and globalisation",
        "chapters": [
          [
            "6.1",
            "Specialisation and free trade"
          ],
          [
            "6.2",
            "Globalisation and trade restrictions"
          ],
          [
            "6.3",
            "Foreign exchange rates"
          ],
          [
            "6.4",
            "Current account of the balance of payments"
          ]
        ]
      }
    ]
  },
  {
    "key": "igcse-business",
    "level": "IGCSE and O Level",
    "subject": "Business",
    "units": [
      {
        "num": "1",
        "name": "Understanding business activity",
        "chapters": [
          [
            "1.1",
            "Business activity"
          ],
          [
            "1.2",
            "Economic sectors"
          ],
          [
            "1.3",
            "Enterprise, business growth and size"
          ],
          [
            "1.4",
            "Types of business organisation"
          ],
          [
            "1.5",
            "Business objectives and stakeholder objectives"
          ]
        ]
      },
      {
        "num": "2",
        "name": "People in business",
        "chapters": [
          [
            "2.1",
            "Human resource management (HRM)"
          ],
          [
            "2.2",
            "Organisation and management"
          ],
          [
            "2.3",
            "Methods of communication"
          ],
          [
            "2.4",
            "Motivating employees"
          ]
        ]
      },
      {
        "num": "3",
        "name": "Marketing",
        "chapters": [
          [
            "3.1",
            "Marketing and the market"
          ],
          [
            "3.2",
            "Market research"
          ],
          [
            "3.3",
            "Marketing mix"
          ],
          [
            "3.4",
            "Legal controls"
          ]
        ]
      },
      {
        "num": "4",
        "name": "Operations management",
        "chapters": [
          [
            "4.1",
            "Production of goods and services"
          ],
          [
            "4.2",
            "Technology and production of goods and services"
          ],
          [
            "4.3",
            "Sustainable production of goods and services"
          ],
          [
            "4.4",
            "Costs, scale of production and break-even analysis"
          ],
          [
            "4.5",
            "Quality of goods and services"
          ],
          [
            "4.6",
            "Location decisions"
          ]
        ]
      },
      {
        "num": "5",
        "name": "Financial information and decisions",
        "chapters": [
          [
            "5.1",
            "Business finance"
          ],
          [
            "5.2",
            "Cash flow forecast"
          ],
          [
            "5.3",
            "Profit and loss"
          ],
          [
            "5.4",
            "Statement of financial position"
          ],
          [
            "5.5",
            "Analysis of accounts"
          ]
        ]
      },
      {
        "num": "6",
        "name": "External influences on business activity",
        "chapters": [
          [
            "6.1",
            "Economic issues"
          ],
          [
            "6.2",
            "Business and the international economy"
          ],
          [
            "6.3",
            "Business and the environment"
          ],
          [
            "6.4",
            "Business and ethical issues"
          ],
          [
            "6.5",
            "Pressure groups"
          ]
        ]
      }
    ]
  },
  {
    "key": "igcse-accounting",
    "level": "IGCSE and O Level",
    "subject": "Accounting",
    "units": [
      {
        "num": "1",
        "name": "The fundamentals of accounting",
        "chapters": [
          [
            "1.1",
            "The purpose of accounting"
          ],
          [
            "1.2",
            "The accounting equation"
          ]
        ]
      },
      {
        "num": "2",
        "name": "Sources and recording of data",
        "chapters": [
          [
            "2.1",
            "The double entry system of book-keeping"
          ],
          [
            "2.2",
            "Business documents"
          ],
          [
            "2.3",
            "Books of prime entry"
          ]
        ]
      },
      {
        "num": "3",
        "name": "Verification of accounting records",
        "chapters": [
          [
            "3.1",
            "The trial balance"
          ],
          [
            "3.2",
            "Correction of errors"
          ],
          [
            "3.3",
            "Bank reconciliation"
          ],
          [
            "3.4",
            "Control accounts"
          ]
        ]
      },
      {
        "num": "4",
        "name": "Accounting procedures",
        "chapters": [
          [
            "4.1",
            "Capital and revenue expenditure and receipts"
          ],
          [
            "4.2",
            "Depreciation and disposal of non-current assets"
          ],
          [
            "4.3",
            "Other payables and other receivables"
          ],
          [
            "4.4",
            "Irrecoverable debts and allowance for irrecoverable debts"
          ],
          [
            "4.5",
            "Valuation of inventory"
          ]
        ]
      },
      {
        "num": "5",
        "name": "Preparation of financial statements",
        "chapters": [
          [
            "5.1",
            "Sole traders"
          ],
          [
            "5.2",
            "Partnerships"
          ],
          [
            "5.3",
            "Limited companies"
          ],
          [
            "5.4",
            "Manufacturing accounts"
          ],
          [
            "5.5",
            "Clubs and societies"
          ],
          [
            "5.6",
            "Incomplete records"
          ]
        ]
      },
      {
        "num": "6",
        "name": "Analysis and interpretation",
        "chapters": [
          [
            "6.1",
            "Calculation and understanding of accounting ratios"
          ],
          [
            "6.2",
            "Interpretation of accounting ratios"
          ],
          [
            "6.3",
            "Inter-business comparison"
          ],
          [
            "6.4",
            "Interested parties"
          ],
          [
            "6.5",
            "Limitations of accounting statements"
          ]
        ]
      },
      {
        "num": "7",
        "name": "Accounting concepts and modern practice",
        "chapters": [
          [
            "7.1",
            "Accounting concepts"
          ],
          [
            "7.2",
            "Ethical considerations"
          ],
          [
            "7.3",
            "Technology and sustainability"
          ]
        ]
      }
    ]
  },
  {
    "key": "as-economics",
    "level": "AS",
    "subject": "Economics",
    "units": [
      {
        "num": "1",
        "name": "Basic economic ideas and resource allocation",
        "chapters": [
          [
            "1.1",
            "Scarcity, choice and opportunity cost"
          ],
          [
            "1.2",
            "Economic methodology"
          ],
          [
            "1.3",
            "Factors of production"
          ],
          [
            "1.4",
            "Resource allocation in different economic systems"
          ],
          [
            "1.5",
            "Production possibility curves"
          ],
          [
            "1.6",
            "Classification of goods and services"
          ]
        ]
      },
      {
        "num": "2",
        "name": "The price system and the microeconomy",
        "chapters": [
          [
            "2.1",
            "Demand and supply curves"
          ],
          [
            "2.2",
            "Price elasticity, income elasticity and cross elasticity of demand"
          ],
          [
            "2.3",
            "Price elasticity of supply"
          ],
          [
            "2.4",
            "The interaction of demand and supply"
          ],
          [
            "2.5",
            "Consumer and producer surplus"
          ]
        ]
      },
      {
        "num": "3",
        "name": "Government microeconomy intervention",
        "chapters": [
          [
            "3.1",
            "Reasons for government intervention in markets"
          ],
          [
            "3.2",
            "Methods and effects of government intervention in markets"
          ],
          [
            "3.3",
            "Addressing income and wealth inequality"
          ]
        ]
      },
      {
        "num": "4",
        "name": "The Macroeconomy",
        "chapters": [
          [
            "4.1",
            "National income statistics"
          ],
          [
            "4.2",
            "Introduction to the circular flow of income"
          ],
          [
            "4.3",
            "Aggregate demand and aggregate supply analysis"
          ],
          [
            "4.4",
            "Economic growth"
          ],
          [
            "4.5",
            "Unemployment"
          ],
          [
            "4.6",
            "Price stability"
          ]
        ]
      },
      {
        "num": "5",
        "name": "Government macroeconomic intervention",
        "chapters": [
          [
            "5.1",
            "Government macroeconomic policy objectives"
          ],
          [
            "5.2",
            "Fiscal policy"
          ],
          [
            "5.3",
            "Monetary policy"
          ],
          [
            "5.4",
            "Supply-side policy"
          ]
        ]
      },
      {
        "num": "6",
        "name": "International economic issues",
        "chapters": [
          [
            "6.1",
            "The reasons for international trade"
          ],
          [
            "6.2",
            "Protectionism"
          ],
          [
            "6.3",
            "Current account of the balance of payments"
          ],
          [
            "6.4",
            "Exchange rates"
          ],
          [
            "6.5",
            "Policies to correct imbalances in the current account"
          ]
        ]
      }
    ]
  },
  {
    "key": "as-business",
    "level": "AS",
    "subject": "Business",
    "units": [
      {
        "num": "1",
        "name": "Business and its environment",
        "chapters": [
          [
            "1.1",
            "Enterprise"
          ],
          [
            "1.2",
            "Business structure"
          ],
          [
            "1.3",
            "Size of business"
          ],
          [
            "1.4",
            "Business objectives"
          ],
          [
            "1.5",
            "Stakeholders in a business"
          ]
        ]
      },
      {
        "num": "2",
        "name": "Human resource management",
        "chapters": [
          [
            "2.1",
            "Human resource management (HRM)"
          ],
          [
            "2.2",
            "Motivation"
          ],
          [
            "2.3",
            "Management"
          ]
        ]
      },
      {
        "num": "3",
        "name": "Marketing",
        "chapters": [
          [
            "3.1",
            "The nature of marketing"
          ],
          [
            "3.2",
            "Market research"
          ],
          [
            "3.3",
            "The marketing mix"
          ]
        ]
      },
      {
        "num": "4",
        "name": "Operations management",
        "chapters": [
          [
            "4.1",
            "The nature of operations"
          ],
          [
            "4.2",
            "Inventory management"
          ],
          [
            "4.3",
            "Capacity utilisation and outsourcing"
          ]
        ]
      },
      {
        "num": "5",
        "name": "Finance and accounting",
        "chapters": [
          [
            "5.1",
            "Business finance"
          ],
          [
            "5.2",
            "Sources of finance"
          ],
          [
            "5.3",
            "Forecasting and managing cash flows"
          ],
          [
            "5.4",
            "Costs"
          ],
          [
            "5.5",
            "Budgets"
          ]
        ]
      }
    ]
  },
  {
    "key": "as-accounting",
    "level": "AS",
    "subject": "Accounting",
    "units": [
      {
        "num": "1",
        "name": "Financial accounting",
        "chapters": [
          [
            "1.1.1",
            "Types of business entity"
          ],
          [
            "1.2.1",
            "The accounting system"
          ],
          [
            "1.3.1",
            "Capital and revenue income and expenditure"
          ],
          [
            "1.3.2",
            "Changing asset values (depreciation, disposal, revaluation)"
          ],
          [
            "1.4.1",
            "Reconciliation and verification (errors, suspense)"
          ],
          [
            "1.4.2",
            "Trial balance"
          ],
          [
            "1.4.3",
            "Bank reconciliation statements"
          ],
          [
            "1.4.4",
            "Control accounts"
          ],
          [
            "1.5.1",
            "Adjustments to draft financial statements"
          ],
          [
            "1.5.2",
            "Sole traders"
          ],
          [
            "1.5.3",
            "Partnerships"
          ],
          [
            "1.5.4",
            "Limited companies"
          ],
          [
            "1.6.1",
            "Users of accounting information"
          ],
          [
            "1.6.2",
            "Calculation and evaluation of ratios"
          ]
        ]
      },
      {
        "num": "2",
        "name": "Cost and management accounting",
        "chapters": [
          [
            "2.1.1",
            "Materials and labour"
          ],
          [
            "2.2.1",
            "Costing applications"
          ],
          [
            "2.2.2",
            "Absorption costing"
          ],
          [
            "2.2.3",
            "Marginal costing"
          ],
          [
            "2.2.4",
            "Cost–volume–profit analysis"
          ]
        ]
      }
    ]
  },
  {
    "key": "a2-economics",
    "level": "A2",
    "subject": "Economics",
    "units": [
      {
        "num": "7",
        "name": "The price system and the microeconomy",
        "chapters": [
          [
            "7.1",
            "Utility"
          ],
          [
            "7.2",
            "Indifference curves and budget lines"
          ],
          [
            "7.3",
            "Efficiency and market failure"
          ],
          [
            "7.4",
            "Private costs and benefits, externalities and social costs and benefits"
          ],
          [
            "7.5",
            "Types of cost, revenue and profit, short-run and long-run production"
          ],
          [
            "7.6",
            "Different market structures"
          ],
          [
            "7.7",
            "Growth and survival of firms"
          ],
          [
            "7.8",
            "Differing objectives and policies of firms"
          ]
        ]
      },
      {
        "num": "8",
        "name": "Government microeconomic intervention",
        "chapters": [
          [
            "8.1",
            "Government policies to achieve efficient resource allocation and correct market failure"
          ],
          [
            "8.2",
            "Equity and redistribution of income and wealth"
          ],
          [
            "8.3",
            "Labour market forces and government intervention"
          ]
        ]
      },
      {
        "num": "9",
        "name": "The macroeconomy",
        "chapters": [
          [
            "9.1",
            "The circular flow of income"
          ],
          [
            "9.2",
            "Economic growth and sustainability"
          ],
          [
            "9.3",
            "Employment/unemployment"
          ],
          [
            "9.4",
            "Money and banking"
          ]
        ]
      },
      {
        "num": "10",
        "name": "Government macroeconomic intervention",
        "chapters": [
          [
            "10.1",
            "Government macroeconomic policy objectives"
          ],
          [
            "10.2",
            "Links between macroeconomic problems and their interrelatedness"
          ],
          [
            "10.3",
            "Effectiveness of policy options to meet all macroeconomic objectives"
          ]
        ]
      },
      {
        "num": "11",
        "name": "International economic issues",
        "chapters": [
          [
            "11.1",
            "Policies to correct disequilibrium in the balance of payments"
          ],
          [
            "11.2",
            "Exchange rates"
          ],
          [
            "11.3",
            "Economic development"
          ],
          [
            "11.4",
            "Characteristics of countries at different levels of development"
          ],
          [
            "11.5",
            "Relationship between countries at different levels of development"
          ],
          [
            "11.6",
            "Globalisation"
          ]
        ]
      }
    ]
  },
  {
    "key": "a2-business",
    "level": "A2",
    "subject": "Business",
    "units": [
      {
        "num": "6",
        "name": "Business and its environment",
        "chapters": [
          [
            "6.1",
            "External influences on business activity"
          ],
          [
            "6.2",
            "Business strategy"
          ]
        ]
      },
      {
        "num": "7",
        "name": "Human resource management",
        "chapters": [
          [
            "7.1",
            "Organisational structure"
          ],
          [
            "7.2",
            "Business communication"
          ],
          [
            "7.3",
            "Leadership"
          ],
          [
            "7.4",
            "Human resource management (HRM) strategy"
          ]
        ]
      },
      {
        "num": "8",
        "name": "Marketing",
        "chapters": [
          [
            "8.1",
            "Marketing analysis"
          ],
          [
            "8.2",
            "Marketing strategy"
          ]
        ]
      },
      {
        "num": "9",
        "name": "Operations management",
        "chapters": [
          [
            "9.1",
            "Location and scale"
          ],
          [
            "9.2",
            "Quality management"
          ],
          [
            "9.3",
            "Operations strategy"
          ]
        ]
      },
      {
        "num": "10",
        "name": "Finance and accounting",
        "chapters": [
          [
            "10.1",
            "Financial statements"
          ],
          [
            "10.2",
            "Analysis of published accounts"
          ],
          [
            "10.3",
            "Investment appraisal"
          ],
          [
            "10.4",
            "Finance and accounting strategy"
          ]
        ]
      }
    ]
  },
  {
    "key": "a2-accounting",
    "level": "A2",
    "subject": "Accounting",
    "units": [
      {
        "num": "3",
        "name": "Financial accounting",
        "chapters": [
          [
            "3.1.1",
            "Financial statements"
          ],
          [
            "3.1.2",
            "Partnerships"
          ],
          [
            "3.1.3",
            "Clubs and societies"
          ],
          [
            "3.1.4",
            "Manufacturing businesses"
          ],
          [
            "3.1.5",
            "Limited companies"
          ],
          [
            "3.2.1",
            "International Accounting Standards"
          ],
          [
            "3.2.2",
            "Ethical considerations"
          ],
          [
            "3.2.3",
            "Auditing and stewardship of limited companies"
          ],
          [
            "3.3.1",
            "Business acquisition and merger"
          ],
          [
            "3.4.1",
            "Computerised accounting systems"
          ],
          [
            "3.5.1",
            "Analysis and communication of accounting information"
          ]
        ]
      },
      {
        "num": "4",
        "name": "Cost and management accounting",
        "chapters": [
          [
            "4.1",
            "Activity based costing (ABC)"
          ],
          [
            "4.2",
            "Standard costing"
          ],
          [
            "4.3",
            "Budgeting and budgetary control"
          ],
          [
            "4.4",
            "Investment appraisal"
          ]
        ]
      }
    ]
  }
];
