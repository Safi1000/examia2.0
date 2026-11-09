"use client";

/**
 * Groundwork's background sound and lock-screen timer.
 *
 * The sounds are made on the phone (no files to download, nothing to licence)
 * as a short seamless loop, then played by an ordinary audio element. That is
 * what lets them keep playing with the screen locked or another app open, the
 * way YouTube's sound does, and what puts the timer on the lock screen and in
 * the notification shade (Media Session), with Pause and Play that work.
 */

export type Sound = "off" | "rain" | "waves" | "brown";

export const SOUNDS: Array<{ id: Sound; label: string }> = [
  { id: "off", label: "Silence" },
  { id: "rain", label: "Rain" },
  { id: "waves", label: "Waves" },
  { id: "brown", label: "Deep hum" },
];

const RATE = 22050;
const urls = new Map<Exclude<Sound, "off">, string>();

/** A seamless loop of the sound, as a WAV file in memory (made once per visit). */
function loopUrl(kind: Exclude<Sound, "off">): string {
  const hit = urls.get(kind);
  if (hit) return hit;
  // Waves swell every 12 s, so the loop is two swells long.
  const seconds = 24;
  const fade = Math.floor(RATE * 0.5);
  const len = RATE * seconds + fade;
  const d = new Float32Array(len);
  const lp = (fc: number) => 1 - Math.exp((-2 * Math.PI * fc) / RATE);
  const a = lp(kind === "rain" ? 1500 : kind === "waves" ? 650 : 420);
  let walk = 0;
  let y = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Rain: bright noise. Waves and hum: a slow random walk (brown noise), softer and deeper.
    const x = kind === "rain" ? white : (walk = (walk + 0.02 * white) / 1.02) * 3.5;
    y += a * (x - y);
    let v = y;
    if (kind === "waves") {
      const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i / RATE)) / 12);
      v *= 0.3 + 0.7 * env ** 1.5;
    }
    d[i] = v;
  }
  // Even loudness, whatever the random draw.
  let sum = 0;
  for (let i = 0; i < len; i++) sum += d[i] * d[i];
  const rms = Math.sqrt(sum / len) || 1;
  const target = kind === "rain" ? 0.05 : kind === "waves" ? 0.07 : 0.09;
  // The last half second is blended into the first, so the loop has no click.
  const out = new Int16Array(len - fade);
  for (let i = 0; i < out.length; i++) {
    let v = d[i];
    if (i < fade) v = v * (i / fade) + d[len - fade + i] * (1 - i / fade);
    out[i] = Math.max(-1, Math.min(1, (v / rms) * target)) * 32767;
  }
  const url = URL.createObjectURL(wav(out));
  urls.set(kind, url);
  return url;
}

function wav(pcm: Int16Array): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

/** One audio element for the whole visit, so the phone treats it as the media playing. */
let el: HTMLAudioElement | null = null;
let playing: Sound = "off";

/** Play (or switch to) a sound. Call from a tap the first time: phones only allow sound that a tap started. */
export function playSound(kind: Sound) {
  if (typeof window === "undefined") return;
  if (kind === "off") return stopSound();
  if (!el) {
    el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.setAttribute("playsinline", "");
  }
  if (playing !== kind) {
    el.src = loopUrl(kind);
    playing = kind;
  }
  void el.play().catch(() => {});
}

export function pauseSound() {
  el?.pause();
}

export function stopSound() {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  playing = "off";
}

export const soundPlaying = () => !!el && !el.paused;

// ---- Lock screen and notification shade (Media Session) ----

type MediaActions = { play: () => void; pause: () => void; stop: () => void };

/** Show the session on the lock screen with a countdown bar; Pause and Play drive the timer. */
export function showOnLockScreen(info: { title: string; subject: string; totalMs: number; leftMs: number; paused: boolean }, actions: MediaActions) {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms) return;
  try {
    ms.metadata = new MediaMetadata({
      title: info.title,
      artist: `Groundwork · ${info.subject}`,
      album: "Hamza Teaches",
      artwork: [
        { src: "/brand-icons/app-512.png?v=2", sizes: "512x512", type: "image/png" },
        { src: "/brand-icons/app-192.png?v=2", sizes: "192x192", type: "image/png" },
      ],
    });
    ms.playbackState = info.paused ? "paused" : "playing";
    const total = Math.max(1, info.totalMs / 1000);
    ms.setPositionState?.({ duration: total, position: Math.min(total, Math.max(0, (info.totalMs - info.leftMs) / 1000)), playbackRate: 1 });
    const set = (a: MediaSessionAction, h: (() => void) | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {}
    };
    set("play", actions.play);
    set("pause", actions.pause);
    set("stop", actions.stop);
    // A countdown can't be dragged.
    set("seekto", null);
    set("seekbackward", null);
    set("seekforward", null);
  } catch {}
}

export function clearLockScreen() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms) return;
  try {
    ms.metadata = null;
    ms.playbackState = "none";
    for (const a of ["play", "pause", "stop"] as MediaSessionAction[]) ms.setActionHandler(a, null);
  } catch {}
}

// ---- The chime ----

let ctx: AudioContext | null = null;

/** Make (or wake) the chime's audio. Only from a tap. */
export function wakeChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctx || ctx.state === "closed") ctx = new Ctx();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  } catch {}
}

/** A soft two-note chime and a buzz, at the end of a focus block or a break. */
export function chime() {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
  if (!ctx || ctx.state === "closed") return;
  try {
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    const c = ctx;
    [660, 880].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.25 + 0.9);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + i * 0.25);
      o.stop(c.currentTime + i * 0.25 + 1);
    });
  } catch {}
}

// ---- A clock that keeps ticking in the background ----

/**
 * Calls `fn` about every `ms`. Browsers slow ordinary timers to once a minute
 * in a hidden tab; a tiny worker's timer isn't slowed, so the floating timer
 * and lock screen stay current. Falls back to a normal timer.
 */
export function backgroundTicker(fn: () => void, ms: number): () => void {
  try {
    const src = URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${ms})`], { type: "text/javascript" }));
    const w = new Worker(src);
    w.onmessage = fn;
    return () => {
      w.terminate();
      URL.revokeObjectURL(src);
    };
  } catch {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
}
