import { AVATARS } from "@/lib/profile";
import { cn } from "@/lib/cn";
import { AvatarFrame } from "@/components/student/AvatarFrame";

/** A student's portal avatar (or their initials until they pick one). */
export function Avatar({ id, initials, className, level, still }: { id?: string; initials?: string; className?: string; level?: number; still?: boolean }) {
  const a = AVATARS.find((x) => x.id === id);
  // The Groundwork level frame, applied automatically (level 0 has none).
  if (level && level > 0)
    return (
      <AvatarFrame level={level} still={still} className={className}>
        <Avatar id={id} initials={initials} className="h-full w-full" />
      </AvatarFrame>
    );
  if (!a)
    return (
      <span className={cn("flex items-center justify-center rounded-full bg-[linear-gradient(145deg,#2c3034,#1c1f22)] font-bold text-brand", className)}>
        {initials}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/avatars/${a.id}.webp`} alt="" width={256} height={256} loading="lazy" decoding="async" className={cn("shrink-0 rounded-full object-cover", className)} />
  );
}
