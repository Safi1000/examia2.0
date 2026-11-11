import {
  cap,
  checkIn,
  clean,
  count,
  guardMessage,
  joinAnd,
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
 * through `guardMessage`. Students: open the conversation warmly and plainly.
 * Parents: short, factual, respectful, modest about what Hamza will do.
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

/** `"Unit 3 test" (Economics)`, `the Economics test`, or `the test`. */
function testRef(title: unknown, subject: unknown) {
  const t = clean(title);
  const s = clean(subject);
  if (t) return s ? `"${t}" (${s})` : `"${t}"`;
  return s ? `the ${s} test` : "the test";
}

// ---- To parents --------------------------------------------------------

export function parentMissedTest(w: Who & { title?: string; subject?: string }) {
  const p = people(w, "missed_test");
  return parent(
    p,
    `${p.hello} ${cap(p.whose)} paper for ${testRef(w.title, w.subject)} didn't reach me before it closed. I'll go over it with ${p.them} in class. If anything is making things difficult at the moment, I'm happy to talk whenever suits you.`,
  );
}

export function parentAbsent(w: Who & { streak: number }) {
  const p = people(w, "absent_streak");
  const n = count(w.streak, "class", "classes");
  const missed = w.streak > 1 && n ? `the last ${n}` : "the last class";
  return parent(
    p,
    `${p.hello} ${cap(p.who)} has missed ${missed}, and I hope everything is alright. If there is anything I should know, I'm happy to talk whenever suits you.`,
  );
}

export function parentLowScore(w: Who & { pct: number; title?: string; subject?: string }) {
  const p = people(w, "low_score");
  const pct = Number.isFinite(w.pct) ? `${Math.round(w.pct)}%` : "";
  const result = pct ? `got ${pct} in ${testRef(w.title, w.subject)}` : `found ${testRef(w.title, w.subject)} difficult`;
  return parent(
    p,
    `${p.hello} ${cap(p.who)} ${result}. The marked paper with my feedback is on the portal, and I'll go over it with ${p.them} in class. If you can look through the feedback together this week, that would really help. I'm happy to talk whenever suits you.`,
  );
}

/** The report message; the link is added after (above the sign-off) with `withLink`. */
export function parentReport(w: Who & { month?: string }) {
  const p = people(w, "report");
  const month = clean(w.month);
  return parent(
    p,
    `${p.hello} Here is ${p.whose} progress report${month ? ` for ${month}` : ""}. If you'd like to go through any of it together, message me any time.`,
  );
}

/** Today's "Parent" button. `facts` are lower-case clauses that follow the name ("missed X"). */
export function parentUpdate(w: Who & { facts: string[] }) {
  const p = people(w, "update");
  const said = joinAnd(w.facts);
  if (!said)
    return parent(p, `${p.hello} I thought I'd ask how ${p.who} is finding the classes from your side. I'm happy to talk whenever suits you.`);
  return parent(
    p,
    `${p.hello} A short update from class: recently ${p.who} ${said}. I'll follow this up with ${p.them} in class, and I'm happy to talk whenever suits you.`,
  );
}

export function parentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w, "closing");
  const t = clean(w.title);
  const when = clean(w.when);
  const test = t ? `${p.whose} test, "${t}",` : `${p.whose} test`;
  return parent(
    p,
    `${p.hello} ${cap(test)} closes${when ? ` ${when}` : " soon"}, and I haven't received it yet. Could you remind ${p.them} to sit it? I'm happy to talk whenever suits you.`,
  );
}

export function parentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w, "missed_class");
  const s = clean(w.subject);
  const day = clean(w.day);
  const close = clean(w.close);
  return parent(
    p,
    `${p.hello} ${cap(p.who)} wasn't in the ${s ? `${s} class` : "class"}${day ? ` on ${day}` : ""}. The recording is on the portal${close ? ` until ${close}` : ""}, so please encourage ${p.them} to watch it. I'm happy to talk whenever suits you.`,
  );
}

export function parentReopened(w: Who & { title?: string; until?: string }) {
  const p = people(w, "reopened");
  const until = clean(w.until);
  return parent(
    p,
    `${p.hello} I've reopened ${titled(w.title, "the test")} for ${p.who}${until ? ` until ${until}` : ""}, so there is still a chance to sit it on the portal. I'm happy to talk whenever suits you.`,
  );
}

export function parentNotifications(w: Who) {
  const p = people(w, "notify");
  return parent(
    p,
    `${p.hello} The portal sends reminders for classes, tests and homework, and they only reach ${p.whose} phone once notifications are on. In the portal: Settings, then Phone notifications, then Turn on. On an iPhone, add the portal to the Home Screen first. I'm happy to help if it gives any trouble.`,
  );
}

// ---- To students -------------------------------------------------------

export function studentMissedTest(w: Who & { title?: string }) {
  const p = people(w, "missed_test");
  return student(p, `${p.hi} I didn't get your paper for ${titled(w.title, "the last test")}. Is everything okay? Message me when you can.`);
}

export function studentLowScore(w: Who) {
  const p = people(w, "low_score");
  return student(p, `${p.hi} I've marked your last test, and it was a hard one. Would you like to go through it together?`);
}

export function studentAbsent(w: Who) {
  const p = people(w, "absent_streak");
  return student(p, `${p.hi} I've missed you in class the last few times. Is everything alright?`);
}

export function studentHomeworkMissing(w: Who & { title?: string }) {
  const p = people(w, "homework_missing");
  return student(p, `${p.hi} I haven't received ${titled(w.title, "your homework")} yet. Are you stuck on any part of it?`);
}

export function studentMissedClass(w: Who & { subject?: string; day?: string; close?: string }) {
  const p = people(w, "missed_class");
  const s = clean(w.subject);
  const day = clean(w.day);
  const close = clean(w.close);
  return student(
    p,
    `${p.hi} I missed you in ${s ? `${s} class` : "class"}${day ? ` on ${day}` : ""}. The recording is on your Classes page${close ? ` until ${close}` : ""} if you'd like to catch up.`,
  );
}

export function studentCheckIn(w: Who) {
  const p = people(w, "check_in");
  return student(p, `${p.hi} I thought I'd ask how things are going. Message me any time.`);
}

export function studentTestClosing(w: Who & { title?: string; when?: string }) {
  const p = people(w, "closing");
  const when = clean(w.when);
  return student(
    p,
    `${p.hi} ${titled(w.title, "your test")} closes${when ? ` ${when}` : " soon"}, and I haven't received your paper yet. Message me if anything is stopping you.`,
  );
}

export function studentHomeworkDue(w: Who & { title?: string; due?: string }) {
  const p = people(w, "homework_due");
  const due = clean(w.due);
  return student(p, `${p.hi} ${titled(w.title, "your homework")} is due${due ? ` ${due}` : " soon"}. Message me if you're stuck on any part of it.`);
}

export function studentReopened(w: Who & { title?: string; until?: string; link: string }) {
  const p = people(w, "reopened");
  const until = clean(w.until);
  const link = clean(w.link);
  const text = `${p.hi} I've opened ${titled(w.title, "the test")} again for you${until ? ` until ${until}` : ""}.${link ? ` You can start it here: ${link}` : " It's on your Tests page."}`;
  return guardMessage(text, checkIn("student", p.seed, p.name), [link]);
}

export function studentNotifications(w: Who) {
  const p = people(w, "notify");
  return student(
    p,
    `${p.hi} the portal sends my reminders for classes, tests and homework, and I'd like them to reach your phone. Open the portal, go to Settings, then Phone notifications, and tap Turn on. On an iPhone, add the portal to your Home Screen first.`,
  );
}

/** "4 hours", "2.5 hours", "45 minutes", or "" when the minutes aren't a sane weekly figure. */
function studyAmount(minutes: number, maxMinutes: number) {
  if (!Number.isFinite(minutes) || minutes < 30 || minutes >= maxMinutes) return "";
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const h = Math.round(minutes / 30) / 2;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
}

/** The "Well built" note to a student's bell. Shows their own week's minutes only when the figure is sane. */
export function wellBuilt(w: Who & { minutes: number; maxMinutes: number }) {
  const p = people(w, "well_built");
  const amount = studyAmount(w.minutes, w.maxMinutes);
  return student(p, `${p.hi} well built this week.${amount ? ` ${cap(amount)} of focus shows.` : ""} Keep going.`);
}
