"use client";

import { useRef, type ReactNode, type MouseEvent } from "react";

type Props = {
  variant?: "gold" | "ghost";
  href?: string;
  onClick?: () => void;
  className?: string;
  magnetic?: boolean;
  children: ReactNode;
  target?: string;
  rel?: string;
};

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors duration-200 cursor-pointer select-none";

const variants = {
  gold: "bg-gold text-[#1b1e21] hover:bg-[#ffd07a]",
  ghost: "border border-hairline-strong text-body hover:border-gold-border hover:text-foreground",
};

export function PillButton({
  variant = "gold",
  href,
  onClick,
  className = "",
  magnetic = false,
  children,
  target,
  rel,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);

  const handleMove = (e: MouseEvent) => {
    if (!magnetic || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * 0.18;
    const y = (e.clientY - (r.top + r.height / 2)) * 0.28;
    ref.current.style.transform = `translate(${x}px, ${y}px)`;
    ref.current.style.transition = "transform 0.12s ease-out";
  };

  const handleLeave = () => {
    if (!ref.current) return;
    ref.current.style.transition = "transform 0.45s cubic-bezier(0.22, 1.4, 0.36, 1)";
    ref.current.style.transform = "translate(0, 0)";
  };

  const cls = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <a
        ref={(n) => void (ref.current = n)}
        href={href}
        target={target}
        rel={rel}
        className={cls}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={(n) => void (ref.current = n)}
      type="button"
      className={cls}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
