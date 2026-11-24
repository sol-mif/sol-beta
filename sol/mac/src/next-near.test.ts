// node --test src/*.test.ts: Near (#1615, slice 3): which keys are ours and which reach the pane, the fixture's terminal,
// the starter (start, in place, undo, the over-limit ask), split_run and the part at Near, redirect, check, talk, the
// phrases ("Ada, fix the login bug in api", "start it"), the copies sorted by state, and the "no" moves held back live.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { route, shellChord, typeInto, typeIntoPage, type At } from "./next/near/keys.ts";
import { focusId, guess, sentence, slug, copyName, stateOf, partCols } from "./next/near/runs.ts";
import { regionIn } from "./next/cv/say/near.ts";

const at = (x: Partial<At> = {}): At => ({ dist: "near", starter: false, parts: "none", ans: false, beside: false, ...x });

test("at Near every plain key reaches the pane; only the shell's ⌘ chords are ours, and ⌘K is left to the terminal", () => {
  for (const code of ["KeyL", "Space", "Enter", "Escape", "Minus", "Digit1", "Period", "KeyF"]) assert.equal(route({ code }, at()), "pane", code);
  assert.equal(route({ code: "Period", altKey: true }, at()), "pane");
  assert.equal(route({ code: "KeyP", metaKey: true }, at()), "shell");
  assert.equal(route({ code: "KeyK", metaKey: true }, at()), "none");
  assert.equal(route({ code: "Enter", metaKey: true }, at()), "none", "⌘↩ with nothing asking is not the shell's");
  assert.equal(route({ code: "Enter", metaKey: true }, at({ ans: true })), "shell");
  assert.equal(shellChord({ code: "Digit3", metaKey: true }, false), true);
  assert.equal(route({ code: "KeyL" }, at({ dist: "middle" })), "none");
});

test("⌘N opens a new session from anywhere (BR1 gate 1); the open starter takes the words; a split job takes the arrows", () => {
  assert.equal(route({ code: "KeyN", metaKey: true }, at({ dist: "far" })), "starter");
  assert.equal(route({ code: "KeyN", metaKey: true }, at()), "starter");
  assert.equal(route({ code: "KeyA" }, at({ dist: "middle", starter: true })), "starter");
  assert.equal(route({ code: "Enter", metaKey: true }, at({ dist: "middle", starter: true })), "starter");
  assert.equal(route({ code: "KeyJ", metaKey: true }, at({ dist: "middle", starter: true })), "shell");
  assert.equal(route({ code: "ArrowRight" }, at({ parts: "choosing" })), "parts");
  assert.equal(route({ code: "Enter" }, at({ parts: "choosing" })), "parts");
  assert.equal(route({ code: "ArrowRight" }, at({ parts: "open" })), "pane");
  assert.equal(route({ code: "ArrowUp", metaKey: true }, at({ parts: "open" })), "parts");
  assert.equal(route({ code: "ArrowRight" }, at({ parts: "choosing", beside: true })), "pane");
});

test("the fixture's terminal types, runs, and holds vim until :wq", () => {
  let t = { lines: ["$ _"], vim: false, buf: "" };
  for (const k of "ls") t = typeInto(t, { code: "Key" + k.toUpperCase(), key: k }).term;
  assert.equal(t.buf, "ls");
  t = typeInto(t, { code: "Period", altKey: true }).term;
  assert.equal(t.buf, "ls <last-arg>");
  let r = typeInto(t, { code: "Enter" });
  assert.equal(r.started, "ls <last-arg>");
  t = r.term; for (const k of "vim x") t = typeInto(t, { code: k === " " ? "Space" : "Key" + k.toUpperCase(), key: k }).term;
  t = typeInto(t, { code: "Enter" }).term;
  assert.equal(t.vim, true);
  for (const k of [":", "w", "q"]) t = typeInto(t, { code: "Key", key: k }).term;
  r = typeInto(t, { code: "Enter" });
  assert.equal(r.saved, true); assert.equal(r.term.vim, false);
  assert.equal(typeIntoPage("ab", { code: "Backspace" }), "a");
});

test("start: a starter where it will run, then one press makes it the session in place; its undo takes it away", () => {
  CV.load("fresh");
  const s = CV.M.start({});
  assert.equal(s.ok, true);
  const id = s.id!;
  assert.equal(CV.D.pieces[id].kind, "starter");
  assert.equal(CV.D.pieces[id].ai, "Ada");
  assert.equal(CV.D.pieces[id].region, "api");
  assert.equal(focusId(), id);
  assert.equal(CV.S.dist, "middle");
  assert.equal(CV.M.start(id).ok, false, "nothing to do yet");
  CV.D.pieces[id].words = "fix the login bug";
  const g = CV.M.start(id);
  assert.equal(g.ok, true); assert.equal(g.id, id);
  assert.equal(CV.D.pieces[id].kind, "session"); assert.equal(CV.D.pieces[id].state, "working"); assert.equal(CV.D.pieces[id].copy, "fix-login-bug");
  assert.equal(focusId(), null);
  g.undo();
  assert.equal(CV.D.pieces[id].kind, "starter");
  s.undo();
  assert.equal(CV.D.pieces[id], undefined);
});

test("a start over the AI's limit asks first; an AI that goes ahead starts at once", () => {
  CV.load("dev-morning");
  const r = CV.M.start({ ai: "Mo", words: "upgrade terraform", region: "infra" });
  assert.equal(guess(CV.D.pieces[r.id!]).over, true);
  const go = CV.M.start(r.id);
  assert.equal(go.ok, true);
  assert.ok((go as unknown as { ask: string }).ask);
  assert.equal(CV.D.pieces[r.id!].kind, "starter");
  const k = CV.M.start({ ai: "Rex", words: "write the tests", region: "api" });
  assert.equal(CV.D.pieces[k.id!].kind, "session");
});

test("the voice: \"Ada, fix the login bug in api\" then \"start it\"", () => {
  CV.load("fresh");
  assert.deepEqual(regionIn("fix the login bug in api"), { words: "fix the login bug", region: "api" });
  assert.ok(CV.say("Ada, fix the login bug in api"));
  const id = focusId()!;
  assert.equal(CV.D.pieces[id].words, "fix the login bug");
  assert.ok(CV.say("start it"));
  assert.equal(CV.D.pieces[id].kind, "session"); assert.equal(CV.D.pieces[id].ai, "Ada"); assert.equal(CV.D.pieces[id].region, "api");
});

test("split_run makes parts; a part opens at Near and ⌘↑ goes back to the job; redirect, check and talk land in the thread", () => {
  CV.load("dev-focus");
  const r = CV.M.split_run("s-Ada", [{ ai: "Rex", words: "write the login tests" }, "fix the logout path"]);
  assert.equal(r.ok, true);
  const p = CV.D.pieces["s-Ada"];
  assert.equal(p.parts?.length, 2); assert.equal(p.parts?.[0].ai, "Rex"); assert.equal(p.parts?.[1].ai, "Ada");
  assert.match(sentence(p), /^Split into 2 parts: 2 working\.$/);
  assert.equal(stateOf(p.parts![0]), "working");
  assert.equal(CV.M.openPart("s-Ada.p1").ok, true);
  assert.equal(CV.S.part, "s-Ada.p1");
  assert.ok(CV.say("back to the job"));
  assert.equal(CV.S.part, null);
  r.undo();
  assert.equal(CV.D.pieces["s-Ada"].parts, undefined);
  assert.equal(CV.M.redirect("s-Ada", "keep the old token").ok, true);
  assert.equal(CV.D.pieces["s-Ada"].words, "keep the old token");
  const c = CV.M.check("s-Ada", "Rex");
  assert.equal(c.ok, true);
  assert.equal((CV.D.pieces["s-Ada"].checked as { by: string }).by, "Rex");
  assert.equal(CV.M.check("s-Ada", "Ada").ok, false, "an AI never checks itself");
  const n = (CV.D.pieces["s-Ada"].talk || []).length;
  assert.equal(CV.M.talk("s-Ada", "and the tests").ok, true);
  assert.equal(CV.D.pieces["s-Ada"].talk?.length, n + 1);
});

test("live, split and split_run answer not yet; the fixture runs them", () => {
  CV.load("dev-focus");
  CV.setMode("live");
  try {
    assert.deepEqual({ ok: CV.M.split("s-Ada", ["a"]).ok, why: CV.M.split("s-Ada", ["a"]).why }, { ok: false, why: "not yet" });
    assert.equal(CV.M.split_run("s-Ada", ["a"]).why, "not yet");
    assert.equal(CV.M.redirect("s-Ada", "x").ok, false, "live without the engine, nothing is said");
  } finally { CV.setMode("fixture"); }
});

test("words → a copy name; the part columns by width", () => {
  assert.equal(slug("Fix the login bug, please"), "fix-login-bug");
  CV.load("dev-morning");
  assert.equal(copyName("fix login"), "fix-login-2");
  assert.deepEqual([partCols(900), partCols(1200), partCols(1600)], [1, 2, 4]);
});
