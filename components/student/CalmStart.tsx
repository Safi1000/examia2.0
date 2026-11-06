"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { pkDate } from "@/lib/timetable";
import { SCENES, greeting, quoteFor, sceneFor, type Scene } from "@/lib/groundwork";
import { fmtMin, type FreeTime, type PlanItem } from "@/lib/groundwork-plan";
import { StudyRoomStrip } from "@/components/student/StudyRoom";

/**
 * Groundwork's start screen, in the spirit of a calm new-tab page: a scene
 * (sky and hills drawn in code), the time, a greeting, today's one thing,
 * a way to start, and a quote. Tap the scene name to change it.
 */
export function CalmStart({
  name,
  meId,
  nowMs,
  plan,
  free,
  onStart,
}: {
  name: string;
  meId: string;
  nowMs: number;
  plan: PlanItem[];
  free: FreeTime;
  onStart: (item: PlanItem | null) => void;
}) {
  const { profile, updateProfile } = useAuth();
  const scene = sceneFor(profile.scene, nowMs);
  const quote = quoteFor(nowMs);
  const today = pkDate(nowMs);
  const focus = profile.today?.date === today ? profile.today : null;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const time = new Date(nowMs).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(/\s?[ap]m$/i, "");
  const ampm = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Karachi" }).format(nowMs)) < 12 ? "am" : "pm";

  const nextScene = () => {
    const i = SCENES.findIndex((s) => s.id === scene.id);
    updateProfile({ scene: SCENES[(i + 1) % SCENES.length].id });
  };
  const saveFocus = () => {
    const text = draft.trim().slice(0, 80);
    if (!text) return;
    updateProfile({ today: { date: today, text } });
    setDraft("");
    setEditing(false);
  };
  const sessions = Math.floor(free.minutes / 30);

  return (
    <section key={scene.id} className="calm relative isolate flex min-h-[78dvh] flex-col overflow-hidden rounded-[28px] text-white shadow-[0_30px_80px_-30px_rgba(0,0,0,.6)]" style={{ background: scene.sky }}>
      <Sky scene={scene} />

      <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-7 sm:pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80">Groundwork</p>
        <button
          type="button"
          onClick={nextScene}
          className="h-9 rounded-full bg-white/12 px-3.5 text-xs font-medium text-white/90 backdrop-blur-md transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={`Scene: ${scene.name}. Change scene`}
        >
          {scene.name} ↻
        </button>
      </div>

      <div className="relative z-10 flex flex-col items-center px-5 pt-8 text-center [text-shadow:0_1px_14px_rgba(0,0,0,.35)] sm:px-7">
        <p className="calm-time font-extralight tabular-nums leading-none tracking-[-0.04em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,.25)]">
          {time}
          <span className="ml-1 align-top text-[0.22em] font-medium tracking-normal text-white/80">{ampm}</span>
        </p>
        <h1 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.01em] text-white sm:text-[1.9rem]">
          {greeting(nowMs)}, {name}.
        </h1>
        <p className="mt-1.5 text-sm text-white/80">
          {free.inClass
            ? "You're in class. Groundwork is here after."
            : free.minutes >= 20
              ? <>You have <span className="font-semibold text-white">{fmtMin(free.minutes)}</span> before {free.until}{sessions >= 1 ? `: room for ${sessions === 1 ? "one session" : `${Math.min(sessions, 6)} sessions`}.` : "."}</>
              : "A short session still counts."}
        </p>
      </div>

      <div className="relative z-10 mt-6 px-3 sm:px-6">
        <DayStrip free={free} nowMs={nowMs} />
      </div>

      {/* Today: what is actually worth doing, from their own tests, homework and weak topics. */}
      <div className="relative z-10 mx-3 mt-4 rounded-[22px] border border-white/15 bg-black/30 p-2 backdrop-blur-xl sm:mx-6">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">Today&apos;s plan</p>
        <ul className="space-y-1">
          {focus && !editing && (
            <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <button
                type="button"
                onClick={() => updateProfile({ today: { ...focus, done: !focus.done } })}
                aria-pressed={!!focus.done}
                aria-label={focus.done ? "Mark not done" : "Mark done"}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm transition ${focus.done ? "border-white bg-white text-black" : "border-white/70 hover:bg-white/15"}`}
              >
                {focus.done ? "✓" : ""}
              </button>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">My one thing</span>
                <span className={`block truncate font-semibold text-white ${focus.done ? "line-through decoration-white/60" : ""}`}>{focus.text}</span>
              </span>
              <button type="button" onClick={() => (setDraft(focus.text), setEditing(true))} className="h-10 shrink-0 px-2 text-xs font-medium text-white/60 hover:text-white">
                Change
              </button>
            </li>
          )}
          {plan.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onStart(it)}
                className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/10 active:bg-white/15"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold ${KIND_STYLE[it.kind]}`} aria-hidden>
                  {KIND_ICON[it.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    {it.tag} · {it.subject}
                  </span>
                  <span className="block truncate font-semibold text-white">{it.title}</span>
                  <span className="block text-xs text-white/65">{it.why}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition group-hover:bg-white group-hover:text-black">
                  {it.href ? "Open" : `${it.minutes} min`}
                </span>
              </button>
            </li>
          ))}
          {!plan.length && !focus && !editing && (
            <li className="px-3 py-2.5 text-sm text-white/75">Nothing urgent today. Pick a subject and keep the habit going.</li>
          )}
        </ul>
        {editing || (!focus && !plan.length) ? (
          <form
            className="flex items-center gap-2 px-3 pb-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              saveFocus();
            }}
          >
            <label htmlFor="calm-focus" className="sr-only">
              Your one thing today
            </label>
            <input
              id="calm-focus"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={80}
              autoComplete="off"
              placeholder="My one thing today…"
              className="h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-4 text-base text-white outline-none placeholder:text-white/50 focus:border-white/70"
            />
            <button type="submit" className="h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-black">
              Add
            </button>
          </form>
        ) : (
          !focus && (
            <button type="button" onClick={() => setEditing(true)} className="mx-3 mb-1 h-10 text-sm font-medium text-white/70 hover:text-white">
              + Add my own
            </button>
          )
        )}
      </div>

      <div className="relative z-10 mt-5 flex flex-col items-center gap-4 px-5 pb-6 sm:px-7">
        <button
          type="button"
          onClick={() => onStart(plan.find((p) => !p.href) ?? null)}
          className="inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-white text-base font-semibold text-black shadow-[0_12px_30px_-10px_rgba(0,0,0,.6)] transition active:scale-[0.98]"
        >
          Start studying
        </button>
        <StudyRoomStrip meId={meId} onJoin={() => onStart(null)} className="w-full max-w-sm [text-shadow:0_1px_8px_rgba(0,0,0,.4)]" />
      </div>

      <figure className="relative z-10 mx-auto mt-auto max-w-lg px-6 pb-7 text-center [text-shadow:0_1px_10px_rgba(0,0,0,.45)]">
        <blockquote className="text-sm leading-relaxed text-white/85 [text-wrap:balance]">“{quote.q}”</blockquote>
        <figcaption className="mt-1 text-xs text-white/60">{quote.by}</figcaption>
      </figure>

      {scene.photo && scene.by && (
        <a href={scene.link} target="_blank" rel="noreferrer" className="absolute bottom-2 right-3 z-10 text-[11px] text-white/55 transition hover:text-white">
          Photo: {scene.by} / Unsplash
        </a>
      )}

      <style>{`
        .calm-photo { animation: calm-in 1.2s ease-out both; }
        @keyframes calm-in { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: none; } }
        .calm-time { font-size: clamp(4rem, 18vw, 6.5rem); }
        .calm-drift { animation: calm-drift 40s ease-in-out infinite alternate; }
        .calm-twinkle { animation: calm-twinkle 4s ease-in-out infinite alternate; }
        @keyframes calm-drift { from { transform: translate3d(-4%, 0, 0); } to { transform: translate3d(4%, -2%, 0); } }
        @keyframes calm-twinkle { from { opacity: .35; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .calm-drift, .calm-twinkle, .calm-photo { animation: none; } }
      `}</style>
    </section>
  );
}

const KIND_ICON: Record<PlanItem["kind"], string> = { test: "T", homework: "H", review: "↻", mission: "★" };
const KIND_STYLE: Record<PlanItem["kind"], string> = {
  test: "bg-[#FBC159] text-black",
  homework: "bg-white text-black",
  review: "bg-[#8FD0F5] text-black",
  mission: "bg-white/20 text-white",
};

const clockOf = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).replace(":00", "").replace(/\s/g, "");

/** 8 am to 10 pm as one bar: classes in gold, the time already gone dimmed, now marked. */
function DayStrip({ free, nowMs }: { free: FreeTime; nowMs: number }) {
  const span = free.dayEndMs - free.dayStartMs;
  const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - free.dayStartMs) / span) * 100));
  const first = free.classes[0];
  const last = free.classes[free.classes.length - 1];
  return (
    <div className="px-2" role="img" aria-label={first ? `Today: classes from ${first.subject} to ${last.subject}` : "Today, no classes"}>
      <div className="relative">
        <div className="relative h-3 overflow-hidden rounded-full bg-white/15 backdrop-blur-md">
          <div className="absolute inset-y-0 left-0 bg-black/35" style={{ width: `${pct(nowMs)}%` }} />
          {free.classes.map((c) => (
            <div key={c.startMs} className="absolute inset-y-0 border-x border-black/20 bg-[#FBC159]/90" style={{ left: `${pct(c.startMs)}%`, width: `${pct(c.endMs) - pct(c.startMs)}%` }} />
          ))}
        </div>
        {nowMs > free.dayStartMs && nowMs < free.dayEndMs && (
          <span className="absolute -top-1 h-5 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,.9)]" style={{ left: `${pct(nowMs)}%` }} aria-hidden />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] font-medium text-white/70">
        <span className="absolute left-0">8am</span>
        {first && (
          // Classes run late (to 9:30 pm): pin the label to the right so it never sits on "10pm".
          <span className="absolute whitespace-nowrap text-[#FFD98A]" style={{ right: `${Math.max(0, 100 - pct(last.endMs))}%` }}>
            {clockOf(first.startMs)} to {clockOf(last.endMs)} classes
          </span>
        )}
        {(!first || pct(last.endMs) < 70) && <span className="absolute right-0">10pm</span>}
      </div>
    </div>
  );
}

/** Stars, glow and three hill lines, drawn as SVG; or the photo, with a shade for the text. */
function Sky({ scene }: { scene: Scene }) {
  if (scene.photo) {
    return (
      <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
        <picture>
          <source media="(min-width: 768px)" srcSet={`/wallpapers/${scene.photo}.jpg`} />
          <img src={`/wallpapers/${scene.photo}-m.jpg`} alt="" className="calm-photo absolute inset-0 h-full w-full object-cover" decoding="async" fetchPriority="high" />
        </picture>
        <div
          className="absolute inset-0"
          style={{
            background: scene.light
              ? "linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.18) 30%,rgba(0,0,0,.22) 60%,rgba(0,0,0,.6))"
              : "linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.05) 30%,rgba(0,0,0,.1) 60%,rgba(0,0,0,.55))",
          }}
        />
      </div>
    );
  }
  const hill = (base: number, amp: number, phase: number) => {
    let d = `M0 100 L0 ${base}`;
    for (let x = 0; x <= 100; x += 2) d += ` L${x} ${(base + Math.sin(x / 9 + phase) * amp + Math.sin(x / 3.3 + phase * 2) * amp * 0.25).toFixed(2)}`;
    return `${d} L100 100 Z`;
  };
  return (
    <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
      <div className="calm-drift absolute -inset-10" style={{ background: `radial-gradient(45% 35% at 70% 30%, ${scene.glow}, transparent 70%)` }} />
      {scene.stars && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {STARS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="white" className={i % 3 === 0 ? "calm-twinkle" : ""} style={{ animationDelay: `${(i % 7) * 0.6}s` }} />
          ))}
        </svg>
      )}
      <svg className="absolute inset-x-0 bottom-0 h-[42%] w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d={hill(38, 9, 1)} fill={scene.hills[0]} />
        <path d={hill(58, 8, 2.4)} fill={scene.hills[1]} />
        <path d={hill(78, 6, 4)} fill={scene.hills[2]} />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.08),transparent_35%,transparent_60%,rgba(0,0,0,.35))]" />
    </div>
  );
}

// Fixed star positions (x, y, radius) in the top half, so they never jump.
const STARS: Array<[number, number, number]> = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 37.7) % 100;
  const y = ((i * 53.3) % 55) + 2;
  return [x, y, i % 5 === 0 ? 0.28 : 0.14];
});
