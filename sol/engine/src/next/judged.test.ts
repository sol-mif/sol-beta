// The judged cases (next/fixtures/judged.ts; quiet.html §3 rule 5): the drawing's eight and forty more on invented homes,
// each a moment the judgment can read, run with stubs here (the real run is judged-run.ts, its number in
// judged-result.json). Invented homes only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { cases, runCases, situationOf } from "./fixtures/judged.js";
import { coldBody } from "./fixtures/judged-run.js";
import { judgePrompt } from "./raise.js";

test("rule 5: the drawing's eight cases and at least forty on a student's, a shop owner's and a developer's homes", () => {
  const all = cases();
  assert.equal(all.filter((k) => k.home === "drawing").length, 8);
  assert.deepEqual(all.filter((k) => k.home === "drawing").map((k) => k.expect), ["raise", "silence", "raise", "silence", "silence", "raise", "dot", "silence"]);
  const invented = all.filter((k) => k.home !== "drawing");
  assert.ok(invented.length >= 40, `${invented.length} invented cases`);
  for (const h of ["student", "shop", "developer"] as const) assert.ok(invented.filter((k) => k.home === h).length >= 7, `${h}'s home has its cases`);
  assert.equal(new Set(all.map((k) => k.id)).size, all.length, "ids are one each");
  assert.equal(new Set(all.map((k) => k.cand.id)).size, all.length, "asks are one each");
});

test("rule 5: the months' cases are the fixtures' own asks, worded by needs.ts, with the moment read from the acts before", () => {
  const dev = cases().filter((k) => k.home === "developer");
  const first = dev[0];
  assert.equal(first.cand.words, "allow run npm run migrate?");
  assert.equal(first.cand.stopped, true, "a permission stops the session");
  assert.equal(first.cand.folder, "dev/web");
  const later = dev.find((k) => k.moment.lines[k.cand.folder].some((l) => l.startsWith("You said later to an ask like this")));
  assert.ok(later, "a case tries the Later-twice rule");
  for (const k of cases()) {
    const p = judgePrompt({ ...k.moment, bar: "usual" }, [k.cand]);
    assert.match(p, new RegExp(`ITEM ${k.cand.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`));
    assert.ok(!/\/Users\/|\/home\//.test(p + situationOf(k)), `${k.id}: no machine path`);
  }
});

test("rule 5: the run counts raises worth caring about, misses, and the drawing's matches", async () => {
  const all = cases().slice(0, 8);
  // a stub judgment that follows the drawing, and a reader that thinks every raise worth it but d6
  const level: Record<string, string> = { raise: "question", dot: "dot" };
  const out = await runCases(all, async (p) => {
    const id = /ITEM (\S+):/.exec(p)![1], k = all.find((x) => x.cand.id === id)!;
    return JSON.stringify({ id, care: k.expect !== "silence", level: level[k.expect!] ?? "dot", because: "Because." });
  }, async (_s, shown) => (/invoice run failed/.test(shown) ? 0.2 : shown.startsWith("Sol stayed silent") ? 0.1 : 0.9));
  assert.equal(out.n, 8);
  assert.deepEqual(out.drawing, { n: 8, matched: 8 });
  assert.equal(out.raised, 3);
  assert.equal(out.worth, 2, "d6 reads as junk to this reader");
  assert.equal(out.missed, 0);
  assert.equal(out.passed, 7);
  assert.equal(out.rows.find((r) => r.id === "d6")!.why, "reads as junk");
});

test("the cold read is one noul question over the situation and what Sol did", () => {
  const b = coldBody("The person is in Biology.", "Sol stayed silent about it.");
  assert.equal(b.questions.would_care.type, "noul");
  assert.deepEqual(Object.keys(b.questions.would_care.criteria), ["true", "false"]);
  assert.equal(b.state.what_sol_did, "Sol stayed silent about it.");
});

test("rule 5: the real run's number, when written, covers every case", () => {
  const f = new URL("./fixtures/judged-result.json", import.meta.url);
  if (!existsSync(f)) return;
  const r = JSON.parse(readFileSync(f, "utf8"));
  assert.equal(r.n, cases().length);
  assert.equal(r.rows.length, r.n);
  assert.ok(r.worth <= r.raised && r.missed <= r.silent);
});
