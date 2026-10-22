import { AVATARS } from "@/lib/profile";
import { cn } from "@/lib/cn";

/** A student's portal avatar (or their initials until they pick one). */
export function Avatar({ id, initials, className, frame }: { id?: string; initials?: string; className?: string; frame?: string | null }) {
  const a = AVATARS.find((x) => x.id === id);
  // A frame earned by study level: a thin ring of colour around the face.
  if (frame)
    return (
      <span className={cn("inline-flex shrink-0 rounded-full p-[2px]", className)} style={{ background: frame }}>
        <Avatar id={id} initials={initials} className="h-full w-full" />
      </span>
    );
  if (!a)
    return (
      <span className={cn("flex items-center justify-center rounded-full bg-[linear-gradient(145deg,#2c3034,#1c1f22)] font-bold text-brand", className)}>
        {initials}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/avatars/${a.id}.webp`} alt="" width={256} height={256} loading="lazy" decoding="async" className={cn("rounded-full object-cover", className)} />
  );
}
