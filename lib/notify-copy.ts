/**
 * The words on phone notifications: short, human, a small smile. Read like
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
    { title: `${subject} has started 👀`, body: "Your seat’s getting cold. Tap to join." },
    { title: `${subject} started ${m} ago`, body: "Still time. Tap to join 🏃" },
    { title: `${subject} is on 👀`, body: "Come in, I saved you a seat." },
  ]);
}

/** Groundwork study time: one a day at most, only if they haven't studied yet. */
export function studyCopy(seed: string, label: string): Copy {
  return pick(seed, [
    { title: "Study time ☕", body: `Your ${label} slot. 25 minutes, then you’re free.` },
    { title: `It’s ${label} 📖`, body: "You said you’d study now. I’m just saying." },
    { title: "Study time ☕", body: "Phone away, timer on. You know the drill." },
  ]);
}

/** A missed class's recording, closing within a few hours. One a day at most. */
export function recordingCopy(seed: string, subject: string, day: string, closes: string): Copy {
  return pick(seed, [
    { title: `Missed ${subject}?`, body: `${day}’s recording is up till ${closes}.` },
    { title: `${subject} recording 🎬`, body: `Gone at ${closes}. Worth 40 minutes, promise.` },
  ]);
}

/** A test opening within the next half hour. */
export function testOpensCopy(seed: string, test: string, time: string): Copy {
  return pick(seed, [
    { title: `Test at ${time} 📝`, body: `${test}. You’ve got this.` },
    { title: `${test} at ${time} 📝`, body: "Quiet room, charged phone. Go get it." },
  ]);
}

/** An assignment due within a day. */
export function assignmentCopy(seed: string, title: string, when: string): Copy {
  return pick(seed, [
    { title: "Due tomorrow ⏳", body: `${title}, ${when}. A photo of your working does it.` },
    { title: `${title} is due tomorrow`, body: "Do it today, thank yourself tomorrow." },
  ]);
}

/** Marked work released. */
export function resultCopy(seed: string, count: number, test?: string): Copy {
  if (count === 1)
    return pick(seed, [
      { title: "Marked ✅", body: `${test ?? "Your test"} is back. Have a look.` },
      { title: `${test ?? "Your test"} is marked ✅`, body: "Read my comments, that’s where the marks are." },
    ]);
  return { title: `${count} tests marked ✅`, body: "They’re back. Have a look." };
}

/** Hamza changed a class on the timetable. Clear first. */
export function classChangeCopy(kind: "back" | "cancelled" | "extra" | "moved", name: string, day: string, time = ""): Copy {
  const Day = day.charAt(0).toUpperCase() + day.slice(1);
  if (kind === "cancelled") return { title: `${name} cancelled ${day}`, body: "Enjoy the free hour 🙌" };
  if (kind === "extra") return { title: `Extra ${name} class`, body: `${Day} at ${time}. Join from Home as usual.` };
  if (kind === "moved") return { title: `${name} moved`, body: `${Day}, now at ${time}.` };
  return { title: `${name} is back on`, body: `${Day}, usual time.` };
}
