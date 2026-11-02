import { Diagnostic } from "@/components/diagnostic/Diagnostic";
import { diagnosticStatus } from "@/lib/diagnostic/status-server";

// The link for students sitting in the classroom: the same check, and their results are
// marked "in class" so they can be looked at apart from the online students.
export const revalidate = 20;

export default async function CheckInClassPage() {
  const { open, kind } = await diagnosticStatus();
  return <Diagnostic open={open} kind={kind} group="class" />;
}
