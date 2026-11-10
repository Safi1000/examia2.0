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
  auto = false,
}: {
  src?: string | null;
  title: string;
  poster?: string;
  label?: string;
  className?: string;
  /** Larger play button for the hero. */
  big?: boolean;
  /** Start on its own, muted, with no click. The visitor unmutes if they want
   *  sound — autoplay with audio is blocked everywhere and rightly so. */
  auto?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const live = playing || (auto && !!src);

  if (live && src) {
    return isFileVideo(src) ? (
      <video
        src={src}
        title={title}
        poster={poster}
        controls
        autoPlay
        muted={auto}
        loop={auto}
        playsInline
        className={`h-full w-full bg-black object-cover ${className}`}
      />
    ) : (
      <iframe
        title={title}
        // A tap means "play it", so the clicked player starts with sound.
        src={toEmbedUrl(src, true, auto && !playing)}
        loading="lazy"
        className={`h-full w-full bg-black ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      {poster ? (
        // The still is shown whole (no zoom-crop) over a blurred copy of itself.
        <>
          {/* The hero poster is the largest thing on a phone's first screen (Google's LCP), so it is fetched first. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sized(poster, 64)} alt="" aria-hidden loading={big ? "eager" : "lazy"} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sized(poster, big ? 1080 : 640)}
            srcSet={big ? `${sized(poster, 640)} 640w, ${sized(poster, 1080)} 1080w` : undefined}
            sizes={big ? "(min-width: 1024px) 720px, 100vw" : undefined}
            alt=""
            aria-hidden
            loading={big ? "eager" : "lazy"}
            fetchPriority={big ? "high" : "auto"}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
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
          className="group absolute left-1/2 top-1/2 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full before:absolute before:-inset-2 before:rounded-full before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          <span
            className={`flex items-center justify-center rounded-full bg-gold text-[#1b1e21] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.55)] transition-[background-color,transform] duration-200 ease-out group-hover:scale-[1.04] group-hover:bg-[#ffd07a] group-active:scale-[0.97] motion-reduce:transform-none ${
              big ? "h-16 w-16 md:h-20 md:w-20" : "h-9 w-9 sm:h-14 sm:w-14"
            }`}
          >
            <svg viewBox="0 0 22 22" fill="currentColor" className={`ml-0.5 ${big ? "h-[22px] w-[22px]" : "h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]"}`}>
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

/** YouTube stills come at full size (up to 1080 × 1920); the site's image service resizes them to WebP. */
function sized(src: string, w: number) {
  return /^https:\/\/i\.ytimg\.com\/vi\//.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75` : src;
}
