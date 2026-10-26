/**
 * Whether the Starting Point Check is open, and which check it is: "start"
 * (day one) or "end" (the same check at the end of the session, to compare).
 * Hamza switches it in Settings → Starting Point Check. Stored on the admin
 * account like the timetable, so no database change. Server only.
 */
import type { Kind } from "@/lib/diagnostic/logic";
import { adminUser, saveAdminMeta } from "@/lib/schedule-server";
import { pushReady, serviceClient } from "@/lib/push-server";

export interface DiagnosticStatus {
  open: boolean;
  kind: Kind;
}

export async function diagnosticStatus(): Promise<DiagnosticStatus> {
  // Local preview without server keys: always open, for testing.
  if (!pushReady()) return { open: true, kind: "start" };
  try {
    const u = await adminUser(serviceClient());
    const d = (u?.app_metadata as { diagnostic?: { open?: boolean; kind?: Kind } } | undefined)?.diagnostic;
    return { open: !!d?.open, kind: d?.kind === "end" ? "end" : "start" };
  } catch {
    return { open: false, kind: "start" };
  }
}

export async function setDiagnosticStatus(callerId: string, status: DiagnosticStatus) {
  await saveAdminMeta(serviceClient(), callerId, { diagnostic: { ...status, changedAt: new Date().toISOString() } });
}
