"use client";

import type { Database } from "@/lib/data/seed";
import { studentById } from "@/lib/data/selectors";
import { reportData } from "@/lib/report-data";

/**
 * Builds a student's monthly report PDF.
 *
 * Shared by the student page and the batch "send monthly reports" run, so both
 * produce exactly the same document. `@react-pdf` (a 1.4 MB chunk) and the
 * document itself are imported on demand — importing them at module scope would
 * put the whole renderer back into every page that merely links here.
 */

export interface BuiltReport {
  blob: Blob;
  fileName: string;
  /** The month it covers, as YYYY-MM ("" for all-time). */
  month: string;
}

export async function buildStudentReport(
  db: Database,
  studentId: string,
  month: string,
  teacherNote = "",
): Promise<BuiltReport | null> {
  const student = studentById(db, studentId);
  if (!student) return null;

  const [{ pdf }, { ReportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/ReportDocument"),
  ]);

  const data = reportData(db, studentId, month, teacherNote);
  if (!data) return null;
  const blob = await pdf(<ReportDocument data={data} />).toBlob();

  const safeName = student.username.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return { blob, fileName: `report-${safeName}-${month || "all"}.pdf`, month };
}
