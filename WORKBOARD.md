# Workboard: agent-2

Branch: `agent-2` (from `origin/main`). Nothing here is on main. Another agent reviews, builds and merges.

Note: this repo has no `/site` folder. The Next.js app is at the repo root, so "site/" in the brief means the root.

## How this was made (read first)

This session could not open web pages (network policy) and could not push to GitHub (this Claude account has no access to the repo). So:

- The work travels as a patch file (`git format-patch`). Apply it on `agent-2` with `git am`.
- Facts were taken from **web search results limited to official domains** (britishcouncil.ae / .sa / .qa, khda.gov.ae, u.ae, spa.gov.sa, qna.org.qa, cambridgeinternational.org). Search gives summaries of those pages, not the pages themselves. **Before merging, open each source below and confirm the fact.** Anything that does not match: fix it or delete the sentence.

## Done

Second pass (quality over quantity): every page now has one job, no copied paragraphs, and only content that is true of that page.

1. `/online-classes/gulf`: answers the two questions a Gulf family has. Times by level for each time zone (stacked cards, readable on a phone), how the classes meet each country's school week (links to the city pages), why recordings matter more abroad, and how exam entry differs in the UAE, Saudi Arabia and Qatar. No copied "What you get" list, no generic tools list.
2. City pages, served by `app/online-classes/[city]` (data in `lib/gulf-pages.ts`, `GULF_CITY_PAGES`): `/online-classes/dubai`, `abu-dhabi`, `riyadh`, `jeddah`, `doha`. Each shows every class of the day on the local clock (from `lib/timetable.ts`), then sections that only make sense for that city, one local question, its own trial box wording and a Sources line. Boilerplate questions ("Do you have a centre?", "How do I start?") removed.
   - Dubai: Friday half day (KHDA), Oud Metha office, Sharjah candidates sit in Dubai, attached centres, a Sharjah weekend question.
   - Abu Dhabi: government week, NOC, taking subjects at two levels.
   - Riyadh: how a Sunday to Thursday week lines up with Monday to Friday classes, 2026 to 2027 start date, which levels a late school day affects, Diplomatic Quarter office, special arrangements.
   - Jeddah: different regional school start in 2025, private school calendar flexibility, a Friday past paper routine, corrections deadline.
   - Doha: Sunday to Thursday week, British Council Qatar process (online, pay at Al Sadd, someone can submit for you, under-18 letter, no practicals), Oct / Nov 2026 dates.
3. `/private-candidates/uae`: two rules first, steps, documents, dates table, fees policy, a UAE-specific "working back from the deadline" section, FAQ with questions not answered in the body. The paragraph copied from the Pakistan guide is gone.
4. `/private-candidates/saudi-arabia`: short on purpose. Who handles entry, the two sessions, three rules the British Council states, and five questions to ask the office before paying.
5. Articles (date 2026-10-23), each with a different job from the existing articles:
   - `igcse-accounting-partnership-accounts.mdx`: rewritten, because `igcse-o-level-accounting-formats.mdx` already has the basic appropriation and current account layout. This one covers a partner's loan, interest on drawings by the month, a residual loss and an overdrawn current account. Totals: profit 12,300 minus 500 loan interest = 11,800; plus 500 interest on drawings = 12,300; minus 9,000 salary and 4,800 interest on capital = residual loss 1,500 (Sana 1,000, Omar 500); Sana current account 7,300 each side, closing debit 2,900; Omar 11,500 each side, closing credit 2,800; capital 80,000 plus current (100) = 79,900; loan 10,000 as a liability.
   - `as-level-economics-9708-paper-1-mcq-tips.mdx`: rewritten so it no longer mirrors `o-level-igcse-economics-paper-1-mcq-tips.mdx` (links to it for the basics). About what is new at AS: two shifts at once, four true options, two-step calculations. Six own practice questions.
   - `igcse-business-0450-justify-evaluate-questions.mdx`: the method for the 12-mark justify question.
   - `o-level-business-7115-syllabus-explained.mdx`: the syllabus and the 7081 switch; links to the 0450 article for the method instead of repeating it.
6. Registered: `PUBLIC_ROUTES` in `lib/seo.ts` (hub, both guides), `app/sitemap.ts` (Gulf city pages), `app/llms.txt/route.ts`.
7. A scan of every study page and article found no sentence of 70+ characters repeated across pages (only code and the one-line "confirm with the British Council" note).

## Third pass (24 October 2026)

**Reviewed and tightened:** the four earlier articles, the Gulf hub, the city data and both guides. Removed narrator lines ("this article", "below is", "look at what it does", "in other words") and repeated points within a page. Added depth:
- 0450 justify article: timing per 12-mark part, a weak paragraph rebuilt into a strong one, a full recommendation.
- 7115 article: one point taken through all four skills (table), and a month-by-month plan to June 2027.
- Partnership article: a practice question with a worked answer (residual 21,600; 12,960 and 8,640).
- 9708 MCQ article: tighter opening, no meta lines.

**Five new articles** (date 2026-10-24), each a different job from the existing ones:
1. `igcse-o-level-accounting-paper-1-mcq-tips.mdx`: 0452 and 7707 Paper 1 (35 questions, 1 h 15, 35 marks, 30% in 2026; 40 questions, 1 h 30, 40 marks from 2027), what to write before looking at the options, a question-type table, seven own questions with full answers.
2. `igcse-economics-price-elasticity-of-demand.mdx`: formula, two worked examples (bus PED −0.4, cinema −1.2), revenue table ($2,000 to $2,250; $4,000 to $3,500), determinants, firms and taxes, a quick check (PED −2, revenue $8,000 to $9,000).
3. `a-level-accounting-9706-statement-of-cash-flows.mdx`: full IAS 7 example. Both statements of financial position balance (2026: 350,000; 2025: 271,000). Operating 84,000, investing (108,000), financing 12,000, net (12,000), cash 30,000 to 18,000. PPE purchases 120,000 as the missing figure; tax paid 15,000.
4. `a-level-business-9609-investment-appraisal.mdx`: two projects. Payback A 2 years 9 months, B 2 years 6 months. ARR A 25%, B 10% (average investment, per the June 2024 examiner report). NPV at 10% A 24,500, B 340. Recommendation with conditions. Quick check ARR 15%.
5. `igcse-economics-market-failure.mdx`: private, external and social costs and benefits with numbers ($50 + $20 = $70), merit and demerit goods, public goods, policies, an 8-mark discuss plan, a quick check ($30 + $12 = $42). Links to the PED and Paper 2 articles instead of repeating them.

**Verify these new facts:**
- 0452 2026 Paper 1: 1 h 15, 35 marks, 35 questions, 30%, whole syllabus, may include calculations: https://www.cambridgeinternational.org/Images/697149-2026-syllabus.pdf
- 0452 and 7707 from 2027: 1 h 30, 40 marks: specimen papers https://www.cambridgeinternational.org/Images/718796-2027-specimen-paper-1.pdf and https://www.cambridgeinternational.org/Images/718961-2027-specimen-paper-1.pdf
- 7707 2026 Paper 1: same format; AO weighting 80% / 20% / 0%; calculators allowed: https://www.cambridgeinternational.org/Images/697340-2026-syllabus.pdf (the calculator rule was seen for 7707; confirm for 0452)
- 9706: statement of cash flows is A Level content under IAS 7: https://www.cambridgeinternational.org/Images/697417-2026-2028-syllabus.pdf (search text was garbled about the section, so confirm)
- 9609: investment appraisal is A Level topic 10.3; payback, ARR, NPV; ARR = average profit / average investment × 100: https://www.cambridgeinternational.org/Images/697371-2026-2028-syllabus.pdf ; June 2024 examiner report on the ARR error and average investment: https://www.cambridgeinternational.org/Images/566845-june-2024-examiner-report.pdf
- 0455: topic 2.7 PED calculation, interpretation, total revenue and significance; market failure key terms: https://www.cambridgeinternational.org/Images/697154-2026-syllabus.pdf , https://www.cambridgeinternational.org/Images/596945-2023-2025-syllabus.pdf

**MCQ checker:** added optional `pages` per paper, so each question link opens the official PDF at that question's page (`#page=N`). Topic practice and the "questions to look at again" list both use it.

**Cambridge questions on the site:** Hamza asked to split the real Paper 1s into individual questions on the site. Not done. Cambridge's help centre says it does not grant permission to publish past paper questions, including multiple-choice questions, on any website: https://help.cambridgeinternational.org/hc/en-gb/articles/203544371-Can-I-reproduce-Cambridge-past-examination-papers-on-the-school-s-website-my-website . The checker links to Cambridge's own PDFs at the right page instead.

## Past paper MCQ checker (new, started 23 October 2026)

Hamza asked for Paper 1 multiple-choice practice for Accounting and Economics, for every level, using real Cambridge past papers, with both a timed mock and topic practice, on the website and later in the portal.

**How it respects Cambridge's copyright:** the site never shows Cambridge's questions. Each paper is a link to the official PDF on cambridgeinternational.org, plus the answer letters from the official mark scheme, plus Hamza's own topic tags and explanations. This follows the rule in `content/blog/README.md` (never paste a full paper or mark scheme).

**Built:**
- `lib/mcq-papers.ts`: the 7 multiple-choice papers taught (IGCSE 0452, O Level 7707, AS 9706 Paper 1; IGCSE 0455, O Level 2281, AS 9708 Paper 1, A Level 9708 Paper 3), the paper data format, `checkPapers()` (drops any entry whose key length, letters, topics or notes do not match), marking and topic grouping.
- `/tools/past-paper-mcq`: hub. Lists every syllabus; ones with no papers show "Papers coming". The page is `noindex` and out of the sitemap and llms.txt until at least one paper exists.
- `/tools/past-paper-mcq/[syllabus]`: the syllabus's papers, plus topic practice (one real question at a time, checked instantly, with Hamza's note) when papers have topic tags.
- `/tools/past-paper-mcq/[syllabus]/[paper]`: timed mock. Link to the official paper, optional timer set from the paper's own time, A to D answer sheet (saved on the device, so a closed tab loses nothing), then score, topic breakdown weakest first, each wrong answer with the right letter and Hamza's note, blanks on one line, link to the official mark scheme and the grade predictor.
- `components/tools/McqChecker.tsx`, `components/tools/TopicPractice.tsx`.
- Tested in Chromium at phone width with a made-up paper (removed before commit): marking, saved answers after reload, timer, topic practice and feedback all worked; no sideways scroll.

**To do (needs web access, for the account that has it):**
1. For each syllabus, open its past papers page (links in `MCQ_SYLLABUSES`) and add papers to `MCQ_PAPERS`: question paper PDF link, mark scheme PDF link, `minutes` and question count from the cover, and the answer key typed from the mark scheme as one string. Start with the latest three sessions, all variants.
2. Double-check each key twice against the mark scheme: one wrong letter marks every student wrong on that question.
3. Topic tags and notes are Hamza's to write (or for Claude to draft for Hamza to approve). Notes must be in Hamza's own words, never copied from Cambridge.
4. Check: Paper 1 maximum marks in `lib/grade-thresholds.ts` say 0452/7707 Paper 1 is 35 marks and the others 30 (for 0455/2281 the 2027 syllabus changes Paper 1 to 40 questions in 1 hour). The data format takes the count from the key, so both work.
5. Check: A Level Accounting 9706 has no multiple-choice paper at A2 (Papers 3 and 4 are written; their maximums in the thresholds data are 75 and 50).
6. Once papers exist, add `/tools/past-paper-mcq` to the footer or the grade predictor page only if Hamza agrees (the landing page stays untouched).

**Portal ("both"):** the portal already has multiple-choice tests (`components/admin/ImportDocModal.tsx`, `lib/question-parser.ts`). Loading past paper questions there is private use for enrolled students, and is Hamza's call. That work is in the portal, which agent-2 must not edit, so it is for the other agent.

## Files created or changed

- created `lib/gulf-pages.ts`, `app/online-classes/gulf/page.tsx`, `app/private-candidates/uae/page.tsx`, `app/private-candidates/saudi-arabia/page.tsx`, the four `.mdx` articles, `WORKBOARD.md`
- created (third pass) `content/blog/igcse-o-level-accounting-paper-1-mcq-tips.mdx`, `igcse-economics-price-elasticity-of-demand.mdx`, `a-level-accounting-9706-statement-of-cash-flows.mdx`, `a-level-business-9609-investment-appraisal.mdx`, `igcse-economics-market-failure.mdx`
- created `lib/mcq-papers.ts`, `components/tools/McqChecker.tsx`, `components/tools/TopicPractice.tsx`, `app/tools/past-paper-mcq/page.tsx`, `app/tools/past-paper-mcq/[syllabus]/page.tsx`, `app/tools/past-paper-mcq/[syllabus]/[paper]/page.tsx`
- changed `app/online-classes/[city]/page.tsx` (adds a `GulfCity` view; Pakistan cities unchanged), `app/online-classes/page.tsx`, `app/sitemap.ts`, `lib/seo.ts`, `app/llms.txt/route.ts`

## Checks run (23 October 2026)

- `npx tsc --noEmit -p .`: pass. `npx eslint` on every changed .ts/.tsx file: pass. `npx next build`: pass, all 5 city pages, the hub, both guides and the 4 articles prerender.
- Zero em dashes or en dashes in every file above. No banned words.
- Opened every new page at phone width (390 px) in Chromium: no sideways page scroll. Class times on the Gulf pages are stacked cards, not wide tables, so nothing is cut off on a phone.
- Not checked: the pages on a real phone, and dark/light theme beyond the default.

## Verify before merge (fact: source)

Pakistan time is UTC+5; UAE and Oman one hour behind; Saudi, Qatar, Kuwait, Bahrain two hours behind (from the brief).

**Dubai**: private schools Monday to Friday, Friday ends by 12 pm at the latest, Saturday and Sunday weekend: https://web.khda.gov.ae/en/Guides/Parents/Faq/4-5-day-week-FAQs-for-Dubai-private-schools
**Abu Dhabi**: Abu Dhabi government, like the federal government, works Monday to Friday, Saturday and Sunday weekend (government, not schools; ADEK school rule not found, so not claimed): https://u.ae/en/information-and-services/jobs/Sector-of-employment/working-in-uae-government-sector/working-hours-in-the-public-sector
**British Council UAE** (city pages and UAE guide): https://www.britishcouncil.ae/sites/default/files/candidate_information_flyer_-_oct_nov_2026.pdf , https://www.britishcouncil.ae/sites/default/files/cambridge_candidate_information_flyer_june_2026.pdf , https://www.britishcouncil.ae/sites/default/files/declaration_by_candidate_0.pdf
- offices: Abu Dhabi, Dubai (Oud Metha), Sharjah (its candidates sit exams in Dubai). The Abu Dhabi street address differs between sources (Al Bateen and Khalidiya Street), so no address is used.
- register online, then email documents to the Dubai school exams team or visit an office; documents within three working days (declaration form)
- documents: passport or Emirates ID original and copy, three photos from the last six months, registration summary, signed declaration, NOC
- NOC required for IGCSE and AS and A Level private candidates; declaration: NOC from your school if you are at an MoE-recognised school
- certificates not endorsed by MoEY; one centre and one board per session
- offline payment due with documents, cash or credit card; fees non-refundable, non-transferable, not carried forward
- dates: May / June 2026 regular 2 Dec 2025 to 13 Feb 2026, late stage 1 14 Feb to 10 Apr 2026; Oct / Nov 2026 regular 26 Jun to 7 Aug 2026, late stage 1 8 Aug to 14 Sep 2026

**Added in the second pass (verify these too)**
- Sharjah government weekend is Friday to Sunday: u.ae working hours page above
- British Council UAE lists Dubai attached centres: https://www.britishcouncil.ae/en/exam/igcse-school/choosing/find-british-council-attached-centre
- Riyadh 2026 to 2027 school year started Sunday 23 August 2026: https://spa.gov.sa/en/N2659363
- In 2025, Jeddah and Taif, and the Makkah and Madinah regions, started a week after most regions: https://www.spa.gov.sa/en/N2384169 (check this link is the 2025 article)
- Saudi private and international schools can move their start by up to two weeks: https://www.moe.gov.sa/en/education/generaleducation/Pages/Reg-priv-int-schools.aspx
- British Council Riyadh office in the Diplomatic Quarter (from the Riyadh English school page; confirm the exams team is at the same office): https://www.britishcouncil.sa/english/schools/riyadh/mens
- Qatar: in special cases someone else can submit and pay for you: British Council Qatar private candidates page below
- Qatar shorter Thursday: https://www.edu.gov.qa/en/News/Details/9271800

**Removed** because the source turned out to be the British Council Cambridge English (language exams) page, not school exams: "the British Council runs Cambridge exam sessions at its Abu Dhabi and Dubai centres".

**Saudi Arabia**: Sunday to Thursday week, Friday and Saturday weekend (2013 Royal Order): https://www.spa.gov.sa/en/bee255bdbb
**British Council Saudi** (Riyadh, Jeddah pages and Saudi guide): https://www.britishcouncil.sa/en/exam/igcse-school/register , https://www.britishcouncil.sa/en/exam/igcse-school/register/dates-deadlines
- offices Riyadh, Jeddah, Al Khobar; separate private candidate route; Cambridge sessions May / June and October / November; boards have different dates; late registration possible at extra fee; special arrangements at least six weeks before, medical certificate from the last two years; contact office straight away about mistakes, each session has a correction deadline

**Qatar**: schools run Sunday to Thursday, shorter Thursday: https://qna.org.qa/en/news/news-details?id=qatar-to-apply-summer-school-hours-on-may-3&date=27/04/2026 (this is a summer-hours notice; find a better source for the normal week if possible)
**British Council Qatar** (Doha page): https://www.britishcouncil.qa/en/exam/igcse-school/register/private-candidates , https://www.britishcouncil.qa/en/exam/igcse-school/register/registration-dates-deadlines
- online School Exams Registration System; pay in person by cash or card at the Al Sadd office; Qatar ID copy, passport photos, signed declaration; under 18 need a No Objection Letter from MOEHE; all subjects except those with practicals; Oct / Nov 2026 regular 13 Jul to 10 Aug 2026, late with penalty to 14 Sep 2026
- not used because sources conflicted: a "Grade 12 school leaving certificate" requirement on one page

**Business 0450 article**: https://www.cambridgeinternational.org/Images/697146-2026-syllabus.pdf , https://www.cambridgeinternational.org/Images/596930-2023-2025-syllabus.pdf , https://www.cambridgeinternational.org/Images/520484-june-2024-question-paper-21.pdf , https://www.cambridgeinternational.org/Images/604224-june-2024-mark-scheme-paper-21.pdf (search showed this file id; check it is the 0450 one, not 0986) , https://www.cambridgeinternational.org/Images/520488-june-2024-examiner-report.pdf , https://www.cambridgeinternational.org/Images/718123-2027-2029-syllabus.pdf
- two papers 1 h 30, 80 marks, 50% each; four questions each; AO 40/20/25/15 overall, AO4 10% P1 and 20% P2; "justify" definition; 0450/21 June 2024 Q2(b) 12 marks and its level descriptors; 0264 replaces 0450 from March 2027, AO P1 40/30/20/10, P2 30/30/25/15
**Business 7115 article**: https://www.cambridgeinternational.org/Images/697338-2026-syllabus.pdf , https://www.cambridgeinternational.org/Images/724211-guide-to-making-entries.pdf , https://www.cambridgeinternational.org/Images/570360-june-2024-examiner-report.pdf , https://www.cambridgeinternational.org/Images/718211-2027-2029-syllabus.pdf , https://www.cambridgeinternational.org/Images/718954-2027-specimen-paper-2.pdf , https://www.cambridgeinternational.org/Images/718949-2027-specimen-paper-1-mark-scheme.pdf
- 7115 marks per paper were NOT confirmed, so not stated; 7081 Paper 1 duration not confirmed, so not stated
**Economics 9708 article**: https://www.cambridgeinternational.org/Images/697423-2026-2028-syllabus.pdf , https://www.cambridgeinternational.org/Images/567336-june-2024-examiner-report.pdf
- Paper 1: 30 questions, 1 hour, 30 marks, 33% of AS; Paper 3: 30 questions, 1 h 15; June 2024 Paper 11 "most candidates answered between 14 and 23 correctly"
**Accounting 0452 article**: https://www.cambridgeinternational.org/Images/718141-2027-2029-syllabus.pdf , https://www.cambridgeinternational.org/Images/596935-2023-2025-syllabus.pdf
- the four "syllabus asks for" bullets; the exclusions (admission, departure, dissolution, ratio changes) were seen in the 2023 to 2025 syllabus: confirm they are still in 2027 to 2029

## For Hamza to decide

- **0450 and 7115 are being replaced.** IGCSE Business becomes 0264 (first exams March 2027) and O Level Business becomes 7081 (first exams June 2027). The site still lists 0450 and 7115 in several places (FAQs, llms.txt, grade thresholds). Students sitting in 2027 take the new codes. I did not change the existing pages.
- Riyadh and Jeddah are now written as separate pages with different content (week fit and late school days for Riyadh; regional calendar and a Friday routine for Jeddah). If you would rather have one Saudi page, they can be merged.

## Seen, not changed

- `lib/public-paths.ts` does not include `/online-classes`, `/private-candidates` or `/grade-thresholds` (true for the existing pages too). Server HTML is fine, but without the Supabase keys the client shows "Something went wrong". The live site has the keys, so it is probably fine; worth a look.
