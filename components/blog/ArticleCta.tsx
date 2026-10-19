import { BookButton } from "@/components/landing/BookingModal";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { waTextLink, type LevelName, type SubjectName } from "@/lib/landing";

const gold =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";
const ghost =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-body transition-colors hover:border-gold-border hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";

/**
 * The two asks inside every article. "mid" is placed by the writer with
 * <BookingBox />; "end" is added by the page after the last paragraph.
 */
export function ArticleCta({
  variant,
  slug,
  topic,
  subject,
  level,
}: {
  variant: "mid" | "end";
  slug: string;
  topic: string;
  subject: SubjectName;
  level: LevelName;
}) {
  const from = `blog:${slug}`;
  const ask = waTextLink(`Hi, I read your article on ${topic}. I have a question.`);

  if (variant === "mid") {
    return (
      <aside className="my-12 rounded-[20px] border border-hairline bg-card p-6 md:p-7">
        <p className="text-lg font-semibold text-foreground">Stuck on this topic?</p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Take one free trial lesson with me and we work through it together, live.
        </p>
        <div className="mt-5">
          <BookButton from={`${from}:mid`} subject={subject} level={level} className={gold}>
            Book your free trial lesson
          </BookButton>
        </div>
      </aside>
    );
  }

  return (
    <aside className="mt-16 rounded-[24px] border border-gold-border bg-card-raised p-7 md:p-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
        {subject} · {level}
      </p>
      <h2 className="mt-3 max-w-[22ch] text-2xl font-bold leading-tight text-foreground md:text-3xl">
        Want this to finally click?
      </h2>
      <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
        Small live classes online, every lesson recorded the same night, and weekly tests I mark
        myself. Start with one free lesson.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <BookButton from={`${from}:end`} subject={subject} level={level} className={gold}>
          Book your free trial lesson
        </BookButton>
        <TrackedLink href={ask} props={{ from: `${from}:ask` }} className={ghost}>
          Ask me about this topic
        </TrackedLink>
      </div>
    </aside>
  );
}
