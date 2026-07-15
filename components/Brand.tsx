import logo from "@/logo/logo.png";
import { cn } from "@/lib/cn";

/**
 * The official HamzaTeaches logo — statically imported from the project's
 * `logo/` folder, which is the single source of truth. The bundler resolves the
 * import to a hashed, served URL, so nothing is copied into `public/` and the
 * site always reflects whatever image sits in that folder.
 *
 * Plain <img> (the project does not use next/image); height is set by callers
 * and width stays `auto` with `object-contain`, so the aspect ratio is never
 * stretched or cropped.
 */
const ALT = "HamzaTeaches Logo";

export function Logo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo.src} alt={ALT} className={cn("w-auto object-contain", className)} />
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
    <img src={logo.src} alt={ALT} style={{ height: size }} className="w-auto object-contain" />
  );
}
