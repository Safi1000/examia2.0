import type { ResultPayload } from "@/lib/diagnostic/logic";
import { reportText } from "@/lib/diagnostic/report";

/**
 * >>> WHERE FINISHED RESULTS GO <<<
 *
 * Called once, when a student finishes the check, with the full result:
 * kind (start or end of session), name, tracks (subject and level), the
 * "How you learn" answers, every answer with its confidence, the written
 * answers, the summary (readiness, ratings, calibration, misconceptions,
 * learning tips), startedAt and finishedAt.
 *
 * It is saved privately on the site (Admin → Starting points), where Hamza
 * reads the report and compares day one with the end of the session.
 * Returns false if it couldn't be saved, so the student can try again.
 */
export async function submitResult(payload: ResultPayload): Promise<boolean> {
  try {
    const res = await fetch("/api/diagnostic/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) return true;
    // Local preview has no storage: show the report in the console instead.
    if (res.status === 503) {
      console.log("Diagnostic result", JSON.stringify(payload));
      console.log(reportText(payload));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
