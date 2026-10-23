"use client";

import { useState } from "react";
import { track } from "@/lib/landing";
import { LETTERS } from "@/lib/mcq-papers";

export interface TopicItem {
  /** "9708/11, June 2024" */
  paper: string;
  questionPaper: string;
  n: number;
  correct: string;
  note?: string;
}

const chip =
  "min-h-11 rounded-full border border-hairline-strong px-4 text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-gold aria-pressed:bg-gold aria-pressed:text-[#1b1e21] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const bubble =
  "flex h-12 w-12 items-center justify-center rounded-full border border-hairline-strong text-base font-semibold text-foreground transition-colors hover:border-gold-border disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** One question at a time from real past papers, checked as soon as you answer. */
export function TopicPractice({ topics, syllabus }: { topics: Array<{ topic: string; items: TopicItem[] }>; syllabus: string }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [right, setRight] = useState(0);

  const items = topics.find((t) => t.topic === topic)?.items ?? [];
  const item = items[i];
  const done = topic !== null && i >= items.length;

  const start = (t: string) => {
    setTopic(t);
    setI(0);
    setPicked(null);
    setRight(0);
    track("mcq_topic", { syllabus, topic: t });
  };
  const answer = (l: string) => {
    if (picked || !item) return;
    setPicked(l);
    if (l === item.correct) setRight((r) => r + 1);
  };
  const next = () => {
    setPicked(null);
    setI((x) => x + 1);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <button key={t.topic} type="button" aria-pressed={topic === t.topic} className={chip} onClick={() => start(t.topic)}>
            {t.topic} <span className="font-normal opacity-70">· {t.items.length}</span>
          </button>
        ))}
      </div>

      {item && (
        <div className="mt-6 rounded-[20px] border border-hairline bg-card p-6 md:p-7" aria-live="polite">
          <p className="text-sm tabular-nums text-muted-foreground">
            {topic}: {i + 1} of {items.length}
          </p>
          <p className="mt-3 text-[17px] leading-relaxed text-body">
            Open{" "}
            <a href={item.questionPaper} target="_blank" rel="noopener" className="text-gold hover:underline">
              {item.paper}
            </a>{" "}
            and answer <strong className="text-foreground">Question {item.n}</strong>.
          </p>
          <div role="group" aria-label={`Your answer to question ${item.n}`} className="mt-5 flex gap-3">
            {LETTERS.map((l) => {
              const shade = !picked ? "" : l === item.correct ? " border-gold bg-gold text-[#1b1e21]" : l === picked ? " border-error-x text-error-x" : " opacity-50";
              return (
                <button key={l} type="button" disabled={!!picked} className={bubble + shade} onClick={() => answer(l)}>
                  {l}
                </button>
              );
            })}
          </div>
          {picked && (
            <div className="mt-5 text-[17px] leading-relaxed text-body">
              <p className="font-semibold text-foreground">{picked === item.correct ? "Right." : `Not this time. The answer is ${item.correct}.`}</p>
              {item.note && <p className="mt-2 text-muted-foreground">{item.note}</p>}
              <button type="button" onClick={next} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]">
                {i + 1 < items.length ? "Next question" : "See my score"}
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="mt-6 rounded-[20px] border border-gold-border/60 bg-card-raised p-6 md:p-7">
          <p className="text-[17px] text-body">
            {topic}: <strong className="text-foreground">{right} out of {items.length}</strong>.
          </p>
          <p className="mt-2 text-[15px] text-muted-foreground">Pick another topic above, or this one again to go back over it.</p>
        </div>
      )}
    </div>
  );
}
