#!/usr/bin/env node
/**
 * Re-copies the four Groundwork 3D worlds from the design mockups into the site.
 *
 *   node scripts/sync-groundwork-worlds.mjs          (run from the site folder)
 *
 * Source: ../design-mockups/groundwork-3d/concept1..4.js (where the worlds are made and tested).
 * Target: lib/groundwork-worlds/tower.js, bridge.js, summit.js, astar.js.
 *
 * The one change made on the way: `three/addons/...` imports become
 * `three/examples/jsm/...`, the path three@0.160 ships its add-ons under (and
 * the one @types/three describes). The typed contract lives in
 * lib/groundwork-worlds/types.ts and the *.d.ts files next to each world, so a
 * refined world drops in without touching TypeScript. Each file is checked
 * before it is written: the contract (a default export with id and mount), no
 * imports beyond three, and no undefined names (ESLint's no-undef, which
 * catches a half-finished edit such as a variable used but never declared).
 * A file that fails a check is left as it was, and the script exits with 1.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import globals from "globals";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const from = process.argv[2] ? resolve(process.argv[2]) : resolve(site, "../design-mockups/groundwork-3d");
const to = join(site, "lib/groundwork-worlds");

const MAP = [
  ["concept1.js", "tower.js", "tower"],
  ["concept2.js", "bridge.js", "bridge"],
  ["concept3.js", "summit.js", "summit"],
  ["concept4.js", "astar.js", "astar"],
];

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser } },
    rules: { "no-undef": "error" },
  },
});

let failed = 0;
for (const [src, dest, id] of MAP) {
  const path = join(from, src);
  if (!existsSync(path)) {
    console.error(`missing  ${path}`);
    failed++;
    continue;
  }
  let code = readFileSync(path, "utf8");
  code = code.replace(/(['"])three\/addons\//g, "$1three/examples/jsm/");
  const problems = [];
  if (!/export\s+default\s*\{/.test(code)) problems.push("no `export default { ... }`");
  if (!/\bmount\b/.test(code)) problems.push("no mount");
  if (!code.includes(`'${id}'`) && !code.includes(`"${id}"`)) problems.push(`id '${id}' not found`);
  if (/from\s+['"](?!three(\/examples\/jsm\/[^'"]+)?['"])[^'"]+['"]/.test(code)) problems.push("imports something other than three");
  const [lint] = await eslint.lintText(code, { filePath: join(to, dest) });
  for (const m of lint.messages.filter((m) => m.severity === 2)) problems.push(`line ${m.line}: ${m.message}`);
  if (problems.length) {
    console.error(`skipped  ${src}: ${problems.join(", ")}`);
    failed++;
    continue;
  }
  const head = `// Copied from design-mockups/groundwork-3d/${src} by scripts/sync-groundwork-worlds.mjs.\n// Edit the original there, then run: node scripts/sync-groundwork-worlds.mjs\n/* eslint-disable */\n`;
  writeFileSync(join(to, dest), head + code);
  console.log(`copied   ${src} -> lib/groundwork-worlds/${dest}`);
}
process.exit(failed ? 1 : 0);
