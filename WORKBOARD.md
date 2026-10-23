# Workboard: agent-2

Branch: `agent-2` (from `origin/main`). Nothing here is on main. Another agent reviews, builds and merges.

Note: this repo has no `/site` folder. The Next.js app is at the repo root, so "site/" in the brief means the root.

## How this was made (read first)

This session could not open web pages (network policy) and could not push to GitHub (this Claude account has no access to the repo). So:

- The work travels as a patch file (`git format-patch`). Apply it on `agent-2` with `git am`.
- Facts were taken from **web search results limited to official domains** (britishcouncil.ae / .sa / .qa, khda.gov.ae, u.ae, spa.gov.sa, qna.org.qa, cambridgeinternational.org). Search gives summaries of those pages, not the pages themselves. **Before merging, open each source below and confirm the fact.** Anything that does not match: fix it or delete the sentence.

## Done

1. `/online-classes/gulf`: hub for Gulf students. Class times by level in UAE / Oman time and in Saudi / Qatar / Kuwait / Bahrain time, worked out from `lib/timetable.ts`, so they follow timetable changes. Lists the five cities and both private candidate guides. Linked from `/online-classes` (not from the landing page).
2. City pages, served by the existing `app/online-classes/[city]` route (data in `lib/gulf-pages.ts`, `GULF_CITY_PAGES`): `/online-classes/dubai`, `abu-dhabi`, `riyadh`, `jeddah`, `doha`. Each has: local class times table, how that country's school week meets the Monday to Friday timetable, the British Council office for private candidates, its own FAQ and a Sources line.
3. `/private-candidates/uae`: same structure as the Pakistan guide. Two rules first (no MoE endorsement, one centre and board per session), registration steps, documents, deadlines table, fees policy, FAQ, Sources.
4. `/private-candidates/saudi-arabia`: shorter, because the British Council Saudi pages publish no current deadline table, fee list or document list for school exams. States only what they say and lists questions to ask the office. Add a deadlines table when one is published.
5. Articles (date 2026-10-23):
   - `content/blog/igcse-business-0450-justify-evaluate-questions.mdx`
   - `content/blog/o-level-business-7115-syllabus-explained.mdx`
   - `content/blog/as-level-economics-9708-paper-1-mcq-tips.mdx`
   - `content/blog/igcse-accounting-partnership-accounts.mdx` (worked example, all totals checked: appropriation 49,000 = 8,000 + 5,000 + 36,000; Amina current account 27,100 each side, c/d 6,500; Bilal 24,400 each side, c/d 4,800; capital plus current 111,300)
6. Registered everywhere: `PUBLIC_ROUTES` in `lib/seo.ts` (gulf hub, both guides), `app/sitemap.ts` (Gulf city pages), `app/llms.txt/route.ts`.

## Files created or changed

- created `lib/gulf-pages.ts`, `app/online-classes/gulf/page.tsx`, `app/private-candidates/uae/page.tsx`, `app/private-candidates/saudi-arabia/page.tsx`, the four `.mdx` articles, `WORKBOARD.md`
- changed `app/online-classes/[city]/page.tsx` (adds a `GulfCity` view; Pakistan cities unchanged), `app/online-classes/page.tsx`, `app/sitemap.ts`, `lib/seo.ts`, `app/llms.txt/route.ts`

## Checks run (23 October 2026)

- `npx tsc --noEmit -p .`: pass. `npx eslint` on every changed .ts/.tsx file: pass. `npx next build`: pass, all 5 city pages, the hub, both guides and the 4 articles prerender.
- Zero em dashes or en dashes in every file above. No banned words.
- Opened every new page at phone width (390 px) in Chromium: no sideways page scroll, tables scroll inside themselves.
- Not checked: the pages on a real phone, and dark/light theme beyond the default.

## Verify before merge (fact: source)

Pakistan time is UTC+5; UAE and Oman one hour behind; Saudi, Qatar, Kuwait, Bahrain two hours behind (from the brief).

**Dubai**: private schools Monday to Friday, Friday ends by 12 pm at the latest, Saturday and Sunday weekend: https://web.khda.gov.ae/en/Guides/Parents/Faq/4-5-day-week-FAQs-for-Dubai-private-schools
**Abu Dhabi**: Abu Dhabi government, like the federal government, works Monday to Friday, Saturday and Sunday weekend (government, not schools; ADEK school rule not found, so not claimed): https://u.ae/en/information-and-services/jobs/Sector-of-employment/working-in-uae-government-sector/working-hours-in-the-public-sector
**British Council UAE** (city pages and UAE guide): https://www.britishcouncil.ae/sites/default/files/candidate_information_flyer_-_oct_nov_2026.pdf , https://www.britishcouncil.ae/sites/default/files/cambridge_candidate_information_flyer_june_2026.pdf , https://www.britishcouncil.ae/sites/default/files/declaration_by_candidate_0.pdf
- offices: Abu Dhabi (Al Qasbah Street, Al Bateen), Dubai (Oud Metha), Sharjah (its candidates sit exams in Dubai); Cambridge sessions run at Abu Dhabi and Dubai centres
- register online, then email documents to the Dubai school exams team or visit an office; documents within three working days (declaration form)
- documents: passport or Emirates ID original and copy, three photos from the last six months, registration summary, signed declaration, NOC
- NOC required for IGCSE and AS and A Level private candidates; declaration: NOC from your school if you are at an MoE-recognised school
- certificates not endorsed by MoEY; one centre and one board per session
- offline payment due with documents, cash or credit card; fees non-refundable, non-transferable, not carried forward
- dates: May / June 2026 regular 2 Dec 2025 to 13 Feb 2026, late stage 1 14 Feb to 10 Apr 2026; Oct / Nov 2026 regular 26 Jun to 7 Aug 2026, late stage 1 8 Aug to 14 Sep 2026

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
- Riyadh and Jeddah share most facts (same country, same British Council rules). If Google treats them as too similar, merge them into one Saudi Arabia page.

## Seen, not changed

- `lib/public-paths.ts` does not include `/online-classes`, `/private-candidates` or `/grade-thresholds` (true for the existing pages too). Server HTML is fine, but without the Supabase keys the client shows "Something went wrong". The live site has the keys, so it is probably fine; worth a look.
