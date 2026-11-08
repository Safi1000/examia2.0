"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { photoSrc, sceneFor } from "@/lib/groundwork";

const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Desktop only: the student's Groundwork photo fills the window behind every
 * portal page, dimmed so the frosted page on top stays easy to read. Phones
 * keep the plain dark background (no big download, nothing to squint past).
 * Purely decorative; never takes clicks.
 */
export function PortalBackdrop({ nowMs }: { nowMs: number }) {
  const { profile } = useAuth();
  const scene = sceneFor(profile.scene, nowMs);
  // Fades in once the photo has arrived, over the scene's own colour.
  const [loaded, setLoaded] = useState<string | null>(null);
  const shown = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 1) setLoaded(img.currentSrc);
  };
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden md:block" style={{ background: scene.sky }}>
      {scene.photo ? (
        <picture key={scene.id}>
          {/* Only screens 768px and up download the photo; the fallback is a 1px blank. */}
          <source media="(min-width: 768px)" srcSet={photoSrc(scene)} />
          <img
            ref={shown}
            src={BLANK}
            alt=""
            onLoad={(e) => e.currentTarget.naturalWidth > 1 && setLoaded(e.currentTarget.currentSrc)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none ${loaded?.endsWith(photoSrc(scene)) ? "opacity-100" : "opacity-0"}`}
            decoding="async"
          />
        </picture>
      ) : null}
      <div className={scene.light ? "absolute inset-0 bg-black/45" : "absolute inset-0 bg-black/30"} />
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
}
