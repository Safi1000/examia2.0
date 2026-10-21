import logo from "@/logo/logo-web.png";
import { cn } from "@/lib/cn";

/**
 * The official HamzaTeaches logo — statically imported from the project's
 * `logo/` folder, which is the single source of truth. The bundler resolves the
 * import to a hashed, served URL, so nothing is copied into `public/` and the
 * site always reflects whatever image sits in that folder.
 *
 * Plain <img> (the project does not use next/image); height is set by callers
 * and width stays `auto` with `object-contain`, so the aspect ratio is never
 * stretched or cropped. logo-web.png is the original resized to 480px wide
 * (36 KB instead of 4 MB); logo.png stays as the master file.
 */
const ALT = "Hamza Teaches";

export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo.src} alt={ALT} width={logo.width} height={logo.height} decoding="async" className={cn("w-auto object-contain", className)} />
  );
}

/** Default wordmark size for header/sidebar spots. */
export function Wordmark({ className }: { className?: string; markSize?: number }) {
  return <Logo className={cn("h-7", className)} />;
}

/** Compact mark; sized by height so the logo's aspect ratio is preserved. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo.src} alt={ALT} width={logo.width} height={logo.height} decoding="async" style={{ height: size }} className="w-auto object-contain" />
  );
}

// The wordmark inside logo-web.png (480 x 223) sits in the box 23,74 → 460,140:
// the rest is empty space. LogoTight shows only that box, so a given height
// is the height of the lettering itself. The file is never changed.
const TRIM = { x: 23, y: 74, w: 438, h: 67 };

/** The wordmark with its empty margins cropped away. Height sets the lettering size. */
export function LogoTight({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-block overflow-hidden", className)}
      style={{ aspectRatio: `${TRIM.w} / ${TRIM.h}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={ALT}
        decoding="async"
        className="absolute max-w-none"
        style={{
          width: `${(logo.width / TRIM.w) * 100}%`,
          left: `${(-TRIM.x / TRIM.w) * 100}%`,
          top: `${(-TRIM.y / TRIM.h) * 100}%`,
        }}
      />
    </span>
  );
}
