import { Diagnostic } from "@/components/diagnostic/Diagnostic";
import { diagnosticOpen } from "@/lib/diagnostic/status-server";

// Checks the open/closed switch at most every 20 seconds.
export const revalidate = 20;

export default async function StartingPointPage() {
  return <Diagnostic open={await diagnosticOpen()} />;
}
