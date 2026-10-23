"use client";

import { ViewerBoard } from "@/components/board/Whiteboard";
import { useBoardRoom } from "@/components/board/TeachGate";

/** On the laptop: share this window in Meet. It follows the tablet live. */
export default function TeachPresentPage() {
  const room = useBoardRoom();
  return room ? <ViewerBoard room={room} present /> : null;
}
