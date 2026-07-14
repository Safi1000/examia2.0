"use client";

import { waLink, track } from "@/lib/landing";

export function MobileCta() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-linear-to-t from-[rgba(20,22,24,0.95)] via-[rgba(20,22,24,0.7)] to-transparent px-5 pt-10 min-[900px]:hidden"
      style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}
    >
      <a
        href={waLink()}
        onClick={() => track("whatsapp_click", { from: "mobile_cta" })}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full max-w-sm items-center justify-center rounded-full bg-gold py-3.5 text-sm font-semibold text-[#1b1e21]"
      >
        Message on WhatsApp
      </a>
    </div>
  );
}
