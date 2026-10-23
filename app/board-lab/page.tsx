import { redirect } from "next/navigation";

/**
 * The old open test board. Drawing now happens only in the teacher console
 * (/teach/board, sign-in required), so a student who edits their view link
 * can't land on a board that draws. /board-lab/view (watch only) stays.
 */
export default function BoardLabPage() {
  redirect("/admin/whiteboard");
}
