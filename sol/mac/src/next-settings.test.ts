// node --test src/*.test.ts: Settings in the new face (#1604, slice 6; next/settings/model.ts and cv/moves/settings.ts).
// The mockup's rules as they were (find, a change in words, point at it, now → with this, the history read from two
// snapshots), and the moves on the fixture: try → keep → ⌘Z puts it back, the history replays a past state, the way
// back turns ui.next off, and live the "no" rows answer "not yet". Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, K, POINTS, chainHere, cmp, diffSnap, findAll, freshUi, kk, parseAsk, nestingOf, pointAt, scopeOfRegion, setBy, standing, trail, upward, voiceLine, whoText } from "./next/settings/model.ts";
import { samWorld } from "./next/settings/seed.ts";
import { D, M, S, load, setMode } from "./next/cv/index.ts";
import { FIXTURE } from "./next/cv/fixture.ts";
import { W, U } from "./next/cv/moves/settings.ts";
import { link } from "./next/settings/link.ts";
import { byPlace, forgot, ledger, placeName, reads } from "./next/settings/privacy-state.ts";
import type { Known } from "./next/known.ts";
import type { Engine } from "./next/cv/wire/types.ts";

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
  assert.equal(pointAt(w, el(["#needsrow", "#side", "#main"]))!.l, "Waiting on you");
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
  assert.ok(M.stAct("l-rm", "learned:2").ok);
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

// Settings › Privacy, the ledger (BR1, #1615; mine/look/br1/because.html scene 4), with invented people only
const line = (k: string, fact: string, source: string, place: string | null = null): Known => ({ k, fact, source, by: "read", place });

test("Privacy: what Sol may read is the last read's sources, the ones a stop cut short, and the ones said no to, each once, in the person's words", () => {
  assert.deepEqual(reads(null), [], "no read yet: no rows, nothing pretends to switch");
  const base = { at: "2026-11-20T09:00:00Z", sources: ["projects", "claude-sessions", "browser"], by: "device", made: "device", digest: "" } as const;
  const rows = reads({ read: { ...base, sources: [...base.sources], stopped: ["browser", "notes"] } });
  assert.deepEqual(rows.map((r) => [r.source, r.on]), [["claude-sessions", true], ["browser", true], ["notes", true], ["projects", true]], "stopped: read in part, still read");
  assert.ok(rows.every((r) => !r.can), "no read.off from the engine yet: no switch");
  assert.equal(rows[0].name, "Claude Code sessions on this Mac");
  assert.ok(rows.every((r) => r.name && !r.name.includes("-")), "never the source's id");
  const said = reads({ read: { ...base, sources: ["projects", "claude-sessions"], stopped: ["notes"], off: ["browser", "notes"] } });
  assert.deepEqual(said.map((r) => [r.source, r.on]), [["claude-sessions", true], ["browser", false], ["notes", false], ["projects", true]], "said no: not read, over a stop");
  assert.ok(said.every((r) => r.can), "the engine sends read.off: each row a switch");
});

test("Privacy: a source turned off says what Sol forgot from it, counted, the first one or two in its words, or that it had learned nothing there", () => {
  const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ ...line(`seen:/u/lucy/garden:${i}`, i ? `Fact ${i}.` : "You water the beds at dawn.", "your notes", "/u/lucy/garden"), from: "notes" as const }));
  assert.equal(forgot("Your notes", []), "Sol no longer reads your notes. Sol hadn't learned anything there yet.");
  assert.equal(forgot("Your notes", notes(1)), "Sol no longer reads your notes. It forgot 1 thing it learned there: “You water the beds at dawn”");
  assert.equal(forgot("Your notes", notes(2)), "Sol no longer reads your notes. It forgot 2 things it learned there: “You water the beds at dawn”, “Fact 1”");
  assert.equal(forgot("Claude Code sessions on this Mac", notes(14)), "Sol no longer reads Claude Code sessions on this Mac. It forgot 14 things it learned there: “You water the beds at dawn”, +13");
  const mine = { ...line("seen:you:hours", "You write before noon.", "your notes"), from: "notes" as const };
  assert.ok(forgot("Your notes", [...notes(3), mine]).includes("there: “You write before noon”, +3"), "what it knew of the person is named first");
});

test("Privacy: everything Sol learned is found by any of its words, every word asked in it", () => {
  const all = [line("fact:1", "Tomas writes the release notes on Fridays", "you said"), line("learned:4", "Prefers short answers", "seen 3 times"),
    line("seen:w:/u/ana/garden:ais", "Claude Code works here", "your AI chats", "w:/u/ana/garden")];
  assert.equal(ledger(all, "").length, 3);
  assert.equal(ledger(all, "   ").length, 3);
  assert.deepEqual(ledger(all, "FRIDAYS").map((f) => f.k), ["fact:1"]);
  assert.deepEqual(ledger(all, "seen short").map((f) => f.k), ["learned:4"], "the source's words count");
  assert.deepEqual(ledger(all, "garden").map((f) => f.k), ["seen:w:/u/ana/garden:ais"], "the place counts");
  assert.deepEqual(ledger(all, "fridays short"), [], "every word, not any");
});

test("Privacy: the ledger is read under who it is about, the person first, each place by its name", () => {
  const you = { parts: [{ id: "/u/minji/thesis", name: "thesis" }] } as unknown as Parameters<typeof placeName>[0];
  assert.equal(placeName(you, "/u/minji/thesis"), "thesis");
  assert.equal(placeName(you, "w:/u/minji/thesis"), "thesis", "a folder's id names the same part");
  assert.equal(placeName(you, "w:/u/minji/garden/"), "garden", "a place next.you does not name: its last folder");
  const list = [line("seen:/u/minji/thesis:hours", "Busiest 9pm–12am", "when you work", "/u/minji/thesis"), line("aim:Writing", "You're here for writing", "you said"),
    line("fact:2", "Dev reviews the drafts", "you said", "w:/u/minji/garden"), line("tool:/u/minji/thesis:LaTeX", "Uses LaTeX here", "your code", "/u/minji/thesis")];
  const g = byPlace(list, (p) => placeName(you, p));
  assert.deepEqual(g.map((x) => [x.name, x.lines.map((l) => l.k)]), [["About you", ["aim:Writing"]], ["thesis", ["seen:/u/minji/thesis:hours", "tool:/u/minji/thesis:LaTeX"]], ["garden", ["fact:2"]]]);
  assert.deepEqual(ledger(list, "thesis latex", (p) => placeName(you, p)).map((f) => f.k), ["tool:/u/minji/thesis:LaTeX"], "the place's name is found too");
  assert.deepEqual(byPlace([], (p) => p), []);
});

test("Privacy: Forget on any line Sol holds; the engine's own by next.you.fact.forget with Back, nothing for what Sol works out", () => {
  load("dev-morning");
  M.stOpen();
  const before = W().prefs.learned.length, k = W().prefs.learned[0].k;
  assert.ok(before > 0);
  const r = M.stAct("k-rm", k);
  assert.ok(r.ok, "a learned line goes as l-rm");
  assert.equal(W().prefs.learned.length, before - 1);
  r.undo();
  assert.equal(W().prefs.learned.length, before);
  assert.equal(M.stAct("k-rm", "fact:9").ok, false, "on the fixture nothing holds an engine fact");
  assert.equal(M.stAct("k-rm", "seen:w:/u/ana:hours").ok, false, "what Sol works out is not forgotten");
  const sent: object[] = [];
  link.e = { send: (o: object) => { sent.push(o); return true; } } as unknown as Engine;
  setMode("live");
  try {
    const f = M.stAct("k-rm", "fact:9");
    assert.ok(f.ok);
    assert.deepEqual(sent, [{ type: "next.you.fact.forget", k: "fact:9" }]);
    f.undo();
    assert.deepEqual(sent[1], { type: "next.you.fact.forget", k: "fact:9", back: true });
    assert.equal(M.stAct("k-rm", "aim:Gardening").ok, false, "a stated aim is not forgotten here");
  } finally { setMode("fixture"); link.e = null; }
});

test("Privacy: the page is reached by its words, and what I've learned opens on it", () => {
  const { w, u } = sam();
  assert.ok(findAll(w, u, "privacy").some((r) => r.type === "place" && r.p === "privacy"));
  assert.ok(findAll(w, u, "erase").some((r) => r.type === "place" && r.p === "privacy"));
  load("dev-morning");
  M.stOpen();
  assert.equal(M.stPlace("learned").id, "st-learned");
  assert.equal(U().page, "privacy");
});

test("Why …?: a folder nested by hand lists its parent's row, as the engine walks it (fits.ts upward, nestedIn)", () => {
  const regions = [{ id: "h:denise" }, { id: "h:massage", parent: "h:denise", parentBy: "person" }, { id: "w:a/b", parent: "h:denise", parentBy: "rule" }, { id: "w:c/d", parentBy: "person" }];
  const nest = nestingOf(regions), inOf = (s: string) => nest.get(s);
  assert.deepEqual(upward("home/massage", inOf), ["home/massage", "home/denise", "home", "~"], "the person's nesting before the path");
  assert.deepEqual(upward("a/b", inOf), ["a/b", "a", "~"], "a rule's nesting is the path's");
  assert.deepEqual(upward("c/d", inOf), ["c/d", "~"], "taken out to the canvas by the person: nothing above it");
  assert.deepEqual(upward("home/massage"), ["home/massage", "home", "~"], "no nesting: the path alone");
  const w = samWorld(), fit = { knob: "size", scope: "home/denise", take: "l", author: "person" as const, reason: null, count: null, source: null, change: null, held: false, history: [] };
  w.fits = [fit];
  w.here = { folder: { scope: "home/massage", name: "Massage", up: upward("home/massage", inOf) }, session: null };
  assert.ok(chainHere(w).includes("home/denise"), "Denise's row is in the Why list");
  assert.equal(standing(w, "size")?.scope, "home/denise", "and her take is the one in use");
  w.here = { folder: { scope: "home/massage", name: "Massage" }, session: null };
  assert.equal(standing(w, "size"), null, "unnested, the path alone");
});

test("Why …?: through the canvas, Settings opened over a folder the person put in another reads that one's take", () => {
  load("dev-morning");
  // two folders as a real Sol names them (the fixture's ids are bare): a person's place under home
  const [a, b] = D.regions.filter((r) => !r.parent && !D.regions.some((x) => x.parent === r.id));
  for (const [r, id] of [[a, "h:denise"], [b, "h:massage"]] as const) {
    if (D.pos?.[r.id]) { D.pos[id] = D.pos[r.id]; delete D.pos[r.id]; }
    for (const p of Object.values(D.pieces)) if (p.region === r.id) p.region = id;
    r.id = id;
  }
  D.regions = [...D.regions];
  assert.ok(M.nest(b.id, a.id).ok);
  setMode("live");
  delete D.prefs;
  S.st = undefined;
  try {
    S.region = b.id;
    M.stOpen();
    assert.ok(W().live);
    assert.ok(chainHere(W()).includes(scopeOfRegion(a.id)!), `${b.name} in ${a.name}: ${a.name}'s row is in the Why list`);
  } finally { setMode("fixture"); }
});
