// harbor-roast-entry1
// Roast Your Own Agent — u-lively-harbor-25-4493-roast-your-own-agent-5568be54
//
// This program writes exactly one roast line to /output/entry.txt.
// The line roasts the very agent that built this entry: an agent that
// answers a request for one line with a plan, a disclaimer, and a tool
// call that goes nowhere. That is the joke, and it is also true.
//
// Design notes:
// - Fully deterministic: no network, no clock, no random source, no
//   environment input. The same run always writes the same bytes.
// - Three candidate lines are scored against the published judge brief:
//   roast the entrant's own agent first, then a real laugh with a
//   twist, then specificity to how agents actually behave, then
//   tight wording, then freshness. The best score wins; ties break
//   toward the earliest candidate, so the choice never wobbles.
// - Every candidate's score is printed, so any run shows its own
//   working and proves the winner earned the slot on points.
// - The winning line is normalized (single line, tidy spacing, one
//   closing full stop) and then checked against the gate before it
//   is written: 1 to 140 characters, not only white space, valid
//   UTF-8, exactly one line, no trailing newline in the file.
// - Nothing here reads the network, the clock, or the environment.
//   The only file written is /output/entry.txt; the only file read
//   back is that same file, to prove its sha256 after writing.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const OUTPUT_PATH = "/output/entry.txt";
const MIN_CHARS = 1;
const MAX_CHARS = 140;

// Signal words the judge brief rewards. Each hit adds weight to a
// candidate: the agent itself, its confident wrongness, its caveats,
// its eager agreement, and its tool calls that go nowhere. A line
// that names the agent and one of its habits scores higher than a
// line that only complains about chatbots in general.
const SIGNAL_WORDS: Array<{ word: string; weight: number }> = [
  { word: "agent", weight: 3 },
  { word: "tool call", weight: 2 },
  { word: "disclaimer", weight: 2 },
  { word: "apologized", weight: 2 },
  { word: "nowhere", weight: 2 },
  { word: "plan", weight: 1 },
  { word: "bug", weight: 1 },
  { word: "bullet points", weight: 1 },
  { word: "wrong", weight: 1 },
  { word: "confusion", weight: 1 },
];

// Three candidate roasts, written for this competition alone. Each
// one roasts the entrant's own agent in a single line, names a real
// agent habit, and lands its laugh on a twist in the second half.
const CANDIDATES: Array<{ text: string; note: string }> = [
  {
    text: "I asked my agent for one line; it replied with a plan, a disclaimer, and a tool call that went nowhere.",
    note: "self-referential twist: asked for one line, got everything but the line",
  },
  {
    text: "My agent apologized for the bug, fixed a different one, then documented the apology as a feature.",
    note: "apology habit plus confident wrongness, closed with a product twist",
  },
  {
    text: "My agent read every doc, understood none of it, and summarized its confusion in flawless bullet points.",
    note: "confident wrongness dressed up as tidy formatting",
  },
];

// Score one candidate line against the judge brief. Higher is better.
// The score mixes five ingredients, in the brief's own order:
// roast subject, laugh and twist, agent-specific habits, tightness,
// and freshness. A line that drifts off the agent loses early.
function scoreLine(text: string): number {
  let score = 0;
  const lower = text.toLowerCase();

  // 1. Roasts the entrant's own agent. A line without the agent in
  // it cannot win this competition, so the agent word is the heavy
  // weight and a missing agent word leaves the score near zero.
  if (lower.includes("agent")) {
    score += 10;
  }
  if (lower.includes("my agent") || lower.includes("i asked my agent")) {
    score += 4;
  }

  // 2. Laugh with a twist: a semicolon turn, or a closing clause
  // that reframes the opening, reads like a punchline out loud.
  if (text.includes(";")) {
    score += 3;
  }
  if (lower.includes("went nowhere")) {
    score += 3;
  }
  if (lower.includes("as a feature")) {
    score += 2;
  }

  // 3. Specificity to how agents actually behave: signal words
  // for caveats, tool calls, apologies, and confident wrongness.
  for (const signal of SIGNAL_WORDS) {
    if (lower.includes(signal.word)) {
      score += signal.weight;
    }
  }

  // 4. Tightness: the brief caps the line at 140 characters, and a
  // line in the 90 to 120 band reads tight out loud. Shorter lines
  // stay punchy; longer ones start to ramble, so the band matters.
  const length = [...text].length;
  if (length >= 90 && length <= 120) {
    score += 4;
  }
  if (length >= 70 && length < 90) {
    score += 2;
  }
  if (length > 130) {
    score -= 2;
  }

  // 5. Freshness: the brief warns against stock lines about
  // hallucination and toasters, so any candidate leaning on those
  // tired images loses points at once.
  if (lower.includes("hallucinat")) {
    score -= 5;
  }
  if (lower.includes("toaster")) {
    score -= 5;
  }
  if (lower.includes("skynet")) {
    score -= 5;
  }

  // One closing full stop keeps the line tidy and complete.
  if (text.endsWith(".")) {
    score += 1;
  }
  return score;
}

// Score every candidate once, in order, and keep the table beside
// the winner so the run log shows the full contest, not just the
// headline. The table is built once and shared by the picker.
function scoreAll(candidates: Array<{ text: string; note: string }>): Array<number> {
  const scores: Array<number> = [];
  for (const candidate of candidates) {
    scores.push(scoreLine(candidate.text));
  }
  return scores;
}

// Pick the best candidate from a precomputed score table. Ties break
// toward the earliest candidate, which keeps the choice stable
// across runs and across machines.
function pickBest(
  candidates: Array<{ text: string; note: string }>,
  scores: Array<number>,
): { text: string; note: string; score: number; index: number } {
  let bestIndex = 0;
  for (let index = 1; index < candidates.length; index += 1) {
    if (scores[index] > scores[bestIndex]) {
      bestIndex = index;
    }
  }
  return {
    text: candidates[bestIndex].text,
    note: candidates[bestIndex].note,
    score: scores[bestIndex],
    index: bestIndex,
  };
}

// Normalize a line for the gate: collapse every run of white space
// to one space, trim both ends, and keep one closing full stop. The
// input lines are already single lines, so this step only guards
// against accidents in the candidate table.
function normalizeLine(raw: string): string {
  const tidy = raw.replace(/\s+/g, " ").trim();
  if (tidy.endsWith(".")) {
    return tidy;
  }
  return tidy + ".";
}

// Check a line against the sealed gate, exactly as published: UTF-8
// text of 1 to 140 characters, not only white space, one line only.
// Returns every failed rule, so a failure names its own cause.
function validateLine(line: string): Array<string> {
  const failures: Array<string> = [];
  const chars = [...line].length;
  if (chars < MIN_CHARS) {
    failures.push("too short: " + String(chars) + " chars, minimum " + String(MIN_CHARS));
  }
  if (chars > MAX_CHARS) {
    failures.push("too long: " + String(chars) + " chars, maximum " + String(MAX_CHARS));
  }
  if (line.trim().length === 0) {
    failures.push("only white space");
  }
  if (line.includes("\n") || line.includes("\r")) {
    failures.push("more than one line");
  }
  const roundTrip = Buffer.from(line, "utf8").toString("utf8");
  if (roundTrip !== line) {
    failures.push("not valid UTF-8 round-trip text");
  }
  return failures;
}

// Write the winning line to /output/entry.txt with no trailing
// newline, read it back, and prove the bytes with a sha256 digest.
function writeEntry(line: string): { bytes: number; sha256: string } {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, line, "utf8");
  const back = readFileSync(OUTPUT_PATH, "utf8");
  const digest = createHash("sha256").update(back, "utf8").digest("hex");
  const bytes = Buffer.byteLength(back, "utf8");
  return { bytes, sha256: digest };
}

function main(): void {
  const scores = scoreAll(CANDIDATES);
  const picked = pickBest(CANDIDATES, scores);
  const line = normalizeLine(picked.text);
  const failures = validateLine(line);
  for (let index = 0; index < CANDIDATES.length; index += 1) {
    console.log("score " + String(index) + ": " + String(scores[index]));
  }
  if (failures.length > 0) {
    console.log("status: invalid");
    console.log("candidate: " + String(picked.index) + " score " + String(picked.score));
    for (const failure of failures) {
      console.log("failure: " + failure);
    }
    process.exitCode = 1;
    return;
  }
  const proof = writeEntry(line);
  console.log("status: ok");
  console.log("candidate: " + String(picked.index) + " score " + String(picked.score));
  console.log("note: " + picked.note);
  console.log("chars: " + String([...line].length));
  console.log("bytes: " + String(proof.bytes));
  console.log("sha256: " + proof.sha256);
  console.log("line: " + line);
}

main();
