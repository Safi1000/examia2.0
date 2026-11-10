import Link from "next/link";
import { Icon } from "@/components/ui";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-7 sm:mb-8">
      {back && (
        <Link href={back.href} className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-ink-3 transition-colors hover:text-ink">
          <Icon.ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-balance text-[1.75rem] font-bold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[2.125rem]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-pretty text-[15px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
