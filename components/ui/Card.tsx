import { cn } from "@/lib/cn";

/** Filed-paper surface. `ruled` adds the signature exam-booklet margin rule. */
export function Card({
  children,
  className,
  ruled,
  id,
  as: Tag = "div",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  ruled?: boolean;
  as?: React.ElementType;
}) {
  return (
    <Tag
      id={id}
      className={cn(
        // A faint light along the top edge gives cards depth without heavy shadows.
        "rounded-xl border border-border bg-surface bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0)_42%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),var(--shadow-sm)]",
        ruled && "ruled-margin",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-b border-border px-5 py-4", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
