"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Bespoke portal artwork from public/portal-art/<group>/ (subject emblems,
 * grade medallions, milestone badges, header and empty-state scenes).
 *
 * Each folder carries a manifest.json. Pictures are looked up by a plain key
 * ("accounting", "A*", "dusk", "empty-tests") so file names can change without
 * touching the pages. Anything missing (no manifest, no file, a failed load)
 * quietly shows the fallback instead, so the portal never breaks for art.
 */

/** Scenes only: subject, grade and milestone art is v2 (see PortalKit), read by fixed paths. */
export type ArtGroup = "scenes";

export type ArtName = string | string[] | null | undefined;

export type ArtEntry = { key: string; src: string; src2x?: string; width?: number; height?: number; alt?: string };

const cache = new Map<ArtGroup, Promise<ArtEntry[]>>();

/** "A*" → "astar", "Empty Tests.webp" → "emptytests". */
export const artKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\*/g, "star")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "");

function toEntry(group: ArtGroup, raw: unknown, fallbackKey?: string): ArtEntry | null {
  if (typeof raw === "string") return { key: fallbackKey ?? raw, src: resolve(group, raw) };
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const file = [o.src, o.file, o.path, o.url, o.filename, o.image].find((v) => typeof v === "string") as string | undefined;
  if (!file) return null;
  const key = ([o.key, o.id, o.slug, o.name, o.grade, o.subject].find((v) => typeof v === "string") as string | undefined) ?? fallbackKey ?? file;
  const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
  const file2x = [o.src2x, o.srcset2x, o.retina].find((v) => typeof v === "string") as string | undefined;
  return {
    key,
    src: resolve(group, file),
    src2x: file2x ? resolve(group, file2x) : undefined,
    width: num(o.width) ?? num(o.w),
    height: num(o.height) ?? num(o.h),
    alt: typeof o.alt === "string" ? o.alt : undefined,
  };
}

function resolve(group: ArtGroup, file: string) {
  if (/^(https?:)?\//.test(file)) return file;
  return `/portal-art/${group}/${file.replace(/^\.\//, "")}`;
}

function parse(group: ArtGroup, json: unknown): ArtEntry[] {
  const list = (v: unknown): ArtEntry[] => (Array.isArray(v) ? v.map((x) => toEntry(group, x)).filter((x): x is ArtEntry => !!x) : []);
  if (Array.isArray(json)) return list(json);
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  for (const k of ["assets", "items", "files", "images", "entries", group]) {
    if (Array.isArray(o[k])) return list(o[k]);
    // { "assets": { "accounting": {...} } }
    if (o[k] && typeof o[k] === "object") return parse(group, o[k]);
  }
  // A plain map: { "accounting": "accounting.webp" } or { "A*": { "file": … } }
  return Object.entries(o)
    .map(([k, v]) => toEntry(group, v, k))
    .filter((x): x is ArtEntry => !!x);
}

const getJson = (url: string): Promise<unknown> =>
  fetch(url, { cache: "no-cache" }) // revalidates (cheap 304), so new art shows without a hard refresh
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

// One manifest for every group (public/portal-art/manifest.json, "items": { group: { key: … } }).
let root: Promise<unknown> | null = null;

/** The group's own manifest when it has one, else its part of the shared one. */
function load(group: ArtGroup) {
  let p = cache.get(group);
  if (!p) {
    p = getJson(`/portal-art/${group}/manifest.json`)
      .then((j) => parse(group, j))
      .then(async (own) => {
        if (own.length) return own;
        root ??= getJson("/portal-art/manifest.json");
        const all = (await root) as { items?: Record<string, unknown> } | null;
        return parse(group, all?.items?.[group] ?? null);
      })
      .catch(() => []);
    cache.set(group, p);
  }
  return p;
}

function find(entries: ArtEntry[], wants: string[]): ArtEntry | null {
  const base = (e: ArtEntry) => artKey(e.src.split("/").pop() ?? "");
  const keys = wants.map(artKey).filter(Boolean);
  for (const k of keys) {
    const hit = entries.find((e) => artKey(e.key) === k) ?? entries.find((e) => base(e) === k);
    if (hit) return hit;
  }
  // Longer keys may sit inside a fuller name ("dusk" in "dashboard-dusk").
  for (const k of keys) {
    if (k.length < 4) continue;
    const hit = entries.find((e) => artKey(e.key).includes(k) || base(e).includes(k));
    if (hit) return hit;
  }
  return null;
}

/** The manifest entry for a key, or null while loading or when there is none. */
export function usePortalArt(group: ArtGroup, name: ArtName): ArtEntry | null {
  // Several names are tried in order: the most specific first.
  const key = (Array.isArray(name) ? name : name ? [name] : []).join("|");
  const want = `${group}:${key}`;
  const [found, setFound] = useState<{ want: string; entry: ArtEntry | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void load(group).then((list) => {
      if (alive) setFound({ want: `${group}:${key}`, entry: find(list, key.split("|")) });
    });
    return () => {
      alive = false;
    };
  }, [group, key]);
  return key && found?.want === want ? found.entry : null;
}

/**
 * One piece of art, or the fallback. Decorative by default (empty alt): pass
 * `alt` when the picture carries meaning the text around it doesn't.
 */
export function PortalArt({
  group,
  name,
  fallback = null,
  ...img
}: {
  group: ArtGroup;
  name: ArtName;
  fallback?: React.ReactNode;
} & ArtImageProps) {
  const entry = usePortalArt(group, name);
  if (!entry) return <>{fallback}</>;
  return <ArtImage key={entry.src} entry={entry} fallback={fallback} {...img} />;
}

type ArtImageProps = {
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** Above the fold (the dashboard header): load straight away. */
  eager?: boolean;
  width?: number;
  height?: number;
  /** Hold the box at width × height (small marks); otherwise the class sizes it. */
  sized?: boolean;
};

/** A manifest entry drawn as an image; the fallback shows if the file fails to load. */
export function ArtImage({
  entry,
  fallback = null,
  className,
  imgClassName,
  alt = "",
  eager,
  width,
  height,
  sized,
}: { entry: ArtEntry; fallback?: React.ReactNode } & ArtImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <span className={cn("block", className)} style={sized && width && height ? { width, height } : undefined}>
      {/* A plain img: sizes come from the manifest and the art is already web sized. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={entry.src}
        srcSet={entry.src2x ? `${entry.src} 1x, ${entry.src2x} 2x` : undefined}
        alt={alt}
        width={width ?? entry.width}
        height={height ?? entry.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        ref={(el) => {
          // Already in the cache: show it without waiting for a load event.
          if (el?.complete && el.naturalWidth) el.dataset.loaded = "";
        }}
        onLoad={(e) => {
          e.currentTarget.dataset.loaded = "";
        }}
        onError={() => setFailed(true)}
        className={cn("art-img h-full w-full", imgClassName)}
      />
    </span>
  );
}
