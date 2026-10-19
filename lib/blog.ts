/**
 * The blog's index. Every article is one file in content/blog/<slug>.mdx that
 * starts with `export const meta = { ... }` (see ArticleMeta). Adding a file
 * adds the article: list, sitemap and Google data all pick it up at build.
 * Server only (reads the folder).
 */
import fs from "node:fs";
import path from "node:path";
import type { LevelName, SubjectName } from "@/lib/landing";

export type ArticleType = "Topic" | "Exam technique" | "Past paper";

export interface ArticleMeta {
  title: string;
  /** About 155 characters: the Google snippet and the card text. */
  description: string;
  subject: SubjectName;
  level: LevelName;
  /** Syllabus codes, e.g. "IGCSE 0452 · O Level 7707". */
  code: string;
  type: ArticleType;
  /** yyyy-mm-dd. */
  date: string;
  updated?: string;
  /** Optional shorter <title> for Google when `title` is long (aim for 60 characters). */
  seoTitle?: string;
}

export interface Article extends ArticleMeta {
  slug: string;
  minutes: number;
}

const DIR = path.join(process.cwd(), "content", "blog");

export function articleSlugs(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

/** Reading time from the file's words (code and JSX tags stripped). */
function readMinutes(slug: string): number {
  const text = fs
    .readFileSync(path.join(DIR, `${slug}.mdx`), "utf8")
    .replace(/export const meta[\s\S]*?\n};?\n/, "")
    .replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function getArticle(slug: string): Promise<Article | null> {
  if (!articleSlugs().includes(slug)) return null;
  const mod = (await import(`@/content/blog/${slug}.mdx`)) as { meta: ArticleMeta };
  return { ...mod.meta, slug, minutes: readMinutes(slug) };
}

/** Newest first. */
export async function allArticles(): Promise<Article[]> {
  const list = await Promise.all(articleSlugs().map(getArticle));
  return list
    .filter((a): a is Article => a !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}
