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

const BROKEN = /\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|[{}]/;
/**
 * The last check before a notification leaves. If a detail it is built from is missing, or the
 * words came out broken, the plain version goes instead: nobody gets "undefined has started".
 */
function sure(parts: unknown[], copy: Copy, plain: Copy): Copy {
  const missing = parts.some((v) => v === null || v === undefined || (typeof v === "number" ? !Number.isFinite(v) : !String(v).trim()));
  return missing || BROKEN.test(`${copy.title} ${copy.body}`) ? plain : copy;
}

/** A class started a minute or two ago and they haven't joined. */
export function classCopy(seed: string, subject: string, minutesIn: number): Copy {
  const m = minutesIn <= 1 ? "a minute" : `${minutesIn} minutes`;
  const copy = pick(seed, [
    { title: `${subject} has started`, body: "I’m keeping your seat. Tap to join." },
    { title: `${subject} started ${m} ago`, body: "You can still join. Tap to come in." },
    { title: `${subject} is on now`, body: "Come in when you’re ready. Tap to join." },
  ]);
  return sure([subject, minutesIn], copy, { title: "Your class has started", body: "You can still join. Tap to come in." });
}

/** Groundwork study time: one a day at most, only if they haven't studied yet. */
export function studyCopy(seed: string, label: string): Copy {
  const copy = pick(seed, [
    { title: "Study time", body: `Your ${label} slot. 25 minutes, then you’re free.` },
    { title: `It’s ${label}`, body: "This is the time you picked to study. Start with something small." },
    { title: "Study time", body: "Phone away, timer on. You’ll feel better once you start." },
  ]);
  return sure([label], copy, { title: "Study time", body: "This is the time you picked to study. Start with something small." });
}

/** A missed class's recording, closing within a few hours. One a day at most. */
export function recordingCopy(seed: string, subject: string, day: string, closes: string): Copy {
  // One way, like every reminder: the fact, and where to find it.
  const copy = pick(seed, [
    { title: `${subject} recording is up`, body: `${day}’s class is on your Classes page till ${closes}.` },
    { title: `${subject} recording`, body: `It’s on your Classes page till ${closes}.` },
  ]);
  return sure([subject, day, closes], copy, { title: "A class recording is up", body: "It’s on your Classes page." });
}

/** A test opening within the next half hour. */
export function testOpensCopy(seed: string, test: string, time: string): Copy {
  const copy = pick(seed, [
    { title: `Test at ${time}`, body: `${test}. Find a quiet spot and do your best.` },
    { title: `${test} at ${time}`, body: "Quiet room, charged phone. Do your best." },
  ]);
  return sure([test, time], copy, { title: "A test opens soon", body: "Quiet room, charged phone. Do your best." });
}

/** An assignment due within a day. */
/** New homework set: what it is and when it's due, once. */
export function newHomeworkCopy(seed: string, title: string, when: string): Copy {
  const copy = pick(seed, [
    { title: "New homework", body: `${title}. Due ${when}.` },
    { title: `Homework: ${title}`, body: `Due ${when}. It's on your Homework page.` },
  ]);
  return sure([title, when], copy, { title: "New homework", body: "It's on your Homework page." });
}

export function assignmentCopy(seed: string, title: string, when: string, today = false): Copy {
  const plain = { title: today ? "Homework due today" : "Homework due tomorrow", body: "It’s on your Homework page." };
  if (today)
    return sure(
      [title, when],
      pick(seed, [
        { title: "Due today", body: `${title}, ${when}. A photo of your working is enough.` },
        { title: `${title} is due today`, body: "There’s still time. A photo of your working is enough." },
      ]),
      plain,
    );
  return sure(
    [title, when],
    pick(seed, [
      { title: "Due tomorrow", body: `${title}, ${when}. A photo of your working is enough.` },
      { title: `${title} is due tomorrow`, body: "It’s on your Homework page. A photo of your working is enough." },
    ]),
    plain,
  );
}

/** Marked work released. */
export function resultCopy(seed: string, count: number, test?: string): Copy {
  const name = test?.trim() || "Your test";
  if (count === 1)
    return sure(
      [name],
      pick(seed, [
        { title: "Marked", body: `${name} is back. Have a look at my comments.` },
        { title: `${name} is marked`, body: "Read my comments, that’s where the marks are." },
      ]),
      { title: "Marked", body: "Your test is back. Have a look at my comments." },
    );
  return sure([count], { title: `${count} tests marked`, body: "They’re back. Have a look at my comments." }, { title: "Tests marked", body: "They’re back. Have a look at my comments." });
}

/** Hamza changed a class on the timetable. Clear first. */
export function classChangeCopy(kind: "back" | "cancelled" | "extra" | "moved", name: string, day: string, time = ""): Copy {
  const Day = String(day ?? "").charAt(0).toUpperCase() + String(day ?? "").slice(1);
  // A change with a detail missing still tells them to look, without guessing the detail.
  const plain = { title: "A class time has changed", body: "Your timetable is on your Classes page." };
  if (kind === "cancelled") return sure([name, day], { title: `${name} cancelled ${day}`, body: "No class this time. I’ll see you in the next one." }, plain);
  if (kind === "extra") return sure([name, day, time], { title: `Extra ${name} class`, body: `${Day} at ${time}. Join from Home as usual.` }, plain);
  if (kind === "moved") return sure([name, day, time], { title: `${name} moved`, body: `${Day}, now at ${time}.` }, plain);
  return sure([name, day], { title: `${name} is back on`, body: `${Day}, usual time.` }, plain);
}
