import { Diagnostic } from "@/components/diagnostic/Diagnostic";
import { diagnosticStatus } from "@/lib/diagnostic/status-server";

// Checks the open/closed switch at most every 20 seconds.
export const revalidate = 20;

export default async function StartingPointPage() {
  const { open, kind } = await diagnosticStatus();
  return <Diagnostic open={open} kind={kind} />;
}
