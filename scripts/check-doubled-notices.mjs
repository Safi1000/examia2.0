// Proves the "Tidy doubled notices" rule (lib/doubled-notices.ts). No database, no network.
// Run: node --experimental-strip-types scripts/check-doubled-notices.mjs
import assert from "node:assert/strict";
import { findDoubledNotices, stillExtra, isUuid, TIDY_MAX } from "../lib/doubled-notices.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n, over = {}) => ({
  id: id(n),
  type: "test_created",
  title: "New test: Depreciation",
  testId: "t1",
  cohortId: "c1",
  studentId: null,
  audience: "student",
  createdAt: "2026-11-10T10:00:00.000000+00:00",
  ...over,
});
const later = (s) => `2026-11-10T10:00:0${s}.000000+00:00`;
let n = 0;
const check = (name, fn) => {
  fn();
  n++;
  console.log(`ok  ${name}`);
};

check("no doubles: nothing found, nothing may go", () => {
  const rows = [row(1), row(2, { testId: "t2" }), row(3, { testId: "t3", title: "New test: Ratios" })];
  assert.deepEqual(findDoubledNotices(rows), []);
  assert.deepEqual(stillExtra(rows, rows.map((r) => r.id)), []);
});

check("a pair: the oldest stays, the later one is the extra", () => {
  const rows = [row(2, { createdAt: later(1) }), row(1)];
  const [g, ...rest] = findDoubledNotices(rows);
  assert.equal(rest.length, 0);
  assert.equal(g.keepId, id(1));
  assert.deepEqual(g.extraIds, [id(2)]);
  assert.equal(g.copies, 2);
});

check("a triple: one stays, two go", () => {
  const rows = [row(3, { createdAt: later(2) }), row(1), row(2, { createdAt: later(1) })];
  const [g] = findDoubledNotices(rows);
  assert.equal(g.keepId, id(1));
  assert.deepEqual(g.extraIds, [id(2), id(3)]);
  assert.equal(g.copies, 3);
});

check("two groups: each keeps its own oldest", () => {
  const rows = [row(1), row(2, { createdAt: later(1) }), row(3, { testId: "t2" }), row(4, { testId: "t2", createdAt: later(1) }), row(5, { testId: "t3" })];
  const found = findDoubledNotices(rows);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((g) => g.keepId).sort(), [id(1), id(3)]);
  assert.deepEqual(found.flatMap((g) => g.extraIds).sort(), [id(2), id(4)]);
});

check("the admin feed row and the student row of one test are separate groups", () => {
  const rows = [row(1), row(2, { createdAt: later(1) }), row(3, { audience: "admin", title: "Test created" }), row(4, { audience: "admin", title: "Test created", createdAt: later(1) })];
  const found = findDoubledNotices(rows);
  assert.equal(found.length, 2);
  assert.deepEqual(found.flatMap((g) => g.extraIds).sort(), [id(2), id(4)]);
});

check("different cohort, audience, title, test or addressee: NOT grouped", () => {
  for (const over of [{ cohortId: "c2" }, { cohortId: null }, { audience: "admin" }, { title: "New test: Ratios" }, { testId: "t2" }, { studentId: "s1" }]) {
    const rows = [row(1), row(2, { createdAt: later(1), ...over })];
    assert.deepEqual(findDoubledNotices(rows), [], JSON.stringify(over));
    assert.deepEqual(stillExtra(rows, [id(1), id(2)]), [], JSON.stringify(over));
  }
});

check("other notice types and rows without a test are never touched", () => {
  const rows = [row(1, { type: "test_updated" }), row(2, { type: "test_updated", createdAt: later(1) }), row(3, { testId: null }), row(4, { testId: null, createdAt: later(1) })];
  assert.deepEqual(findDoubledNotices(rows), []);
  assert.deepEqual(stillExtra(rows, rows.map((r) => r.id)), []);
});

check("identical created times fall back to id order (smallest id stays)", () => {
  const rows = [row(9), row(4), row(7)];
  const [g] = findDoubledNotices(rows);
  assert.equal(g.keepId, id(4));
  assert.deepEqual(g.extraIds, [id(7), id(9)]);
});

check("times that differ only below a millisecond still order by time, not id", () => {
  const rows = [row(1, { createdAt: "2026-11-10T10:00:00.123457+00:00" }), row(2, { createdAt: "2026-11-10T10:00:00.123456+00:00" })];
  const [g] = findDoubledNotices(rows);
  assert.equal(g.keepId, id(2));
  assert.deepEqual(g.extraIds, [id(1)]);
});

check("an id list holding an oldest row or an unrelated id is filtered", () => {
  const rows = [row(1), row(2, { createdAt: later(1) }), row(3, { createdAt: later(2) }), row(5, { testId: "t9" }), row(6, { type: "note_added", testId: null })];
  const asked = [id(1), id(2), id(2), id(3), id(5), id(6), id(404), "not-an-id", ""];
  assert.deepEqual(stillExtra(rows, asked), [id(2), id(3)]);
});

check("a stale list can never remove the last copy", () => {
  // The screen listed 2 and 3 as extras of 1. Since then 1 and 3 have gone.
  const now = [row(2, { createdAt: later(1) })];
  assert.deepEqual(stillExtra(now, [id(2), id(3)]), []);
  // Or only the oldest went: 2 is now the copy that stays, 3 may still go.
  const now2 = [row(2, { createdAt: later(1) }), row(3, { createdAt: later(2) })];
  assert.deepEqual(stillExtra(now2, [id(2), id(3)]), [id(3)]);
});

check("removing every listed extra leaves exactly one copy per notice", () => {
  const rows = [row(1), row(2, { createdAt: later(1) }), row(3, { createdAt: later(2) }), row(4, { testId: "t2" }), row(5, { testId: "t2" }), row(6, { testId: "t3" })];
  const go = new Set(stillExtra(rows, findDoubledNotices(rows).flatMap((g) => g.extraIds)));
  const left = rows.filter((r) => !go.has(r.id));
  assert.deepEqual(left.map((r) => r.id), [id(1), id(4), id(6)]);
  assert.deepEqual(findDoubledNotices(left), []);
});

check("id shape and the cap", () => {
  assert.equal(isUuid(id(1)), true);
  for (const bad of ["", "abc", `${id(1)} or 1=1`, `${id(1)},${id(2)}`, 7, null, undefined, {}]) assert.equal(isUuid(bad), false);
  assert.equal(TIDY_MAX, 500);
});

console.log(`doubled-notices: ${n} of ${n} checks passed`);
