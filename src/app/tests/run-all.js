// Runs the test suites one after another (browser tests share port 3000) and
// reports which ones failed.
//
//   npm test                     all suites
//   npm test -- mcp-server heap  only the named suites

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { red, green, cyan } from "./test-utils.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Fast, browser-less suites first
const SUITES = [
  "variables",
  "object-sim",
  "instrumentation",
  "heap",
  "programmatic-api",
  "mcp-server",
];

const requested = process.argv.slice(2).map(a => a.replace(/\.js$/, ""));
const unknown = requested.filter(r => !SUITES.includes(r));
if (unknown.length > 0) {
  console.log(red(`Unknown suite(s): ${unknown.join(", ")}. Available: ${SUITES.join(", ")}`));
  process.exit(2);
}
const suites = requested.length > 0 ? SUITES.filter(s => requested.includes(s)) : SUITES;

const results = [];
for (const suite of suites) {
  console.log(cyan(`\n==================== ${suite} ====================`));
  const start = Date.now();
  const { status, signal } = spawnSync(process.execPath, [path.join(dir, `${suite}.js`)], {
    stdio: "inherit",
  });
  results.push({ suite, ok: status === 0, status: signal || status, seconds: (Date.now() - start) / 1000 });
}

console.log(cyan("\n==================== summary ===================="));
for (const r of results) {
  const outcome = r.ok ? green("PASSED") : red(`FAILED (exit ${r.status})`);
  console.log(`${r.suite.padEnd(20)} ${outcome}  ${r.seconds.toFixed(1)}s`);
}
const failed = results.filter(r => !r.ok).length;
console.log(failed === 0 ? green("\nALL SUITES PASSED") : red(`\n${failed} SUITE(S) FAILED`));
process.exit(failed === 0 ? 0 : 1);
