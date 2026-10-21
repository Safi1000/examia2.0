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
    <div className="mb-8">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
          <Icon.ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.85rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[2.25rem]">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
