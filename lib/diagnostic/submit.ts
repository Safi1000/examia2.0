import type { ResultPayload } from "@/lib/diagnostic/logic";
import { reportText } from "@/lib/diagnostic/report";

/**
 * >>> WHERE FINISHED RESULTS GO <<<
 *
 * Called once, when a student finishes the Starting Point Check, with the
 * full result: name, level, subjects, the "How you learn" answers, every
 * answer with its confidence, the written answers, the summary (ratings,
 * calibration, misconceptions, learning tips), startedAt and finishedAt.
 * reportText(payload) turns it into Hamza's plain-text report.
 *
 * For now it only logs. Later this is the one place to change, to send the
 * result to a Google Sheet, WhatsApp or the website's own storage.
 */
export async function submitResult(payload: ResultPayload): Promise<void> {
  console.log("Diagnostic result", JSON.stringify(payload));
  console.log(reportText(payload));
}
