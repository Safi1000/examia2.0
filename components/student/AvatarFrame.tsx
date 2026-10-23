"use client";

import { useId } from "react";

/**
 * Groundwork level frames, drawn in SVG around the round avatar. They apply
 * automatically by level and get more extravagant as students climb:
 *
 *  0 Starter  none
 *  1 Steady   bronze ring with studs
 *  2 Sharp    bevelled silver with small wings
 *  3 Scholar  gold double ring with a laurel wreath and a star
 *  4 Topper   ornate gold with laurels, a crown, a ruby and a moving shine
 *  5 Legend   prismatic ring that slowly turns, feathered wings, jewelled
 *             crown, sparkles and a soft glow
 *
 * The avatar keeps its full size; the frame is drawn around it, spilling
 * outside the avatar's box (the ring and ornaments add about 60%).
 */
const C = 100; // centre of the 200 x 200 drawing

/** Points on a circle, for placing ornaments. */
const at = (r: number, deg: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)] as const;

function Laurel({ fill, side, from, to }: { fill: string; side: 1 | -1; from: number; to: number }) {
  // Leaves along an arc on one side, each tilted along the curve.
  const leaves = [];
  for (let a = from, i = 0; a <= to; a += 13, i++) {
    const deg = side === 1 ? a : 180 - a;
    const [x, y] = at(84, deg);
    const tilt = deg + (side === 1 ? 90 : -90) + (side === 1 ? -28 : 28);
    leaves.push(<ellipse key={i} cx={x} cy={y} rx="9" ry="4" fill={fill} transform={`rotate(${tilt} ${x} ${y})`} />);
  }
  return <g>{leaves}</g>;
}

function Wings({ fill, big }: { fill: string; big?: boolean }) {
  // A symmetrical fan of feathers on each side, longest in the middle.
  const angles = big ? [-34, -17, 0, 17, 34] : [-18, 0, 18];
  const out: React.ReactNode[] = [];
  for (const side of [1, -1] as const) {
    angles.forEach((a, i) => {
      const deg = side === 1 ? a : 180 - a;
      const len = (big ? 40 : 24) - Math.abs(a) * (big ? 0.3 : 0.35);
      const w = big ? 8 : 5.5;
      const [x, y] = at(big ? 82 : 79, deg);
      // A tapered feather: fat near the ring, pointed at the tip, with a quill line.
      out.push(
        <g key={`${side}${i}`} transform={`translate(${x} ${y}) rotate(${deg})`}>
          <path d={`M0 0 Q${len * 0.35} ${-w} ${len} 0 Q${len * 0.35} ${w} 0 0 Z`} fill={fill} stroke="#5a3a08" strokeOpacity=".4" strokeWidth=".8" />
          <path d={`M2 0 L${len * 0.85} 0`} stroke="#5a3a08" strokeOpacity=".35" strokeWidth=".8" />
        </g>,
      );
    });
  }
  return <g>{out}</g>;
}

function Crown({ fill, gem, big }: { fill: string; gem?: string; big?: boolean }) {
  return (
    <g transform={big ? "translate(100 22) scale(1.35) translate(-100 -22)" : undefined}>
      <path d="M78 30 L84 12 L92 24 L100 6 L108 24 L116 12 L122 30 Z" fill={fill} stroke="#5a3a08" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="77" y="28" width="46" height="7" rx="2" fill={fill} stroke="#5a3a08" strokeWidth="1.2" />
      {gem && (
        <>
          <circle cx="100" cy="31.5" r="3.2" fill={gem} />
          <circle cx="86" cy="31.5" r="2.2" fill="#7DB7F5" />
          <circle cx="114" cy="31.5" r="2.2" fill="#7FD1A6" />
        </>
      )}
    </g>
  );
}

export function AvatarFrame({ level, children, className }: { level: number; children: React.ReactNode; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  if (level <= 0) return <>{children}</>;

  const metal = level === 1 ? "bronze" : level === 2 ? "silver" : "gold";
  const ring = level >= 5 ? `url(#${id("prism")})` : `url(#${id(metal)})`;

  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`}>
      {children}
      {/* 200-unit drawing where the avatar is the middle 124 units. */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute overflow-visible" style={{ inset: "-30.6%", width: "161.2%", height: "161.2%" }} aria-hidden>
        <defs>
          <linearGradient id={id("bronze")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E2A877" />
            <stop offset=".35" stopColor="#8A5229" />
            <stop offset=".6" stopColor="#C98A55" />
            <stop offset="1" stopColor="#5C3216" />
          </linearGradient>
          <linearGradient id={id("silver")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".3" stopColor="#9AA3AD" />
            <stop offset=".55" stopColor="#E9EDF1" />
            <stop offset="1" stopColor="#5E6670" />
          </linearGradient>
          <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFF1C4" />
            <stop offset=".3" stopColor="#E5A832" />
            <stop offset=".55" stopColor="#FFD77A" />
            <stop offset=".8" stopColor="#B9821F" />
            <stop offset="1" stopColor="#FFE3A3" />
          </linearGradient>
          <linearGradient id={id("prism")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4FA3FF" />
            <stop offset=".25" stopColor="#A66BFF" />
            <stop offset=".5" stopColor="#FF5C8A" />
            <stop offset=".75" stopColor="#FFB020" />
            <stop offset="1" stopColor="#2FD39A" />
            {level >= 5 && <animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="6s" repeatCount="indefinite" />}
          </linearGradient>
          <radialGradient id={id("glow")}>
            <stop offset=".62" stopColor="#FBC159" stopOpacity="0" />
            <stop offset=".7" stopColor="#FBC159" stopOpacity=".6" />
            <stop offset="1" stopColor="#FBC159" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id("shine")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={id("ruby")} cx=".35" cy=".35">
            <stop offset="0" stopColor="#FFB3B3" />
            <stop offset=".5" stopColor="#E0283C" />
            <stop offset="1" stopColor="#7A0A18" />
          </radialGradient>
        </defs>

        {/* Legend: a soft pulsing glow behind everything. */}
        {level >= 5 && (
          <circle cx={C} cy={C} r="98" fill={`url(#${id("glow")})`}>
            <animate attributeName="opacity" values=".55;1;.55" dur="2.6s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Wings: small silver from Sharp, big golden feathers for Legend. */}
        {level === 2 && <Wings fill={`url(#${id("silver")})`} />}
        {level >= 5 && <Wings fill={`url(#${id("gold")})`} big />}

        {/* Laurel wreath from Scholar. */}
        {level >= 3 && (
          <>
            <Laurel fill={level >= 4 ? `url(#${id("gold")})` : "#C9962F"} side={1} from={-55} to={70} />
            <Laurel fill={level >= 4 ? `url(#${id("gold")})` : "#C9962F"} side={-1} from={-55} to={70} />
          </>
        )}

        {/* The main ring: thicker and bevelled as the level rises. */}
        <circle cx={C} cy={C} r="71" fill="none" stroke="#1A1D20" strokeWidth={level >= 3 ? 20 : 16} />
        <circle cx={C} cy={C} r="71" fill="none" stroke={ring} strokeWidth={level >= 3 ? 16 : 12} />
        <circle cx={C} cy={C} r={level >= 3 ? 63 : 65} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="1.5" />
        <circle cx={C} cy={C} r={level >= 3 ? 79 : 77} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
        {level >= 3 && <circle cx={C} cy={C} r="71" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="1" strokeDasharray="2 5" />}
        {/* Legend: gold edges either side of the prism, so it reads as jewellery. */}
        {level >= 5 && (
          <>
            <circle cx={C} cy={C} r="80" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="3" />
            <circle cx={C} cy={C} r="62.5" fill="none" stroke={`url(#${id("gold")})`} strokeWidth="2.5" />
          </>
        )}

        {/* Studs around the ring (bronze and silver). */}
        {level <= 2 &&
          [45, 135, 225, 315].map((d) => {
            const [x, y] = at(71, d);
            return <circle key={d} cx={x} cy={y} r="4.5" fill={`url(#${id(metal)})`} stroke="#000" strokeOpacity=".35" />;
          })}

        {/* Moving shine across the metal (Topper and Legend). */}
        {level >= 4 && (
          <g>
            <circle cx={C} cy={C} r="71" fill="none" stroke={`url(#${id("shine")})`} strokeWidth="16" strokeDasharray="60 386" strokeLinecap="round" opacity=".7">
              <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur={level >= 5 ? "3s" : "4.5s"} repeatCount="indefinite" />
            </circle>
          </g>
        )}

        {/* Scholar: a star at the top. Topper and Legend: a crown. */}
        {level === 3 && (
          <path
            d="M100 12 L105 24 L118 24 L108 32 L112 45 L100 37 L88 45 L92 32 L82 24 L95 24 Z"
            fill={`url(#${id("gold")})`}
            stroke="#5a3a08"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        )}
        {level >= 4 && <Crown fill={`url(#${id("gold")})`} gem={level >= 5 ? "#E0283C" : undefined} big={level >= 5} />}

        {/* Topper and Legend: a ruby at the bottom. */}
        {level >= 4 && (
          <g>
            <path d="M100 160 L112 172 L100 188 L88 172 Z" fill={`url(#${id("ruby")})`} stroke="#5a3a08" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M100 160 L106 172 L100 182 L94 172 Z" fill="#fff" opacity=".25" />
          </g>
        )}

        {/* Legend: twinkling sparkles. */}
        {level >= 5 &&
          [
            [32, 48, "0s"],
            [170, 56, ".8s"],
            [24, 140, "1.6s"],
            [176, 146, "1.1s"],
          ].map(([x, y, d], i) => (
            <path key={i} d={`M${x} ${Number(y) - 7} L${Number(x) + 2} ${Number(y) - 2} L${Number(x) + 7} ${y} L${Number(x) + 2} ${Number(y) + 2} L${x} ${Number(y) + 7} L${Number(x) - 2} ${Number(y) + 2} L${Number(x) - 7} ${y} L${Number(x) - 2} ${Number(y) - 2} Z`} fill="#FFF6D8">
              <animate attributeName="opacity" values="0;1;0" dur="2s" begin={String(d)} repeatCount="indefinite" />
            </path>
          ))}
      </svg>
    </span>
  );
}
