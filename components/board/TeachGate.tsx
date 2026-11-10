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
  // The room could not be worked out yet (no connection): say so instead of a blank screen.
  const [waiting, setWaiting] = useState(false);
  const isAdmin = session?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    let again: ReturnType<typeof setTimeout> | null = null;
    type Meta = { boardKey?: string } | undefined;
    // Before the dot: the name the tablet saves its board under (unchanged). After: the private key.
    const open = (id: string, key: string) => alive && setRoom(`t-${id.slice(0, 20)}.${key}`);
    const find = async () => {
      if (DEMO) return alive && setRoom("demo-teacher");
      try {
        // The sign-in kept on this device first: it needs no network, so the board opens (and its
        // saved pages with it) even when the Wi-Fi is down or slow. Before, that was a blank screen.
        const { data: local } = await supabase().auth.getSession();
        const mine = local.session?.user;
        const localKey = (mine?.user_metadata as Meta)?.boardKey;
        if (mine && localKey) return open(mine.id.replace(/-/g, ""), localKey);
        const { data } = await supabase().auth.getUser();
        const id = data.user?.id.replace(/-/g, "") ?? "";
        if (id) {
          // A random key kept on Hamza's own account (students can't read it), made
          // once, so the room can't be worked out from anything students can see.
          let key = (data.user?.user_metadata as Meta)?.boardKey;
          if (!key) {
            const b = new Uint8Array(12);
            crypto.getRandomValues(b);
            key = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
            await supabase().auth.updateUser({ data: { boardKey: key } });
          }
          return open(id, key);
        }
      } catch {}
      // No answer yet (offline, or the sign-in is slow): try again shortly instead of staying blank.
      if (!alive) return;
      setWaiting(true);
      again = setTimeout(() => void find(), 3000);
    };
    void find();
    return () => {
      alive = false;
      if (again) clearTimeout(again);
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
  if (!room)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#141618] px-6 text-center text-[#f0ede8]" role="status">
        {waiting && <p className="text-sm text-[#f0ede8]/70">Waiting for the connection. The board opens as soon as it is back.</p>}
      </div>
    );
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}
