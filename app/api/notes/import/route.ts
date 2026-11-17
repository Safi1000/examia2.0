import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/push-server";
import { checkKey, touchKey } from "@/lib/notes-import-server";
import { bookFor, chapterTitle, isHidden, levelOfName, matchChapter, setHidden, slotOf, subjectOfName, type NoteLevel, type NoteSubject } from "@/lib/notes-library";
import { saveNoteText } from "@/lib/note-text";
import { CLOUDINARY_CLOUD, CLOUDINARY_NOTES_PRESET } from "@/lib/config";

/**
 * Notes made outside the console (Claude on Hamza's Mac) are filed here with
 * the upload key from Settings, never a sign-in. The file itself goes straight
 * to file storage first; this only files it: the right level and subject, the
 * current batches that take them, its chapter (from its title), and its words
 * for search.
 *
 *   plan    : where each note would go, and what is already on that chapter.
 *   publish : add one note. Students in that level and subject see it at once.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const LEVELS: NoteLevel[] = ["IGCSE and O Level", "AS", "A2"];
const SUBJECTS: NoteSubject[] = ["Accounting", "Business", "Economics"];
type Row = Record<string, unknown>;

/** Where a level and subject live in the portal: its classes, subjects, the current batches, and the notes already there. */
async function place(sb: SupabaseClient, level: NoteLevel, subject: NoteSubject) {
  const [cls, subj, coh, cCls, cSubj] = await Promise.all([
    sb.from("classes").select("id,name"),
    sb.from("subjects").select("id,name"),
    sb.from("cohorts").select("id,name,active"),
    sb.from("cohort_classes").select("cohort_id,class_id"),
    sb.from("cohort_subjects").select("cohort_id,subject_id"),
  ]);
  const failed = [cls, subj, coh, cCls, cSubj].find((r) => r.error);
  if (failed) throw new Error(failed.error!.message);
  const classIds = ((cls.data ?? []) as Row[]).filter((c) => levelOfName(c.name as string) === level).map((c) => c.id as string);
  const subjectIds = ((subj.data ?? []) as Row[]).filter((s) => subjectOfName(s.name as string) === subject).map((s) => s.id as string);
  const links: Array<{ cohortId: string; cohort: string; classId: string; subjectId: string }> = [];
  for (const c of ((coh.data ?? []) as Row[]).filter((c) => c.active !== false)) {
    const own = ((cCls.data ?? []) as Row[]).filter((r) => r.cohort_id === c.id).map((r) => r.class_id as string);
    const ownS = ((cSubj.data ?? []) as Row[]).filter((r) => r.cohort_id === c.id).map((r) => r.subject_id as string);
    // A batch with no list takes everything (the console's own rule).
    for (const classId of classIds) {
      if (own.length && !own.includes(classId)) continue;
      for (const subjectId of subjectIds) {
        if (ownS.length && !ownS.includes(subjectId)) continue;
        links.push({ cohortId: c.id as string, cohort: c.name as string, classId, subjectId });
      }
    }
  }
  return { classIds, subjectIds, links };
}

/** Notes already filed under this level and subject: id, title, hidden or not. */
async function existing(sb: SupabaseClient, classIds: string[], subjectIds: string[]) {
  if (!classIds.length || !subjectIds.length) return [];
  const { data: na, error } = await sb.from("note_assignments").select("note_id").in("class_id", classIds).in("subject_id", subjectIds);
  if (error) throw new Error(error.message);
  const ids = [...new Set(((na ?? []) as Row[]).map((r) => r.note_id as string))];
  const out: Array<{ id: string; title: string; fileName: string; fileType: string }> = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: e } = await sb.from("notes").select("id,title,file_name,file_type").in("id", ids.slice(i, i + 150));
    if (e) throw new Error(e.message);
    for (const n of (data ?? []) as Row[]) out.push({ id: n.id as string, title: n.title as string, fileName: (n.file_name as string) ?? "", fileType: (n.file_type as string) ?? "" });
  }
  return out;
}

const asLevel = (v: unknown) => LEVELS.find((l) => l === v) ?? null;
const asSubject = (v: unknown) => SUBJECTS.find((s) => s === v) ?? null;

async function planOne(sb: SupabaseClient, level: NoteLevel, subject: NoteSubject, rawTitle: string, fileName: string) {
  const book = bookFor(level, subject);
  const ch = book ? matchChapter(book, rawTitle, fileName) : null;
  const where = await place(sb, level, subject);
  const slot = ch ? slotOf(ch) : null;
  // What students see on that chapter today.
  // With no chapter to go by (a handout under "More notes"), the same name counts as the same note.
  const plain = (t: string) => t.toLowerCase().replace(/\.pdf$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const there = (await existing(sb, where.classIds, where.subjectIds)).filter((n) => {
    if (isHidden(n.fileType)) return false;
    if (book && slot) {
      const m = matchChapter(book, n.title, n.fileName);
      return !!m && slotOf(m) === slot;
    }
    return plain(n.title) === plain(rawTitle) || plain(n.fileName) === plain(fileName || rawTitle);
  });
  return {
    title: ch ? (ch.unit ? ch.name : chapterTitle(ch.num, ch.name)) : rawTitle,
    chapter: ch ? { num: ch.num, name: ch.name, unit: !!ch.unit } : null,
    batches: [...new Set(where.links.map((l) => l.cohort))],
    there: there.map((n) => ({ id: n.id, title: n.title })),
    where,
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ error: "not set up" }, { status: 503, headers: noStore });
  const sb = serviceClient();
  if (!(await checkKey(sb, req.headers.get("x-notes-key")))) return NextResponse.json({ error: "That upload key isn't valid. Make a new one in Settings." }, { status: 401, headers: noStore });
  const body = (await req.json().catch(() => null)) as Row | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });

  try {
    if (body.action === "plan") {
      const items = Array.isArray(body.items) ? (body.items as Row[]).slice(0, 80) : [];
      const out = [];
      for (const it of items) {
        const level = asLevel(it.level);
        const subject = asSubject(it.subject);
        const title = typeof it.title === "string" ? it.title.trim().slice(0, 200) : "";
        if (!level || !subject || !title) {
          out.push({ error: "Needs a level, a subject and a title." });
          continue;
        }
        const p = await planOne(sb, level, subject, title, typeof it.fileName === "string" ? it.fileName : "");
        out.push({ title: p.title, chapter: p.chapter, batches: p.batches, there: p.there });
      }
      return NextResponse.json({ items: out, cloud: CLOUDINARY_CLOUD, preset: CLOUDINARY_NOTES_PRESET }, { headers: noStore });
    }

    if (body.action === "publish") {
      const level = asLevel(body.level);
      const subject = asSubject(body.subject);
      const rawTitle = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
      const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "note.pdf";
      const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
      if (!level || !subject || !rawTitle) return NextResponse.json({ error: "Needs a level, a subject and a title." }, { status: 400, headers: noStore });
      // Only a file in the site's own storage, never a link to somewhere else.
      if (!CLOUDINARY_CLOUD || !fileUrl.startsWith(`https://res.cloudinary.com/${CLOUDINARY_CLOUD}/`)) return NextResponse.json({ error: "That file isn't in the site's storage." }, { status: 400, headers: noStore });
      const pages = Array.isArray(body.pages) ? (body.pages as unknown[]).map((p) => (typeof p === "string" ? p : "")).slice(0, 600) : null;

      const p = await planOne(sb, level, subject, rawTitle, fileName);
      if (!p.where.links.length) return NextResponse.json({ error: `No current batch takes ${level} ${subject}.` }, { status: 409, headers: noStore });
      // The same note sent twice (a retry) is not filed twice.
      if (body.replace !== true && p.there.length) return NextResponse.json({ error: "That chapter already has a note.", there: p.there }, { status: 409, headers: noStore });

      const id = randomUUID();
      const ins = await sb.from("notes").insert({ id, title: p.title, file_url: fileUrl, file_type: "application/pdf", file_name: fileName, created_at: new Date().toISOString() });
      if (ins.error) throw new Error(ins.error.message);
      const links = await sb.from("note_assignments").insert(p.where.links.map((l) => ({ note_id: id, cohort_id: l.cohortId, class_id: l.classId, subject_id: l.subjectId })));
      if (links.error) {
        // Never leave a note nobody can see.
        await sb.from("notes").delete().eq("id", id);
        throw new Error(links.error.message);
      }
      // The older note on this chapter is hidden from students, not deleted: it can come back from the console.
      let hidden = 0;
      if (body.replace === true) {
        for (const old of p.there) {
          const { data } = await sb.from("notes").select("file_type").eq("id", old.id).maybeSingle();
          const upd = await sb.from("notes").update({ file_type: setHidden(((data as Row | null)?.file_type as string) ?? "application/pdf", true) }).eq("id", old.id);
          if (!upd.error) hidden++;
        }
      }
      let searchable = false;
      if (pages?.some((t) => t.trim())) {
        try {
          await saveNoteText(id, pages);
          searchable = true;
        } catch {}
      }
      await touchKey(sb, p.title);
      return NextResponse.json({ ok: true, noteId: id, title: p.title, chapter: p.chapter, batches: p.batches, hidden, searchable }, { headers: noStore });
    }
  } catch (e) {
    console.error("[notes import]", e);
    return NextResponse.json({ error: "The portal couldn't file that note. Try again." }, { status: 502, headers: noStore });
  }
  return NextResponse.json({ error: "bad request" }, { status: 400, headers: noStore });
}
