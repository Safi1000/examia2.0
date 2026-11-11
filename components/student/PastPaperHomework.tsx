"use client";

import { useEffect, useState } from "react";
import { PageStack } from "@/components/PageStack";
import { isPaperImage } from "@/lib/paper-builder";

/**
 * Homework built "From past papers", as the student sees it: the questions
 * numbered in this homework's own order ("Question 1", "Question 2"), each
 * with only its own picture (the paper's printed number covered), and any
 * case study or data pages under "Reading". Never the paper's name.
 *
 * The server says which question each picture shows (/api/paper-builder,
 * action "view"), and brings older pictures up to date on the way.
 */
type Group = { title: string; urls: string[] };

export function PastPaperHomework({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  const [groups, setGroups] = useState<{ key: string; list: Group[] } | null>(null);

  useEffect(() => {
    let live = true;
    const paper = urls.filter(isPaperImage);
    fetch("/api/paper-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "view", urls: paper }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { urls?: Array<string | null>; ids?: Array<string | null> } | null) => {
        if (!live) return;
        const byId = new Map<string, string[]>();
        const reading: string[] = [];
        const other: string[] = [];
        let pi = 0;
        for (const u of urls) {
          if (!isPaperImage(u)) {
            other.push(u);
            continue;
          }
          const i = pi++;
          const shown = body?.urls ? body.urls[i] : u;
          const id = body?.ids?.[i] ?? null;
          if (!shown) continue;
          if (id) byId.set(id, [...(byId.get(id) ?? []), shown]);
          else reading.push(shown);
        }
        const list: Group[] = [...byId.values()].map((g, i) => ({ title: `Question ${i + 1}`, urls: g }));
        if (reading.length) list.push({ title: "Reading for the written questions", urls: reading });
        if (other.length) list.push({ title: "Also attached", urls: other });
        setGroups({ key, list });
      })
      .catch(() => live && setGroups({ key, list: [{ title: "Questions", urls }] }));
    return () => {
      live = false;
    };
    // `key` stands for the list of links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!groups || groups.key !== key) return <div className="skeleton h-40 w-full rounded-lg" aria-busy="true" aria-label="Loading the questions" />;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2">For a multiple choice question, write its number and your letter: for example, 1 B.</p>
      {groups.list.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="mb-2 text-sm font-bold text-ink">{g.title}</h3>
          <PageStack urls={g.urls} label={g.title} />
        </section>
      ))}
    </div>
  );
}
