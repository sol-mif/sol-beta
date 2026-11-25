// node --test src/*.test.ts: the first run, step by step, on the new face (Sol ticket #97, on #1855's first run). While the
// shell installs (welcome.rs first_run), the window shows the five steps a first run takes, each with its own state: where
// Sol goes, Node, the engine, then Google and the AI (Claude, Codex) once the engine answers; the shell's reload to "/" does
// not end it (a mark in localStorage carries the last two over), and it ends on the new face, whose welcome card follows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
const S = await import("./next/movein/firstrun/steps-state.ts");
const L = await import("./next/movein/firstrun/left.ts");

const states = (s: ReturnType<typeof S.stepsOf>) => Object.fromEntries(s.map((x) => [x.id, x.state]));

// sol/install's own order (its steps 2 to 8): where Sol goes, Apple's developer tools, Node, the clone, Claude Code, sol/setup
const REAL = ["  ok    Sol goes to ~/Sol", "  ok    Apple's developer tools", "  ok    you are ada; your branch will be ada/mine",
  "install: fetching Node v24.22.1 (nodejs.org, about 50 MB)", "  ok    Node v24.22.1 in ~/.sol/node, checksum verified",
  "install: cloning Sol into ~/Sol", "  ok    Sol is in ~/Sol, on ada/mine (yours: commits there get \"mine: \" in front)",
  "install: installing Claude Code (Anthropic's installer)", "  ok    Claude Code installed",
  "install: bash sol/setup (a few minutes: packages, the engine built, its job)", "  ok    sol/setup done"];
const upTo = (n: number) => REAL.slice(0, n);

test("the install's own lines, in sol/install's real order, move the first three steps one at a time", () => {
  assert.deepEqual(states(S.stepsOf({ lines: [] })), { place: "doing", node: "todo", engine: "todo", google: "todo", ai: "todo" });
  assert.deepEqual(states(S.stepsOf({ lines: upTo(2) })), { place: "doing", node: "todo", engine: "todo", google: "todo", ai: "todo" }, "Apple's tools are part of getting the Mac ready");
  assert.deepEqual(states(S.stepsOf({ lines: upTo(4) })), { place: "done", node: "doing", engine: "todo", google: "todo", ai: "todo" });
  assert.deepEqual(states(S.stepsOf({ lines: upTo(5) })), { place: "done", node: "done", engine: "doing", google: "todo", ai: "todo" }, "Node in: Sol itself comes next");
  assert.deepEqual(states(S.stepsOf({ lines: upTo(10) })), { place: "done", node: "done", engine: "doing", google: "todo", ai: "todo" }, "the clone, Claude Code and sol/setup are one step");
  assert.equal(states(S.stepsOf({ lines: REAL })).engine, "done");
  const fr = REAL.map((_, i) => S.fracOf(upTo(i + 1)));
  assert.ok(fr.every((x, i) => i === 0 || x >= fr[i - 1]), "the line never goes back");
  assert.ok(fr[fr.length - 1] > 0.9 && S.fracOf([]) < 0.1);
});

test("a stop marks the step it happened in, never another", () => {
  assert.deepEqual(states(S.stepsOf({ lines: upTo(4), error: "could not fetch node from nodejs.org" })), { place: "done", node: "stopped", engine: "todo", google: "todo", ai: "todo" });
  assert.equal(states(S.stepsOf({ lines: [...upTo(6)], error: "could not clone" })).engine, "stopped", "the clone is the third step's, never where Sol goes");
  assert.equal(states(S.stepsOf({ lines: upTo(6), error: "could not clone" })).place, "done");
  assert.equal(states(S.stepsOf({ lines: [], error: "another Sol runs on this Mac" })).place, "stopped");
  const late = S.stepsOf({ lines: REAL, error: "Sol is installed, but its engine does not answer; try again" });
  assert.equal(states(late).engine, "stopped", "stopped after all three: the last is marked, never a rail of ticks beside a stop");
  assert.equal(S.currentOf(late), "engine");
});

test("where Sol goes is said from the install's own words, ~/Sol until it speaks", () => {
  assert.equal(S.placeOf([]), "~/Sol");
  assert.equal(S.placeOf(["  ok    Sol goes to ~/Work/Sol"]), "~/Work/Sol");
  assert.equal(S.placeOf(["install: cloning Sol into ~/Projects/Sol"]), "~/Projects/Sol");
  assert.equal(S.placeOf(["  ok    Sol goes to ~/Sol", "  ok    Sol is in ~/Work/Sol, on ada/mine"]), "~/Work/Sol");
});

test("signed in to only one AI, new chats start on that one (the old onboarding's seat, One.tsx)", () => {
  assert.equal(S.seatOf({ claude: "in", codex: "out" }), "claude");
  assert.equal(S.seatOf({ claude: "missing", codex: "in" }), "codex");
  assert.equal(S.seatOf({ claude: "in", codex: "in" }), null);
  assert.equal(S.seatOf({ claude: "out", codex: "out" }), null);
});

test("once the engine answers: Google, then the AI; a Sol with no cloud skips Google; each can be left for later", () => {
  const after = { lines: null, google: "out", ai: { claude: "out", codex: "out" } } as const;
  assert.deepEqual(states(S.stepsOf(after)), { place: "done", node: "done", engine: "done", google: "doing", ai: "todo" });
  assert.equal(S.currentOf(S.stepsOf(after)), "google");
  assert.deepEqual(states(S.stepsOf({ ...after, google: "none" })), { place: "done", node: "done", engine: "done", google: "skipped", ai: "doing" });
  assert.equal(states(S.stepsOf({ ...after, google: "later" })).google, "skipped");
  assert.equal(states(S.stepsOf({ ...after, google: "in" })).ai, "doing");
  const one = S.stepsOf({ ...after, google: "in", ai: { claude: "in", codex: "out" } });
  assert.equal(states(one).ai, "doing", "one AI signed in: the step stays, so the other can be added; its press says Continue");
  assert.equal(S.aiPress({ claude: "in", codex: "out" }), "Continue");
  assert.equal(S.aiPress({ claude: "out", codex: "missing" }), "Later");
  assert.equal(S.currentOf(S.stepsOf({ ...after, google: "in", ai: { claude: "in", codex: "in" } })), null, "both in: nothing left, the face");
  assert.equal(S.currentOf(S.stepsOf({ ...after, google: "in", ai: "later" })), null);
  assert.equal(S.currentOf(S.stepsOf({ ...after, google: "?" })), "google", "the engine not answered yet: Google waits, drawn as asking");
});

test("the mark carries the last two steps over the shell's reload, set while the shell installs", () => {
  assert.equal(L.signInsLeft(), false);
  L.markSignIns();
  assert.equal(L.signInsLeft(), true, "set while the shell installs");
  L.endSignIns();
  assert.equal(L.signInsLeft(), false, "gone once the steps end, or are left for later");
});

test("App.tsx draws the steps lazily for both halves: while the shell installs, and after its reload while the mark is there", () => {
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(app, /lazy\(\(\) => import\("\.\/next\/movein\/firstrun\/Steps"\)\)/);
  assert.match(app, /firstNow === "setup" && first\) return [^\n]*<Steps /, "the shell installing: the steps, in place of the one line");
  assert.match(app, /nextOn\(e\.settings\) && signIns\) return [^\n]*<Steps /, "after the reload, before the new face: the steps' last two");
});

test("the steps speak English, as the rest of the new face does (Frank, 2026-11-24): no Chinese outside comments", () => {
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  for (const f of ["Steps.tsx", "steps-state.ts", "left.ts"]) {
    const t = strip(readFileSync(new URL(`./next/movein/firstrun/${f}`, import.meta.url), "utf8"));
    assert.deepEqual(t.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/g) ?? [], [], f);
  }
  assert.equal(S.TITLES.place, "Get this Mac ready");
});
