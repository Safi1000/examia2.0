"use client";

import { useState } from "react";
import { isFileVideo, toEmbedUrl } from "@/lib/landing";

/**
 * Click-to-play video. Renders a gold play button over a poster (or a plain
 * gradient) and swaps in the real player on click, so no third-party iframe is
 * loaded until the visitor actually asks for it.
 *
 * Accepts YouTube, Vimeo, or a direct file URL. With no `src` it degrades to a
 * labelled placeholder rather than an empty black box.
 */
export function VideoPlayer({
  src,
  title,
  poster,
  label = "Video coming soon",
  className = "",
  big = false,
}: {
  src?: string | null;
  title: string;
  poster?: string;
  label?: string;
  className?: string;
  /** Larger play button for the hero. */
  big?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing && src) {
    return isFileVideo(src) ? (
      <video
        src={src}
        title={title}
        poster={poster}
        controls
        autoPlay
        playsInline
        className={`h-full w-full bg-black object-cover ${className}`}
      />
    ) : (
      <iframe
        title={title}
        src={toEmbedUrl(src)}
        className={`h-full w-full bg-black ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-br from-[#2a2d31] via-[#1b1e21] to-[#141618]"
        />
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-[rgba(0,0,0,0.7)] to-transparent"
      />

      {src ? (
        <button
          type="button"
          aria-label={`Play: ${title}`}
          onClick={() => setPlaying(true)}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-105"
        >
          <span className="pulse-ring absolute inset-0 rounded-full border-2 border-gold" aria-hidden />
          <span
            className={`flex items-center justify-center rounded-full bg-gold text-[#1b1e21] shadow-[0_10px_40px_rgba(251,193,89,0.35)] ${
              big ? "h-16 w-16 md:h-20 md:w-20" : "h-14 w-14"
            }`}
          >
            <svg width={big ? 22 : 18} height={big ? 22 : 18} viewBox="0 0 22 22" fill="currentColor" className="ml-1">
              <path d="M5 3l14 8-14 8z" />
            </svg>
          </span>
        </button>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full border border-hairline-strong bg-[rgba(20,22,24,0.7)] px-4 py-1.5 text-xs text-faint backdrop-blur">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
