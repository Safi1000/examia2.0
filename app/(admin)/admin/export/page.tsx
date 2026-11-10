"use client";

import { useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Checkbox, Badge, Icon } from "@/components/ui";
import { COMPANY_SLUG } from "@/lib/config";
import {
  buildExport,
  entityCount,
  entityRows,
  exportFilename,
  marksSheet,
  toCsv,
  todayStamp,
  CSV_BOM,
  TABULAR,
  ENTITY_LABEL,
  type EntityKey,
} from "@/lib/export";

const ALL: EntityKey[] = ["cohorts", "students", "tests", "submissions", "announcements", "bank"];

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Not at once: Safari and Samsung Internet drop a big download if its link dies in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ExportPage() {
  const db = useDatabase();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<EntityKey>>(new Set(ALL));
  // Read once: the file name shown under the button is today's, in Pakistan time.
  const [today] = useState(() => todayStamp(Date.now()));

  function toggle(key: EntityKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function downloadJson() {
    const keys = ALL.filter((k) => selected.has(k));
    if (keys.length === 0) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      organisation: COMPANY_SLUG,
      data: buildExport(db, keys),
    };
    const name = exportFilename(COMPANY_SLUG, todayStamp(Date.now()), "json");
    download(JSON.stringify(payload, null, 2), name, "application/json");
    toast(`Exported ${keys.length} ${keys.length === 1 ? "entity" : "entities"} as JSON.`, "success");
  }

  function downloadCsv(key: EntityKey) {
    const csv = toCsv(entityRows(db, key));
    if (!csv) return toast(`No ${ENTITY_LABEL[key].toLowerCase()} to export yet.`, "info");
    const name = `${COMPANY_SLUG}-${key}-${todayStamp(Date.now())}.csv`;
    // The byte-order mark makes Excel read names in any script correctly.
    download(CSV_BOM + csv, name, "text/csv;charset=utf-8");
    toast(`Exported ${ENTITY_LABEL[key]} as CSV.`, "success");
  }

  function downloadMarks() {
    const csv = toCsv(marksSheet(db));
    if (!csv) return toast("No students to export yet.", "info");
    download(CSV_BOM + csv, `${COMPANY_SLUG}-marks-${todayStamp(Date.now())}.csv`, "text/csv;charset=utf-8");
    toast("Marks spreadsheet downloaded.", "success");
  }

  function downloadBackup() {
    const payload = { exportedAt: new Date().toISOString(), organisation: COMPANY_SLUG, data: db };
    download(JSON.stringify(payload), `${COMPANY_SLUG}-full-backup-${todayStamp(Date.now())}.json`, "application/json");
    toast("Full backup downloaded. Keep it somewhere safe.", "success");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader title="Data export" subtitle="Download a snapshot of your portal data." />

      <Card className="mb-5 max-w-2xl p-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Marks spreadsheet</h2>
        <p className="mt-1 text-sm text-ink-2">Every current student, every released test as a percentage, and their average. Opens in Excel or Google Sheets.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={downloadMarks}>
            <Icon.Download className="h-4 w-4" /> Download marks
          </Button>
          <Button variant="secondary" onClick={downloadBackup}>
            <Icon.Download className="h-4 w-4" /> Full backup (everything)
          </Button>
        </div>
      </Card>

      <Card className="max-w-2xl p-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Choose entities</h2>
        <ul className="mt-3 divide-y divide-border">
          {ALL.map((key) => (
            // Same height with or without a CSV button, and the whole label is a 44px tap target.
            <li key={key} className="flex min-h-16 items-center justify-between gap-3 py-2.5">
              <Checkbox className="min-h-11" checked={selected.has(key)} onChange={() => toggle(key)} label={
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{ENTITY_LABEL[key]}</span>
                  <Badge tone="neutral">{entityCount(db, key)}</Badge>
                </span>
              } />
              {TABULAR.includes(key) && (
                <button onClick={() => downloadCsv(key)} aria-label={`Download ${ENTITY_LABEL[key]} as CSV`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                  <Icon.Download className="h-3.5 w-3.5" /> CSV
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button onClick={downloadJson} disabled={selected.size === 0}>
            <Icon.Download className="h-4 w-4" /> Download JSON
          </Button>
          <p className="min-w-0 break-all font-mono text-xs text-ink-3">
            {exportFilename(COMPANY_SLUG, today, "json")}
          </p>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          JSON includes every selected entity. CSV is available for tabular entities (cohorts, students, submissions).
        </p>
      </Card>
    </div>
  );
}
