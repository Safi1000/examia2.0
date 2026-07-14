"use client";

import { useEffect, useState } from "react";
import { RAIL_SECTIONS } from "@/lib/landing";

export function SectionRail() {
  const [active, setActive] = useState("top");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const s of RAIL_SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Section navigation"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-4 min-[1240px]:flex"
    >
      {RAIL_SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" })}
            className="group flex items-center gap-3"
          >
            <span
              className={`text-xs transition-all duration-300 ${
                isActive ? "text-gold opacity-100" : "text-faint opacity-0 group-hover:opacity-70"
              }`}
            >
              {s.label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive ? "h-2.5 w-2.5 scale-110 bg-gold" : "h-2 w-2 bg-hairline-strong group-hover:bg-faint"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
