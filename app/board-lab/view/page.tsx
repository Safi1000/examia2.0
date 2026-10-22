"use client";

import { useEffect, useState } from "react";
import { ViewerBoard } from "@/components/board/Whiteboard";

/** What a student sees: Hamza's board, live. */
export default function BoardViewPage() {
  const [room, setRoom] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    const r = u.searchParams.get("room");
    const id = setTimeout(() => {
      setPresent(u.searchParams.get("present") === "1");
      setRoom(r ?? "");
    }, 0);
    return () => clearTimeout(id);
  }, []);
  if (room === null) return <div className="fixed inset-0 bg-[#141618]" />;
  if (!room)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#141618] px-6 text-center text-sm text-[#a6acb2]">
        This link is missing its board code. Ask Hamza for the student link.
      </div>
    );
  return <ViewerBoard room={room} present={present} />;
}
