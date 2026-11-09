"use client";

import { useMemo } from "react";

/**
 * The focus timer as a building site. The plan of an A* is only a whisper
 * until it is built (the next few spots are marked out like scaffolding);
 * a little builder in a gold hard hat walks to each spot and swings his
 * hammer, and one gold brick drops into place at a time, from the ground up,
 * until the grade stands finished when the time is up. Groundwork, literally.
 * The builder is our own character, drawn from plain shapes. The phone app's
 * built-in Groundwork (mobile/src/features/groundwork/BrickTimer.tsx) matches.
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

const S = 10;
const G = 1.4;
// The builder, in the same units as a brick (one brick is 10 x 10).
const BW = 8;
const BH = 11;

export function BrickTimer({ progress, phase, paused }: { progress: number; phase: "focus" | "rest"; paused: boolean }) {
  const all = useMemo(() => cells(), []);
  const n = all.length;
  const placed = phase === "rest" ? n : Math.min(n, Math.floor(Math.max(0, progress) * n) + (progress > 0 ? 1 : 0));
  const w = COLS * S;
  const h = ROWS * S;
  const building = phase === "focus" && !paused && placed > 0;
  const done = phase === "rest";

  // The builder stands just left of the next brick, on the row below it (or on the ground before the first).
  const target = placed < n ? all[placed] : all[n - 1];
  const bx = placed === 0 ? -BW - 1 : Math.max(-BW + 1, target.x * S - BW + 2);
  const by = (placed === 0 ? h : target.y * S + S) - BH;

  return (
    <svg
      viewBox={`-12 -14 ${w + 20} ${h + 17}`}
      className={`h-full w-full overflow-visible transition-opacity duration-500 ${paused ? "opacity-60" : ""}`}
      role="img"
      aria-label={done ? "A star built" : `${placed} of ${n} bricks laid`}
    >
      <defs>
        <linearGradient id="brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={done ? "#A6E3C4" : "#FFD98A"} />
          <stop offset="1" stopColor={done ? "#6FC097" : "#E5A832"} />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF8E1" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="built">
          {all.map((c, i) => (
            <rect key={`c${i}`} x={c.x * S + G / 2} y={c.y * S + G / 2} width={S - G} height={S - G} rx={1.6} />
          ))}
        </clipPath>
      </defs>

      {/* The ground */}
      <rect x={-10} y={h + 0.6} width={w + 16} height={0.6} rx={0.3} fill="rgba(255,255,255,.08)" />

      {/* The plan: a whisper until it is built; the next few spots are marked out. */}
      {all.slice(placed).map((c, i) => {
        const soon = phase === "focus" && placed > 0 && i < 3;
        return (
          <rect
            key={`g${c.x},${c.y}`}
            x={c.x * S + G / 2}
            y={c.y * S + G / 2}
            width={S - G}
            height={S - G}
            rx={1.6}
            fill={soon ? "none" : "rgba(255,255,255,.025)"}
            stroke={soon ? "rgba(251,193,89,.4)" : "none"}
            strokeWidth={0.5}
            strokeDasharray={soon ? "1.5 1.2" : undefined}
          />
        );
      })}

      {/* The bricks laid so far; the newest one drops in, with a puff of dust. */}
      {all.slice(0, placed).map((c, i) => {
        const newest = i === placed - 1 && phase === "focus";
        return (
          <rect
            key={`b${c.x},${c.y}`}
            x={c.x * S + G / 2}
            y={c.y * S + G / 2}
            width={S - G}
            height={S - G}
            rx={1.6}
            fill="url(#brick)"
            className={newest ? "brick-drop" : undefined}
          />
        );
      })}
      {building ? (
        <ellipse key={`d${placed}`} className="brick-dust" cx={all[placed - 1].x * S + S / 2} cy={all[placed - 1].y * S + S - 0.5} rx={S * 0.7} ry={1.6} fill="rgba(240,237,232,.45)" />
      ) : null}

      {/* The finished A* catches the light. */}
      {done ? (
        <g clipPath="url(#built)">
          <rect className="brick-shine" x={-30} y={-5} width={30} height={h + 10} fill="url(#shine)" />
        </g>
      ) : null}

      {/* The builder: walks to each spot, hops up a row, swings his hammer. */}
      <g className="builder-walk" style={{ transform: `translate(${bx}px, ${by}px)` }}>
        <g key={`h${target.x},${target.y},${done}`} className={done ? "builder-cheer" : building ? "builder-hop" : undefined}>
          {/* Hammer, pivoting at the hand */}
          <g className={building ? "builder-hammer" : undefined} style={{ transformOrigin: "6.6px 7.6px", transform: paused ? "rotate(20deg)" : undefined }}>
            <rect x={6.1} y={3} width={0.9} height={4.8} rx={0.4} fill="#B0B6BB" />
            <rect x={4.9} y={2.4} width={3.3} height={1.6} rx={0.4} fill="#E5A832" />
          </g>
          {/* Hard hat */}
          <path d="M1.8 3 A2.7 2.7 0 0 1 7.2 3 Z" fill="#FBC159" />
          <rect x={1.1} y={2.7} width={6.8} height={0.9} rx={0.45} fill="#E5A832" />
          {/* Face */}
          <rect x={2.2} y={3.6} width={4.6} height={3.4} rx={1.4} fill="#F2E3CF" />
          <circle cx={3.6} cy={4.9} r={0.38} fill="#1B1E21" />
          <circle cx={5.4} cy={4.9} r={0.38} fill="#1B1E21" />
          <path d="M3.9 5.9 Q4.5 6.4 5.1 5.9" stroke="#1B1E21" strokeWidth={0.35} fill="none" strokeLinecap="round" />
          {/* Overalls and belt */}
          <rect x={2} y={7} width={5} height={3} rx={1} fill="#3A3F45" />
          <rect x={2} y={8.1} width={5} height={0.6} fill="#FBC159" />
          <rect x={6.4} y={7.2} width={1.4} height={0.9} rx={0.45} fill="#3A3F45" />
          {/* Legs */}
          <rect className={building ? "builder-leg-l" : undefined} x={3} y={10} width={1.2} height={1.6} rx={0.5} fill="#2A2E33" />
          <rect className={building ? "builder-leg-r" : undefined} x={4.9} y={10} width={1.2} height={1.6} rx={0.5} fill="#2A2E33" />
        </g>
      </g>

      <style>{`
        .brick-drop { transform-box: fill-box; transform-origin: 50% 100%; animation: brick-drop 520ms cubic-bezier(.3,0,.2,1) both; }
        @keyframes brick-drop {
          0% { transform: translateY(-26px) scaleY(1.15) scaleX(.9); opacity: 0; }
          20% { opacity: 1; }
          62% { transform: translateY(1px) scaleX(1.12) scaleY(.82); }
          82% { transform: translateY(-1px) scaleX(.97) scaleY(1.04); }
          100% { transform: none; }
        }
        .brick-dust { transform-box: fill-box; transform-origin: center; animation: brick-dust 650ms ease-out 300ms both; }
        @keyframes brick-dust { 0% { opacity: 0; transform: scale(.4); } 20% { opacity: .6; } 100% { opacity: 0; transform: scale(1.6); } }
        .builder-walk { transition: transform 560ms cubic-bezier(.45,0,.25,1); }
        .builder-hop { animation: builder-hop 520ms cubic-bezier(.3,0,.3,1); }
        @keyframes builder-hop { 0% { transform: translateY(0); } 40% { transform: translateY(-3px); } 100% { transform: translateY(0); } }
        .builder-hammer { animation: builder-hammer 920ms cubic-bezier(.4,0,.3,1) infinite; }
        @keyframes builder-hammer { 0% { transform: rotate(0); } 28% { transform: rotate(-55deg); } 42% { transform: rotate(18deg); } 58% { transform: rotate(0); } 100% { transform: rotate(0); } }
        .builder-leg-l, .builder-leg-r { transform-box: fill-box; }
        .builder-cheer { animation: builder-cheer 460ms cubic-bezier(.3,0,.3,1) 3; }
        @keyframes builder-cheer { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-4px); } }
        .brick-shine { animation: brick-shine 1400ms cubic-bezier(.45,0,.25,1) 200ms both; }
        @keyframes brick-shine { from { transform: translateX(0); } to { transform: translateX(${w + 40}px); } }
        @media (prefers-reduced-motion: reduce) {
          .brick-drop, .brick-dust, .builder-hop, .builder-hammer, .builder-cheer, .brick-shine { animation: none; }
          .builder-walk { transition: none; }
        }
      `}</style>
    </svg>
  );
}
