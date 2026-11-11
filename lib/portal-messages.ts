import {
  cap,
  checkIn,
  clean,
  count,
  guardMessage,
  joinAnd,
  low,
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
 * Style (Hamza, 2026-11-11): lower case like a real text, one way. State the
 * fact and, where useful, the one thing to do, then end: no "happy to talk",
 * no questions (only the plain check-ins ask one). Lower case is written into
 * the wording and applied with `low` to subjects, days and dates only, so
 * names, titles, usernames, passwords and links are never changed.
 */

type Who = { id: string; username: string | null | undefined };

/** The names and greetings a builder needs, worked out once. */
function people(w: Who, kind: string) {
  const name = messageName(w.username);
  const seed = `${w.id}|${kind}`;
  return {
    name,
    seed,
    hi: studentHello(seed, name),
    hello: parentHello(seed),
    /** "Amelia" or "your child", mid-sentence. */
    who: name || "your child",
    /** "Amelia" or "them", for a second mention. */
    them: name || "them",
    /** "Amelia's" or "your child's". */
    whose: name ? `${name}'s` : "your child's",
  };
}

const student = (p: ReturnType<typeof people>, text: string) => guardMessage(text, checkIn("student", p.seed, p.name));
const parent = (p: ReturnType<typeof people>, text: string) => guardMessage(`${text}${PARENT_SIGN}`, checkIn("parent", p.seed, p.name));

/** `"Unit 3 test" (economics)`, `the economics test`, or `the test`. */
function testRef(title: unknown, subject: unknown) {
  const t = clean(title);
  const s = low(subject);
  if (t) return s ? `"${t}" (${s})` : `"${t}"`;
  return s ? `the ${s} test` : "the test";
}

// ---- To parents --------------------------------------------------------

export function parentMissedTest(w: Who & { title?: string; subject?: string }) {
  const p = people(w, "missed_test");
  return parent(p, `${p.hello} ${p.whose} paper for ${testRef(w.title, w.subject)} didn't reach me before it closed. i'll go over it with ${p.them} in class.`);
}

export function parentAbsent(w: Who & { streak: number }) {
  const p = people(w, "absent_streak");
  const n = count(w.streak, "class", "classes");
  const missed = w.streak > 1 && n ? `the last ${n}` : "the last class";
  return parent(p, `${p.hello} ${p.who} has missed ${missed}. i hope everything is alright.`);
}

export function parentLowScore(w: Who & { pct: number; title?: string; subject?: string }) {
  const p = people(w, "low_score");
  const pct = Number.isFinite(w.pct) ? `${Math.round(w.pct)}%` : "";
  const result = pct ? `got ${pct} in ${testRef(w.title, w.subject)}` : `found ${testRef(w.title, w.subject)} difficult`;
  return parent(p, `${p.hello} ${p.who} ${result}. the marked paper with my feedback is on the portal. i'll go over it with ${p.them} in class.`);
}

/** The report message; the link is added after (above the sign-off) with `withLink`. */
export function parentReport(w: Who & { month?: string }) {
  const p = people(w, "report");
  const month = low(w.month);
  return parent(p, `${p.hello} here is ${p.whose} progress report${month ? ` for ${month}` : ""}.`);
}

/** Today's "Parent" button. `facts` are lower-case clauses that follow the name ("missed X"). With none, it is the check-in. */
export function parentUpdate(w: Who & { facts: string[] }) {
  const p = people(w, "update");
  const said = joinAnd(w.facts);
  if (!said) return parent(p, `${p.hello} how is ${p.who} finding the classes from your side?`);
  return parent(p, `${p.hello} a short update: recently ${p.who} ${said}. i'll follow this up with ${p.them} in class.`);
}

export function parentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w, "closing");
  const t = clean(w.title);
  const when = low(w.when);
  const test = t ? `${p.whose} test, "${t}",` : `${p.whose} test`;
  return parent(p, `${p.hello} ${test} closes${when ? ` ${when}` : " soon"} and i haven't received it yet. please remind ${p.them} to sit it.`);
}

export function parentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w, "missed_class");
  const s = low(w.subject);
  const day = low(w.day);
  const close = low(w.close);
  return parent(
    p,
    `${p.hello} ${p.who} wasn't in the ${s ? `${s} class` : "class"}${day ? ` on ${day}` : ""}. the recording is on the portal${close ? ` until ${close}` : ""}, please make sure it gets watched.`,
  );
}

export function parentReopened(w: Who & { title?: string; until?: string }) {
  const p = people(w, "reopened");
  const until = low(w.until);
  return parent(p, `${p.hello} i've reopened ${titled(w.title, "the test")} for ${p.who}${until ? ` until ${until}` : ""}, so it can still be sat on the portal.`);
}

export function parentNotifications(w: Who) {
  const p = people(w, "notify");
  return parent(
    p,
    `${p.hello} the portal sends reminders for classes, tests and homework, and they only reach ${p.whose} phone once notifications are on. in the portal: settings, then phone notifications, then turn on. on an iphone, add the portal to the home screen first.`,
  );
}

// ---- To students -------------------------------------------------------

export function studentMissedTest(w: Who & { title?: string }) {
  const p = people(w, "missed_test");
  return student(p, `${p.hi} i didn't get your paper for ${titled(w.title, "the last test")}. we'll go over it in class.`);
}

export function studentLowScore(w: Who) {
  const p = people(w, "low_score");
  return student(p, `${p.hi} i've marked your last test, it was a hard one. we'll go through it together in class.`);
}

export function studentAbsent(w: Who) {
  const p = people(w, "absent_streak");
  return student(p, `${p.hi} i've missed you in class the last few times. hope all is well, see you in the next one.`);
}

export function studentHomeworkMissing(w: Who & { title?: string }) {
  const p = people(w, "homework_missing");
  return student(p, `${p.hi} i haven't received ${titled(w.title, "your homework")} yet. send it in when it's done.`);
}

export function studentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w, "missed_class");
  const s = low(w.subject);
  const day = low(w.day);
  const close = low(w.close);
  return student(
    p,
    `${p.hi} missed you in ${s || "class"}${day ? ` on ${day}` : ""}. the recording is on your classes page${close ? ` till ${close}` : ""}, watch it before it closes.`,
  );
}

/** Today's check-in with nothing to report: its one plain question is the whole point. */
export function studentCheckIn(w: Who) {
  const p = people(w, "check_in");
  return student(p, `${p.hi} how are things going with your studies?`);
}

export function studentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w, "closing");
  const when = low(w.when);
  return student(
    p,
    `${p.hi} ${titled(w.title, "your test")} closes${when ? ` ${when}` : " soon"} and i haven't received your paper yet. make sure you sit it before then.`,
  );
}

export function studentHomeworkDue(w: Who & { title?: string; due?: string }) {
  const p = people(w, "homework_due");
  const due = low(w.due);
  return student(p, `${p.hi} ${titled(w.title, "your homework")} is due${due ? ` ${due}` : " soon"}. send it in before then.`);
}

export function studentReopened(w: Who & { title?: string; until?: string; link: string }) {
  const p = people(w, "reopened");
  const until = low(w.until);
  const link = clean(w.link);
  const text = `${p.hi} i've opened ${titled(w.title, "the test")} again for you${until ? ` until ${until}` : ""}.${link ? ` you can start it here: ${link}` : " it's on your tests page."}`;
  return guardMessage(text, checkIn("student", p.seed, p.name), [link]);
}

export function studentNotifications(w: Who) {
  const p = people(w, "notify");
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
 * The "Well built" note to a student's bell. A bell note, not WhatsApp, so it
 * keeps normal capitals. Shows their own week's minutes only when the figure is sane.
 */
export function wellBuilt(w: Who & { minutes: number; maxMinutes: number }) {
  const p = people(w, "well_built");
  const amount = studyAmount(w.minutes, w.maxMinutes);
  return student(p, `${cap(p.hi)} well built this week.${amount ? ` ${cap(amount)} of focus shows.` : ""} Keep going.`);
}
