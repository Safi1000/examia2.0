"use client";

import { useEffect, useState } from "react";
import { TeacherBoard } from "@/components/board/Whiteboard";

/** Hamza's board. Keeps one room per device; the room code is in the link. */
export default function BoardLabPage() {
  const [room, setRoom] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    let r = url.searchParams.get("room");
    if (!r) {
      try {
        r = localStorage.getItem("ht-board-room");
      } catch {}
    }
    if (!r) r = Math.random().toString(36).slice(2, 8);
    try {
      localStorage.setItem("ht-board-room", r);
    } catch {}
    url.searchParams.set("room", r);
    window.history.replaceState(null, "", url.toString());
    const id = setTimeout(() => setRoom(r), 0);
    return () => clearTimeout(id);
  }, []);
  return room ? <TeacherBoard room={room} /> : <div className="fixed inset-0 bg-[#141618]" />;
}
