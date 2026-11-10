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
        // The portal surface (globals.css): one step lighter, a hairline, a
        // faint light along the top edge and a soft contact shadow.
        "surface rounded-xl",
        ruled && "ruled-margin",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("border-b border-hairline px-5 py-4", className)}>{children}</div>;
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
