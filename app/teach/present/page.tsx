"use client";

import { TeacherBoard } from "@/components/board/Whiteboard";
import { useBoardRoom } from "@/components/board/TeachGate";

/** On the laptop: share this window in Meet. Draw, type and add pictures here too; it follows the tablet's view. */
export default function TeachPresentPage() {
  const room = useBoardRoom();
  return room ? <TeacherBoard room={room} lead={false} /> : null;
}
