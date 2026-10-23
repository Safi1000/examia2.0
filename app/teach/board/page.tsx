"use client";

import { TeacherBoard } from "@/components/board/Whiteboard";
import { useBoardRoom } from "@/components/board/TeachGate";

/** On the tablet: the board you draw on. */
export default function TeachBoardPage() {
  const room = useBoardRoom();
  return room ? <TeacherBoard room={room} /> : null;
}
