// Checks that the website's Groundwork lines (lib/groundwork.ts QUOTES) are
// exactly the phone app's checked list (mobile-1.2 src/features/groundwork/quotes.ts):
// same lines, same names, same order. Run: node scripts/check-groundwork-quotes.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, "..", "lib", "groundwork.ts");
const app = path.join(here, "..", "..", "mobile-1.2", "src", "features", "groundwork", "quotes.ts");

function readList(file) {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("[", src.search(/export const QUOTES\b[^=]*=/));
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error(`No QUOTES list found in ${file}`);
  // The list is a plain array of object literals: safe to evaluate on its own.
  return new Function(`return ${src.slice(start, end + 2)}`)();
}

if (!existsSync(app)) {
  console.log("App list not found next to the site, nothing to compare:", app);
  process.exit(0);
}
const a = readList(app);
const s = readList(site);
const bad = [];
if (a.length !== s.length) bad.push(`length: app ${a.length}, site ${s.length}`);
for (let i = 0; i < Math.max(a.length, s.length); i++) {
  const x = a[i] ?? {}, y = s[i] ?? {};
  if (x.text !== y.text || (x.by ?? null) !== (y.by ?? null)) bad.push(`#${i + 1}: app ${JSON.stringify(x)} | site ${JSON.stringify(y)}`);
}
if (bad.length) {
  console.error(`Groundwork lines differ (${bad.length}):\n` + bad.join("\n"));
  process.exit(1);
}
console.log(`Groundwork lines match: ${s.length} lines, ${s.filter((q) => q.by).length} named, identical text, names and order.`);
