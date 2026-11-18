"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/public-paths";
import { Splash as PortalSplash } from "@/components/Splash";
import { PortalSkeleton } from "@/components/PortalSkeleton";

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

// The same loading screen the portal shows next (logo and gold line), so the
// hand-over does not read as a flash between two different screens.
function Splash() {
  return (
    <div className="bg-paper">
      <PortalSplash />
    </div>
  );
}

/**
 * What shows while the portal itself is still arriving: the outline of the
 * page being opened, so nothing jumps when it fills in. Signing in and a test
 * opening keep the splash (there is no page behind them yet).
 */
function PortalWait() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/login") || pathname.startsWith("/test/")) return <Splash />;
  return (
    <div className="bg-paper">
      <PortalSkeleton side={pathname.startsWith("/admin") ? "admin" : "student"} />
    </div>
  );
}

const loadPortal = () => import("@/components/PortalProviders");
const PortalProviders = dynamic(loadPortal, { ssr: false, loading: PortalWait });

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

  if (!mounted) return <PortalWait />;

  return <PortalProviders>{children}</PortalProviders>;
}
