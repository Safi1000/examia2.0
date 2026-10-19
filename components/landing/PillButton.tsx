"use client";

import type { ReactNode } from "react";
import { Magnetic } from "./Magnetic";

type Props = {
  variant?: "gold" | "ghost";
  href?: string;
  onClick?: () => void;
  className?: string;
  /** Leans toward the cursor (on by default). */
  magnetic?: boolean;
  children: ReactNode;
  target?: string;
  rel?: string;
};

const base =
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold transition-[background-color,border-color,color,transform] duration-200 cursor-pointer select-none active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const variants = {
  gold: "btn-shine bg-gold text-[#1b1e21] hover:bg-[#ffd07a]",
  ghost: "border border-hairline-strong text-body hover:border-gold-border hover:text-foreground",
};

export function PillButton({
  variant = "gold",
  href,
  onClick,
  className = "",
  magnetic = true,
  children,
  target,
  rel,
}: Props) {
  const cls = `${base} ${variants[variant]} ${className}`;

  const el = href ? (
    <a href={href} target={target} rel={rel} className={cls} onClick={onClick}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );

  return magnetic ? <Magnetic>{el}</Magnetic> : el;
}
