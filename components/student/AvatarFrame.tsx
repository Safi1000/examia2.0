/**
 * Groundwork level frames as a watch bezel (design-mockups/portal-art/v2/bezel-spec.md).
 * Fine rings only; a level shows through the metal and the band's weight:
 *
 *  0 Starter  no band (the photo keeps the same inset, so it never changes size)
 *  1 Steady   a warm white hairline
 *  2 Sharp    brushed bronze
 *  3 Scholar  brushed silver
 *  4 Topper   brushed gold
 *  5 Legend   brushed gold, a fine inner gold ring (64px and up) and the faintest glow
 *
 * The ring is drawn inside the avatar's box, and a deep charcoal gap always
 * sits between the metal and the photo, so gold never touches a yellow avatar
 * background. Plain CSS (globals.css, .bezel): no filters, no animation.
 * `still` is kept for callers; nothing here moves.
 */
export function AvatarFrame({ level, children, className }: { level: number; children: React.ReactNode; className?: string; still?: boolean }) {
  const lv = Math.max(0, Math.min(5, Math.floor(level)));
  return (
    <span data-level={lv} className={`bezel ${className ?? ""}`}>
      {lv === 5 && <span aria-hidden className="bezel__glow" />}
      {lv > 0 && (
        <>
          {lv === 1 ? <span aria-hidden className="bezel__hair" /> : <span aria-hidden className="bezel__band" />}
          <span aria-hidden className="bezel__gap" />
        </>
      )}
      <span className="bezel__photo">{children}</span>
      {lv === 5 && <span aria-hidden className="bezel__inner" />}
    </span>
  );
}
