"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface AdminFilterValue {
  /** null = all cohorts */
  cohortId: string | null;
  setCohortId: (id: string | null) => void;
  /** Per-page chip selections, keyed by page (see `useStickyFilter`). */
  filters: Record<string, string[]>;
  setFilter: (key: string, values: string[]) => void;
}

const Ctx = createContext<AdminFilterValue | null>(null);

export function AdminFilterProvider({ children }: { children: React.ReactNode }) {
  const [cohortId, setCohortId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const setFilter = useCallback(
    (key: string, values: string[]) => setFilters((prev) => ({ ...prev, [key]: values })),
    [],
  );
  const value = useMemo(
    () => ({ cohortId, setCohortId, filters, setFilter }),
    [cohortId, filters, setFilter],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminFilter(): AdminFilterValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminFilter must be used within AdminFilterProvider");
  return ctx;
}

/**
 * A filter selection that outlives navigation.
 *
 * The provider is mounted in the admin layout, so state kept here survives
 * moving to a submission and coming back — page-local useState does not, which
 * is why every filter reset on the way back.
 */
export function useStickyFilter(key: string): [string[], (values: string[]) => void] {
  const { filters, setFilter } = useAdminFilter();
  const set = useCallback((values: string[]) => setFilter(key, values), [key, setFilter]);
  return [filters[key] ?? EMPTY, set];
}

const EMPTY: string[] = [];
