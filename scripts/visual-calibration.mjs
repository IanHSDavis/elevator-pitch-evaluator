#!/usr/bin/env node
/**
 * Visual coaching calibration harness.
 *
 * Replays a fixed { transcript, durationSeconds, videoFrames } payload
 * against /api/evaluate?skip_notify=1 N times, then reports per-visual-dim
 * level stability and coaching-prose overlap. Analogous to the n=20 audio
 * borderline study, but for the qualitative visual layer (Presence,
 * Eye Contact, Delivery Confidence).
 *
 * Usage:
 *   1. Record a borderline pitch in the app (video mode).
 *   2. After processing, copy the network-request payload to /api/evaluate
 *      from devtools as `.calibration/fixture.json`. Schema must match
 *      RequestSchema in src/app/api/evaluate/route.ts:
 *        { transcript: string, durationSeconds: number, videoFrames: string[4] }
 *   3. Start the dev server: `npm run dev`
 *   4. Run: `node scripts/visual-calibration.mjs`
 *      Optional: `--n=20`, `--url=http://localhost:3000`,
 *                `--fixture=.calibration/fixture.json`,
 *                `--out=.calibration/results.json`
 *
 * The dev server flag matters: `npm run dev` strips Claude Code's
 * ANTHROPIC_API_KEY/BASE_URL from the env so .env.local wins. See
 * package.json `dev` script and LEARNINGS.md for context.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = parseArgs(process.argv.slice(2));
const n = Number.parseInt(args.n ?? "20", 10);
const baseUrl = args.url ?? "http://localhost:3000";
const fixturePath = args.fixture ?? ".calibration/fixture.json";
const outPath = args.out ?? ".calibration/results.json";

if (!existsSync(fixturePath)) {
  console.error(`Fixture not found: ${fixturePath}`);
  console.error(
    "Record a video pitch and save the /api/evaluate request payload",
  );
  console.error(
    "to that path. See header comment in scripts/visual-calibration.mjs.",
  );
  process.exit(1);
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
if (
  typeof fixture.transcript !== "string" ||
  typeof fixture.durationSeconds !== "number" ||
  !Array.isArray(fixture.videoFrames) ||
  fixture.videoFrames.length !== 4
) {
  console.error(
    "Invalid fixture: need { transcript: string, durationSeconds: number, videoFrames: string[4] }",
  );
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/evaluate?skip_notify=1`;
console.log(`Running ${n} evaluations against ${url}`);
console.log(`Fixture: ${fixturePath} (transcript ${fixture.transcript.length} chars, ${fixture.durationSeconds}s, 4 frames)`);
console.log("");

const runs = [];
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const runStart = Date.now();
  let result;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fixture),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Run ${i + 1}/${n}: HTTP ${response.status} — ${text.slice(0, 200)}`);
      runs.push({ ok: false, status: response.status, error: text });
      continue;
    }
    result = await response.json();
  } catch (err) {
    console.error(`Run ${i + 1}/${n}: ${err.message}`);
    runs.push({ ok: false, error: err.message });
    continue;
  }
  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  const visualSummary = (result.visualDimensions ?? [])
    .map((d) => `${d.shortLabel}=${d.level}`)
    .join(" ");
  console.log(`Run ${i + 1}/${n} (${elapsed}s) · ${visualSummary}`);
  runs.push({ ok: true, result });
}

const elapsedTotal = ((Date.now() - t0) / 1000).toFixed(1);
console.log("");
console.log(`All runs complete in ${elapsedTotal}s`);
console.log("");

const ok = runs.filter((r) => r.ok);
if (ok.length === 0) {
  console.error("No successful runs. Aborting analysis.");
  process.exit(1);
}
if (ok.length < n) {
  console.warn(`${n - ok.length} of ${n} runs failed; analyzing the ${ok.length} that succeeded.`);
}

const visualDims = ok[0].result.visualDimensions ?? [];
if (visualDims.length === 0) {
  console.error(
    "No visualDimensions in result — fixture is missing videoFrames or the server didn't run video mode.",
  );
  process.exit(1);
}

const report = {
  meta: {
    n: ok.length,
    failed: n - ok.length,
    fixture: fixturePath,
    elapsedSeconds: Number(elapsedTotal),
    timestamp: new Date().toISOString(),
  },
  overallScores: ok.map((r) => r.result.overallScore),
  visualDimensions: [],
};

for (const dim of visualDims) {
  const perRun = ok.map((r) =>
    r.result.visualDimensions.find((d) => d.key === dim.key),
  );
  const levels = perRun.map((d) => d.level);
  const evidences = perRun.map((d) => d.evidence);
  const coachings = perRun.map((d) => d.coaching);
  report.visualDimensions.push({
    key: dim.key,
    title: dim.title,
    levelDistribution: tally(levels),
    levelStability: stability(levels),
    evidenceJaccardMean: pairwiseJaccardMean(evidences),
    coachingJaccardMean: pairwiseJaccardMean(coachings),
    samples: {
      evidence: evidences.slice(0, 3),
      coaching: coachings.slice(0, 3),
    },
  });
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("=".repeat(60));
console.log(`VISUAL CALIBRATION REPORT — n=${ok.length}`);
console.log("=".repeat(60));
console.log("");
console.log(`Overall score (transcript-driven): ${report.overallScores.join(", ")}`);
console.log(`  stdev: ${stdev(report.overallScores).toFixed(2)}`);
console.log("");
for (const dim of report.visualDimensions) {
  console.log(`${dim.title} (${dim.key})`);
  console.log(`  level distribution: ${formatTally(dim.levelDistribution)}`);
  console.log(`  level stability:    ${(dim.levelStability * 100).toFixed(0)}% (1.0 = all runs same level)`);
  console.log(`  evidence overlap:   ${dim.evidenceJaccardMean.toFixed(2)} (mean pairwise Jaccard)`);
  console.log(`  coaching overlap:   ${dim.coachingJaccardMean.toFixed(2)} (mean pairwise Jaccard)`);
  console.log("");
}
console.log(`Full report written to ${outPath}`);

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    out[k] = v ?? "true";
  }
  return out;
}

function tally(values) {
  const out = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function formatTally(t) {
  return Object.entries(t)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

function stability(values) {
  if (values.length === 0) return 0;
  const counts = tally(values);
  const max = Math.max(...Object.values(counts));
  return max / values.length;
}

function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

function pairwiseJaccardMean(strings) {
  if (strings.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      sum += jaccard(strings[i], strings[j]);
      count++;
    }
  }
  return count === 0 ? 1 : sum / count;
}

function stdev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
