"use client";

import { useId } from "react";

/**
 * Groundwork rank frames, in the style of game rank borders (PUBG Conqueror,
 * Ace, Crown): a sculpted metal ring, a crest with a gem on top, swept blades
 * at the sides, getting heavier and richer at every level. Applied
 * automatically by level:
 *
 *  0 Starter  none
 *  1 Steady   bronze ring, small shield crest with an amber stone
 *  2 Sharp    silver ring, sapphire crest, a pair of short blades each side
 *  3 Scholar  gold ring, emerald crest, three blades each side, lower crest
 *  4 Topper   gold with a crimson enamel ring, crowned ruby crest, four blades
 *  5 Legend   dark gunmetal and gold, glowing amber enamel, five sweeping
 *             blades, a large flame-stone crown, soft aura and drifting embers
 *
 * The metal is shaded with an SVG lighting filter (light from the top left),
 * so the shapes read as real, raised metal. That layer never animates; the
 * Legend aura and embers live in a separate layer, so nothing heavy redraws.
 */
const C = 100;
/** Point at radius r, angle deg (0 = top, clockwise). */
const at = (r: number, deg: number) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)] as const;
const p = (r: number, deg: number) => at(r, deg).map((n) => n.toFixed(2)).join(" ");

type Tier = {
  metal: [string, string, string, string];
  trim: string;
  gem: [string, string];
  enamel?: string;
  /** A different metal for the ring band (Legend: dark band, gold ornaments). */
  band?: [string, string, string, string];
  blades: number[]; // blade angles (right side), mirrored on the left
  bladeLen: number;
  crest: "shield" | "crown" | "great";
  lower?: boolean;
};

const TIERS: Record<number, Tier> = {
  1: { metal: ["#F6D2AE", "#C0834F", "#8A5328", "#4A2810"], trim: "#F3C9A0", gem: ["#FFD38A", "#B35A00"], blades: [], bladeLen: 0, crest: "shield" },
  2: { metal: ["#FFFFFF", "#C9D0D7", "#7D868F", "#3A4048"], trim: "#F4F7FA", gem: ["#A9DBFF", "#1F5FBF"], blades: [62, 82], bladeLen: 16, crest: "shield" },
  3: { metal: ["#FFF3C8", "#E6B24A", "#A5711A", "#5A3A08"], trim: "#FFE7A6", gem: ["#9BF5C8", "#0E7A4C"], blades: [52, 70, 88], bladeLen: 22, crest: "shield", lower: true },
  4: { metal: ["#FFF3C8", "#E6B24A", "#A5711A", "#5A3A08"], trim: "#FFE7A6", gem: ["#FFB0B0", "#9E0A1F"], enamel: "#A3122B", blades: [44, 60, 76, 92], bladeLen: 27, crest: "crown", lower: true },
  5: {
    metal: ["#FFF6D6", "#F2C14E", "#B8811C", "#5E3B06"],
    band: ["#5A6068", "#2A2E34", "#16191D", "#08090B"],
    trim: "#FFE29A",
    gem: ["#FFF0B3", "#FF5A00"],
    enamel: "#FF8A1F",
    blades: [34, 50, 66, 82, 98],
    bladeLen: 36,
    crest: "great",
    lower: true,
  },
};

/** One swept blade, rooted on the ring and curving up towards the crest. */
function blade(deg: number, len: number, side: 1 | -1) {
  const a = side * deg;
  const sweep = side * 20; // tips lean towards the top, like wings
  const base1 = p(72, a - side * 7);
  const base2 = p(72, a + side * 7);
  const tip = p(72 + len, a - sweep);
  const c1 = p(72 + len * 0.6, a - side * 11);
  const c2 = p(72 + len * 0.5, a + side * 4);
  return `M${base1} Q${c1} ${tip} Q${c2} ${base2} Z`;
}

export function AvatarFrame({ level, children, className, still }: { level: number; children: React.ReactNode; className?: string; still?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}-${uid}`;
  const t = TIERS[Math.min(5, level)];
  if (!t) return <>{children}</>;
  const metal = `url(#${id("metal")})`;
  const trim = `url(#${id("trim")})`;
  const gem = `url(#${id("gem")})`;
  const box = { inset: "-30.6%", width: "161.2%", height: "161.2%" } as const;

  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`}>
      {/* Legend aura sits behind the avatar. */}
      {level >= 5 && !still && (
        <svg viewBox="0 0 200 200" className="pointer-events-none absolute overflow-visible motion-reduce:hidden" style={box} aria-hidden>
          <defs>
            <radialGradient id={id("aura")}>
              <stop offset=".6" stopColor="#FFB020" stopOpacity="0" />
              <stop offset=".72" stopColor="#FFB020" stopOpacity=".75" />
              <stop offset="1" stopColor="#FF6A00" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r="104" fill={`url(#${id("aura")})`}>
            <animate attributeName="opacity" values=".55;1;.55" dur="3.4s" repeatCount="indefinite" />
          </circle>
        </svg>
      )}

      {children}

      {/* The frame itself: drawn once, never animated. */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute overflow-visible" style={box} aria-hidden>
        <defs>
          <linearGradient id={id("metal")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={t.metal[0]} />
            <stop offset=".35" stopColor={t.metal[1]} />
            <stop offset=".7" stopColor={t.metal[2]} />
            <stop offset="1" stopColor={t.metal[3]} />
          </linearGradient>
          <linearGradient id={id("band")} x1="0" y1="0" x2="1" y2="1">
            {(t.band ?? t.metal).map((c, i) => (
              <stop key={i} offset={[0, 0.35, 0.7, 1][i]} stopColor={c} />
            ))}
          </linearGradient>
          <linearGradient id={id("trim")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".4" stopColor={t.trim} />
            <stop offset="1" stopColor={level >= 5 ? "#9C6A15" : t.metal[2]} />
          </linearGradient>
          <radialGradient id={id("gem")} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".25" stopColor={t.gem[0]} />
            <stop offset="1" stopColor={t.gem[1]} />
          </radialGradient>
          {/* Raised-metal look: blur the shape's edge, light it from the top left. */}
          <filter id={id("emboss")} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="blur" />
            <feSpecularLighting in="blur" surfaceScale="3.2" specularConstant=".95" specularExponent="20" lightingColor="#ffffff" result="spec">
              <fePointLight x="30" y="-10" z="110" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine" />
            <feComposite in="SourceGraphic" in2="shine" operator="arithmetic" k1="0" k2="1" k3=".8" k4="0" result="lit" />
            <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#000" floodOpacity=".65" />
          </filter>
          <filter id={id("glow")} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="g" />
            <feMerge>
              <feMergeNode in="g" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${id("emboss")})`}>
          {/* Blades, behind the ring. */}
          {t.blades.map((d, i) => {
            const len = t.bladeLen - i * (t.bladeLen * 0.12);
            return (
              <g key={d}>
                <path d={blade(d, len, 1)} fill={metal} />
                <path d={blade(d, len, -1)} fill={metal} />
              </g>
            );
          })}

          {/* The ring: a broad metal band with bright trims either side. */}
          <circle cx={C} cy={C} r="69" fill="none" stroke={`url(#${id("band")})`} strokeWidth="12" />
          <circle cx={C} cy={C} r="75.2" fill="none" stroke={trim} strokeWidth="2.2" />
          <circle cx={C} cy={C} r="62.8" fill="none" stroke={trim} strokeWidth="2" />

          {/* Lower crest (Scholar up). */}
          {t.lower && <path d="M100 186 Q91 180 89 172 L100 166 L111 172 Q109 180 100 186 Z" fill={metal} />}

          {/* Top crest. */}
          {t.crest === "shield" && <path d="M100 12 Q109 13 115 18 Q114 33 100 44 Q86 33 85 18 Q91 13 100 12 Z" fill={metal} />}
          {t.crest === "crown" && (
            <path d="M80 34 L84 16 L92 26 L100 8 L108 26 L116 16 L120 34 Q110 40 100 46 Q90 40 80 34 Z" fill={metal} />
          )}
          {t.crest === "great" && (
            <path
              d="M72 36 Q74 24 78 18 L86 28 L92 12 L100 0 L108 12 L114 28 L122 18 Q126 24 128 36 Q114 42 100 50 Q86 42 72 36 Z"
              fill={metal}
            />
          )}
        </g>

        {/* Enamel ring between the metal and the face (Topper, Legend). */}
        {t.enamel && <circle cx={C} cy={C} r="64.9" fill="none" stroke={t.enamel} strokeWidth="2.6" filter={level >= 5 ? `url(#${id("glow")})` : undefined} />}

        {/* Gold trims on Legend's dark metal, so it reads as gunmetal set in gold. */}
        {level >= 5 && (
          <>
            <circle cx={C} cy={C} r="75.2" fill="none" stroke={trim} strokeWidth="2.2" />
            <circle cx={C} cy={C} r="62.8" fill="none" stroke={trim} strokeWidth="2" />
          </>
        )}

        {/* Stones: crest (and lower crest), with a glint. */}
        <g filter={level >= 4 ? `url(#${id("glow")})` : undefined}>
          <circle cx="100" cy={t.crest === "great" ? 30 : t.crest === "crown" ? 30 : 27} r={t.crest === "great" ? 7.5 : t.crest === "crown" ? 6 : 5.2} fill={gem} stroke="#1a1208" strokeOpacity=".6" />
          {t.lower && <circle cx="100" cy="175" r="3.6" fill={gem} stroke="#1a1208" strokeOpacity=".6" />}
        </g>
        <circle cx={98} cy={t.crest === "great" ? 27.5 : t.crest === "crown" ? 28 : 25.2} r="1.6" fill="#fff" opacity=".9" />
        {/* Side studs on the ring (Sharp up). */}
        {level >= 2 &&
          [90, 270].map((d) => {
            const [x, y] = at(69, d);
            return <circle key={d} cx={x} cy={y} r="3.4" fill={gem} stroke="#1a1208" strokeOpacity=".6" />;
          })}
      </svg>

      {/* Legend: a few embers drifting up past the crest (separate, light layer). */}
      {level >= 5 && !still && (
        <svg viewBox="0 0 200 200" className="pointer-events-none absolute overflow-visible motion-reduce:hidden" style={box} aria-hidden>
          {[
            [70, "0s", 2.2],
            [128, "1.1s", 1.8],
            [88, "2.0s", 1.5],
            [116, "2.8s", 2],
          ].map(([x, delay, r], i) => (
            <circle key={i} cx={Number(x)} cy="40" r={Number(r)} fill="#FFC56B">
              <animate attributeName="cy" values="44;4" dur="3.6s" begin={String(delay)} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;0" dur="3.6s" begin={String(delay)} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
      )}
    </span>
  );
}
