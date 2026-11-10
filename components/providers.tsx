"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/public-paths";
import { COMPANY_NAME } from "@/lib/config";

/**
 * Client root. Public pages render straight into the server HTML with nothing
 * else around them. Portal pages depend on localStorage (mock store + session),
 * so they show a splash until hydration to keep server and client markup
 * identical, then load the portal tree (auth, data store, toasts) as its own
 * chunk: the public pages never download Supabase or the store.
 */
/** True only after hydration. No setState-in-effect; the server snapshot is false. */
const subscribeNoop = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper" aria-hidden>
      <span className="font-display text-lg font-extrabold tracking-tight text-brand">{COMPANY_NAME}</span>
    </div>
  );
}

const loadPortal = () => import("@/components/PortalProviders");
const PortalProviders = dynamic(loadPortal, { ssr: false, loading: Splash });

/** Starts downloading the portal early (e.g. when a visitor reaches for Login). */
export function preloadPortal() {
  void loadPortal();
}

export function Providers({ children }: { children: React.ReactNode }) {
  const mounted = useHydrated();
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return (
      <div data-site="public" className="relative z-10 flex min-h-dvh flex-col">
        <div className="flex-1">{children}</div>
      </div>
    );
  }

  if (!mounted) return <Splash />;

  return <PortalProviders>{children}</PortalProviders>;
}
