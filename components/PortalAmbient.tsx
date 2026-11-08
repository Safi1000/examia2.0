/**
 * The portal's backdrop, on phone and desktop.
 *
 * - Students: a soft wash of their Groundwork scene. For a photo, only the
 *   small thumbnail is used, blurred until no detail is left; for a colour
 *   scene, its own gradient. Both sit under charcoal so text stays easy to read.
 * - The teacher console (no scene): an aurora of brand light, gold from the
 *   top left and deep navy from the bottom right, over warm charcoal.
 *
 * Purely decorative; sits behind everything and never takes clicks.
 */
export function PortalAmbient({ photo, sky }: { photo?: string; sky?: string }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper">
      {photo || sky ? (
        <>
          {/* The scene's own colours first, so there is never a flash of grey while the thumbnail loads. */}
          {sky && <div className="absolute inset-0" style={{ background: sky }} />}
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- a tiny blurred thumbnail, no optimisation needed
            <img
              key={photo}
              src={photo}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full scale-125 object-cover blur-[48px] saturate-[1.35]"
            />
          )}
          {/* Charcoal over it, heavier at the bottom where most of the reading is. */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(26,29,32,0.56) 0%, rgba(26,29,32,0.62) 40%, rgba(20,22,24,0.82) 100%)" }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #1f2226 0%, #1a1d20 50%, #141618 100%)" }} />
          {/* Gold light, top left. */}
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(65% 60% at 10% -8%, color-mix(in srgb, var(--color-brand) 38%, transparent) 0%, color-mix(in srgb, var(--color-brand) 14%, transparent) 38%, transparent 72%)" }}
          />
          {/* Deep navy, bottom right (the colour of the reels and VSLs). */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(75% 70% at 100% 100%, rgba(40, 70, 150, 0.75) 0%, rgba(20, 34, 75, 0.5) 45%, transparent 78%)" }} />
          {/* A faint warm band through the middle so the two lights meet softly. */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(45% 35% at 75% 30%, rgba(229, 140, 90, 0.12) 0%, transparent 70%)" }} />
        </>
      )}
      {/* Soft edges. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(0, 0, 0, 0.35) 100%)" }} />
    </div>
  );
}
