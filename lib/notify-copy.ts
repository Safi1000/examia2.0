/**
 * The words on phone notifications: warm, a little funny, never mean, fine
 * for a parent to read over a shoulder. Written as Hamza ("I"). Each kind
 * has a few versions; the same notification always gets the same version
 * (picked from its ref), so a retry never changes the wording.
 * The fact (what, when, where to tap) always stays in.
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
      { title: `${subject} at ${time} 📚`, body: "Snacks ready, phone charged, brain loading. Join opens 5 minutes before." },
      { title: `${subject} at ${time} 📚`, body: "Quick water break now, class in a bit. The Join button wakes up 5 minutes before." },
      { title: `Chalo, ${subject} at ${time} 📚`, body: "Your seat is saved. Join opens 5 minutes before class." },
      { title: `${subject} at ${time} 📚`, body: "Find your notes, close the 47 tabs. Join opens 5 minutes before." },
    ]);
  if (stage === "open")
    return pick(seed, [
      { title: `${subject} is about to start 🎬`, body: "Doors are open. Tap Join and grab the good seat (they’re all the good seat)." },
      { title: `${subject} in a few minutes 🎬`, body: "Camera on, notes out, tap Join. I’ll be the one talking." },
      { title: `${subject} is about to start 🎬`, body: "Tap Join now and you’re early. Early is the new on time." },
    ]);
  return pick(seed, [
    { title: `${subject} is live now 🔴`, body: "Tap Join. Fashionably late is still late, but you’re still welcome." },
    { title: `${subject} has started 🔴`, body: "I’m live. Tap Join and slide in quietly, nobody saw a thing." },
  ]);
}

/** Groundwork study time, a few minutes before the slot. */
export function studyCopy(seed: string, label: string): Copy {
  return pick(seed, [
    { title: "Study o’clock ⏰", body: `It’s almost ${label}. Your brain booked this meeting. Don’t ghost it.` },
    { title: "Your study slot is here ☕", body: `${label} session time. Phone in another room, timer on, main character energy.` },
    { title: "Groundwork time 🌄", body: `Your ${label} session is up. Future you is already saying thank you.` },
    { title: "Two options at " + label + " 🤔", body: "Scroll for 25 minutes, or get 25 minutes smarter. Open Groundwork and press Start." },
  ]);
}

/** A missed class's recording, closing within a few hours. */
export function recordingCopy(seed: string, subject: string, day: string, closes: string): Copy {
  return pick(seed, [
    { title: `Last call for ${subject} 🎞️`, body: `You missed ${day}’s class. The recording disappears at ${closes}, like it never happened.` },
    { title: `${subject} recording closes at ${closes} ⏳`, body: `${day}’s class self destructs at ${closes}. Mission: watch it before then.` },
    { title: `${subject} misses you 🎞️`, body: `${day}’s recording is open until ${closes}. Popcorn optional, notes not optional.` },
  ]);
}

/** A test opening within the next half hour. */
export function testOpensCopy(seed: string, test: string, time: string): Copy {
  return pick(seed, [
    { title: `${test} opens at ${time} 📝`, body: "Deep breath. Quiet spot, charged phone, pen ready. You’ve got this." },
    { title: `${test} opens at ${time} 📝`, body: "Plot twist: you’re more ready than you think." },
    { title: `Heads up: ${test} at ${time} 📝`, body: "Water, pen, phone on charge. And breathe." },
  ]);
}

/** An assignment due within a day. */
export function assignmentCopy(seed: string, title: string, when: string): Copy {
  return pick(seed, [
    { title: `${title} is due tomorrow ⏳`, body: `Due ${when}. Start today and enjoy the rare feeling of being early.` },
    { title: `${title} is due tomorrow ⏳`, body: `Due ${when}. Today you is the hero tomorrow you needed.` },
    { title: `Tiny reminder: ${title} ⏳`, body: `Due ${when}. Photos of your working are fine. Panic is not required.` },
  ]);
}

/** Marked work released. */
export function resultCopy(seed: string, count: number, test?: string): Copy {
  if (count === 1)
    return pick(seed, [
      { title: "Your result is in ✨", body: `I’ve marked ${test ?? "your test"}. Spoiler: the feedback is the best part.` },
      { title: "Fresh from marking ✨", body: `${test ?? "Your test"} is back. Come see how you did.` },
      { title: "Your result is in ✨", body: `${test ?? "Your test"} is marked. Open it for your marks and my comments.` },
    ]);
  return pick(seed, [
    { title: `${count} results are in ✨`, body: "I’ve marked your tests. Your feedback is waiting." },
    { title: `${count} results just landed ✨`, body: "Marks and comments are ready. Tap to see them." },
  ]);
}

/** Hamza changed a class on the timetable. Clear first, light second. */
export function classChangeCopy(kind: "back" | "cancelled" | "extra" | "moved", name: string, day: string, time = ""): Copy {
  if (kind === "cancelled") return { title: "Class cancelled 🗓️", body: `${name} ${day} is cancelled. Use the time well (a nap counts, briefly).` };
  if (kind === "extra") return { title: "Bonus class 🎁", body: `Extra ${name} class ${day} at ${time}. Same Join button on Home.` };
  if (kind === "moved") return { title: "New class time 🔁", body: `${name} ${day} is now at ${time}. Set an alarm, I’ll set a lesson.` };
  return { title: "Class is back on ✅", body: `${name} ${day} is back at its usual time.` };
}
