/**
 * The words on phone notifications: calm, warm, short, with a light smile
 * now and then. Never pushy, never mean, fine for a parent to read. Written
 * as Hamza ("I"). Each kind has a couple of versions; the same notification
 * always gets the same one (picked from its ref), so a retry never changes
 * it. The fact (what, when, where to tap) always stays in.
 */

/** A stable pick from a list, by text. */
function pick<T>(seed: string, list: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

type Copy = { title: string; body: string };

/** Class reminder: soon (join not open yet), opening, or live now. */
export function classCopy(seed: string, subject: string, time: string, stage: "soon" | "open" | "now"): Copy {
  if (stage === "soon")
    return pick(seed, [
      { title: `${subject} at ${time}`, body: "A good moment for water and your notes. Join opens 5 minutes before." },
      { title: `${subject} at ${time}`, body: "See you soon. The Join button appears 5 minutes before class." },
    ]);
  if (stage === "open")
    return pick(seed, [
      { title: `${subject} is about to start`, body: "Join is open on Home. Your seat is waiting." },
      { title: `${subject} in a few minutes`, body: "Tap Join on Home whenever you’re ready." },
    ]);
  return { title: `${subject} has started`, body: "Tap Join on Home. Come in quietly, you haven’t missed much." };
}

/** Groundwork study time: one a day at most, only if they haven't studied yet. */
export function studyCopy(seed: string, label: string): Copy {
  return pick(seed, [
    { title: "Your study time ☕", body: `It’s nearly ${label}. Twenty five calm minutes is all it takes.` },
    { title: "Groundwork, when you’re ready 🌿", body: `Your ${label} session. Phone in another room, timer on.` },
    { title: "A quiet half hour 🌙", body: `You planned to study at ${label}. Future you will be glad you did.` },
  ]);
}

/** A missed class's recording, closing within a few hours. One a day at most. */
export function recordingCopy(seed: string, subject: string, day: string, closes: string): Copy {
  return pick(seed, [
    { title: `${subject} recording`, body: `You missed ${day}’s class. The recording is open until ${closes}.` },
    { title: `Catch up on ${subject}`, body: `${day}’s recording closes at ${closes}. Worth a watch before then.` },
  ]);
}

/** A test opening within the next half hour. */
export function testOpensCopy(seed: string, test: string, time: string): Copy {
  return pick(seed, [
    { title: `${test} opens at ${time}`, body: "Find a quiet spot and charge your phone. You’ve prepared for this." },
    { title: `${test} opens at ${time}`, body: "Take a breath. Pen, paper, quiet room, and you’re set." },
  ]);
}

/** An assignment due within a day. */
export function assignmentCopy(seed: string, title: string, when: string): Copy {
  return pick(seed, [
    { title: `${title} is due tomorrow`, body: `Due ${when}. Start today and tomorrow stays calm.` },
    { title: `${title} is due tomorrow`, body: `Due ${when}. A photo of your working is all I need.` },
  ]);
}

/** Marked work released. */
export function resultCopy(seed: string, count: number, test?: string): Copy {
  if (count === 1)
    return pick(seed, [
      { title: "Your result is ready ✨", body: `I’ve marked ${test ?? "your test"}. My comments are the useful part.` },
      { title: "Your result is ready ✨", body: `${test ?? "Your test"} is marked. Have a look when you’re free.` },
    ]);
  return { title: `${count} results are ready ✨`, body: "I’ve marked your tests. Have a look when you’re free." };
}

/** Hamza changed a class on the timetable. Clear and short. */
export function classChangeCopy(kind: "back" | "cancelled" | "extra" | "moved", name: string, day: string, time = ""): Copy {
  if (kind === "cancelled") return { title: "Class cancelled", body: `${name} ${day} is cancelled. The time is yours.` };
  if (kind === "extra") return { title: "Extra class", body: `Extra ${name} class ${day} at ${time}. Join from Home as usual.` };
  if (kind === "moved") return { title: "New class time", body: `${name} ${day} is now at ${time}.` };
  return { title: "Class is back on", body: `${name} ${day} is back at its usual time.` };
}
