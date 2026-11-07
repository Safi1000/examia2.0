"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The floating timer: a small always-on-top window, like a YouTube video in
 * picture-in-picture, so the countdown stays in view while a student reads a
 * note, opens a past paper or switches apps.
 *
 * Desktop Chrome and Edge get a real mini window with a Pause button
 * (Document Picture-in-Picture). Everywhere else that can float a video
 * (Android, Safari on Mac, iPhone and iPad) gets the timer drawn into a
 * silent video, whose own Play and Pause buttons drive the timer.
 */

export type FloatView = {
  leftMs: number;
  totalMs: number;
  phase: "focus" | "rest";
  paused: boolean;
  subject: string;
  intention?: string;
};
type Actions = { pause: () => void; resume: () => void };
export type FloatKind = "doc" | "video" | null;

type DocPip = { requestWindow: (o?: { width?: number; height?: number }) => Promise<Window>; window: Window | null };
const docPip = () => (typeof window !== "undefined" ? (window as Window & { documentPictureInPicture?: DocPip }).documentPictureInPicture : undefined);

/** Can this browser float a canvas drawn into a video? */
function canVideo(): boolean {
  if (typeof window === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return false;
  const v = document.createElement("video") as HTMLVideoElement & { webkitSupportsPresentationMode?: (m: string) => boolean };
  return (!!document.pictureInPictureEnabled && typeof v.requestPictureInPicture === "function") || !!v.webkitSupportsPresentationMode?.("picture-in-picture");
}

export function floatKind(): FloatKind {
  if (typeof window === "undefined") return null;
  if (docPip()) return "doc";
  return canVideo() ? "video" : null;
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
};

/** Set once the mini window has failed to open in this browser. */
let docBlocked = false;

const GOLD = "#FBC159";
const MINT = "#7FD1A6";

/** Draw the timer for the video float (16:9). */
function drawFrame(c: HTMLCanvasElement, v: FloatView) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width;
  const H = c.height;
  const accent = v.phase === "rest" ? MINT : GOLD;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#14181b");
  g.addColorStop(1, "#0c0e10");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, W * 0.7);
  glow.addColorStop(0, v.phase === "rest" ? "rgba(127,209,166,.18)" : "rgba(251,193,89,.16)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const font = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif";

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `700 22px ${font}`;
  const label = (v.paused ? "PAUSED" : v.phase === "rest" ? "BREAK" : "FOCUS") + (v.phase === "focus" ? `  ·  ${v.subject.toUpperCase()}` : "");
  ctx.fillText(label.slice(0, 40), 40, 58);

  ctx.fillStyle = v.paused ? "rgba(255,255,255,.55)" : "#ffffff";
  ctx.font = `200 ${v.leftMs >= 3600_000 ? 128 : 156}px ${font}`;
  ctx.fillText(clock(v.leftMs), 34, 222);

  if (v.intention && v.phase === "focus") {
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = `500 24px ${font}`;
    const t = v.intention.length > 42 ? `${v.intention.slice(0, 41)}…` : v.intention;
    ctx.fillText(t, 40, 272);
  } else if (v.phase === "rest") {
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = `500 24px ${font}`;
    ctx.fillText("Stand up, drink some water.", 40, 272);
  }

  const done = v.totalMs ? 1 - v.leftMs / v.totalMs : 0;
  const y = H - 46;
  ctx.fillStyle = "rgba(255,255,255,.12)";
  roundRect(ctx, 40, y, W - 80, 8, 4);
  ctx.fillStyle = accent;
  roundRect(ctx, 40, y, Math.max(8, (W - 80) * Math.min(1, Math.max(0, done))), 8, 4);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** Copy the page's styles into the mini window so it looks like the portal. */
function copyStyles(to: Window) {
  for (const ss of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(ss.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const s = to.document.createElement("style");
      s.textContent = css;
      to.document.head.appendChild(s);
    } catch {
      if (ss.href) {
        const l = to.document.createElement("link");
        l.rel = "stylesheet";
        l.href = ss.href;
        to.document.head.appendChild(l);
      }
    }
  }
  to.document.documentElement.className = document.documentElement.className;
  to.document.documentElement.setAttribute("style", document.documentElement.getAttribute("style") ?? "");
  to.document.body.className = `${document.body.className} focus-dark`;
}

/**
 * The floating timer for a running session. `view` is read live; the returned
 * `portal` must be rendered (it is the mini window's content on desktop).
 */
export function useFloatTimer(view: FloatView, actions: Actions, enabled: boolean) {
  const [kind] = useState<FloatKind>(() => floatKind());
  const [docWin, setDocWin] = useState<Window | null>(null);
  const [videoOn, setVideoOn] = useState(false);
  const viewRef = useRef(view);
  const actRef = useRef(actions);
  useEffect(() => {
    viewRef.current = view;
    actRef.current = actions;
  });

  // ---- Video float: a canvas, streamed into a silent video, kept ready so a tap can float it at once.
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const ours = useRef(false);

  useEffect(() => {
    if (!kind || !enabled || !canVideo()) return;
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 360;
    drawFrame(c, viewRef.current);
    const v = document.createElement("video") as HTMLVideoElement & { autoPictureInPicture?: boolean };
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    // In the page but out of sight: a hidden video can't float.
    v.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
    try {
      v.srcObject = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(4);
    } catch {
      return;
    }
    document.body.appendChild(v);
    void v.play().catch(() => {});
    // Its own Play and Pause buttons (in the float, or on the lock screen) drive the timer.
    const onPause = () => {
      if (ours.current) return;
      if (document.pictureInPictureElement === v || (v as unknown as { webkitPresentationMode?: string }).webkitPresentationMode === "picture-in-picture") actRef.current.pause();
    };
    const onPlay = () => {
      if (ours.current) return;
      if (viewRef.current.paused) actRef.current.resume();
    };
    const onEnter = () => setVideoOn(true);
    const onLeave = () => {
      setVideoOn(false);
      // Back in the page: keep the stream going for next time.
      if (v.paused) void v.play().catch(() => {});
    };
    v.addEventListener("pause", onPause);
    v.addEventListener("play", onPlay);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    const onPresent = () => {
      const mode = (v as unknown as { webkitPresentationMode?: string }).webkitPresentationMode;
      if (mode === "picture-in-picture") onEnter();
      else onLeave();
    };
    v.addEventListener("webkitpresentationmodechanged", onPresent);
    canvas.current = c;
    video.current = v;
    return () => {
      v.removeEventListener("pause", onPause);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
      v.removeEventListener("webkitpresentationmodechanged", onPresent);
      if (document.pictureInPictureElement === v) void document.exitPictureInPicture().catch(() => {});
      (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
      v.remove();
      canvas.current = null;
      video.current = null;
      setVideoOn(false);
    };
  }, [kind, enabled]);

  // Redraw as the timer moves (the page calls this from its own ticking clock).
  const paint = useCallback(() => {
    if (canvas.current) drawFrame(canvas.current, viewRef.current);
  }, []);
  useEffect(() => {
    paint();
    const v = video.current;
    if (!v || !videoOn) return;
    // Keep the float's own Play/Pause button showing the timer's state.
    ours.current = true;
    if (view.paused && !v.paused) {
      // Let a "Paused" frame through first.
      const t = setTimeout(() => {
        v.pause();
        ours.current = false;
      }, 400);
      return () => clearTimeout(t);
    }
    if (!view.paused && v.paused) void v.play().catch(() => {});
    ours.current = false;
  }, [view.leftMs, view.paused, view.phase, view.subject, view.intention, videoOn, paint]);

  const open = useCallback(async () => {
    if (kind === "doc" && !docBlocked) {
      const pip = docPip();
      if (pip?.window) return pip.window.focus();
      try {
        if (!pip) throw new Error("no document pip");
        const w = await pip.requestWindow({ width: 340, height: 240 });
        copyStyles(w);
        const root = w.document.createElement("div");
        root.style.height = "100%";
        w.document.body.style.margin = "0";
        w.document.body.appendChild(root);
        w.addEventListener("pagehide", () => setDocWin(null));
        setDocWin(w);
        (w as Window & { __root?: HTMLElement }).__root = root;
        return;
      } catch {
        // Not allowed here (an embedded browser, a policy). The failed try used up the tap,
        // so the next tap floats the video instead.
        docBlocked = true;
        return;
      }
    }
    const v = video.current as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void }) | null;
    if (!v) return;
    try {
      if (v.paused) void v.play().catch(() => {});
      if (typeof v.requestPictureInPicture === "function" && document.pictureInPictureEnabled) await v.requestPictureInPicture();
      else v.webkitSetPresentationMode?.("picture-in-picture");
    } catch {}
  }, [kind]);

  const close = useCallback(() => {
    if (docWin) docWin.close();
    if (video.current && document.pictureInPictureElement === video.current) void document.exitPictureInPicture().catch(() => {});
    const v = video.current as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void; webkitPresentationMode?: string }) | null;
    if (v?.webkitPresentationMode === "picture-in-picture") v.webkitSetPresentationMode?.("inline");
  }, [docWin]);

  // Closing the session closes the float.
  useEffect(() => {
    if (!enabled && docWin) docWin.close();
  }, [enabled, docWin]);
  useEffect(() => () => docPip()?.window?.close(), []);

  // Desktop Chrome can float on its own when the student switches tab, if a sound is playing.
  useEffect(() => {
    if (!enabled || !kind || typeof navigator === "undefined" || !navigator.mediaSession) return;
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => void open());
    } catch {}
    return () => {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {}
    };
  }, [enabled, kind, open]);

  const root = (docWin as (Window & { __root?: HTMLElement }) | null)?.__root;
  const portal: ReactNode = root ? createPortal(<MiniTimer view={view} actions={actions} />, root) : null;
  return { kind, active: !!docWin || videoOn, open, close, paint, portal };
}

/** The desktop mini window's content. */
function MiniTimer({ view, actions }: { view: FloatView; actions: Actions }) {
  const rest = view.phase === "rest";
  const done = view.totalMs ? 1 - view.leftMs / view.totalMs : 0;
  return (
    <div className="flex h-full select-none flex-col justify-between bg-[#0f1214] p-5 text-white" style={{ fontFamily: "inherit" }}>
      <div className="flex items-center justify-between gap-3">
        <p className={`truncate text-[11px] font-semibold uppercase tracking-[0.22em] ${rest ? "text-[#7FD1A6]" : "text-[#FBC159]"}`}>
          {view.paused ? "Paused" : rest ? "Break" : `Focus · ${view.subject}`}
        </p>
      </div>
      <div>
        <p className={`text-[64px] font-extralight leading-none tabular-nums tracking-[-0.04em] ${view.paused ? "text-white/55" : "text-white"}`}>{clock(view.leftMs)}</p>
        {view.intention && !rest && <p className="mt-2 truncate text-sm text-white/65">{view.intention}</p>}
        {rest && <p className="mt-2 text-sm text-white/65">Stand up, drink some water.</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${rest ? "bg-[#7FD1A6]" : "bg-[#FBC159]"}`} style={{ width: `${Math.max(2, Math.min(100, done * 100))}%` }} />
        </div>
        <button
          type="button"
          onClick={() => (view.paused ? actions.resume() : actions.pause())}
          className="h-9 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-black active:scale-[0.97]"
        >
          {view.paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
