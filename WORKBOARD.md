# Workboard: agent-2

Branch: `agent-2` (from `origin/main`). Nothing here is on main. Another agent reviews, builds and merges.

Note: this repo has no `/site` folder. The Next.js app is at the repo root, so "site/" in the brief means the root.

## Blocker

This session's network policy blocks web pages: every fetch fails (britishcouncil.ae, britishcouncil.sa, cambridgeinternational.org, even wikipedia.org). Web search works, but it only gives summaries, not the official pages, so it does not count as verification. Every task that needs an official fact is on hold until the hosts below are allowed in the cloud environment's Network access settings:

- britishcouncil.ae, www.britishcouncil.ae
- britishcouncil.sa, www.britishcouncil.sa
- britishcouncil.qa, www.britishcouncil.qa
- www.cambridgeinternational.org
- government / regulator sites for school weeks (for example u.ae, www.khda.gov.ae, adek.gov.ae, moe.gov.sa, edu.gov.qa)

## Done

1. `/online-classes/gulf`: page for Gulf students. Class times by level in UAE / Oman time and in Saudi / Qatar / Kuwait / Bahrain time, worked out from the live timetable (`lib/timetable.ts`), so the times follow any timetable change. Uses only facts from the brief (times, no fees, free trial). No school-week or British Council claims yet.
2. Added `/online-classes/gulf` to `PUBLIC_ROUTES` (lib/seo.ts, which feeds the sitemap) and to `app/llms.txt/route.ts`. Linked from `/online-classes` (not from the landing page).
3. Draft article `content/blog/_igcse-accounting-partnership-accounts.mdx` (unpublished: file name starts with `_`). Full worked example; totals checked by hand: appropriation 49,000 = 8,000 + 5,000 + 36,000; Amina current account 27,100 each side, c/d 6,500; Bilal 24,400 each side, c/d 4,800; capital plus current 111,300.

## Files created or changed

- created `lib/gulf-pages.ts`
- created `app/online-classes/gulf/page.tsx`
- created `content/blog/_igcse-accounting-partnership-accounts.mdx` (draft)
- created `WORKBOARD.md`
- changed `lib/seo.ts`, `app/llms.txt/route.ts`, `app/online-classes/page.tsx`

## Not verified

- Partnership article: that 0452 covers interest on drawings, partners' salaries and current accounts, and the exact layout Cambridge mark schemes use. Needs the 0452 syllabus PDF. No Sources line yet, so it stays a draft.
- `/online-classes/gulf` was not opened in a browser. tsc, eslint and next build all pass (23 October 2026); the built page shows the expected local times (UAE 2:30 to 8:30 PM, Saudi 1:30 to 7:30 PM).

## Left to do (needs web access)

- City pages: Dubai, Abu Dhabi, Riyadh, Jeddah, Doha. Plan: one `GULF_CITY_PAGES` list next to `GULF_ZONES`, served by `app/online-classes/[city]`, each with local times, the school week from the regulator, and that country's British Council private candidate route. Not built, so no thin pages go live.
- `/private-candidates/uae` and `/private-candidates/saudi-arabia`.
- Articles: Business 0450 evaluate / discuss, Business 7115 syllabus, Economics 9708 Paper 1 MCQ. Then publish the partnership article (remove the `_`) with a Sources line.
