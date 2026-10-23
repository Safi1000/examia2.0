/**
 * The portal's backdrop: a soft gold light at the top of every page and a
 * faint grid that fades out, echoing the sign-in door and the public site.
 * Purely decorative; sits behind everything and never takes clicks.
 */
export function PortalAmbient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute left-1/2 top-0 h-[640px] w-[1200px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.10]"
        // A soft gradient instead of a 110px blur filter: same glow, no repaint cost on phones.
        style={{ background: "radial-gradient(closest-side, var(--color-brand), color-mix(in srgb, var(--color-brand) 40%, transparent) 45%, transparent)" }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[520px] opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--color-ink) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-ink) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 60% 100% at 50% 0%, #000 10%, transparent 75%)",
        }}
      />
    </div>
  );
}
