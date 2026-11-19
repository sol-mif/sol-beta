// Pieces (#1092): the ghost row (pieceGhost.ts, the designer's NOW 3 of 05:14), worked out on this machine and never
// sent (the lead's 05:54). His own short lines only; a status question by its words, asked twice; the source whose words
// cover its name answers it: all of them acts, some a dashed pill, none nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostFrom, nameFrom, sourceFor, statusName, typedIn } from "../src/work/pieceGhost.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const now = Date.now(), iso = (ms: number) => new Date(ms).toISOString();
const line = (o: object) => JSON.stringify(o);

test("his lines: typed by him, today, short; not injected, not meta, not the agent's", () => {
  const j = [
    line({ type: "user", timestamp: iso(now - 1000), message: { content: "how are the releases" } }),
    line({ type: "user", timestamp: iso(now - 1000), message: { content: [{ type: "text", text: "what waits on me" }] } }),
    line({ type: "user", timestamp: iso(now - 2 * 86_400_000), message: { content: "old question" } }),
    line({ type: "user", isMeta: true, timestamp: iso(now), message: { content: "meta" } }),
    line({ type: "user", timestamp: iso(now), message: { content: "<command-name>/x</command-name>" } }),
    line({ type: "assistant", timestamp: iso(now), message: { content: "how are the releases" } }),
    line({ type: "user", timestamp: iso(now), message: { content: "x".repeat(300) } }),
    "not json",
  ].join("\n");
  assert.deepEqual(typedIn(j, now - 86_400_000), ["how are the releases", "what waits on me"]);
});

test("the tool's name is the question's own words", () => {
  assert.equal(nameFrom("how are the releases?"), "releases");
  assert.equal(nameFrom("what's the status of the cowork bugs"), "cowork bugs");
  assert.equal(nameFrom("how are we doing"), "");
});

test("a status question asked twice is the ghost; the source whose words cover it answers, issues by area and kind", () => {
  const src = [
    { id: "issues", word: "issues", parts: [{ label: "area", options: ["cowork", "marketing"] }, { label: "kind", options: ["bug", "decision"] }] },
    { id: "prs", word: "pull requests" }, { id: "runs", word: "runs" }, { id: "file:.sol/rhythm.json", word: "rhythm.json" },
    { id: "else", word: "something else", asks: "sentence" as const },
  ];
  assert.equal(statusName("fix the button"), null);
  assert.equal(statusName("how are the cowork bugs today"), "cowork bugs");
  assert.deepEqual(sourceFor("cowork bugs", src), { reads: "issues", parts: { area: "cowork", kind: "bug" }, covered: 1 });
  assert.equal(sourceFor("pull requests", src)?.reads, "prs");
  assert.equal(sourceFor("releases", src), null, "no source has its words: nothing");
  const g = ghostFrom(["how are the cowork bugs", "fix the side", "how are the cowork bugs today"], src);
  assert.deepEqual(g, { name: "cowork bugs", reads: "issues", parts: { area: "cowork", kind: "bug" }, asked: "how are the cowork bugs today", tier: "acts" });
  assert.equal(ghostFrom(["how are the cowork bugs"], src), null, "asked once is not one he keeps asking");
  assert.equal(ghostFrom(["how are the cowork launches", "how are the cowork launches"], src)?.tier, "ghost", "some words covered: the dashed pill");
  assert.equal(ghostFrom(["how are the releases", "how are the releases"], src), null);
  assert.equal(ghostFrom(["how are the cowork bugs", "how are the cowork bugs"], src, ["cowork bugs"]), null, "a piece already answers it: not offered again");
});

test("Home's due: whether a dated fact is his is decided by its words here; none is no row, neither is maybe due, never yellow", () => {
  return import("../src/work/pieceSources.ts").then((S) => {
    const now = new Date(2026, 10, 13);
    const facts = [{ k: "Problem set 4", v: "due Nov 16", src: "syllabus.pdf" }, { k: "Office hours", v: "Nov 15", src: "syllabus.pdf" }, { k: "Guest visit", v: "Nov 14", src: "syllabus.pdf" }];
    assert.equal(S.dueTier(facts[0]), "acts");
    assert.equal(S.dueTier(facts[1]), "none");
    assert.equal(S.dueTier(facts[2]), "ghost");
    const r = S.dueRows("", now, facts, S.dueTiers(facts));
    assert.deepEqual(r.rows.map((x) => x.t), ["Problem set 4", "Guest visit"]);
    assert.equal(r.rows[0].wants, true);
    assert.equal(r.rows[1].wants, undefined, "maybe due is never yellow");
    assert.match(r.rows[1].note ?? "", /maybe due/);
    assert.equal(r.rows[1].maybe, true, "drawn as a name with a dashed hairline");
  });
});

test("a spy on every request: the ghost and Home's due send nothing anywhere (no word he typed, no fact's words)", async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const S = await import("../src/work/pieceSources.ts");
  const G = await import("../src/work/pieceGhost.ts");
  const sent: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: unknown, o?: { body?: unknown }) => { sent.push(`${String(u)} ${String(o?.body ?? "")}`); throw new Error("no network in this test"); }) as typeof fetch;
  try {
    const d = mkdtempSync(join(tmpdir(), "sol-ghost-spy-"));
    const f = join(d, "t.jsonl");
    writeFileSync(f, [1, 2].map(() => JSON.stringify({ type: "user", timestamp: new Date().toISOString(), message: { content: "how are the secret cowork bugs" } })).join("\n"));
    const g = await G.ghostFor(d, [{ id: "issues", word: "issues", parts: [{ label: "area", options: ["cowork"] }, { label: "kind", options: ["bug"] }] }], async () => [f]);
    assert.ok(g, "the ghost is still found, here");
    mkdirSync(join(d, "cls"));
    writeFileSync(join(d, "cls", "ground.json"), JSON.stringify({ facts: [{ k: "Secret essay for Prof Lee", v: "due Nov 20", src: "syllabus.pdf" }] }));
    await S.builtinSource(join(d, "cls"), { name: "due" }, { getJson: async () => ({}), readJson: () => ({}), readText: (p: string) => { try { return require("node:fs").readFileSync(join(d, "cls", p), "utf8"); } catch { return null; } }, jsonFiles: () => [] } as never);
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(sent, [], "nothing was sent");
  } finally { globalThis.fetch = real; }
});
