"use client";

import { useId } from "react";

/**
 * Groundwork level frames, drawn like a premium watch bezel or an esports
 * rank ring: real metal shading, engraved detail, cut stones. They apply
 * automatically by level and get richer as students climb:
 *
 *  0 Starter  none
 *  1 Steady   polished bronze bezel, fine engraved ticks
 *  2 Sharp    brushed steel bezel, hour markers, chamfered edge
 *  3 Scholar  polished gold bezel, markers, a small rank chevron
 *  4 Topper   black ceramic ring set in gold, four cut diamonds, light sweep
 *  5 Legend   ceramic and gold, twelve diamonds, a slow iridescent halo, crest
 *
 * One light source (top left) everywhere, so it reads as real material.
 * The avatar keeps its full size; the frame is drawn around it.
 */
const C = 100;
const at = (r: number, deg: number) => [C + r * Math.cos(((deg - 90) * Math.PI) / 180), C + r * Math.sin(((deg - 90) * Math.PI) / 180)] as const;

/** A small brilliant-cut stone seen from above (four facets and a glint). */
function Diamond({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -6 L6 0 L0 6 L-6 0 Z" fill="#DDE8F2" stroke="#2a2f36" strokeWidth=".6" />
      <path d="M0 -6 L6 0 L0 0 Z" fill="#FFFFFF" />
      <path d="M-6 0 L0 6 L0 0 Z" fill="#A9B8C6" />
      <path d="M0 0 L6 0 L0 6 Z" fill="#C7D5E2" />
      <circle cx="-1.6" cy="-2.2" r="1" fill="#fff" />
    </g>
  );
}

/** Thin engraved lines around the ring: `n` ticks between two radii. */
function Ticks({ n, r1, r2, color, width = 0.8, skip }: { n: number; r1: number; r2: number; color: string; width?: number; skip?: number }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    if (skip && i % skip === 0) continue;
    const d = (360 / n) * i;
    const [x1, y1] = at(r1, d);
    const [x2, y2] = at(r2, d);
    out.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />);
  }
  return <g>{out}</g>;
}

/** Twelve hour markers, slim bars set into the bezel. */
function Markers({ r1, r2, fill, edge }: { r1: number; r2: number; fill: string; edge: string }) {
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => {
        const d = i * 30;
        const [x, y] = at((r1 + r2) / 2, d);
        const big = i % 3 === 0;
        return (
          <rect
            key={i}
            x={x - (big ? 1.6 : 1.1)}
            y={y - (r2 - r1) / 2}
            width={big ? 3.2 : 2.2}
            height={r2 - r1}
            rx=".8"
            fill={fill}
            stroke={edge}
            strokeWidth=".5"
            transform={`rotate(${d} ${x} ${y})`}
          />
        );
      })}
    </g>
  );
}

export function AvatarFrame({ level, children, className }: { level: number; children: React.ReactNode; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  if (level <= 0) return <>{children}</>;

  const metal = level === 1 ? "bronze" : level === 2 ? "steel" : "gold";
  const ceramic = level >= 4;

  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`}>
      {children}
      {/* 200-unit drawing where the avatar is the middle 124 units. */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute overflow-visible" style={{ inset: "-30.6%", width: "161.2%", height: "161.2%" }} aria-hidden>
        <defs>
          {/* Metals: light from the top left, a bright band, darker lower right. */}
          <linearGradient id={id("bronze")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F3C9A0" />
            <stop offset=".22" stopColor="#B57A4A" />
            <stop offset=".45" stopColor="#E7B183" />
            <stop offset=".7" stopColor="#7A4723" />
            <stop offset="1" stopColor="#3E2210" />
          </linearGradient>
          <linearGradient id={id("steel")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".2" stopColor="#A7AFB8" />
            <stop offset=".42" stopColor="#EEF1F4" />
            <stop offset=".68" stopColor="#6C747E" />
            <stop offset="1" stopColor="#2E333A" />
          </linearGradient>
          <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF4D2" />
            <stop offset=".2" stopColor="#D9A23A" />
            <stop offset=".42" stopColor="#FFE29A" />
            <stop offset=".68" stopColor="#9C6A15" />
            <stop offset="1" stopColor="#4A3008" />
          </linearGradient>
          <linearGradient id={id("ceramic")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4A4F57" />
            <stop offset=".35" stopColor="#15171A" />
            <stop offset=".6" stopColor="#2B2F35" />
            <stop offset="1" stopColor="#050607" />
          </linearGradient>
          <linearGradient id={id("halo")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8EC5FF" />
            <stop offset=".3" stopColor="#C8A6FF" />
            <stop offset=".55" stopColor="#FFD9A0" />
            <stop offset=".8" stopColor="#9FF0D4" />
            <stop offset="1" stopColor="#8EC5FF" />
            <animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="9s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient id={id("sweep")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id("aura")}>
            <stop offset=".78" stopColor="#FBC159" stopOpacity="0" />
            <stop offset=".86" stopColor="#FBC159" stopOpacity=".35" />
            <stop offset="1" stopColor="#FBC159" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Legend: a soft warm aura outside the bezel only. */}
        {level >= 5 && (
          <circle cx={C} cy={C} r="99" fill={`url(#${id("aura")})`}>
            <animate attributeName="opacity" values=".6;1;.6" dur="3.2s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Shadow under the bezel, so it sits above the page. */}
        <circle cx={C} cy={C + 1.5} r="72" fill="none" stroke="#000" strokeOpacity=".45" strokeWidth={ceramic ? 22 : 18} />

        {/* Outer metal bezel. */}
        <circle cx={C} cy={C} r={ceramic ? 77 : 71.5} fill="none" stroke={`url(#${id(metal)})`} strokeWidth={ceramic ? 8 : level === 3 ? 16 : 14} />
        {/* Chamfered edges: a bright outer lip and a dark inner lip. */}
        <circle cx={C} cy={C} r={ceramic ? 81 : level === 3 ? 79.5 : 78.5} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth=".8" />
        <circle cx={C} cy={C} r={ceramic ? 73 : level === 3 ? 63.5 : 64.5} fill="none" stroke="#000" strokeOpacity=".55" strokeWidth="1" />

        {/* Topper and Legend: black ceramic ring set inside the gold. */}
        {ceramic && (
          <>
            <circle cx={C} cy={C} r="67.5" fill="none" stroke={`url(#${id("ceramic")})`} strokeWidth="11" />
            <circle cx={C} cy={C} r="62.5" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="1.6" />
            <circle cx={C} cy={C} r="73" fill="none" stroke="#000" strokeOpacity=".6" strokeWidth=".8" />
          </>
        )}

        {/* Engraving: fine ticks (bronze), markers (steel and gold), gold markers on ceramic. */}
        {level === 1 && <Ticks n={60} r1={66.5} r2={70} color="#3E2210" width={0.6} />}
        {level === 1 && <Ticks n={12} r1={65.5} r2={72} color="#2a1608" width={1.2} />}
        {level === 2 && <Ticks n={60} r1={66} r2={68.5} color="#2E333A" width={0.5} skip={5} />}
        {level === 2 && <Markers r1={66} r2={75} fill="#F7F9FB" edge="#4a525c" />}
        {level === 3 && <Markers r1={66} r2={76} fill="#3a2706" edge="#FFE29A" />}
        {ceramic && <Markers r1={64.5} r2={70.5} fill={`url(#${id("gold")})`} edge="#4A3008" />}

        {/* Steel: an extra fine outer ring, like a watch case. */}
        {level === 2 && <circle cx={C} cy={C} r="81" fill="none" stroke={`url(#${id("steel")})`} strokeWidth="1.6" />}

        {/* Stones: four on Topper, twelve on Legend, set into the ceramic. */}
        {level === 4 &&
          [0, 90, 180, 270].map((d) => {
            const [x, y] = at(67.5, d);
            return <Diamond key={d} x={x} y={y} s={0.85} />;
          })}
        {level >= 5 &&
          Array.from({ length: 12 }, (_, i) => {
            const [x, y] = at(67.5, i * 30);
            return <Diamond key={i} x={x} y={y} s={i % 3 === 0 ? 0.85 : 0.6} />;
          })}

        {/* Legend: a thin iridescent halo that slowly shifts colour. */}
        {level >= 5 && <circle cx={C} cy={C} r="84.5" fill="none" stroke={`url(#${id("halo")})`} strokeWidth="2.4" />}

        {/* Light catching the metal: a fixed highlight, and a slow sweep from Topper. */}
        <circle
          cx={C}
          cy={C}
          r={ceramic ? 77 : 71.5}
          fill="none"
          stroke="#fff"
          strokeOpacity=".35"
          strokeWidth={ceramic ? 2 : 3}
          strokeDasharray="70 400"
          strokeDashoffset="-300"
          strokeLinecap="round"
        />
        {level >= 4 && (
          <circle cx={C} cy={C} r="77" fill="none" stroke={`url(#${id("sweep")})`} strokeWidth="8" strokeDasharray="45 440" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur={level >= 5 ? "5s" : "7s"} repeatCount="indefinite" />
          </circle>
        )}

        {/* Rank mark at the top: a chevron for Scholar, a crest with a stone for Legend. */}
        {level === 3 && (
          <path d="M91 21 L100 15 L109 21 L109 25 L100 19 L91 25 Z" fill={`url(#${id("gold")})`} stroke="#4A3008" strokeWidth=".7" strokeLinejoin="round" />
        )}
        {level >= 5 && (
          <g>
            <path d="M86 20 L100 10 L114 20 L114 26 L100 16 L86 26 Z" fill={`url(#${id("gold")})`} stroke="#4A3008" strokeWidth=".8" strokeLinejoin="round" />
            <Diamond x={100} y={21} s={0.7} />
          </g>
        )}
      </svg>
    </span>
  );
}
