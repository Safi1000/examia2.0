"use client";

import { useEffect, useId, useRef, useState } from "react";
import { color } from "@/lib/tokens";

export interface LinePoint {
  label: string;
  value: number; // 0..max
}

/**
 * Hand-rolled SVG score-trend line. Draws in on first paint (reduced-motion
 * disables the animation globally). No charting dependency.
 */
export function LineChart({
  points,
  max = 100,
  height = 200,
}: {
  points: LinePoint[];
  max?: number;
  height?: number;
}) {
  const gradId = useId();
  // The drawing is exactly as wide as its box, so one unit is one pixel and
  // the labels stay the same size on a phone and on a wide desktop card.
  const box = useRef<HTMLDivElement>(null);
  const empty = points.length === 0;
  const [W, setW] = useState(320);
  // The point being read (tap or hover): its value is written above it.
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setW(Math.max(240, Math.round(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // Runs again once there is something to draw (an empty chart renders nothing).
  }, [empty]);
  const H = height;
  // Room on the left for "100%".
  const padX = 36;
  const padY = 22;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  if (points.length === 0) return null;

  const isSingle = points.length === 1;

  const x = (i: number) =>
    isSingle ? padX + innerW / 2 : padX + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${padX},${padY + innerH} ${line} ${x(points.length - 1)},${padY + innerH}`;
  const gridVals = [0, 25, 50, 75, 100].filter((g) => g <= max);
  // The chart scales with its box, so on a phone one unit is about a pixel:
  // labels at 11 stay readable, and only as many dates as fit side by side are
  // written (always the first and the last), so they never run into each other.
  const fitLabels = Math.max(2, Math.floor(innerW / 56));
  const step = Math.max(1, Math.ceil((points.length - 1) / (fitLabels - 1)));
  const showLabel = (i: number) =>
    i === points.length - 1 || (i % step === 0 && points.length - 1 - i >= step);
  const last = points[points.length - 1];
  const unit = max === 100 ? "%" : "";
  const summary =
    points.length === 1
      ? `Score trend: ${last.label}, ${Math.round(last.value)}${unit}`
      : `Score trend from ${Math.round(points[0].value)}${unit} (${points[0].label}) to ${Math.round(last.value)}${unit} (${last.label})`;

  return (
    <div ref={box} className="w-full">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={summary}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color.brand} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color.brand} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke={color.border} strokeWidth="1" />
          <text x={padX - 5} y={y(g) + 3.5} textAnchor="end" fontSize="12" fill={color.ink3} className="tabular">
            {g}
            {unit}
          </text>
        </g>
      ))}

      {!isSingle && <polygon points={area} fill={`url(#${gradId})`} />}
      {!isSingle && (
        <polyline
          points={line}
          fill="none"
          stroke={color.brand}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "draw 1.1s var(--ease-out) forwards" }}
        />
      )}

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={at === i ? 5 : 3.5} fill={color.surface} stroke={color.brand} strokeWidth="2.5" />
          {/* A fingertip-sized target round each dot: tap or hover to read its value. */}
          <circle
            cx={x(i)}
            cy={y(p.value)}
            r="16"
            fill="transparent"
            className="cursor-pointer"
            onPointerEnter={() => setAt(i)}
            onPointerLeave={() => setAt((cur) => (cur === i ? null : cur))}
            onClick={() => setAt((cur) => (cur === i ? null : i))}
          />
          {showLabel(i) && (
            <text
              x={x(i)}
              y={H - 5}
              textAnchor={isSingle ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontSize="12"
              fill={color.ink3}
              className="tabular"
            >
              {p.label}
            </text>
          )}
        </g>
      ))}

      {at !== null && points[at] && (
        <text
          x={Math.min(W - padX, Math.max(padX, x(at)))}
          y={Math.max(12, y(points[at].value) - 12)}
          textAnchor={x(at) < padX + 50 ? "start" : x(at) > W - padX - 50 ? "end" : "middle"}
          fontSize="12"
          fontWeight="600"
          fill={color.ink}
          className="tabular pointer-events-none"
        >
          {points[at].label}: {Math.round(points[at].value)}
          {unit}
        </text>
      )}
    </svg>
    </div>
  );
}
