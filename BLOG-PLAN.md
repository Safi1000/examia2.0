# Blog plan (and later, the PDF shop)

Status: plan only, nothing built. Agreed inputs from Hamza (2026-10-15):
- Start with O Level / IGCSE, AS / A Level, and past paper walk-throughs. No UK GCSE.
- No PDF pack for now. When it comes, it must take Pakistani payments and international cards.
- The homepage stays the single funnel page. The blog does not go in the top menu unless Hamza says yes.

## 1. How articles are written and published

- Each article is one file in `content/blog/`, written in MDX (Markdown that can hold a booking button). Example: `content/blog/igcse-accounting-trial-balance.mdx`.
- Each file starts with a short header the site reads:

  ```
  title: How to prepare a trial balance (IGCSE Accounting 0452)
  description: One-line summary for Google, about 155 characters.
  subject: Accounting
  level: O Level / IGCSE
  code: 0452 / 7707
  date: 2026-11-01
  ```

- Workflow: Hamza (or a writer) drafts in Google Docs → Claude (hamza-copy) edits it into Hamza's voice and turns it into the MDX file → it goes into the code → the site redeploys on Vercel as it does today. No database, no login, no new monthly service.
- Later option, only if writers multiply: a simple CMS. Not needed now.

## 2. URLs and pages

- `/blog`: one list of all articles, newest first, with filter chips (Accounting, Business, Economics, O Level / IGCSE, AS / A Level, Past papers). Filters are on the same page, not separate pages.
- `/blog/<slug>`: one article. Slugs are short and searchable, e.g. `/blog/igcse-accounting-trial-balance`, `/blog/9708-economics-paper-2-may-june-2024`.
- Linked from the footer as "Articles". Top menu: unchanged unless Hamza approves a "Articles" link.
- Each article page gets: its own title and description, a share image drawn from its title, Article + Breadcrumb data for Google, and an automatic sitemap entry.

## 3. How each article feeds bookings and WhatsApp

Every article uses the same calm layout as the homepage and the same booking pop-up.

1. **Top strip** under the title: "Taught by Hamza · Accounting · O Level / IGCSE".
2. **Mid-article box** (after the first main section): "Stuck on this topic? Book a free trial lesson" → opens the booking calendar with that article's subject and level already ticked.
3. **End box**: the same booking button, plus "Ask me about this topic" → WhatsApp opens with "Hi, I read your article on <topic>. I have a question." typed in.
4. **Grade predictor link** on exam-technique and past-paper articles → homepage `#grade`.
5. **Phone bar**: the existing "Chat on WhatsApp" bar stays at the bottom.
6. **Tracking**: every button reports `from: blog:<slug>` to the Meta pixel, so Hamza can see which articles bring bookings.

## 4. First 10 articles

Chosen for likely search demand. After launch, Google Search Console will show what people actually search, and the list gets adjusted.

| # | Title | Level | Type |
|---|---|---|---|
| 1 | How to prepare a trial balance, with a worked example (IGCSE 0452 / O Level 7707 Accounting) | O Level / IGCSE | Topic |
| 2 | Depreciation explained: straight-line vs reducing balance (IGCSE and O Level Accounting) | O Level / IGCSE | Topic |
| 3 | How to answer 6-mark and 12-mark questions in IGCSE Business Studies 0450 | O Level / IGCSE | Exam technique |
| 4 | Price elasticity of demand explained with diagrams (IGCSE 0455 / O Level 2281 Economics) | O Level / IGCSE | Topic |
| 5 | Market failure in ten minutes: notes and exam tips (IGCSE and O Level Economics) | O Level / IGCSE | Topic |
| 6 | Statement of cash flows, step by step (A Level Accounting 9706) | AS / A Level | Topic |
| 7 | How to write a 20-mark evaluation essay (A Level Economics 9708) | AS / A Level | Exam technique |
| 8 | Investment appraisal made simple: payback, ARR and NPV (A Level Business 9609) | AS / A Level | Topic |
| 9 | IGCSE Accounting 0452 Paper 2 walk-through [PAPER: Hamza picks session and variant] | O Level / IGCSE | Past paper |
| 10 | A Level Economics 9708 Paper 2 walk-through [PAPER: Hamza picks session and variant] | AS / A Level | Past paper |

Past paper rule: Cambridge owns the papers. Walk-throughs quote question numbers and short extracts only, explain the method, and link to the official paper. Never upload the full paper or mark scheme.

## 5. PDF shop (later, not now)

When Hamza is ready to sell a guide pack:
- **Shape:** a single product block on the homepage or blog (not a new shop page), with "Buy" opening a hosted checkout. The PDF is emailed automatically after payment.
- **Payment, Pakistan + international cards:** compare at that time:
  - a Pakistani payment gateway that takes local cards, JazzCash/Easypaisa and international cards (e.g. Safepay, PayFast);
  - a hosted digital-products store (e.g. Lemon Squeezy, Gumroad), but only after checking it can pay out to a Pakistani bank.
- **Rough cost:** no monthly fee on most of these options; roughly 3 to 10% per sale, depending on the provider. Verify current fees and payout rules before choosing.

## 6. Build estimate (blog only)

- **Work:** one focused Claude session: MDX setup, `/blog` list with filters, article template with the 3 booking and WhatsApp boxes, share image, Google data, sitemap, footer link, plus article 1 written and published as the pattern.
- **Packages:** 1 to 2 small, free packages for MDX. Installing them needs Hamza's yes.
- **Money:** nothing new. Vercel hosting stays the same.
- **Tokens:** roughly 300k to 500k for the build session, about the size of one homepage round. Each later article: roughly 20k to 40k tokens to edit and publish from Hamza's draft.

## Open questions (TODO-ASK)

- Who drafts articles: Hamza, a writer, or Claude from Hamza's notes and voice?
- How often: one a week, or two?
- Add "Articles" to the top menu, or footer only?
- Which past paper sessions and variants for articles 9 and 10?
