"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

/**
 * Teacher-only, and gives both devices the same private board room: it comes
 * from Hamza's own account, so the tablet and the laptop find each other on
 * their own (no codes to copy) and nobody can guess it.
 */
const RoomContext = createContext<string | null>(null);
export const useBoardRoom = () => useContext(RoomContext);

export function TeachGate({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const [room, setRoom] = useState<string | null>(null);
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    void (async () => {
      if (DEMO) return alive && setRoom("demo-teacher");
      const { data } = await supabase().auth.getUser();
      const id = data.user?.id.replace(/-/g, "") ?? "";
      if (alive && id) setRoom(`t-${id.slice(0, 20)}`);
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  if (initializing) return <div className="fixed inset-0 bg-[#141618]" />;
  if (!isAdmin)
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[#141618] px-6 text-center text-[#f0ede8]">
        <p className="text-lg font-semibold">Sign in as the teacher to use the whiteboard.</p>
        <Link href="/admin" className="inline-flex h-11 items-center rounded-full bg-[#FBC159] px-6 text-sm font-bold text-[#141618]">
          Sign in
        </Link>
      </div>
    );
  if (!room) return <div className="fixed inset-0 bg-[#141618]" />;
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}
