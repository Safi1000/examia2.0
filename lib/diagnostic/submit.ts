import type { ResultPayload } from "@/lib/diagnostic/logic";

/**
 * >>> WHERE FINISHED RESULTS GO <<<
 *
 * Called once, when a student finishes the Starting Point Check, with the
 * full result: about (the form), level, subjects, every answer with its
 * confidence, the written answers, the summary ratings and finishedAt.
 *
 * For now it only logs. Later this is the one place to change, to send the
 * result to a Google Sheet, WhatsApp or the website's own storage.
 */
export async function submitResult(payload: ResultPayload): Promise<void> {
  console.log("Diagnostic result", JSON.stringify(payload));
}
