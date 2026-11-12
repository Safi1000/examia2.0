import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import type { PdfImage, PdfPaper, PdfQuestion } from "@/lib/test-pdf-model";

// ============================================================================
// A test printed for students (TestPaperDocument) and its marking sheet for
// the teacher (MarkingSheetDocument). A4, white paper, black text: printer
// friendly. Brand kept quiet: the wordmark small on its own dark tile (the
// gold logo only sits on dark), Inter Tight as in the parent report, and one
// thin gold rule as the only colour. Layout only: lib/test-pdf-model.ts says
// what is printed and lib/test-pdf.tsx loads the pictures.
// ============================================================================

const FONT_CDN = "https://cdn.jsdelivr.net/fontsource/fonts";
Font.register({
  family: "Inter Tight",
  fonts: [
    { src: `${FONT_CDN}/inter-tight@5.2.5/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FONT_CDN}/inter-tight@5.2.5/latin-600-normal.ttf`, fontWeight: 600 },
    { src: `${FONT_CDN}/inter-tight@5.2.5/latin-800-normal.ttf`, fontWeight: 800 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const INK = "#1A1D20";
const BODY = "#26292D";
const MUTED = "#5E646A";
const FAINT = "#8A9096";
const RULE = "#C4C8CC";
const GOLD = "#FBC159";
const TILE = "#212427";

const A4_W = 595.28;
const A4_H = 841.89;
const SIDE = 54;
const TOP = 46;
const BOTTOM = 62;
const NUM_W = 26;
const MARK_W = 34;
/** Room for a question's own content (between its number and its marks). */
const CONTENT_W = A4_W - 2 * SIDE - NUM_W - MARK_W;
/** The tallest a picture may be and still sit on one page with its number. */
const MAX_PIC_H = A4_H - TOP - BOTTOM - 200;
const LINE_GAP = 24;
const PAGE_H = A4_H - TOP - BOTTOM;
const TEXT_LH = 10.5 * 1.45;

/** About how many lines a text takes at a width (a little generous, so blocks are never too tall). */
function linesOf(text: string, width: number, size = 10.5) {
  const perLine = Math.max(10, Math.floor(width / (size * 0.53)));
  return text.split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.replace(/\*\*/g, "").length / perLine)), 0);
}

/** The tallest the first picture may be so the number, words, picture and choices still fit on one page. */
function pictureRoom(q: PdfQuestion<PdfImage>, withChoices: boolean) {
  let used = 18 + 6 + 12;
  if (q.text) used += linesOf(q.text, CONTENT_W) * TEXT_LH + 4;
  if (withChoices && q.kind === "mcq") used += q.pictureChoice ? 30 : 8 + q.options.reduce((n, o) => n + linesOf(o, CONTENT_W - 25) * TEXT_LH + 6, 0);
  if (q.kind === "written") used += 2 * LINE_GAP + 4;
  return Math.max(160, Math.min(MAX_PIC_H, PAGE_H - used));
}
const LOGO_W = 99;
const LOGO_H = LOGO_W * (67 / 438);

const s = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", paddingHorizontal: SIDE, paddingTop: TOP, paddingBottom: BOTTOM, fontFamily: "Inter Tight", fontSize: 10.5, color: BODY },
  // Line height sits on the content, never on the page: a counted page number inherits it and then is not drawn.
  flow: { lineHeight: 1.45 },
  row: { flexDirection: "row" },
  num: { width: NUM_W, fontWeight: 800, color: INK, fontSize: 10.5 },
  marks: { width: MARK_W, textAlign: "right", color: MUTED, fontSize: 9.5 },
  body: { width: CONTENT_W },
  label: { fontSize: 7.2, letterSpacing: 1.6, color: MUTED, fontWeight: 600, textTransform: "uppercase" },
  hair: { height: 0.6, backgroundColor: RULE },
});

// ---- Small parts -------------------------------------------------------------

/** Wording with the paper's line breaks, and its **bold** words when it is a past paper's. */
function Words({ text, rich, style }: { text: string; rich: boolean; style?: ComponentProps<typeof View>["style"] }) {
  const paras = text.split("\n").filter((p, i, all) => p.trim() || (i > 0 && i < all.length - 1));
  return (
    <View style={style}>
      {paras.map((p, i) => (
        <Text key={i} style={{ marginTop: i ? 4 : 0 }}>
          {rich
            ? p.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                /^\*\*[^*]+\*\*$/.test(part) ? (
                  <Text key={j} style={{ fontWeight: 800, color: INK }}>{part.slice(2, -2)}</Text>
                ) : (
                  <Text key={j}>{part}</Text>
                ),
              )
            : p}
        </Text>
      ))}
    </View>
  );
}

const plain = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1");

/** A bubble with its letter, to fill in. */
function Bubble({ letter, size = 15 }: { letter: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 0.8, borderColor: INK, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.5, fontWeight: 600, color: INK, lineHeight: 1, marginTop: 0.5 }}>{letter}</Text>
    </View>
  );
}

/** A picture at the text width (or smaller when it would not fit on a page), or a clear note when it failed. */
function Picture({ img, width = CONTENT_W, maxH = MAX_PIC_H }: { img: PdfImage; width?: number; maxH?: number }) {
  if ("failed" in img)
    return (
      <View style={{ width, borderWidth: 0.8, borderColor: RULE, borderStyle: "dashed", paddingVertical: 14, paddingHorizontal: 12, marginTop: 6 }}>
        <Text style={{ fontSize: 9.5, color: MUTED }}>This picture could not be loaded. Download the PDF again, or show the question on screen.</Text>
      </View>
    );
  let w = width;
  let h = (width * img.h) / img.w;
  if (h > maxH) {
    h = maxH;
    w = (maxH * img.w) / img.h;
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image src={img.src} style={{ width: w, height: h, marginTop: 6 }} />;
}

/** The running footer: the title on the left, the page count on the right. */
function Footer({ title, note }: { title: string; note?: string }) {
  return (
    <>
      <Text fixed style={{ position: "absolute", left: SIDE, bottom: 30, width: A4_W - 2 * SIDE - 110, fontSize: 7.8, color: FAINT, maxLines: 1, textOverflow: "ellipsis" }}>
        {note ? `${title} · ${note}` : title}
      </Text>
      {/* A page count drawn on its own, at a set width (a counted text in a row can come out empty). */}
      <Text
        fixed
        style={{ position: "absolute", right: SIDE, bottom: 30, width: 100, textAlign: "right", fontSize: 7.8, color: FAINT }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}

/** The header: the wordmark on its tile, the title and its details, one gold rule. */
function Header({ paper, eyebrow }: { paper: PdfPaper; eyebrow?: string }) {
  return (
    <View>
      <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
        <View style={{ flex: 1, paddingRight: 24 }}>
          {eyebrow ? <Text style={[s.label, { marginBottom: 6 }]}>{eyebrow}</Text> : null}
          <Text style={{ fontSize: 20, fontWeight: 800, color: INK, lineHeight: 1.2, letterSpacing: -0.3 }}>{paper.title}</Text>
          {paper.details.length ? <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 5 }}>{paper.details.join("   ·   ")}</Text> : null}
        </View>
        <View style={{ backgroundColor: TILE, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 7 }}>
          {/* The wordmark sits at 23..461 × 74..141 of its 480 × 223 file: shown alone, 35 mm wide (its print minimum). */}
          <View style={{ width: LOGO_W, height: LOGO_H, overflow: "hidden", position: "relative" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={paper.logo} style={{ position: "absolute", width: LOGO_H * (480 / 67), height: LOGO_H * (223 / 67), left: -LOGO_H * (23 / 67), top: -LOGO_H * (74 / 67) }} />
          </View>
        </View>
      </View>
      <View style={{ height: 1.2, backgroundColor: GOLD, marginTop: 14 }} />
    </View>
  );
}

function FillLine({ label, width }: { label: string; width?: number }) {
  return (
    <View style={[s.row, { alignItems: "flex-end", flex: width ? undefined : 1, width }]}>
      <Text style={{ fontSize: 9.5, color: MUTED, marginRight: 8 }}>{label}</Text>
      <View style={{ flex: 1, borderBottomWidth: 0.7, borderBottomColor: INK, height: 12 }} />
    </View>
  );
}

const marksLabel = (m: number) => `[${m}]`;

// ---- The question paper ----------------------------------------------------------

function QuestionBlock({ q }: { q: PdfQuestion<PdfImage> }) {
  const [first, ...rest] = q.images;
  const more = rest.length > 0 || q.inserts.length > 0;
  // Kept together: the number, the wording, the first picture and every choice
  // (or the first lines of a written answer). Never split from one another.
  const head = (
    <View wrap={false} style={{ marginTop: 18 }}>
      <View style={s.row}>
        <Text style={s.num}>{q.n}</Text>
        <View style={s.body}>
          {q.text ? <Words text={q.text} rich={q.rich} /> : null}
          {first ? <Picture img={first} maxH={pictureRoom(q, !more)} /> : null}
          {q.kind === "mcq" && !q.pictureChoice && !more && q.options.length ? <Options options={q.options} rich={q.rich} /> : null}
          {q.kind === "mcq" && q.pictureChoice && !more ? <PictureChoice /> : null}
          {q.kind === "written" && !more ? <Lines count={Math.min(q.lines, 2)} /> : null}
          {q.separate && !more ? <SeparatePaper /> : null}
          {q.ownSpace && !more ? <OwnSpace /> : null}
        </View>
        <Text style={s.marks}>{marksLabel(q.marks)}</Text>
      </View>
    </View>
  );
  return (
    <>
      {head}
      {rest.map((img, i) => (
        <View key={i} wrap={false} style={{ marginLeft: NUM_W }}>
          <Picture img={img} />
        </View>
      ))}
      {q.inserts.map((img, i) => (
        <View key={`in${i}`} wrap={false} style={{ marginLeft: NUM_W, marginTop: i ? 0 : 10 }}>
          {i === 0 ? <Text style={s.label}>Insert for question {q.n}</Text> : null}
          <Picture img={img} />
        </View>
      ))}
      {more && q.kind === "mcq" ? (
        <View wrap={false} style={{ marginLeft: NUM_W, width: CONTENT_W }}>
          {q.pictureChoice ? <PictureChoice /> : <Options options={q.options} rich={q.rich} />}
        </View>
      ) : null}
      {q.kind === "written" && q.lines > 0 ? (
        // The first two lines sit with the question; the rest may run onto the next page.
        Array.from({ length: Math.max(0, q.lines - (more ? 0 : 2)) }, (_, i) => (
          <View key={`l${i}`} wrap={false} style={{ marginLeft: NUM_W, width: CONTENT_W, height: LINE_GAP, borderBottomWidth: 0.6, borderBottomColor: RULE }} />
        ))
      ) : null}
      {q.insertWith ? (
        <View wrap={false} style={{ marginLeft: NUM_W }}>
          <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 8 }}>Use the insert printed after question {q.insertWith}.</Text>
        </View>
      ) : null}
      {q.ownSpace && more ? (
        <View wrap={false} style={{ marginLeft: NUM_W }}>
          <OwnSpace />
        </View>
      ) : null}
      {q.separate && more ? (
        <View wrap={false} style={{ marginLeft: NUM_W }}>
          <SeparatePaper />
        </View>
      ) : null}
    </>
  );
}

function Options({ options, rich }: { options: string[]; rich: boolean }) {
  return (
    <View style={{ marginTop: 8 }}>
      {options.map((o, i) => (
        <View key={i} style={[s.row, { marginTop: i ? 4 : 0, alignItems: "flex-start" }]}>
          <Bubble letter={"ABCDEF"[i] ?? "?"} />
          <Words text={o} rich={rich} style={{ marginLeft: 10, width: CONTENT_W - 25, marginTop: 0.5 }} />
        </View>
      ))}
    </View>
  );
}

/** Under a picture whose choices are printed in it: the four bubbles to fill. */
function PictureChoice() {
  return (
    <View style={[s.row, { marginTop: 10, alignItems: "center" }]}>
      <Text style={{ fontSize: 9, color: MUTED, marginRight: 12 }}>Your answer</Text>
      {["A", "B", "C", "D"].map((l) => (
        <View key={l} style={{ marginRight: 14 }}>
          <Bubble letter={l} />
        </View>
      ))}
    </View>
  );
}

function Lines({ count }: { count: number }) {
  return (
    <View style={{ marginTop: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ height: LINE_GAP, borderBottomWidth: 0.6, borderBottomColor: RULE }} />
      ))}
    </View>
  );
}

function SeparatePaper() {
  return <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 8 }}>Answer this question on separate paper. Write the question number at the top.</Text>;
}

function OwnSpace() {
  return <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 8 }}>Write your answer in the spaces on these pages. Where there are none, use separate paper.</Text>;
}

function EndLine() {
  return (
    <View wrap={false} style={[s.row, { marginTop: 30, alignItems: "center", justifyContent: "center" }]}>
      <View style={{ width: 40, height: 0.6, backgroundColor: RULE }} />
      <Text style={[s.label, { marginHorizontal: 12, color: MUTED }]}>End of test</Text>
      <View style={{ width: 40, height: 0.6, backgroundColor: RULE }} />
    </View>
  );
}

/** Columns of question numbers with A to D bubbles. */
function AnswerGrid({ questions }: { questions: PdfQuestion<PdfImage>[] }) {
  const mcq = questions.filter((q) => q.kind === "mcq");
  const perCol = Math.min(20, Math.max(10, Math.ceil(mcq.length / 3)));
  const cols: PdfQuestion<PdfImage>[][] = [];
  for (let i = 0; i < mcq.length; i += perCol) cols.push(mcq.slice(i, i + perCol));
  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: 800, color: INK }}>Answer grid</Text>
      <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 4 }}>For each multiple choice question, fill in one circle.</Text>
      <View style={[s.row, { marginTop: 16, gap: 26 }]}>
        <FillLine label="Name" />
      </View>
      <View style={{ height: 1.2, backgroundColor: GOLD, marginTop: 18, marginBottom: 6 }} />
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {cols.map((col, c) => (
          <View key={c} style={{ width: (A4_W - 2 * SIDE - 40) / 3 }}>
            {col.map((q) => (
              <View key={q.n} wrap={false} style={[s.row, { alignItems: "center", paddingVertical: 5.5, borderBottomWidth: 0.5, borderBottomColor: "#E3E5E8" }]}>
                {/* No set height or inherited line height here: either one stops a row's text being drawn. */}
                <Text style={{ width: 26, fontSize: 9.5, fontWeight: 800, color: INK, lineHeight: 1 }}>{q.n}</Text>
                {(q.pictureChoice ? ["A", "B", "C", "D"] : q.options.map((_, i) => "ABCDEF"[i])).map((l) => (
                  <View key={l} style={{ marginRight: 8 }}>
                    <Bubble letter={l} size={14} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
        {/* Keep columns to the left when there are fewer than three. */}
        {Array.from({ length: Math.max(0, 3 - cols.length) }, (_, i) => <View key={`pad${i}`} style={{ width: (A4_W - 2 * SIDE - 40) / 3 }} />)}
      </View>
    </View>
  );
}

export function TestPaperDocument({ paper }: { paper: PdfPaper }) {
  const mcqs = paper.questions.filter((q) => q.kind === "mcq").length;
  const grid = paper.grid && mcqs > 0;
  const lines = [
    "Answer all questions.",
    mcqs ? `For each multiple choice question, fill in one circle${grid ? ", here or on the answer grid on the last page" : ""}.` : "",
    paper.questions.some((q) => q.kind === "written") ? "Write your answers in the spaces provided." : "",
  ].filter(Boolean);
  return (
    <Document title={paper.title} author="Hamza Teaches" creator="hamzateaches.com" producer="hamzateaches.com">
      <Page size="A4" style={s.page}>
        <View style={s.flow}>
          <Header paper={paper} />
          <View style={[s.row, { marginTop: 18, gap: 28 }]}>
            <FillLine label="Name" />
            <FillLine label="Date" width={150} />
          </View>
          <View style={{ marginTop: 14 }}>
            {lines.map((l) => (
              <Text key={l} style={{ fontSize: 9.5, color: MUTED }}>{l}</Text>
            ))}
          </View>
          {paper.questions.map((q) => (
            <QuestionBlock key={q.n} q={q} />
          ))}
          <EndLine />
        </View>
        <Footer title={paper.title} />
      </Page>
      {grid ? (
        <Page size="A4" style={s.page}>
          <View style={s.flow}>
            <AnswerGrid questions={paper.questions} />
          </View>
          <Footer title={paper.title} />
        </Page>
      ) : null}
    </Document>
  );
}

// ---- The marking sheet -----------------------------------------------------------

export function MarkingSheetDocument({ paper }: { paper: PdfPaper }) {
  const mcq = paper.questions.filter((q) => q.kind === "mcq");
  const written = paper.questions.filter((q) => q.kind === "written");
  const mcqMarks = mcq.reduce((n, q) => n + q.marks, 0);
  const writtenMarks = written.reduce((n, q) => n + q.marks, 0);
  const perCol = 10;
  const keyCols: PdfQuestion<PdfImage>[][] = [];
  for (let i = 0; i < mcq.length; i += perCol) keyCols.push(mcq.slice(i, i + perCol));
  return (
    <Document title={`${paper.title}: marking sheet`} author="Hamza Teaches" creator="hamzateaches.com" producer="hamzateaches.com">
      <Page size="A4" style={s.page}>
        <View style={s.flow}>
          <Header paper={paper} eyebrow="Marking sheet · for the teacher" />
          {mcq.length ? (
            <View wrap={false} style={{ marginTop: 18 }}>
              <Text style={s.label}>Multiple choice key</Text>
              <View style={[s.row, { marginTop: 8, flexWrap: "wrap" }]}>
                {keyCols.map((col, c) => (
                  <View key={c} style={{ width: 82, marginBottom: 6 }}>
                    {col.map((q) => (
                      <View key={q.n} style={[s.row, { alignItems: "center", paddingVertical: 3 }]}>
                        <Text style={{ width: 26, fontSize: 9.5, color: MUTED, textAlign: "right", marginRight: 10, lineHeight: 1 }}>{q.n}</Text>
                        <Text style={{ fontSize: 11, fontWeight: 800, color: INK, lineHeight: 1 }}>{q.answer ?? "?"}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={[s.label, { marginTop: 18 }]}>Question by question</Text>
          <View style={[s.hair, { marginTop: 6 }]} />
          {paper.questions.map((q) => (
            <MarkingRow key={q.n} q={q} />
          ))}

          <View wrap={false} style={{ marginTop: 16 }}>
            <View style={{ height: 1.2, backgroundColor: GOLD }} />
            <View style={[s.row, { marginTop: 8, justifyContent: "space-between" }]}>
              <Text style={{ fontSize: 11, fontWeight: 800, color: INK }}>Total</Text>
              <Text style={{ fontSize: 11, fontWeight: 800, color: INK }}>{paper.totalMarks} {paper.totalMarks === 1 ? "mark" : "marks"}</Text>
            </View>
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>
              {[mcq.length ? `${mcq.length} multiple choice, ${mcqMarks} ${mcqMarks === 1 ? "mark" : "marks"}` : "", written.length ? `${written.length} written, ${writtenMarks} ${writtenMarks === 1 ? "mark" : "marks"}` : ""].filter(Boolean).join("   ·   ")}
            </Text>
          </View>
        </View>
        <Footer title={paper.title} note="Marking sheet" />
      </Page>
    </Document>
  );
}

function MarkingRow({ q }: { q: PdfQuestion<PdfImage> }) {
  const [first, ...rest] = q.scheme;
  const words = q.kind === "mcq" ? (q.answerText ? plain(q.answerText) : "Picture question") : q.text ? plain(q.text) : "Written question";
  const head = (
    <View wrap={false} style={{ paddingVertical: 5, borderBottomWidth: q.scheme.length ? 0 : 0.5, borderBottomColor: "#E3E5E8" }}>
      <View style={s.row}>
        <Text style={s.num}>{q.n}</Text>
        <View style={s.body}>
          <View style={[s.row, { alignItems: "flex-start" }]}>
            {q.kind === "mcq" ? <Text style={{ fontSize: 10.5, fontWeight: 800, color: INK, width: 18 }}>{q.answer ?? "?"}</Text> : null}
            <Text style={{ fontSize: 9.5, color: q.kind === "mcq" && !q.answerText ? MUTED : BODY, flex: 1, maxLines: 3, textOverflow: "ellipsis" }}>{words}</Text>
            {q.source ? <Text style={{ fontSize: 7.8, color: FAINT, width: 150, textAlign: "right", marginTop: 1.5 }}>{q.source}</Text> : null}
          </View>
          {q.kind === "written" && !q.scheme.length ? (
            <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{q.source ? "No mark scheme on file for this question. Mark it by hand." : "Mark it by hand."}</Text>
          ) : null}
          {first ? <Picture img={first} maxH={MAX_PIC_H - 40} /> : null}
        </View>
        <Text style={s.marks}>{marksLabel(q.marks)}</Text>
      </View>
    </View>
  );
  return (
    <>
      {head}
      {rest.map((img, i) => (
        <View key={i} wrap={false} style={{ marginLeft: NUM_W }}>
          <Picture img={img} />
        </View>
      ))}
      {q.scheme.length ? <View style={[s.hair, { marginTop: 8, backgroundColor: "#E3E5E8" }]} /> : null}
    </>
  );
}
