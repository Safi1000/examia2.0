/**
 * The words on phone notifications: short, human and warm, no emoji. Read like
 * a text from Hamza ("I"), never like an app. A couple of versions each; the
 * same notification always gets the same one (picked from its ref).
 * The fact (what, when) always stays in.
 */

/** A stable pick from a list, by text. */
function pick<T>(seed: string, list: T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

type Copy = { title: string; body: string };

/** A class started a minute or two ago and they haven't joined. */
export function classCopy(seed: string, subject: string, minutesIn: number): Copy {
  const m = minutesIn <= 1 ? "a minute" : `${minutesIn} minutes`;
  return pick(seed, [
    { title: `${subject} has started`, body: "I’m keeping your seat. Tap to join." },
    { title: `${subject} started ${m} ago`, body: "You can still join. Tap to come in." },
    { title: `${subject} is on now`, body: "Come in when you’re ready. Tap to join." },
  ]);
}

/** Groundwork study time: one a day at most, only if they haven't studied yet. */
export function studyCopy(seed: string, label: string): Copy {
  return pick(seed, [
    { title: "Study time", body: `Your ${label} slot. 25 minutes, then you’re free.` },
    { title: `It’s ${label}`, body: "This is the time you picked to study. Start with something small." },
    { title: "Study time", body: "Phone away, timer on. You’ll feel better once you start." },
  ]);
}

/** A missed class's recording, closing within a few hours. One a day at most. */
export function recordingCopy(seed: string, subject: string, day: string, closes: string): Copy {
  return pick(seed, [
    { title: `${subject} recording is up`, body: `${day}’s class is on your Classes page till ${closes}.` },
    { title: `${subject} recording`, body: `It’s there till ${closes}. Ask me if anything in it is unclear.` },
  ]);
}

/** A test opening within the next half hour. */
export function testOpensCopy(seed: string, test: string, time: string): Copy {
  return pick(seed, [
    { title: `Test at ${time}`, body: `${test}. Find a quiet spot and do your best.` },
    { title: `${test} at ${time}`, body: "Quiet room, charged phone. Do your best." },
  ]);
}

/** An assignment due within a day. */
/** New homework set: what it is and when it's due, once. */
export function newHomeworkCopy(seed: string, title: string, when: string): Copy {
  return pick(seed, [
    { title: "New homework", body: `${title}. Due ${when}.` },
    { title: `Homework: ${title}`, body: `Due ${when}. It's on your Homework page.` },
  ]);
}

export function assignmentCopy(seed: string, title: string, when: string, today = false): Copy {
  if (today)
    return pick(seed, [
      { title: "Due today", body: `${title}, ${when}. A photo of your working is enough.` },
      { title: `${title} is due today`, body: "There’s still time. Tell me if you’re stuck on any part." },
    ]);
  return pick(seed, [
    { title: "Due tomorrow", body: `${title}, ${when}. A photo of your working is enough.` },
    { title: `${title} is due tomorrow`, body: "Tell me if you’re stuck on any part." },
  ]);
}

/** Marked work released. */
export function resultCopy(seed: string, count: number, test?: string): Copy {
  if (count === 1)
    return pick(seed, [
      { title: "Marked", body: `${test ?? "Your test"} is back. Have a look at my comments.` },
      { title: `${test ?? "Your test"} is marked`, body: "Read my comments, that’s where the marks are." },
    ]);
  return { title: `${count} tests marked`, body: "They’re back. Have a look at my comments." };
}

/** Hamza changed a class on the timetable. Clear first. */
export function classChangeCopy(kind: "back" | "cancelled" | "extra" | "moved", name: string, day: string, time = ""): Copy {
  const Day = day.charAt(0).toUpperCase() + day.slice(1);
  if (kind === "cancelled") return { title: `${name} cancelled ${day}`, body: "No class this time. I’ll see you in the next one." };
  if (kind === "extra") return { title: `Extra ${name} class`, body: `${Day} at ${time}. Join from Home as usual.` };
  if (kind === "moved") return { title: `${name} moved`, body: `${Day}, now at ${time}.` };
  return { title: `${name} is back on`, body: `${Day}, usual time.` };
}
