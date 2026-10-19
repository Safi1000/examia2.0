"use client";

import { waLink, track } from "@/lib/landing";
import { Magnetic } from "./Magnetic";

/**
 * Floating WhatsApp button, bottom right, on every screen size. The round
 * green icon is what visitors already recognise; the label slides out on hover
 * (desktop) and is always read out to screen readers.
 */
export function MobileCta() {
  return (
    <div
      className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Magnetic strength={0.35}>
        <a
          href={waLink()}
          onClick={() => track("whatsapp_click", { from: "floating" })}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          className="wa-float group flex h-14 items-center gap-0 overflow-hidden rounded-full bg-[#25D366] pl-[14px] pr-[14px] shadow-[0_12px_32px_-8px_rgba(37,211,102,0.55),0_4px_14px_rgba(0,0,0,0.35)] transition-[gap,padding,transform] duration-300 hover:gap-2 hover:pr-5 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden className="shrink-0 fill-white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
          </svg>
          <span className="max-w-0 whitespace-nowrap text-[15px] font-semibold text-white opacity-0 transition-[max-width,opacity] duration-300 group-hover:max-w-[12rem] group-hover:opacity-100 group-focus-visible:max-w-[12rem] group-focus-visible:opacity-100">
            Chat on WhatsApp
          </span>
        </a>
      </Magnetic>
    </div>
  );
}
