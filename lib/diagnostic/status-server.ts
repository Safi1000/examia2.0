/**
 * Whether the Starting Point Check is open. Hamza switches it on for the
 * first class and off afterwards (Settings → Starting Point Check). Stored
 * on the admin account like the timetable, so no database change. Server only.
 */
import { adminUser, saveAdminMeta } from "@/lib/schedule-server";
import { pushReady, serviceClient } from "@/lib/push-server";

export async function diagnosticOpen(): Promise<boolean> {
  // Local preview without server keys: always open, for testing.
  if (!pushReady()) return true;
  try {
    const u = await adminUser(serviceClient());
    return !!(u?.app_metadata as { diagnostic?: { open?: boolean } } | undefined)?.diagnostic?.open;
  } catch {
    return false;
  }
}

export async function setDiagnosticOpen(callerId: string, open: boolean) {
  await saveAdminMeta(serviceClient(), callerId, { diagnostic: { open, changedAt: new Date().toISOString() } });
}
