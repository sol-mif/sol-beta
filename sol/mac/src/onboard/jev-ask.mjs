#!/usr/bin/env node
// Sends the one onboarding's Jev questions from the person's own machine (#1088; the questions are built in jev.ts):
//   node jev-ask.mjs --in <request.json> --out <answers.json>
// The key is JEV_API_KEY, else the line JEV_API_KEY=… in ~/.config/sol/jev.env; it is never printed or written. No key,
// an error or over 4 s: it writes {"answers":null,"why":"…"} and the face goes on with its own rules.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const out = arg("out"), inp = arg("in");
const done = (o) => { writeFileSync(out, JSON.stringify(o) + "\n"); process.exit(0); };
if (!out || !inp) { console.error("jev: --in and --out"); process.exit(2); }
// JEV_STUB=1: no call at all (the walks set it until Jev is told only kinds and counts); the face uses its own rules
if (process.env.JEV_STUB) done({ answers: null, why: "stub" });
let key = (process.env.JEV_API_KEY ?? "").trim();
if (!key) {
  try {
    const line = readFileSync(join(homedir(), ".config", "sol", "jev.env"), "utf8").split("\n").find((l) => /^\s*(export\s+)?JEV_API_KEY\s*=/.test(l));
    key = line?.replace(/^\s*(export\s+)?JEV_API_KEY\s*=\s*/, "").trim().replace(/^(["'])(.*)\1$/, "$2") ?? "";
  } catch { /* none */ }
}
if (!key) done({ answers: null, why: "no key" });
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 4000);
const t0 = Date.now();
try {
  const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: readFileSync(inp, "utf8"), signal: ac.signal });
  if (!r.ok) done({ answers: null, why: `http ${r.status}` });
  const j = await r.json();
  done({ answers: j?.answers ?? null, ms: Date.now() - t0 });
} catch (e) { done({ answers: null, why: ac.signal.aborted ? "over 4 s" : String(e?.message ?? e).slice(0, 80) }); }
finally { clearTimeout(timer); }
