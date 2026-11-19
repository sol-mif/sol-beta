// node --test src/*.test.ts: Settings in the new face (#1604, slice 6; next/settings/model.ts and cv/moves/settings.ts).
// The mockup's rules as they were (find, a change in words, point at it, now → with this, the history read from two
// snapshots), and the moves on the fixture: try → keep → ⌘Z puts it back, the history replays a past state, the way
// back turns ui.next off, and live the "no" rows answer "not yet". Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, K, POINTS, cmp, diffSnap, findAll, freshUi, kk, parseAsk, pointAt, setBy, trail, voiceLine, whoText } from "./next/settings/model.ts";
import { samWorld } from "./next/settings/seed.ts";
import { D, M, S, load, setMode } from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";
import { W, U } from "./next/cv/moves/settings.ts";

const sam = () => { const w = samWorld(); return { w, u: freshUi(w) }; };

test("find: words people use reach the choice, and a change in words comes first", () => {
  const { w, u } = sam();
  const dark = findAll(w, u, "dark mode");
  assert.equal(dark[0].said, true);
  assert.deepEqual([dark[0].k, dark[0].t], ["look", "night"]);
  assert.ok(findAll(w, u, "notifications").some((r) => r.type === "knob" && r.k === "attention"));
  assert.ok(findAll(w, u, "forget").some((r) => r.type === "place" && r.p === "learned"));
  assert.deepEqual(findAll(w, u, "zzqx"), []);
  // an AI named in the words: its own choices
  const inbox = findAll(w, u, "inbox keeper");
  assert.ok(inbox.length && inbox.every((r) => r.type !== "knob" || K[r.k!].per));
  assert.ok(inbox.some((r) => r.ai === "inbox"));
});

test("asking in words: the mockup's phrases land on their takes", () => {
  const { w, u } = sam();
  const ask = (q: string) => { const p = parseAsk(w, u, q); return p && `${p.k}:${p.t}${p.ai ? ":" + p.ai : ""}`; };
  assert.equal(ask("bigger text"), "size:l");
  assert.equal(ask("make it way bigger"), "size:xl");
  assert.equal(ask("quieter while I'm reviewing"), "attention:money");
  assert.equal(ask("let Course catch-up go ahead"), "autonomy:small:course");
  assert.equal(ask("bill watcher limit $50"), "spend:c50:bill");
  assert.equal(ask("hide the steps"), "working:result");
  assert.equal(ask("next ask"), null);
});

test("now → with this: what changes on your own things", () => {
  const { w } = sam();
  const a = cmp(w, K.autonomy, "asks", "ahead", "inbox");
  assert.equal(a.rows!.filter((r) => r.chg).length, 2);
  assert.equal(a.count, "2 of 4 jobs change.");
  const t = cmp(w, K.attention, "asksbreaks", "quiet", null);
  assert.match(t.lead!, /3 → 0 times/);
  const v = cmp(w, K["v-length"], "short", "full", null);
  assert.ok(v.two![1].length > v.two![0].length);
  assert.equal(voiceLine("short", "brisk", "none"), "Biology ch. 4: one page.");
});

test("the history: each change read from the snapshots around it, who set each choice", () => {
  const { w } = sam();
  assert.equal(w.hist.length, 10);
  const d = diffSnap(w.hist[0].snap, w.hist[1].snap);
  assert.deepEqual(d.k.map((c) => [c.key, c.from, c.to]), [["autonomy:course", "asks", "ahead"]]);
  assert.deepEqual(diffSnap(w.hist[8].snap, w.hist[9].snap).k.map((c) => c.to), ["m"]);
  assert.equal(setBy(w, "working")!.how, "your AI tuned it");
  assert.match(whoText(w, K.working), /^your AI tuned it/);
  assert.deepEqual(trail(w, K.size, null).map((x) => x.t), ["m", "l", "m"]);
});

test("point at it: the first POINT that holds the thing wins, an AI's name first", () => {
  const { w } = sam();
  // a stand-in element: closest(q) answers for the selectors it is inside
  const el = (inside: string[], ai?: string) => ({
    closest: (q: string) => (q.split(",").some((s) => inside.includes(s.trim())) ? { dataset: { ai } } : null),
  }) as unknown as Element;
  assert.equal(pointAt(w, el(["#talk", "#main"]))!.l, "the talk bar");
  assert.equal(pointAt(w, el(["#needsrow", "#side", "#main"]))!.l, "Needs you");
  assert.equal(pointAt(w, el(["#main"]))!.l, "the window");
  assert.equal(pointAt(w, el(["#v-settings", "#main"])), null);
  const ai = pointAt(w, el(["[data-ai]", "#side"], "bill"))!;
  assert.deepEqual([ai.l, ai.ai, ai.k], ["Bill watcher", "bill", ["autonomy", "spend"]]);
  assert.equal(POINTS[POINTS.length - 1].q, "#main");
  // live, the spend limit is "no": pointing never offers it
  assert.deepEqual(pointAt({ ...w, live: true }, el(["[data-ai]"], "bill"))!.k, ["autonomy"]);
});

test("moves on the fixture: try → keep → ⌘Z puts it back", () => {
  assert.ok(load("dev-morning"));
  assert.ok(M.stOpen().ok);
  assert.equal(S.page, "settings");
  const was = W().prefs.kept.look;
  assert.ok(M.stTry("look", "night").ok);
  assert.equal(U().trying?.t, "night");
  assert.equal(W().prefs.kept.look, was, "trying keeps nothing");
  assert.ok(M.stKeep().ok);
  assert.equal(W().prefs.kept.look, "night");
  assert.equal(U().trying, null);
  const n = W().hist.length;
  assert.ok(M.stUndo().ok);
  assert.equal(W().prefs.kept.look, was);
  assert.equal(W().hist.length, n + 1, "turning back is itself a change");
  assert.equal(M.stUndo().ok, false, "the turning back is in the history, not on ⌘Z's stack (ui.html undo_)");
  assert.equal(W().prefs.kept.look, was);
});

test("moves on the fixture: the history replays a past state, as a new change", () => {
  load("dev-morning");
  M.stKeep("size", "xl");
  const past = C(W().hist[3].snap);
  assert.ok(M.stPreview(3).ok);
  assert.equal(U().hx, 3);
  const n = W().hist.length;
  assert.ok(M.stReplay(3).ok);
  assert.deepEqual(W().prefs, past);
  assert.equal(W().hist.length, n + 1);
  assert.deepEqual(W().hist[n].snap, past);
  assert.equal(U().hx, null);
});

test("moves on the fixture: find, ask, point at a part, the voice's learned lines", () => {
  load("dev-morning");
  M.stOpen();
  assert.ok(M.stFind("bigger text").ok);
  assert.ok(M.stSel(0).ok);
  assert.deepEqual([U().trying?.k, U().trying?.t], ["size", "l"]);
  assert.ok(M.stPick(0).ok);
  assert.equal(W().prefs.kept.size, "l");
  assert.ok(M.stAsk("let Course catch-up go ahead").ok);
  assert.deepEqual(U().trying, { k: "autonomy", t: "small", ai: "course", sticky: true });
  M.stLeave();
  const lines = W().prefs.learned.length;
  assert.ok(M.stAct("l-rm", "2").ok);
  assert.equal(W().prefs.learned.length, lines - 1);
  M.stUndo();
  assert.equal(W().prefs.learned.length, lines);
  assert.equal(kk(K.autonomy, "inbox"), "autonomy:inbox");
});

test("the way back: ui.next off in the store, the time kept beside", () => {
  load("dev-morning");
  assert.equal((D.settings as { ui: { next: boolean } }).ui.next, true);
  const r = M.oldSol();
  assert.ok(r.ok);
  assert.equal((D.settings as { ui: { next: boolean } }).ui.next, false);
  assert.ok((D.nextBack as { at: string }).at);
  r.undo();
  assert.equal((D.settings as { ui: { next: boolean } }).ui.next, true);
});

test("live: the history, the ways and the spend limit answer not yet, and no fixture line shows", () => {
  assert.ok(FIXTURE["dev-morning"]);
  load("dev-morning");
  setMode("live");
  delete D.prefs;
  S.st = undefined;
  try {
    const w = W();
    assert.equal(w.live, true);
    assert.equal(w.hist.length, 0);
    assert.equal(w.prefs.learned.length, 0, "no fixture line in a real Sol");
    assert.ok(!w.ais.some((a) => a.n === "Inbox keeper"));
    assert.equal(M.stReplay(0).why, "not yet");
    assert.equal(M.stWay("deep").why, "not yet");
    assert.equal(M.stTry("spend", "c5").why, "not yet");
    assert.ok(!findAll(w, U(), "budget").some((r) => r.k === "spend"));
    assert.ok(M.stTry("look", "night").ok);
  } finally { setMode("fixture"); }
});
