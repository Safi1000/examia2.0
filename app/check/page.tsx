import { Diagnostic } from "@/components/diagnostic/Diagnostic";
import { diagnosticStatus } from "@/lib/diagnostic/status-server";

// The short link for the Starting Point Check (same as /starting-point). Checks the
// open/closed switch at most every 20 seconds.
export const revalidate = 20;

export default async function CheckPage() {
  const { open, kind } = await diagnosticStatus();
  return <Diagnostic open={open} kind={kind} group="online" />;
}
