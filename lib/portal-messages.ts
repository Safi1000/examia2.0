import {
  cap,
  checkIn,
  clean,
  guardMessage,
  joinAnd,
  low,
  lowSubject,
  messageName,
  PARENT_SIGN,
  parentHello,
  studentHello,
  titled,
} from "@/lib/outgoing-message";

/**
 * Every WhatsApp message (and the "Well built" note) the teacher console
 * writes for Hamza, in one place. Each builder takes plain values, drops a
 * clause when an optional detail is missing, and returns text that has been
 * through `guardMessage`.
 *
 * Style (Hamza, 2026-11-11, and 27 Nov: "less AI"): a teacher texting. Lower
 * case like a real text, short, first person "i". The first two messages ever
 * to a person (`intro`, from introNeeded in lib/sent-log.ts) say once who Hamza
 * is ("assalamualaikum, this is Hamza, Ali's economics teacher." / "hi Ali,
 * it's Hamza.") and parent ones end with his name; after that it is just
 * "assalamualaikum." or "hi Ali," and the point. One short plain question
 * where a person would ask one. Never he or she (gender isn't stored): the
 * name, or "they". Never what the portal tracks. Lower case is applied with
 * `low` to subjects, days and dates only, so names, titles, usernames,
 * passwords and links are never changed.
 */

type Who = {
  id: string;
  username: string | null | undefined;
  /** One of the first two messages to this person (parent or student): say who Hamza is. */
  intro: boolean;
};

/** The names and greetings a builder needs, worked out once. */
function people(w: Who, subject?: unknown) {
  const name = messageName(w.username);
  const intro = !!w.intro;
  return {
    name,
    intro,
    hi: studentHello(name, intro),
    hello: parentHello(name, intro, clean(subject)),
    /** "Amelia" or "your child", mid-sentence. */
    who: name || "your child",
    /** "Amelia" or "them", for a second mention. */
    them: name || "them",
    /** "Amelia's" or "your child's". */
    whose: name ? `${name}'s` : "your child's",
  };
}

type P = ReturnType<typeof people>;
const student = (p: P, text: string) => guardMessage(text, checkIn("student", p.name, p.intro));
const parent = (p: P, text: string) => guardMessage(`${text}${p.intro ? PARENT_SIGN : ""}`, checkIn("parent", p.name, p.intro));

/** `"Unit 3 test" (economics)`, `the economics test`, or `the test`. */
function testRef(title: unknown, subject: unknown) {
  const t = clean(title);
  const s = low(subject);
  if (t) return s ? `"${t}" (${s})` : `"${t}"`;
  return s ? `the ${s} test` : "the test";
}

/** "two", "three" ... "ten", then digits. */
const NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => (Number.isInteger(n) && n >= 0 ? (NUMBER[n] ?? String(n)) : "");

// ---- To parents --------------------------------------------------------

export function parentMissedTest(w: Who & { title?: string; subject?: string }) {
  const p = people(w, w.subject);
  return parent(p, `${p.hello} ${p.who} didn't hand in ${testRef(w.title, w.subject)} before it closed. i'll go through it with ${p.them} in class.`);
}

/** Missed every class at their level lately (the fallback when classes can't be told apart by subject). */
export function parentAbsent(w: Who & { streak: number }) {
  const p = people(w);
  const n = inWords(w.streak);
  return parent(p, `${p.hello} ${p.who} has missed the last ${w.streak > 1 && n ? `${n} classes` : "class"}. is everything ok?`);
}

/**
 * Missed the last few classes in one subject. `days` are "tue 18" style,
 * `fine` the subjects they are still coming to.
 */
export function parentSubjectAbsent(w: Who & { subject: string; missed: number; days: string[]; fine?: string[] }) {
  const p = people(w, w.subject);
  const s = lowSubject(w.subject);
  const n = inWords(w.missed);
  const last = w.missed > 1 && n ? `the last ${n} classes` : "the last class";
  const days = joinAnd(w.days.map(low));
  const fine = joinAnd((w.fine ?? []).map(lowSubject));
  return parent(
    p,
    `${p.hello} ${p.who} hasn't been in ${s || "class"} ${last}${days ? ` (${days})` : ""}.${fine ? ` they've been coming to ${fine} fine.` : ""} is everything ok?`,
  );
}

export function parentLowScore(w: Who & { pct: number; title?: string; subject?: string }) {
  const p = people(w, w.subject);
  const pct = Number.isFinite(w.pct) ? `${Math.round(w.pct)}%` : "";
  const result = pct ? `got ${pct} in ${testRef(w.title, w.subject)}` : `found ${testRef(w.title, w.subject)} hard`;
  return parent(p, `${p.hello} ${p.who} ${result}. the marked paper with my comments is on the portal, and i'll go over it with ${p.them} in class.`);
}

/** The report message; the link is added after (above the sign-off) with `withLink`. */
export function parentReport(w: Who & { month?: string }) {
  const p = people(w);
  const month = low(w.month);
  // The link stops 7 days after it is sent (REPORT_LINK_DAYS in lib/report-data).
  return parent(p, `${p.hello} here's ${p.whose} progress report${month ? ` for ${month}` : ""}. the link works for a week.`);
}

/** Today's "Parent" button. `facts` are lower-case clauses that follow the name ("missed X"). With none, it is the check-in. */
export function parentUpdate(w: Who & { facts: string[] }) {
  const p = people(w);
  const said = joinAnd(w.facts);
  if (!said) return parent(p, `${p.hello} how is ${p.who} finding the classes?`);
  return parent(p, `${p.hello} ${p.who} ${said}. i'll pick it up with ${p.them} in class.`);
}

export function parentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w);
  const t = clean(w.title);
  const when = low(w.when);
  const test = t ? `${p.whose} test, "${t}",` : `${p.whose} test`;
  return parent(p, `${p.hello} ${test} closes${when ? ` ${when}` : " soon"} and i haven't got it yet. can you remind ${p.them} to sit it?`);
}

export function parentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w, w.subject);
  const s = low(w.subject);
  const day = low(w.day);
  const close = low(w.close);
  return parent(
    p,
    `${p.hello} ${p.who} wasn't in the ${s ? `${s} class` : "class"}${day ? ` on ${day}` : ""}. the recording is on the portal${close ? ` until ${close}` : ""}, so ${p.them} can still catch up.`,
  );
}

export function parentReopened(w: Who & { title?: string; until?: string }) {
  const p = people(w);
  const until = low(w.until);
  return parent(p, `${p.hello} i've reopened ${titled(w.title, "the test")} for ${p.who}${until ? ` until ${until}` : ""}, so it can still be done on the portal.`);
}

export function parentNotifications(w: Who) {
  const p = people(w);
  return parent(
    p,
    `${p.hello} the portal sends reminders for classes, tests and homework, but they only reach ${p.whose} phone once notifications are on. in the portal: settings, then phone notifications, then turn on. on an iphone, add the portal to the home screen first.`,
  );
}

// ---- To students -------------------------------------------------------

export function studentMissedTest(w: Who & { title?: string }) {
  const p = people(w);
  return student(p, `${p.hi} i didn't get your paper for ${titled(w.title, "the last test")}. we'll go over it in class.`);
}

export function studentLowScore(w: Who) {
  const p = people(w);
  return student(p, `${p.hi} i've marked your last test. it was a hard one, we'll go through it together in class.`);
}

/** Missed the last few classes at their level (the fallback when classes can't be told apart by subject). */
export function studentAbsent(w: Who) {
  const p = people(w);
  return student(p, `${p.hi} you've missed the last few classes. all ok? see you in the next one.`);
}

/** Missed the last few classes in one subject. `days` are "tue 18" style. */
export function studentSubjectAbsent(w: Who & { subject: string; days: string[] }) {
  const p = people(w);
  const s = lowSubject(w.subject);
  const days = joinAnd(w.days.map(low));
  return student(p, `${p.hi} you weren't in ${s || "class"}${days ? ` on ${days}` : " the last few times"}. all ok? see you in the next one.`);
}

export function studentHomeworkMissing(w: Who & { title?: string }) {
  const p = people(w);
  return student(p, `${p.hi} i haven't got ${titled(w.title, "your homework")} from you yet. send it in when it's done.`);
}

export function studentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w);
  const s = low(w.subject);
  const day = low(w.day);
  const close = low(w.close);
  return student(
    p,
    `${p.hi} you weren't in ${s || "class"}${day ? ` on ${day}` : ""}. the recording is on your classes page${close ? ` till ${close}` : ""}, watch it before it goes.`,
  );
}

/** Today's check-in with nothing to report: its one plain question is the whole point. */
export function studentCheckIn(w: Who) {
  const p = people(w);
  return student(p, `${p.hi} how are your classes going?`);
}

/** Today's "New this week" hello, before their first class. */
export function studentWelcome(w: Who) {
  const p = people(w);
  return student(p, `${p.hi} welcome to the classes, glad you're here. if anything on the portal is unclear, just message me here.`);
}

/** Today's "New this week" hello, once their first class is done. */
export function studentFirstClass(w: Who) {
  const p = people(w);
  return student(p, `${p.hi} how was your first class? tell me if anything was unclear and we'll go over it.`);
}

/** Classes page, a few minutes into a live class: the "Remind" button. */
export function studentClassStarted(w: Who & { subject?: string }) {
  const p = people(w);
  const s = low(w.subject);
  return student(p, `${p.hi} ${s ? `${s} has` : "class has"} started. join from the portal, i'm keeping your seat.`);
}

export function studentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w);
  const when = low(w.when);
  return student(p, `${p.hi} ${titled(w.title, "your test")} closes${when ? ` ${when}` : " soon"} and i haven't got your paper yet. sit it before then.`);
}

export function studentHomeworkDue(w: Who & { title?: string; due?: string }) {
  const p = people(w);
  const due = low(w.due);
  return student(p, `${p.hi} ${titled(w.title, "your homework")} is due${due ? ` ${due}` : " soon"}. send it in before then.`);
}

export function studentReopened(w: Who & { title?: string; until?: string; link: string }) {
  const p = people(w);
  const until = low(w.until);
  const link = clean(w.link);
  const text = `${p.hi} i've opened ${titled(w.title, "the test")} again for you${until ? ` until ${until}` : ""}.${link ? ` you can start it here: ${link}` : " it's on your tests page."}`;
  return guardMessage(text, checkIn("student", p.name, p.intro), [link]);
}

export function studentNotifications(w: Who) {
  const p = people(w);
  return student(
    p,
    `${p.hi} the portal sends my reminders for classes, tests and homework. to get them on your phone, open the portal, go to settings, then phone notifications, and tap turn on. on an iphone, add the portal to your home screen first.`,
  );
}

/** "4 hours", "2.5 hours", "45 minutes", or "" when the minutes aren't a sane weekly figure. */
function studyAmount(minutes: number, maxMinutes: number) {
  if (!Number.isFinite(minutes) || minutes < 30 || minutes >= maxMinutes) return "";
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const h = Math.round(minutes / 30) / 2;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

/**
 * The "Well built" note to a student's bell. A bell note inside the portal, not
 * WhatsApp, so it keeps normal capitals and never introduces Hamza. Shows their
 * own week's minutes only when the figure is sane.
 */
export function wellBuilt(w: { id: string; username: string | null | undefined; minutes: number; maxMinutes: number }) {
  const p = people({ ...w, intro: false });
  const amount = studyAmount(w.minutes, w.maxMinutes);
  return student(p, `${cap(p.hi)} well built this week.${amount ? ` ${cap(amount)} of focus shows.` : ""} Keep going.`);
}
