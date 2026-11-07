"use client";

import { useMemo } from "react";

/**
 * The focus timer as a building site: a faint blueprint of an A*, and one
 * gold brick dropping into place at a time, from the ground up, until the
 * grade stands finished when the time is up. Groundwork, literally.
 */
const A = ["..###..", ".##.##.", "##...##", "##...##", "#######", "#######", "##...##", "##...##", "##...##"];
const STAR = ["..#..", ".###.", "#####", ".###.", ".#.#."];
const COLS = 13;
const ROWS = 9;

type Cell = { x: number; y: number };

function cells(): Cell[] {
  const out: Cell[] = [];
  A.forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push({ x, y })));
  STAR.forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push({ x: x + 8, y })));
  // Built like a building: bottom row first, left to right.
  return out.sort((a, b) => b.y - a.y || a.x - b.x);
}

export function BrickTimer({ progress, phase, paused }: { progress: number; phase: "focus" | "rest"; paused: boolean }) {
  const all = useMemo(() => cells(), []);
  const n = all.length;
  const placed = phase === "rest" ? n : Math.min(n, Math.floor(Math.max(0, progress) * n) + (progress > 0 ? 1 : 0));
  const S = 10;
  const G = 1.4;
  const w = COLS * S;
  const h = ROWS * S;

  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className={`h-full w-full overflow-visible transition-opacity duration-500 ${paused ? "opacity-45" : ""}`} role="img" aria-label={`${placed} of ${n} bricks laid`}>
      <defs>
        <linearGradient id="brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={phase === "rest" ? "#A6E3C4" : "#FFD98A"} />
          <stop offset="1" stopColor={phase === "rest" ? "#6FC097" : "#E5A832"} />
        </linearGradient>
      </defs>
      {/* The blueprint */}
      {all.map((c, i) => (
        <rect key={`g${i}`} x={c.x * S + G / 2} y={c.y * S + G / 2} width={S - G} height={S - G} rx={1.6} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={0.5} strokeDasharray="1.5 1.2" />
      ))}
      {/* The bricks laid so far; the newest one drops in. */}
      {all.slice(0, placed).map((c, i) => (
        <rect
          key={`b${i}`}
          x={c.x * S + G / 2}
          y={c.y * S + G / 2}
          width={S - G}
          height={S - G}
          rx={1.6}
          fill="url(#brick)"
          className={i === placed - 1 && phase === "focus" ? "brick-drop" : undefined}
          style={i === placed - 1 && phase === "focus" ? { ["--fall" as string]: `${-(c.y * S + 40)}px` } : undefined}
        />
      ))}
      <style>{`
        .brick-drop { transform-box: fill-box; animation: brick-drop 700ms cubic-bezier(.3,0,.2,1) both; }
        @keyframes brick-drop {
          0% { transform: translateY(var(--fall)); opacity: 0; }
          15% { opacity: 1; }
          72% { transform: translateY(0); }
          84% { transform: translateY(-2.5px); }
          100% { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) { .brick-drop { animation: none; } }
      `}</style>
    </svg>
  );
}
