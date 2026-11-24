// node --test src/*.test.ts: the first run of a downloaded Sol (#94, Sol ticket #96). Before: with no root the app showed
// /?firstrun=1, whose face waited on an engine that only the install would bring, and the install only started from the
// old onboarding, which never drew: "Sol is starting…" for good. Now the shell installs (welcome.rs first_run) and the
// face asks it, drawing one line while it runs; a download never draws the old face, its onboarding included.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
store.set("sol.ui.next", "0");   // this Mac last read the switch off (Frank's BR1: the old onboarding forced)
const F = await import("./next/flag.ts");
const { askOf, progressOf } = await import("./next/movein/setup-state.ts");
type FR = import("./next/flag.ts").FirstRun;
const fr = (o: Partial<FR>): FR => ({ active: false, download: true, lines: [], code: null, error: null, ...o });

test("a fresh Sol with no root draws the install's line, never the engine's wait or the old onboarding", () => {
  assert.equal(F.firstScreen(undefined), "wait", "the shell not answered yet: the first frame's paper");
  assert.equal(F.firstScreen(fr({ active: true })), "setup", "no root: the shell is installing, the face says so");
  assert.equal(F.firstScreen(fr({ active: true, error: "could not fetch Node", code: 1 })), "setup", "stopped: still the setup, with why");
  assert.equal(F.firstScreen(fr({ active: false })), "face", "installed: the face");
  assert.equal(F.firstScreen(null), "face", "no shell to ask (a browser): the face as before");
});

test("a download never draws the old face: not before the engine answers, not when it answers off", () => {
  F.noteBuild(true);
  assert.equal(store.get("sol.build"), "download", "kept for index.html's first paint");
  assert.equal(F.waitsFirst(null), true, "the engine not heard yet: the paper, even with the switch last read off here");
  assert.equal(F.nextOn({ ui: { next: false } }), true, "an engine that says off (a cold one, before its channel): still the new face");
  assert.equal(F.waitsFirst({ ui: { next: false } }), false);
  F.noteBuild(false);
  assert.equal(F.nextOn({ ui: { next: false } }), false, "the team's own build keeps the switch both ways");
  store.set("sol.ui.next", "0");
  assert.equal(F.waitsFirst(null), false, "the team's build, switch last read off: the old face starts as it did");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /getItem\("sol\.build"\) === "download"\) document\.documentElement\.dataset\.nextFirst/, "index.html paints a download the paper");
});

test("the shell is asked on a beat while it installs, and no more once Sol is open", async () => {
  const said: (FR | null)[] = [];
  const answers = [fr({ active: true }), fr({ active: true, lines: ["install: bash sol/setup"] }), fr({ active: false })];
  let asked = 0;
  const stop = F.watchFirstRun(async () => answers[Math.min(asked++, answers.length - 1)], (f) => said.push(f), 1);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(asked, 3, "asked until the shell says it is done");
  assert.deepEqual(said.map((f) => f?.active), [true, true, false]);
  stop();
  const none: (FR | null)[] = [];
  F.watchFirstRun(() => Promise.reject(new Error("no command first_run_state")), (f) => none.push(f));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(none, [null], "an app with no such command (older shell) or a browser: the face as before");
});

test("the line moves with the install's own words", () => {
  assert.equal(progressOf([]), 0.02);
  const steps = ["install: cloning Sol into ~/Sol", "  ok    Sol is in ~/Sol, on ada/mine", "  ok    Node v24.22.1 in ~/.sol/node, checksum verified", "  ok    the engine answers on 7777"];
  const at = steps.map((_, i) => progressOf(steps.slice(0, i + 1)));
  assert.deepEqual(at, [0.04, 0.22, 0.42, 0.94]);
});

test("a clean Mac's one wait on the person, Apple's developer tools, is said while it waits and gone once installed", () => {
  const wait = "install: git needs Apple's developer tools: click Install in the window Apple opened (a few minutes), this waits";
  assert.equal(askOf(["install: cloning Sol into ~/Sol"]), null);
  assert.match(askOf([wait]) ?? "", /請按「安裝」/);
  assert.equal(askOf([wait, "  ok    Apple's developer tools"]), null);
});
