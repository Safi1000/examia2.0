/**
 * Page 2 of the Starting Point Report: the session, the route to an A*, and
 * the terms. Every fact here comes from what Hamza has already published:
 * the Blueprint offer (session, start date, what is included) and the site's
 * own terms page (app/terms/page.tsx, updated 16 October 2026). If either
 * changes, change it here too.
 */

export const SESSION = {
  name: "The Blueprint",
  exams: "May/June 2027",
  starts: "2 November 2026",
};

/** What every student gets this session. */
export const INCLUDED: Array<{ title: string; detail: string }> = [
  { title: "Live classes", detail: "Five days a week, online, in small groups." },
  { title: "Every class recorded", detail: "Sent the same night, so a missed class is never lost." },
  { title: "Weekly tests", detail: "Made and marked by me, with feedback on every answer." },
  { title: "Full syllabus and past papers", detail: "Every topic in syllabus order, then exam practice." },
  { title: "Past paper window", detail: "March and April are set aside for timed past papers." },
  { title: "Direct line to me", detail: "Questions on WhatsApp, answered by me." },
];

/**
 * The route to an A*, phase by phase. What the class covers comes from the
 * session plan (syllabus in order, past paper window in March and April);
 * the "you" lines are the standard an A* needs.
 */
export const PHASES: Array<{ when: string; title: string; class: string; you: string[] }> = [
  {
    when: "November",
    title: "Foundations",
    class: "The first topics of each course, and your start points fixed.",
    you: ["Tick off your four start points", "Keep your four week commitment"],
  },
  {
    when: "December to February",
    title: "The full syllabus",
    class: "Every topic in syllabus order, with a test every week.",
    you: ["80% or more in weekly tests", "Redo every mistake before the next test"],
  },
  {
    when: "March and April",
    title: "Past paper window",
    class: "Timed past papers, marked against the mark scheme.",
    you: ["Two timed papers a week", "Review every lost mark against the mark scheme"],
  },
  {
    when: "May and June",
    title: "Exams",
    class: "Final papers, and help with any last questions.",
    you: ["Sleep, eat, and trust the work you have done", "Check the timetable for every paper twice"],
  },
];

/** The terms that matter most, shortened from the site's terms page. */
export const TERMS: Array<{ h: string; body: string }> = [
  { h: "Fees and payment", body: "Fees depend on level and number of subjects and are shared privately on WhatsApp. They are paid monthly, in advance, before that month’s classes start, by bank transfer, JazzCash or Easypaisa, or by card or online payment from outside Pakistan." },
  { h: "Refunds", body: "Fees are not refundable once paid, including if a student stops attending partway through." },
  { h: "Missed classes", body: "If I miss or cancel a class, I make it up with an extra class. If a student misses a class, it is not repeated, but the recording is sent the same night." },
  { h: "Recordings, notes and tests", body: "All material is for the enrolled student’s own study. Please do not share, sell or upload it anywhere." },
  { h: "The student portal", body: "Keep your login to yourself and tell me straight away if someone else may have it. I may pause an account that is misused." },
  { h: "Results", body: "I teach the whole syllabus, set and mark weekly practice, and tell you honestly where you stand. Results also depend on your own work, so no tutor can promise a grade." },
];

export const TERMS_NOTE = "Full terms and privacy policy: hamzateaches.com/terms and hamzateaches.com/privacy. Governed by the laws of Pakistan.";
