"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import logo from "@/logo/logo-web.png";
import { Icon } from "@/components/ui";
import { SCENES, type Scene } from "@/lib/groundwork";

/**
 * Proud moments, shareable: draws a story-sized card (1080 × 1920) in the
 * brand look and opens the phone's share sheet (Instagram, WhatsApp,
 * Facebook…). Where a browser can't share images, it shows the card with
 * Download, WhatsApp and Facebook instead.
 */
export interface Moment {
  /** Small line at the top, e.g. "Groundwork · this week". */
  kicker: string;
  /** The big line, e.g. "#1 in my class". */
  big: string;
  /** One supporting line, e.g. "6 h 40 min of study". */
  sub: string;
  name: string;
  scene?: Scene;
}

const SITE = "hamzateaches.com";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Wraps text to a width; returns the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawMoment(m: Moment): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const scene = m.scene ?? SCENES.find((s) => s.id === "gunmetal")!;
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";

  // Sky: take the colour stops of the scene's last linear gradient.
  const stops = [...scene.sky.matchAll(/(#[0-9a-f]{6})\s+(\d+)%/gi)].map((x) => [x[1], Number(x[2]) / 100] as const);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  (stops.length ? stops : ([["#1b2226", 0], ["#323e44", 1]] as const)).forEach(([col, at]) => g.addColorStop(at, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.32, 0, W * 0.7, H * 0.32, W * 0.8);
  glow.addColorStop(0, scene.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // A photo scene: the tall wallpaper, cover-cropped, instead of drawn hills.
  let photoDone = false;
  if (scene.photo) {
    try {
      const img = await loadImage(`/wallpapers/${scene.photo}-m.jpg`);
      const k = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
      const shade = ctx.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, "rgba(0,0,0,.55)");
      shade.addColorStop(0.45, "rgba(0,0,0,.15)");
      shade.addColorStop(1, "rgba(0,0,0,.65)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      photoDone = true;
    } catch {}
  }
  // Hills.
  const hill = (base: number, amp: number, col: string, phase: number) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base + Math.sin(x / 190 + phase) * amp + Math.sin(x / 70 + phase * 2) * amp * 0.25);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  if (!photoDone) {
    hill(H * 0.66, 60, scene.hills[0], 1);
    hill(H * 0.74, 50, scene.hills[1], 2.4);
    hill(H * 0.83, 40, scene.hills[2], 4);
  }

  // Card text.
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fbc159";
  ctx.font = `700 34px ${font}`;
  ctx.fillText(m.kicker.toUpperCase().split("").join(String.fromCharCode(8202)), 96, 360);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 132px ${font}`;
  const big = wrap(ctx, m.big, W - 192);
  big.forEach((l, i) => ctx.fillText(l, 96, 520 + i * 140));
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `500 50px ${font}`;
  const subY = 520 + (big.length - 1) * 140 + 100;
  wrap(ctx, m.sub, W - 192).forEach((l, i) => ctx.fillText(l, 96, subY + i * 64));
  ctx.fillStyle = "#fbc159";
  ctx.fillRect(96, subY + 60, 120, 8);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 46px ${font}`;
  ctx.fillText(m.name, 96, H - 300);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `500 34px ${font}`;
  ctx.fillText(`Studying with Hamza Teaches · ${SITE}`, 96, H - 240);
  if (photoDone && scene.by) {
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.font = `400 24px ${font}`;
    ctx.fillText(`Photo: ${scene.by} / Unsplash`, 96, H - 120);
  }
  try {
    const img = await loadImage(logo.src);
    const w = 360;
    ctx.drawImage(img, 96, 150, w, (img.height / img.width) * w);
  } catch {}
  return new Promise((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
}

export function ShareMoment({ moment, label = "Share", className }: { moment: Moment; label?: string; className?: string }) {
  const [fallback, setFallback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = `${moment.big}. ${moment.sub}. Studying with Hamza Teaches: https://www.${SITE}`;

  async function share() {
    setBusy(true);
    try {
      const blob = await drawMoment(moment);
      const file = new File([blob], "hamza-teaches.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text }).catch(() => {});
      } else {
        setFallback(URL.createObjectURL(blob));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-busy={busy}
        className={className ?? "inline-flex h-9 items-center gap-1.5 rounded-full border border-brand/40 px-4 text-sm font-semibold text-ink transition hover:bg-brand hover:text-on-brand"}
      >
        <Icon.Share className="h-4 w-4" />
        {busy ? "Making your card…" : label}
      </button>
      {fallback &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Share your card" onClick={() => setFallback(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fallback} alt="Your share card" className="mx-auto max-h-[55dvh] rounded-xl" />
              <div className="mt-4 grid gap-2">
                <a href={fallback} download="hamza-teaches.png" className="inline-flex h-11 items-center justify-center rounded-full bg-brand text-sm font-semibold text-on-brand">
                  Download for Instagram
                </a>
                <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-full border border-border-strong text-sm font-semibold text-ink">
                  Share on WhatsApp
                </a>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://www.${SITE}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-full border border-border-strong text-sm font-semibold text-ink">
                  Share on Facebook
                </a>
                <button type="button" onClick={() => setFallback(null)} className="h-10 text-sm text-ink-3">
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
