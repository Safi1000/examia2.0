"use client";

import { Document, Page, Text, View, Image, StyleSheet, Svg, Path, Line, Circle, Font } from "@react-pdf/renderer";
import logo from "@/logo/logo-web.png";
import { LANDING } from "@/lib/landing";
import type { ReportData } from "@/lib/report-data";

// ============================================================================
// Monthly report for parents: ONE A4 page. Brand look (charcoal and gold,
// Inter Tight with a Caveat headline), no boxes, few words: drawings carry
// the numbers. Layout only; every number comes from lib/report-data.ts.
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
Font.register({ family: "Caveat", src: `${FONT_CDN}/caveat@5.2.5/latin-600-normal.ttf` });
Font.registerHyphenationCallback((w) => [w]);

const BG = "#17191C";
const INK = "#F0EDE8";
const BODY = "#B9BEC3";
const MUTED = "#80868C";
const LINE = "#2A2E33";
const GOLD = "#FBC159";
const GOOD = "#86C9A6";
const BAD = "#E8907E";

const PAD = 40;
const W = 595.28 - 2 * PAD;
const GAP = 30;
const COL = (W - GAP) / 2;
const LOGO_H = 16;
const GRADES = ["A*", "A", "B", "C", "D", "E", "U"];

const s = StyleSheet.create({
  page: { backgroundColor: BG, paddingHorizontal: PAD, paddingTop: 36, paddingBottom: 44, fontFamily: "Inter Tight", fontSize: 8.5, color: BODY, lineHeight: 1.35 },
  row: { flexDirection: "row" },
  h2: { fontSize: 6.8, letterSpacing: 2, color: GOLD, fontWeight: 600, textTransform: "uppercase", marginBottom: 9 },
  label: { fontSize: 6.3, letterSpacing: 1.8, color: MUTED, fontWeight: 600, textTransform: "uppercase" },
  hair: { height: 1, backgroundColor: LINE },
});

function fmtDate(d: string) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
}
function phone(n: string) {
  return n.startsWith("92") ? `+92 ${n.slice(2, 5)} ${n.slice(5)}` : `+${n}`;
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/** Tiny legend swatches. */
const Dot = ({ color, ring }: { color: string; ring?: boolean }) => (
  <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 1.5, marginRight: 3, backgroundColor: ring ? "transparent" : color, borderWidth: ring ? 1 : 0, borderColor: color }} />
);
const Tick = () => <View style={{ width: 1.5, height: 7, backgroundColor: INK, marginRight: 4, marginTop: 0.5 }} />;
const Legend = ({ children }: { children: React.ReactNode }) => <View style={[s.row, { alignItems: "flex-start" }]}>{children}</View>;
const LegendText = ({ children }: { children: React.ReactNode }) => <Text style={{ fontSize: 6.4, color: MUTED, marginRight: 9 }}>{children}</Text>;

function ScoreRing({ data }: { data: ReportData }) {
  const size = 104;
  const c = size / 2;
  const r = 44;
  const v = data.average;
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v));
  const ca = data.classAverage;
  return (
    <View style={{ width: size, alignItems: "center" }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={r} stroke={LINE} strokeWidth={7} fill="none" />
          {pct > 0 ? <Path d={arc(c, c, r, 0, Math.min(359.9, pct * 3.6))} stroke={GOLD} strokeWidth={7} fill="none" strokeLinecap="round" /> : null}
          {ca != null ? (
            <Circle cx={c + r * Math.sin((ca * 3.6 * Math.PI) / 180)} cy={c - r * Math.cos((ca * 3.6 * Math.PI) / 180)} r={4} fill={BG} stroke={INK} strokeWidth={1.3} />
          ) : null}
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontWeight: 800, color: INK, lineHeight: 1 }}>{v == null ? "–" : `${Math.round(v)}%`}</Text>
          <Text style={{ fontSize: 5.8, letterSpacing: 1.4, color: MUTED, marginTop: 3, fontWeight: 600 }}>AVERAGE</Text>
        </View>
      </View>
      <View style={[s.row, { marginTop: 5 }]}>
        {ca != null ? (
          <Legend>
            <Dot color={INK} ring />
            <LegendText>Class {Math.round(ca)}%</LegendText>
          </Legend>
        ) : null}
        {data.change != null ? (
          <Text style={{ fontSize: 6.6, color: data.change >= 0 ? GOOD : BAD, fontWeight: 600 }}>
            {data.change >= 0 ? "+" : "−"}
            {Math.abs(Math.round(data.change))} vs last month
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Attendance({ a }: { a: ReportData["attendance"] }) {
  const w = 104;
  const cx = w / 2;
  const cy = 50;
  const r = 42;
  const pct = a ? Math.max(0, Math.min(100, a.percent)) : 0;
  const total = a ? a.present + a.late + a.absent : 0;
  return (
    <View style={{ width: COL / 2 + 10 }}>
      <Text style={s.label}>Attendance</Text>
      <View style={{ width: w, height: 54, marginTop: 8 }}>
        <Svg width={w} height={54}>
          <Path d={arc(cx, cy, r, -90, 90)} stroke={LINE} strokeWidth={7} fill="none" strokeLinecap="round" />
          {a && pct > 0 ? <Path d={arc(cx, cy, r, -90, -90 + pct * 1.8)} stroke={pct >= 85 ? GOLD : BAD} strokeWidth={7} fill="none" strokeLinecap="round" /> : null}
        </Svg>
        <Text style={{ position: "absolute", left: 0, top: 26, width: w, textAlign: "center", fontSize: 16, fontWeight: 800, color: a ? INK : MUTED }}>
          {a ? `${Math.round(a.percent)}%` : "–"}
        </Text>
      </View>
      <Text style={{ fontSize: 6.6, color: MUTED, marginTop: 4, width: w, textAlign: "center" }}>
        {!a ? "Not recorded yet" : total ? `${a.present + a.late} of ${total} classes` : "This month"}
      </Text>
    </View>
  );
}

function Tests({ data }: { data: ReportData }) {
  return (
    <View style={{ width: COL / 2 + 20 }}>
      <Text style={s.label}>Tests handed in</Text>
      <Text style={{ fontSize: 22, fontWeight: 800, color: INK, marginTop: 8, lineHeight: 1 }}>
        {data.set ? data.handedIn : data.results.length}
        <Text style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{data.set ? ` / ${data.set}` : ""}</Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 9, width: 130 }}>
        {data.dots.slice(0, 20).map((d, i) => (
          <View
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              marginRight: 4,
              marginBottom: 4,
              backgroundColor: d === "done" ? GOLD : d === "missed" ? BAD : "transparent",
              borderWidth: d === "open" ? 1.2 : 0,
              borderColor: MUTED,
            }}
          />
        ))}
      </View>
      <Legend>
        <Dot color={GOLD} />
        <LegendText>Done</LegendText>
        {data.missed.length ? (
          <>
            <Dot color={BAD} />
            <LegendText>Missed</LegendText>
          </>
        ) : null}
        {data.dots.includes("open") ? (
          <>
            <Dot color={MUTED} ring />
            <LegendText>Open</LegendText>
          </>
        ) : null}
      </Legend>
    </View>
  );
}

function Grade({ grade }: { grade: ReportData["grade"] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.label}>Indicative grade</Text>
      <Text style={{ fontSize: 30, fontWeight: 800, color: GOLD, marginTop: 6, lineHeight: 1 }}>{grade ?? "–"}</Text>
      <View style={{ flexDirection: "row", marginTop: 9 }}>
        {GRADES.map((g) => (
          <View key={g} style={{ alignItems: "center", width: 21 }}>
            <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: g === grade ? GOLD : LINE }} />
            <Text style={{ fontSize: 6.4, marginTop: 2, color: g === grade ? GOLD : MUTED, fontWeight: g === grade ? 800 : 400 }}>{g}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Subjects({ data }: { data: ReportData }) {
  if (!data.bySubject.length) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.h2}>By subject</Text>
        <Legend>
          <View style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: GOLD, marginRight: 4, marginTop: 2 }} />
          <LegendText>Average</LegendText>
          <Tick />
          <LegendText>Class</LegendText>
        </Legend>
      </View>
      {data.bySubject.map((b) => (
        <View key={b.subject} style={[s.row, { alignItems: "center", paddingVertical: 4 }]}>
          <Text style={{ width: 118, fontSize: 9, fontWeight: 600, color: INK }}>{b.subject}</Text>
          <View style={{ flex: 1, height: 6, backgroundColor: LINE, borderRadius: 3, marginRight: 14 }}>
            <View style={{ height: 6, width: `${Math.max(2, b.average)}%`, backgroundColor: GOLD, borderRadius: 3 }} />
            {b.classAvg != null ? <View style={{ position: "absolute", left: `${b.classAvg}%`, top: -2.5, width: 1.6, height: 11, backgroundColor: INK }} /> : null}
          </View>
          <Text style={{ width: 36, fontSize: 10, fontWeight: 800, color: INK, textAlign: "right" }}>{Math.round(b.average)}%</Text>
          <Text style={{ width: 28, fontSize: 10, fontWeight: 800, color: GOLD, textAlign: "right" }}>{b.grade}</Text>
        </View>
      ))}
    </View>
  );
}

function Trend({ data, listedFrom }: { data: ReportData; listedFrom: number }) {
  const pts = data.results;
  if (pts.length < 2) return null;
  const CH = 70;
  const PL = 22;
  const PR = 8;
  const PT = 10;
  const PB = 8;
  const iw = W - PL - PR;
  const ih = CH - PT - PB;
  const x = (i: number) => PL + (i / (pts.length - 1)) * iw;
  const y = (v: number) => PT + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const clsPts = pts.map((p, i) => (p.classAvg == null ? null : `${x(i).toFixed(1)},${y(p.classAvg).toFixed(1)}`)).filter(Boolean) as string[];
  const cls = clsPts.length > 1 ? clsPts.map((c, i) => `${i ? "L" : "M"}${c}`).join(" ") : "";

  return (
    <View style={{ marginTop: 12 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.h2}>Test by test</Text>
        <Legend>
          <View style={{ width: 10, height: 2, backgroundColor: GOLD, marginRight: 4, marginTop: 3 }} />
          <LegendText>{data.firstName}</LegendText>
          {cls ? (
            <>
              <View style={{ width: 10, height: 1, borderTopWidth: 1, borderColor: MUTED, borderStyle: "dashed", marginRight: 4, marginTop: 3.5 }} />
              <LegendText>Class</LegendText>
            </>
          ) : null}
        </Legend>
      </View>
      <View style={{ width: W, height: CH }}>
        <Svg width={W} height={CH}>
          {[0, 50, 100].map((v) => (
            <Line key={v} x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke={LINE} strokeWidth={0.7} />
          ))}
          <Path d={area} fill={GOLD} fillOpacity={0.07} />
          {cls ? <Path d={cls} fill="none" stroke={MUTED} strokeWidth={0.9} strokeDasharray="2.5 2.5" /> : null}
          <Path d={line} fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinejoin="round" />
          {pts.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.percent)} r={5.4} fill={i >= listedFrom ? GOLD : BG} stroke={GOLD} strokeWidth={1} />
          ))}
        </Svg>
        {[100, 50, 0].map((v) => (
          <Text key={v} style={{ position: "absolute", left: 0, top: y(v) - 3.5, fontSize: 5.6, color: MUTED }}>
            {v}%
          </Text>
        ))}
        {pts.map((p, i) => (
          <Text key={i} style={{ position: "absolute", left: x(i) - 6, top: y(p.percent) - 3.6, width: 12, textAlign: "center", fontSize: 5.6, fontWeight: 800, color: i >= listedFrom ? BG : GOLD }}>
            {i + 1}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Topics({ title, items, good }: { title: string; items: ReportData["strengths"]; good: boolean }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.h2}>{title}</Text>
      {items.map((t) => (
        <View key={t.subject + t.name} style={{ marginBottom: 6 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ fontSize: 8.4, color: INK }}>{t.name}</Text>
            <Text style={{ fontSize: 8.4, color: good ? GOOD : BAD, fontWeight: 800 }}>{t.percent}%</Text>
          </View>
          <View style={{ height: 3, backgroundColor: LINE, borderRadius: 2, marginTop: 3 }}>
            <View style={{ height: 3, width: `${Math.max(2, t.percent)}%`, borderRadius: 2, backgroundColor: good ? GOLD : BAD }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const logoSrc = typeof window !== "undefined" ? new URL(logo.src, window.location.origin).href : logo.src;
  // One page: the latest four results are listed (filled dots on the chart); the chart shows all.
  const MAX = 4;
  const listedFrom = Math.max(0, data.results.length - MAX);
  const listed = data.results.slice(listedFrom);
  // The note box allows 260 characters; older or longer notes are cut at a word.
  const note = data.teacherNote.length > 260 ? `${data.teacherNote.slice(0, 257).replace(/\s+\S*$/, "")}…` : data.teacherNote;

  return (
    <Document title={`${data.name} · ${data.monthLabel} report`} author="Hamza Sadaqat">
      {/* Always one page: content is capped (four listed results, three topics each, a short note). */}
      <Page size="A4" style={s.page}>
        <Svg width={595.28} height={300} style={{ position: "absolute", top: 0, left: 0 }}>
          <Circle cx={560} cy={-60} r={260} fill={GOLD} fillOpacity={0.01} />
          <Circle cx={560} cy={-60} r={200} fill={GOLD} fillOpacity={0.012} />
          <Circle cx={560} cy={-60} r={140} fill={GOLD} fillOpacity={0.014} />
        </Svg>

        {/* Masthead */}
        <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
          <View style={{ width: LOGO_H * (438 / 67), height: LOGO_H, overflow: "hidden", position: "relative" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={logoSrc}
              style={{ position: "absolute", width: LOGO_H * (480 / 67), height: LOGO_H * (223 / 67), left: -LOGO_H * (23 / 67), top: -LOGO_H * (74 / 67) }}
            />
          </View>
          <Text style={{ fontSize: 6.5, letterSpacing: 2.2, color: GOLD, fontWeight: 600 }}>MONTHLY REPORT · {data.monthLabel.toUpperCase()}</Text>
        </View>

        {/* Hero */}
        <View style={[s.row, { marginTop: 20, justifyContent: "space-between", alignItems: "center" }]}>
          <View style={{ flex: 1, paddingRight: 18 }}>
            <Text style={{ fontSize: 36, fontWeight: 800, color: INK, letterSpacing: -1, lineHeight: 1 }}>{data.name}</Text>
            <Text style={{ fontFamily: "Caveat", fontSize: 22, color: GOLD, marginTop: 5, lineHeight: 1 }}>{data.headline}</Text>
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 9 }}>{[data.subjects.join(" · "), data.cohort].filter(Boolean).join("   |   ")}</Text>
          </View>
          <ScoreRing data={data} />
        </View>

        <View style={[s.hair, { marginTop: 16, marginBottom: 14 }]} />

        {/* Attendance, tests, grade */}
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <Attendance a={data.attendance} />
          <Tests data={data} />
          <Grade grade={data.grade} />
        </View>

        <Subjects data={data} />
        <Trend data={data} listedFrom={listedFrom} />

        {/* Results + topics */}
        <View style={[s.row, { marginTop: 14, alignItems: "flex-start" }]}>
          <View style={{ width: COL }}>
            <Text style={s.h2}>Latest results</Text>
            {listed.map((r, i) => {
              const d = r.classAvg == null ? null : Math.round(r.percent - r.classAvg);
              return (
                <View key={i} style={[s.row, { alignItems: "center", paddingVertical: 3.5 }]}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", marginRight: 7 }}>
                    <Text style={{ fontSize: 6.2, fontWeight: 800, color: BG }}>{listedFrom + i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, paddingRight: 4 }}>
                    <Text style={{ fontSize: 8.2, color: INK }}>{r.title.length > 30 ? `${r.title.slice(0, 29)}…` : r.title}</Text>
                    <Text style={{ fontSize: 6.2, color: MUTED }}>
                      {r.subject} · {fmtDate(r.date)}
                    </Text>
                  </View>
                  <Text style={{ width: 34, fontSize: 9.5, fontWeight: 800, textAlign: "right", color: INK }}>{Math.round(r.percent)}%</Text>
                  <Text style={{ width: 30, fontSize: 6.8, textAlign: "right", fontWeight: 600, color: d == null ? MUTED : d >= 0 ? GOOD : BAD }}>
                    {d == null ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d)}`}
                  </Text>
                </View>
              );
            })}
            {listed.length ? (
              <Legend>
                <Text style={{ fontSize: 6.2, color: MUTED, marginTop: 3 }}>+/− = points above or below the class</Text>
              </Legend>
            ) : (
              <Text style={{ fontSize: 7.5, color: MUTED }}>No marked tests this month yet.</Text>
            )}
          </View>
          <View style={{ width: GAP }} />
          <View style={{ width: COL }}>
            <Topics title="Strongest topics" items={data.strengths.slice(0, note ? 2 : 3)} good />
            <Topics title="To work on" items={data.focus.slice(0, note ? 2 : 3)} good={false} />
          </View>
        </View>

        {/* Next + note */}
        <View style={[s.row, { marginTop: 8, alignItems: "flex-start" }]}>
          <View style={{ width: note ? COL : W }}>
            <Text style={s.h2}>Next</Text>
            {data.nextSteps.slice(0, 3).map((n, i) => {
              const [k, v] = n.includes(": ") ? n.split(/: (.+)/) : ["", n];
              return (
                <View key={i} style={[s.row, { marginBottom: 4 }]}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginTop: 3.5, marginRight: 7 }} />
                  <Text style={{ fontSize: 8.2, color: INK }}>
                    {k ? <Text style={{ color: MUTED }}>{k}  </Text> : null}
                    {v}
                  </Text>
                </View>
              );
            })}
          </View>
          {note ? (
            <>
              <View style={{ width: GAP }} />
              <View style={{ width: COL, borderLeftWidth: 1.5, borderColor: GOLD, paddingLeft: 11 }}>
                <Text style={{ fontSize: 8.4, color: INK, lineHeight: 1.5 }}>{note}</Text>
                <Text style={{ fontFamily: "Caveat", fontSize: 14, color: GOLD, marginTop: 3 }}>Hamza Sadaqat</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Footer */}
        <View style={{ position: "absolute", bottom: 20, left: PAD, right: PAD }}>
          <View style={[s.hair, { marginBottom: 6 }]} />
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ fontSize: 6.6, color: MUTED }}>Questions? WhatsApp {phone(LANDING.waNumber)}</Text>
            <Text style={{ fontSize: 6.6, color: GOLD }}>hamzateaches.com</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
