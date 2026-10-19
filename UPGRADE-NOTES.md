# Phase 1 upgrade: leads + SEO (2026-10-14)

For the developer deploying this. Portal login, database, uploads, pixel, WhatsApp number and existing homepage copy are unchanged.

## What changed and why

1. **Public pages now render on the server** (`components/providers.tsx`). Before, `/` was wrapped in the hydration gate, so crawlers and link previews saw only a "Hamza Teaches" splash. Public paths (`/`, `/tuition/*`, `/tools/*`) now skip the gate. Portal routes are untouched. The landing nav uses a new `useOptionalAuth()` (`lib/auth-context.tsx`), so on public pages it always shows "Login".
2. **Sitemap and robots**: `app/sitemap.ts` and `app/robots.ts`. Portal routes and `/api/` are disallowed. `/login` is noindex (`app/login/layout.tsx`).
3. **Share image**: `app/opengraph-image.tsx` (1200x630, made in code). `metadataBase` is set from `NEXT_PUBLIC_SITE_URL` (default `https://hamzateaches.com`).
4. **Structured data** (`lib/seo.ts`, `components/JsonLd.tsx`): EducationalOrganization and FAQPage on `/`; Course, Breadcrumb and FAQPage on the subject pages; WebApplication on the tool.
5. **Subject pages**: `/tuition/accounting`, `/tuition/business`, `/tuition/economics` (`app/tuition/[subject]/page.tsx`, content in `lib/subjects.ts`). Static, with their own titles and descriptions.
6. **Grade predictor**: `/tools/grade-predictor` (`components/landing/GradePredictor.tsx`, logic in `lib/grade-predictor.ts`). Nothing is stored. The result button opens WhatsApp with the result typed in and fires the pixel `Lead` event (`from: grade_predictor`).
7. **Homepage**: a new "Free tool" section above the FAQ (`ToolTeaser` in `Sections.tsx`). The FAQ list moved to `lib/landing.ts` (`FAQS`) so it can also feed the structured data. The text is unchanged.
8. **Footer**: link columns (subjects, free tools, contact, student login) on every public page.

## Before going live

- Add `NEXT_PUBLIC_SITE_URL=https://hamzateaches.com` to the Vercel env (optional, it is the default).
- After deploy, submit `https://hamzateaches.com/sitemap.xml` in Google Search Console.
- Grade bands in `lib/grade-predictor.ts` are working estimates (TODO-ASK). Hamza to confirm them.

# Phase 2: portal (2026-10-14)

Login, database, uploads and RLS are unchanged.

1. **Preview-only demo mode** (`lib/demo.ts`): `npm run dev:demo`, then `/dashboard?demo=student` or `/admin?demo=admin`. It loads `lib/data/seed.ts` instead of Supabase. It needs both `next dev` and `NEXT_PUBLIC_DEMO_MODE=1`, so it can never switch on in a production build. Hooks are in `lib/supabase.ts`, `lib/data/store.ts` (hydrate, refreshTest) and `lib/auth-context.tsx`.
2. **Student dashboard**: a status line under the greeting ("2 tests to do. X closes in 3 hours"), tests to do placed above announcements, "Closes in …" on open tests (amber under 24h), and score + grade on released tests (`TestCard.tsx`, `formatRelative` in `lib/time.ts`).
3. **Phones**: a labelled bottom tab bar replaces the row of bare icons (`app/(student)/layout.tsx`, padding rule in `globals.css`).
4. **Grading**: auto-marked MCQs are folded into one summary line (with a "Show them" toggle), one-tap 0 / Half / Full buttons, "Skip to next →", "Release & next", and "Next to mark →" after the existing auto-release.
5. **Look**: Inter Tight across the portal (Bricolage and Hanken removed, so fewer font files load). The card edge is now a grey hairline instead of gold, so gold is kept for actions. Pinned announcements use gold instead of blue.
6. **Progress**: the headline label reads "Grade this month".

# Phase 3: study coach + faster test making (2026-10-15)

1. **Study coach** (`components/student/StudyCoach.tsx`): on each result page, "What to work on next" lists up to 3 topics where marks were dropped, with the questions to redo (they jump to `#q-N`), a matching note (when a note title contains the topic name) and a pre-typed WhatsApp question. The progress page shows "Your next three steps" (topics under 70% overall) at the top. Uses the existing `topicMastery`; no data changes.
2. **Faster test making** (`components/admin/ImportDocModal.tsx`, button now "Paste or upload"): a "Paste text" tab parses questions in the browser (no upload), "Topic for all" and "Marks for all" set every row at once, an answer key ("1B 2C" or "BCA") ticks the correct options, and topic boxes suggest topics already in use.
3. `Card` accepts an `id`.

# Phase 4: premium portal restyle (2026-10-15)

No logic, data or login changes. Mostly design tokens, so every screen picks it up.

1. **Tokens** (`app/globals.css`): warm charcoal surfaces from brand.md, neutral hairline borders (the old ones were blue-grey), text greys raised to pass WCAG AA (`--color-ink-3` was about 3:1, now 5:1), larger corner radii (12/16px), and flat cards (no drop shadow; depth comes from the surface step plus a hairline).
2. **Buttons** (`components/ui/Button.tsx`): pill shape like the public site. Gold for the main action, hairline outline for secondary.
3. **Headings**: page titles are bigger (`PageHeader`). Section headings across student and admin screens moved from small uppercase grey to sentence-case semibold.
4. **Admin pages**: content is centred at max 1152px with more breathing room. The sidebar sits on the page background.
5. **Login**: pill button, sentence-case labels now linked to their inputs (screen readers announce them).
6. Badges and test-code pills are quieter (no outline on neutral ones).

# Phase 5: Today home + retest weak topics (2026-10-15)

1. **Today** (`app/(admin)/admin/today/page.tsx`) is now the admin landing page (`/admin`, the admin login and the sidebar logo all go there; it is also first in the sidebar). It shows tiles (to mark, closing in 48h, students to check on, 30-day average), the oldest submissions to mark with a "Start marking" button, tests closing soon with who hasn't handed in (one-tap WhatsApp reminder when a number is saved), students to check on (missed a test in the last 14 days, last two results averaging under 50%, or 2+ absences in a row) with pre-typed WhatsApp messages to the student and parent, and the 3 weakest topics. Respects the sidebar cohort filter. Read-only.
2. **Retest weak topics** (`lib/retest.ts`): "Make a retest" builds a test of up to 10 questions on that topic (question bank first, then past tests, no repeats) as a **draft** for that cohort, using the existing store actions (`addTest`, `importBankItems`, `addQuestion`). No schema change.
3. **Publish for drafts**: the test editor shows a "Draft" note and a "Publish" button (`setTestStatus(id, "active")`). Before this, the portal had no way to publish a draft.

# Phase 6: exam countdown study plan (2026-10-15)

1. **Plan page** (`/plan`, `app/(student)/plan/page.tsx`; logic in `lib/study-plan.ts`): days and weeks to the exams, a "This week" card (focus topics with the student's mark so far, the tests open that week that aren't handed in yet, and the week's tasks), and every week ahead. Phases: "Learn and practise" until the past-paper window, "Past papers" from 1 March, then a "Final week". Topics are every topic Hamza has tagged in the student's subjects (tests + bank). They are ordered weakest first, and topics under 70% / 50% are queued two / three times, so they come back more often. The plan is rebuilt from the student's marks each time it opens; nothing is stored.
2. **Dashboard**: a "This week's focus" card linking to the plan.
3. **Menu**: "Plan" added to the student menu. The phone tab bar now has 6 items with short labels (Home, Plan, Progress, Tasks, Notes, Settings).
4. **TODO-ASK**: `EXAMS` in `lib/study-plan.ts` holds the first exam date (working default 26 April 2027) and the past-paper start (1 March 2027). Hamza to confirm.

# Phase 7: front-end funnel, menu, booking, reviews, legal (2026-10-15)

1. **Booking calendar** (`components/landing/BookingFlow.tsx`, logic in `lib/booking.ts`): subject, level, student or parent, online or Rawalpindi, a day in the next 14 days and a time (Pakistan time). The button opens WhatsApp with the whole booking typed in. Nothing is stored and nothing is reserved until Hamza confirms in the chat. Used on the new `/book` page and inside the homepage level picker (level cards now select a level and open the calendar instead of jumping straight to WhatsApp). TODO-ASK: `TRIAL_DAYS` and `TRIAL_HOURS` are working defaults (Mon to Sat, 4 to 8 pm).
2. **Top menu** (`Nav.tsx`): Subjects dropdown, Reviews, Grade predictor, FAQ, Login and a gold "Book free trial" button. On phones and tablets a full-screen menu (Escape closes it). The phone menu sits outside `<header>` because the header's backdrop blur traps fixed children.
3. **Homepage tightening**: removed the fake "Trial requested / Lesson booked" hero cards and the "Your video" and "2 min" labels on the video; added a one-line offer under the headline; one CTA label everywhere ("Book your free trial lesson"); "Inside a lesson" captions now describe what students get instead of claiming to show a real class; review cards no longer show "Student review 1/2" and link to `/reviews`; the announcement no longer follows you down the page; body text raised to 15 to 17px.
4. **New pages**: `/reviews`, `/book`, `/privacy`, `/terms` (shared `LegalPage.tsx`). All in the sitemap and in `isPublicPath`. Footer has Privacy and Terms links. Review data moved to `lib/reviews.ts`.
5. **Privacy and terms are drafts.** Hamza to fill each `[PLACEHOLDER]` (contact email, data retention, reply time, fees and payment, refunds, missed classes) and approve the wording before launch.

# Phase 8: one funnel page (2026-10-15)

Hamza's direction: one strong homepage, no extra pages except Privacy and Terms (footer only), online-first.

1. **Removed pages** (moved, not deleted, to `../archive-removed-pages/app/`): `/tuition/*`, `/book`, `/reviews`, `/tools/grade-predictor`. Sitemap and `isPublicPath` now list only `/`, `/privacy`, `/terms`. Their course data now prints on the homepage (`coursesLd()` in `lib/seo.ts`).
2. **Booking pop-up** (`BookingModal.tsx`, `BookingProvider` + `BookButton`): every "Book free trial" / "Book your free trial lesson" / "Book now" button, and each level card, opens the calendar in a pop-up (bottom sheet on phones). Everything stays editable; level cards pre-select subject and level.
3. **Menu**: Login, Chat on WhatsApp, Book free trial. Nothing else. Phones show Login + Book free trial; WhatsApp stays in the sticky bottom bar.
4. **Grade predictor** is now a homepage section (`#grade`, `GradeSection`) above the FAQ.
5. **Online-first**: hero line, footer and structured data lead with online classes; in-person Rawalpindi remains only as the second "Where?" option. Visitors outside Pakistan see each slot in their own time under the Pakistan time, and both go into the WhatsApp message.

# Phase 9: blog (2026-10-16)

Plan: `BLOG-PLAN.md`. Footer link only ("Articles"); the top menu is unchanged.

1. **Packages**: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`, `remark-gfm` (tables). Configured in `next.config.ts`; text styles in `mdx-components.tsx` (required by @next/mdx).
2. **Articles** are files in `content/blog/<slug>.mdx`, each starting with `export const meta = {…}` (`lib/blog.ts` has the fields). How-to for writers: `content/blog/README.md`. Files starting with `_` are drafts.
3. **Pages**: `/blog` (list with subject and level filter chips, `ArticleList.tsx`) and `/blog/[slug]` (static; Article + Breadcrumb data; per-article share image). Both render on the server (`/blog` added to `isPublicPath`) and are in the sitemap.
4. **Leads**: `<BookingBox />` mid-article and an automatic end box (`ArticleCta.tsx`) open the booking pop-up with the article's subject and level ticked; "Ask me about this topic" opens WhatsApp with the topic typed in. Pixel events carry `from: blog:<slug>:mid|end|ask`.
5. **Article 1**: `igcse-accounting-trial-balance` (worked example, DEAD CLIC, the six errors). Hamza to read it before launch.

# Phase 10: security, SEO and UI audit (2026-10-16)

## Security (fixed)
1. **Students could award themselves marks** (P0). A student inserts their own answer rows; marks were only forced for MCQs, so a written/photo answer could arrive with `marks_awarded` set, and students could insert a submission already `released` with a `total_marks`. Fixed in **`supabase/migrations/20261016010000_harden_student_writes.sql`**: non-admin inserts have grading columns cleared, the answer type forced to the question's type, no answers into released submissions, and submissions can't be released or scored by students. Assignment feedback is now teacher-only on insert as well as update. **The developer must apply this migration to the live Supabase project** (`supabase db push`).
2. **Open file proxy** (P0). `/api/download` fetched any `?url=` with the Cloudinary admin key and no login. It now only accepts short-lived signed links (`signDownloadUrl` in `lib/signed-view.ts`), minted by the parent report page after the token check. `/api/view` and `/api/download` only stream this site's own Cloudinary cloud, with safe filenames and no-store caching.
3. **Ad tracker inside the private portal** (P1). The Meta pixel loaded on every route, sending portal and parent-report URLs (which contain private ids and report tokens) to Meta. It now loads on public pages only (`lib/public-paths.ts`).
4. **Next.js critical vulnerabilities** (P0). Upgraded `next` and `eslint-config-next` 16.2.9 → 16.4.2, and ran `npm audit fix` for the others (postcss, sharp, nanoid, xmldom, source-map-js). Remaining: a moderate warning in `mammoth` (used only by the admin-only document importer; the fix would be a breaking downgrade).
5. **Security headers** on every response (`next.config.ts`): HSTS, nosniff, SAMEORIGIN framing, referrer policy, permissions policy, a framing/plugin/form CSP; `X-Powered-By` removed; `/reports/*` never cached.
6. **Parent report links** are now 16 random characters (about 93 bits) instead of 9. Existing links keep working.

## Not fixed (needs a decision)
- Cloudinary uploads use an unsigned preset, so the preset name in the browser lets anyone upload files to the account, and uploaded files have public URLs. Fix: signed uploads through a server route (a small build).
- No server-side check that a test is still open when a student submits (the app enforces it in the browser only).

## SEO and speed (fixed)
- Homepage title and description now name the levels and lead with online classes.
- Logo served at 36 KB (`logo/logo-web.png`) instead of the 4 MB original, with fixed dimensions (no layout shift). The default Next.js favicon and starter SVGs moved to `../archive-removed-pages/`.
- Hero and review videos no longer load three YouTube players on page load; they load on tap and play with sound.
- Article pages accept a shorter `seoTitle`; article 1 uses one. `/plan` added to robots disallow.

## UI and audience (fixed)
- "Inside a lesson" tiles collapsed to thin lines on phones; they now have height.
- The trial banner is a single compact row on phones, so the hero's booking button is on the first screen.
- The picker's "Book now on WhatsApp" now opens the booking calendar (one label and one path for booking).
- Copy: "before you hand over a single rupee" → "before you pay anything" (international students); "Twenty minutes" → "One free lesson" (unconfirmed length).
- Small text and tap targets raised (FAQ WhatsApp button 44px, helper text 14px).

# Phase 11: international, Cambridge + Edexcel (2026-10-16)

1. **Exam board step** in the booking calendar (Cambridge / Pearson Edexcel / Not sure); the board goes into the WhatsApp message and the pixel event.
2. **Both boards named** in the hero line, homepage and blog descriptions, footer, Organization and Course data, the grade predictor note and the terms.
3. **Two new FAQs** (homepage and its FAQ data): "Do you teach Edexcel as well as Cambridge?" and "I live in the UK or the Gulf. Can I still join?".
4. **CSP fix**: `form-action` now allows `https://www.facebook.com`; the phase 10 header had blocked the Meta pixel's event posts.
5. No price on the site, by Hamza's decision.

# Phase 12: lean, premium homepage (2026-10-16)

Hamza's direction: fewer words, more space, an Apple-like calm; the homepage is the funnel only.

1. **New homepage** (`LandingPage.tsx` + `HomeSections.tsx`): Hero → Proof (3 facts) → How it works (3 steps) → Choose your class (subject tabs, 3 level cards that open booking) → Same syllabus, opposite experience (4 points) → Meet Hamza → Reviews → Questions → Book. Larger type, 96 to 160px section spacing, no card borders, one gold action per screen.
2. **Hero**: the trial banner is now a small pill above the headline (it opens booking); one line of who and what; one button. Glow, corner marks and eyebrow lines removed.
3. **Removed from the homepage**: grade predictor (now `/tools/grade-predictor`, footer link only, in the sitemap), film grain, vignette, scroll progress bar, magnetic buttons, pulsing LIVE dot, illustration tiles, long comparison lists. Retired components are in `../archive-removed-pages/` (`Sections.before-lean-home.tsx`, `components-landing/`).
4. `Sections.tsx` now only holds the shared `VideoReviewCard` and `FaqItem`.

# Phase 13: restore the visual sections, cut the words (2026-10-16)

Hamza's correction: keep the elements (icons, the comparison, tiles, photo and stats); cut the text, mostly above the fold.

1. **Restored** `Sections.tsx` sections: trust cards with icons, the subject/level picker, "Same syllabus. Opposite experience." comparison, "Inside a lesson" tiles, Meet Hamza (ACCA badge + stats), reviews, FAQ, closing. `PillButton.tsx` restored. The phase 12 version is archived as `HomeSections.lean-v1.tsx`.
2. **Hero** is four things: the trial pill ("Live online ·" shows from tablet width up), the headline, the tagline with its gold underline, one button. The video sits below.
3. **Text cut**: one short line per trust card (the middle card now names Cambridge and Edexcel, O Level to A Level); the picker's helper and "Step two" lines and its extra button removed (level cards open booking); "Inside a lesson" subtitle removed; Meet Hamza down to one paragraph; reviews, FAQ and closing intros shortened; closing has one button.
4. Section spacing raised to 96 / 144px. The grade predictor stays on its own page.

# Phase 14: guides shop page (2026-10-16)

Hamza's direction: keep the homepage as it is (refine only); every extra lives on its own page, linked from the footer.

1. **`/guides`** (`app/guides/page.tsx`): hero ("Written by me, for my students."), four guide cards with code-drawn covers (`components/guides/GuideCover.tsx`), a sample cheat-sheet page, "Why buy from a teacher?", a short FAQ and a "Rather learn it live?" free-lesson box. Footer link "Guides", in the sitemap and `isPublicPath`. Not linked from the homepage body or the header.
2. **Data and launch switch** (`lib/guides.ts`): titles, prices ($9.99 / $19.99), points. Each guide's `buyUrl` is empty, so cards show "Coming soon" plus a WhatsApp "Tell me when it's out" button (pixel event `guide_notify_click`). Paste a checkout link into `buyUrl` and the card becomes "Buy now" (`guide_buy_click`). `BUNDLE` shows only once a price and link are set.
3. **TODO-ASK**: store provider (Lemon Squeezy or Gumroad, both pay out to Pakistan and handle sales tax), bundle price, refund policy, final covers. When the store is chosen, add it to the privacy policy as a payment processor.

# Phase 15: homepage polish, simple words (2026-10-16)

1. **Builder credit removed** everywhere (`GlobalFooter` and `BUILD_CREDIT` deleted from `components/providers.tsx` and `lib/config.ts`), at Hamza's request.
2. **"Inside my classes"** (`components/landing/InsideLesson.tsx`) replaces the old illustration tiles: five cards, each with a small drawing of what it looks like (live Zoom class with Hamza's photo, tonight's recording, a marked weekly test, the portal progress view, a 7 → 11 marks chart) and one plain line. Numbers in the drawings are layout examples.
3. **Section order** (first-time visitor's path): Hero → trust cards → Same syllabus / Opposite experience → reviews → inside my classes → your teacher → pick your class → questions → book. Backgrounds re-alternated.
4. **Copy at a 5th-grade reading level**: trust cards, level cards, the comparison (4 rows each), Meet Hamza, reviews and FAQ headings rewritten in short, simple words. FAQ cut from 8 to 5 (`FAQS` in `lib/landing.ts`).
5. Header logo larger (48 / 56 / 64px). The homepage body links only to booking and WhatsApp; other pages (guides, articles, grade predictor, privacy, terms) are in the footer only.

# Phase 9: one flowing background, tighter hero, review wall (2026-10-16)

1. **Backdrop** (`components/landing/Backdrop.tsx`, styles `.landing-backdrop*` in `globals.css`): one fixed background for every public page. A gold glow follows the cursor (fine pointers), a large ambient gold glow drifts side to side as you scroll, plus a faint blueprint grid and a vignette for depth. Both glows move only with the visitor's own input, so they stay on under reduced motion. Section `bg-band-*` classes were removed so sections blend.
2. **Hero**: less space above the fold (top padding 40/64px instead of 80/128px).
3. **Reviews**: one wall of videos and WhatsApp messages at their real shapes (9:16 video, 900x1524 images), nothing cropped. Swipe rail on phones, staggered five-across row on desktop. `ReviewSlider` is no longer used on the homepage.
4. **FAQ**: centred single column in a soft card, 17px answers, WhatsApp prompt underneath.
5. **Footer**: centred logo, one line and links; the legal line shows "Privacy policy" only (the privacy page links to the terms).

# Phase 10: playful buttons, tighter spacing (2026-10-16)

1. **Magnetic buttons** (`components/landing/Magnetic.tsx`): main buttons lean toward the cursor from 12px away and spring back on leave (mouse and trackpad only). Used by `PillButton` (now magnetic by default), the nav buttons, hero pill and button, FAQ WhatsApp button, and gently on the full-width booking and grade buttons.
2. **Shine and press**: gold buttons get a light sweep on hover (`.btn-shine` in `globals.css`), arrows nudge right, and buttons press in slightly on click.
3. **Card spotlight**: cards marked `data-spot` show a soft gold light under the cursor; the position is set by the one pointer listener in `Backdrop.tsx`. Review cards also lift on hover.
4. **Backdrop defined a little more**: stronger ambient glow plus a faint second glow, and a gold "blueprint" grid (every 4th line) that shows where the glow is.
5. **Spacing**: sections 64/96px top and bottom (was 96/144px); trust strip and hero video spacing reduced to match.

# Phase 11: glass header, floating WhatsApp, cursor companion, new headline (2026-10-16)

1. **Headline** (Hamza's pick): "You know the syllabus. You still lose the marks." in two lines, with a one-line offer under the gold tagline ("Live online classes in Accounting, Business and Economics for O Level, IGCSE, AS and A2. I show you how to write the answers examiners reward.").
2. **Floating WhatsApp button** (`MobileCta.tsx`): round green WhatsApp icon bottom right on every screen size, magnetic, label slides out on hover. The header WhatsApp button is gone. Footer bottom padding leaves room for it on phones.
3. **Glass header** (`Nav.tsx`, `.glass-bar` in `globals.css`): a floating see-through pill with blur and a thin light edge; gains a soft shadow once you scroll. Note: write `backdrop-filter` unprefixed only; the CSS build adds the Safari prefix and drops the standard rule if both are written.
4. **Cursor companion** (`CursorFollower.tsx`, `.cursor-dot` / `.cursor-ring`): a gold dot on the pointer and a trailing ring that grows over anything clickable and squeezes on click. Mouse and trackpad only; the normal cursor stays.
5. **Hero video tilt**: the intro video card tilts slightly toward the cursor (max about 5 degrees).
6. **Spacing**: sections 56/80px top and bottom; heading-to-content gaps 40px.

# Phase 12: calmer cursor, keyword line, new trust cards, no repeats (2026-10-16)

1. **Cursor ring removed** (`CursorFollower.tsx` deleted, its CSS removed). In its place the background grid drifts a few pixels against the cursor (`--gx`/`--gy` in `Backdrop.tsx`): depth with nothing trailing the pointer. The soft gold cursor glow, magnetic buttons and card spotlight stay.
2. **Hero**: the long offer line is replaced by three keywords with thin gold dividers: Accounting | Business | Economics.
3. **Trust cards** (`components/landing/TrustCards.tsx`, replaces the old `TrustBar` in `Sections.tsx`): drawings instead of icons, in the "Inside my classes" style. Your teacher (photo + ACCA / BSc Applied Accountancy chips), What you learn (syllabus card, Cambridge and Edexcel), How I teach (a marked answer with an examiner-style note). The old "Your first lesson: Free" card is gone.
4. **No repeats**: footer drops WhatsApp (floating button), Student login (header) and the tagline line; FAQ's WhatsApp button became a line pointing to the floating button.

# Phase 13: real grade predictor, trust cards, privacy, 404 (2026-10-16)

1. **Grade predictor on official data** (`lib/grade-thresholds.ts` generated from `data/cambridge-grade-thresholds.json`, logic in `lib/grade-predictor.ts`, screen in `GradePredictor.tsx`). Covers Cambridge IGCSE 0452 / 0450 / 0455, O Level 7707 / 7115 / 2281 and AS & A Level 9706 / 9609 / 9708, June 2026 and June 2025 (PDF links in the JSON). Students pick subject, qualification, which paper (June 2026, June 2025, or another paper / mock), the variant, and raw marks per paper (paper totals are fixed from the tables).
   - Exact paper + variant: graded against that paper's published thresholds.
   - Any other paper: graded against every June 2026 and 2025 variant; shows the most common grade (ties go to the lower grade) and the range.
   - Weighting: 0452, 7707, 0455, 2281 and 9706 AS papers use Paper 1 30% / Paper 2 70% (A Level 9706 adds Papers 3 and 4 at face value). Verified against the per-paper thresholds in the same PDFs: weighted totals match Cambridge's option thresholds within 0.5 marks. Business and 9708 are plain sums. Weighted totals are rounded to whole marks.
   - Not covered: staged A Level routes (carried-forward AS) and stand-alone components 50/60.
   - Next session: add the new PDFs' numbers to the JSON and regenerate the TS file.
2. **Trust cards**: "Straight A's in the subjects I teach" (photo + Straight A's / ACCA / BSc chips), "The full Cambridge syllabus", "Why first, then the method" (whiteboard drawing). Meet Hamza stats gain "Straight A's".
3. **Footer**: Instagram shows "@hamzateaches"; "Articles" renamed "Revision notes" across the blog.
4. **Privacy policy** fully rewritten (`app/privacy/page.tsx`). Still a placeholder: contact email. Working defaults to confirm: 12-month retention, 30-day reply, recordings shared only with the class, parent consent under 13.
5. **404 page** (`app/not-found.tsx`): "This page isn't on the syllabus." with home and booking buttons; noindex.

# Phase 14: simpler predictor, Drive reviews, logo intro, SEO copy (2026-10-16)

1. **Grade predictor, 3 steps**: subject, level (Cambridge board shown with the syllabus code), marks. Always uses the "any paper" mode (most likely grade across June 2026 and June 2025 papers, plus the range). The exact-paper mode is still in `predict()` for later. New `outlook()` gives a May/June 2027 safe target (highest recent minimum for the next grade), the raw marks needed on the longest paper, and the 2025 to 2026 trend. `roast()` adds a cheeky one-liner per grade (shown in Caveat). The predictor page's FAQ section and FAQ schema are removed. Edexcel not included (Cambridge only for now).
2. **Reviews**: 7 new videos from Hamza's Drive folder (3 on-camera "Real Stories", 1 selfie, 3 voice-note recordings) added to `lib/reviews.ts` as Drive links; the two existing YouTube shorts stay. The review section is now one swipeable rail with arrow buttons on desktop. Drive files must stay "anyone with the link"; YouTube (unlisted) loads faster and is recommended before launch.
3. **Logo intro** (`IntroLogo.tsx`, `.intro-splash` in `globals.css`): CSS-only, about 1 second; the wordmark writes in left to right, then the cover fades and the hero rises in. Never waits on JavaScript.
4. **Footer**: Guides link hidden (commented out; `/guides` page still exists).
5. **Syllabus card**: "Your whole syllabus, topic by topic", Cambridge or Edexcel.
6. **SEO copy**: subtitles under the picker and "Inside my classes", Cambridge syllabus codes on the level cards, a "Which exam boards and levels do you teach?" FAQ (also in the FAQ schema), keyword-rich Meet Hamza line and photo alt text.

# Phase 15: final front-end polish (2026-10-16)

1. **Project moved** to `~/Documents/@hamzateaches website/site` (pages archived earlier are in `../archive-removed-pages`). Run `npm install --legacy-peer-deps` once after moving; `node_modules` is not copied.
2. **Blog renamed "The Exam Room"** (footer, breadcrumbs, page title "The Exam Room: Accounting, Business and Economics Exam Tips"), intro widened to exam tips and industry articles, header centred. URL stays `/blog`.
3. **Grade predictor**: one centred column (form, then the result, which scrolls into view the first time it appears); page heading centred. The WhatsApp button and message now depend on the grade: A* "Make my A* exam-proof", A "Turn my A into an A*", B/C "Get my plan to reach [next]", D and below "Get my catch-up plan". Reply templates for Hamza are in `../WhatsApp replies for the grade predictor.md`.
4. **Reviews**: centred heading; on desktop the rail opens centred with fading edges and arrows underneath; phones swipe from the first card.
5. **SEO and structure**: `/guides` removed from the sitemap and set to noindex while hidden; hidden "Why students choose..." heading over the trust cards so headings run in order. Checked every public page at 375, 390, 768, 1024 and 1440px: no sideways scroll, one h1, no skipped heading levels, all images have alt text, titles under 80 and descriptions about 145 to 160 characters.

# Phase 16: email, Exam Room, review wall (2026-10-16)

1. **Contact email** `LANDING.email` (override with `NEXT_PUBLIC_CONTACT_EMAIL`) in the privacy policy and the organisation schema. Terms page still has placeholders (fees, refunds, missed classes); it is linked only from the privacy policy.
2. **No builder credit** anywhere on the site (confirmed with Hamza).
3. **The Exam Room** (`/blog`): just the title and the article cards. Filters, intro, breadcrumb and counts removed. Cards wrap and centre, so one or two articles don't sit to the left.
4. **Reviews**: a top-to-bottom wall (CSS columns: 2 on phones, 3 on tablets, 4 on desktop), every review visible, no slider. Generic "Student review" captions show only the review type (On camera / Voice note) until real names are added.
5. **Video previews** (`VideoPlayer.tsx`): the still is shown whole (`object-contain`) over a blurred copy, so portrait Drive recordings and landscape YouTube stills aren't zoom-cropped. The hero preview loads eagerly; the rest lazily.

# Phase 17: shape-matched reviews, terms, no stranded words (2026-10-16)

1. **Reviews** (`Reviews` in `Sections.tsx`, data in `lib/reviews.ts`): three centred rows, in this order: On camera (5 videos, 9:16), Voice notes (4 screen recordings, each its own shape), In their messages (3 screenshots). Every card is exactly the shape of its media (`ratio` per item, `--rh` row height per breakpoint), so there are no empty bands. Captions only appear once a student's first name is added to `name`.
2. **YouTube Shorts previews** use `oar2.jpg` (the still in the video's own shape) instead of the 16:9 `maxresdefault.jpg`.
3. **Terms**: no refunds once paid; Hamza makes up classes he misses or cancels, student-missed classes are not repeated (recording sent the same night). Still a placeholder: when fees are due and how they are paid.
4. **No stranded last words**: headings use `text-wrap: balance`, body text `text-wrap: pretty` (globals.css); short centred subtitles widened to fit one line on desktop and balanced on phones.

# Phase 18: one review wall, plainer copy (2026-10-16)

1. **Reviews**: one combined wall, no group labels or footnote. Order: videos, voice notes, messages. One shared card height (`--rh`: 240 / 280 / 320px) with each card at its media's own shape; on desktop this packs into three even rows. Message names now sit on the screenshot (gradient overlay), so every card in a row is the same height.
2. **Copy cleanup** (removed AI-sounding lines and side comments): the handwritten "this is the whole thing" note; "Same syllabus. Opposite experience." became "Most classes vs my class."; comparison rows rewritten plainly; "Not a big academy. Just me..." rewritten; closing "One free lesson. Then you will know." became "Try a lesson before you decide."; eyebrows now "How it's different", "Reviews", "FAQ", "Free trial lesson"; predictor asides removed ("Brace yourself", "No sugar-coating", "Don't count on...", "The paper you get on the day decides which"); 404 handwritten line removed. The grade one-liners stay (Hamza asked for them).

# Phase 19: final answers from Hamza (2026-10-16)

1. **Google Meet or Zoom** wherever classes are described (class card, privacy, terms).
2. **Online only**: the booking calendar's "Where?" step and the in-person option are removed (`Mode` type gone from `lib/booking.ts`); terms and course descriptions say online. Rawalpindi stays only as where the business is based (privacy, organisation schema).
3. **Trial hours**: Monday to Saturday, slots 1 pm to 8 pm Pakistan time (last ends 9 pm).
4. **Terms complete**: fees monthly in advance; bank transfer, JazzCash or Easypaisa, or card/online for students abroad; no refunds; Hamza makes up only classes he misses. No placeholders left on the terms or privacy pages.
5. **Confirmed**: privacy defaults (12 months, 30 days, recordings class-only, parent agreement under 13), first exam 26 April 2027 with past papers from 1 March, 100+ students and 4+ years.
6. **Still open (Hamza, final stage)**: review uploads with first names and permission; Guides page and PDF prices when the pack is ready.

# Phase 20: phone-only compaction (2026-10-16)

Desktop (md and up) is unchanged from Phase 18; every change below applies below 768px only.

1. **Comparison**: phones get a two-column table (Most classes | My class, `COMPARE` rows); desktop keeps the two approved cards (`hidden md:grid`).
2. **Trust cards and "Inside my classes"**: two cards per row on phones (the wide "Small live classes" and "Why first" cards span both). Drawings shrink with CSS `zoom` (per-card `--z`) so they fill their panel with a small margin; panels size to the drawing. Desktop panel heights (h-40 / h-56) and padding are untouched.
3. **Level cards, FAQ rows, Meet Hamza photo**: tighter padding and type on phones only.
4. **Reviews on phones**: three runs (videos 3 across, voice notes, messages 3 across) with their own heights, a smaller play button and tighter gaps; larger screens keep the one mixed wall.

# Phase 21: pre-launch checklist (2026-10-18)

1. **Cookie consent (UK/EU only)**: the Meta pixel snippet (`components/MetaPixel.tsx`) checks the visitor's time zone; `Europe/*` and a few Atlantic European zones only load the pixel after "That's fine" in `CookieBanner.tsx` (choice stored in `localStorage` key `ht-cookies`). Everyone else loads it straight away. The `<noscript>` pixel image is removed so nothing fires without the check. Privacy policy explains this and has a "Change my cookie choice" button. Note: the inline snippet lives in a template string, so avoid `\/` escapes inside it (they get stripped and break the script).
2. **Tab and home-screen icons**: `app/icon.svg` (gold handwritten "h" on #1B1E21) and `app/apple-icon.tsx` (180 px PNG). The layout no longer uses the wide wordmark as the icon.
3. **Homepage title**: "Accounting, Business & Economics Tuition | Hamza Teaches" (56 characters).
4. **Contrast**: landing `--color-faint` lifted from #868c92 to #969ca2 so small text passes 4.5:1 on cards.
5. **Checked, no change needed**: no broken internal links; secret keys only in server routes (`app/api/*`, `lib/signed-view.ts`); every image has alt text; share image and Twitter image tags present; sitemap and robots present; custom 404; one main call to action.
6. **At launch (hosting side)**: Vercel forces HTTPS by default (check http:// redirects); submit the sitemap in Google Search Console; run PageSpeed Insights on the live URL; test on a real phone; check Meta Events Manager shows PageView and Lead.
