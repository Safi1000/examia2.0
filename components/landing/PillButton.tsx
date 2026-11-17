"use client";

import type { ReactNode } from "react";

type Props = {
  variant?: "gold" | "ghost";
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
};

/* Calm states: a lighter gold on hover, a small press, a clear focus ring. No sweep, glow or cursor pull. */
const base =
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 text-base font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out cursor-pointer select-none active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const variants = {
  gold: "bg-gold text-band-b hover:bg-gold-hover active:bg-[#f0b444]",
  ghost: "border border-hairline-strong text-body hover:border-white/[0.28] hover:text-ink",
};

export function PillButton({ variant = "gold", href, onClick, className = "", children, target, rel }: Props) {
  const cls = `${base} ${variants[variant]} ${className}`;

  return href ? (
    <a href={href} target={target} rel={rel} className={cls} onClick={onClick}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
