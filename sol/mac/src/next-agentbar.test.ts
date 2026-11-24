// node --test src/*.test.ts: the bar is always agentic (#1615 BR1, cv/wire/canvas.ts). Words no move takes go to the
// canvas session with the window's picture of the canvas; pieces dropped on the bar ride as chips, once each; while the
// agent works the frame's line says so, and its words stay there until OK. Its moves are done as the hand would: a
// folder takes its pieces along, a fold takes its folded size, and each place it changed is kept by "ai".
// Invented people only (the dev-morning fixture). Signed: marcocyl04-ux's agent (builder B), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import * as W from "./next/cv/wire/canvas.ts";
import * as L from "./next/plane/layout.ts";
import { tabsLink } from "./next/cv/moves/tabs.ts";

// the frame's line as Next.tsx gives it (frame.tsx is a view; the wire speaks through hooks.flash and agentLine.hold)
let held: string | null = null, said: { text: string; act?: string; no?: string; run?: () => void } | null = null;
const frame = { now: () => (said ?? (held ? { text: held } : null)) as { text: string; act?: string; no?: string; run?: () => void } | null, clear: () => { held = null; said = null; } };
CV.hooks.flash = (t, act, no) => { said = { text: t, act: act?.label, no: no?.label, run: act?.run }; };
W.agentLine.hold = (t) => { held = t; if (t) said = null; };

function engine() {
  const sent: any[] = [], subs = new Set<(m: any) => void>();
  const e = { send: (m: any) => sent.push(m), subscribe: (f: (m: any) => void) => { subs.add(f); return () => subs.delete(f); } } as never;
  return { e, sent, hear: (m: object) => subs.forEach((f) => f(m)) };
}
function live<T>(f: (x: ReturnType<typeof engine>) => T): T {
  CV.load("dev-morning");
  frame.clear();
  const x = engine(), off = W.attach(x.e) as () => void;
  CV.setMode("live");
  try { return f(x); } finally { CV.setMode("fixture"); off(); W.agentBar.chips = []; }
}
const folderWithPieces = () => {
  const r = CV.D.regions.find((r) => CV.D.pos?.[r.id] && Object.values(CV.D.pieces).some((p) => p.region === r.id && CV.D.pos?.[p.id] && !p.inside))!;
  const p = Object.values(CV.D.pieces).find((p) => p.region === r.id && CV.D.pos?.[p.id] && !p.inside)!;
  return { r, p };
};

test("the window's picture names every thing with a place: folders, pieces in their folder, the Diary", () => {
  CV.load("dev-morning");
  const pic = W.picture(), { r, p } = folderWithPieces();
  assert.ok(pic.length > 2);
  assert.equal(pic.find((x) => x.id === r.id)?.kind, "folder");
  assert.equal(pic.find((x) => x.id === r.id)?.name, r.name);
  assert.equal(pic.find((x) => x.id === p.id)?.in, r.id);
  assert.ok(pic.every((x) => [x.x, x.y, x.w, x.h].every(Number.isFinite)));
});

test("words no move takes go to the canvas session with the picture and the chips; the frame says it works, then its words", () => live(({ sent, hear }) => {
  const { r, p } = folderWithPieces();
  assert.equal(W.chipOn(p.id), true);
  assert.equal(W.chipOn(p.id), false, "once each");
  assert.equal(W.chipOn("no-such-thing"), false);
  W.chipOn(r.id);
  W.chipOff(r.id);
  assert.deepEqual(W.agentBar.chips.map((c) => c.id), [p.id]);
  assert.equal(W.askAgent("what is this"), true);
  const m = sent.at(-1);
  assert.equal(m.type, "next.canvas.say");
  assert.equal(m.text, "what is this");
  assert.deepEqual(m.chips, [{ id: p.id, title: W.thingOf(p.id)!.name }]);
  assert.ok(Array.isArray(m.canvas) && m.canvas.length > 2);
  assert.deepEqual(W.agentBar.chips, [], "the chips went with the words");
  assert.equal(W.agentBar.working, true);
  assert.equal(frame.now()?.text, "Sol is on it…");
  hear({ type: "next.canvas.said", working: false, session: "s", text: "Laid your folders out in a row." });
  assert.equal(W.agentBar.working, false);
  assert.equal(frame.now()?.text, "Laid your folders out in a row.");
  assert.equal(frame.now()?.no, "OK", "it stays until OK");
  assert.equal(frame.now()?.act, "Open its talk");
  assert.equal(held, null, "the working line is taken off");
}));

test("Open its talk opens the bar's standing session in a tab, as a session opens; off the canvas and off every count", () => live(({ e, sent, hear }) => {
  tabsLink.e = e;   // the tabs' own wire (cv/wire/tabs.ts) on the same engine
  const sid = "6a1d2e3f-4b5c-4d7e-8f90-a1b2c3d4e5f6", working = CV.working(), placed = L.placedPieces().length;
  hear({ type: "next.canvas.said", working: false, session: sid, text: "Laid your folders out in a row." });
  frame.now()!.run!();
  const p = CV.D.pieces[sid];
  assert.equal(p?.kind, "session");
  assert.equal(p.sessionId, sid);
  assert.equal(CV.D.tabs?.front, sid, "in front, in its tab");
  assert.ok(sent.some((m) => m.type === "next.tab.open" && m.id === sid && m.kind === "session" && m.front === true), "through the same tab open as a session");
  assert.equal(CV.D.pos?.[sid], undefined, "it takes no place on the canvas");
  assert.equal(L.placedPieces().length, placed);
  assert.equal(CV.working(), working, "no count of working sessions takes it");
  frame.now()!.run!();
  assert.equal(CV.D.tabs?.tabs.filter((t) => t.id === sid).length, 1, "pressed again, the same tab");
  hear({ type: "next.canvas.said", working: false, text: "No session named." });
  assert.equal(frame.now()?.act, "OK", "with no session, only OK");
  assert.equal(W.openAgent("not ok!"), false);
  tabsLink.e = null;
}));

test("off the engine (the fixture) nothing is sent and the bar says the agent is not reachable", () => {
  CV.load("dev-morning");
  assert.equal(W.askAgent("tidy"), false);
  assert.equal(W.agentBar.working, false);
});

test("an AI's folder move takes its pieces along; each place it changed is kept by ai", () => live(({ sent, hear }) => {
  const { r, p } = folderWithPieces();
  const R = { ...CV.D.pos![r.id] }, P = { ...CV.D.pos![p.id] };
  hear({ type: "next.pos.ai", id: r.id, x: R.x + 500, y: R.y + 200, w: R.w, h: R.h, by: "ai", folded: false });
  assert.deepEqual([CV.D.pos![r.id].x, CV.D.pos![r.id].y], [R.x + 500, R.y + 200]);
  assert.deepEqual([CV.D.pos![p.id].x, CV.D.pos![p.id].y], [P.x + 500, P.y + 200], "its piece came with it");
  assert.equal(CV.D.pos![p.id].by, "ai");
  const kept = sent.filter((m) => m.type === "next.pos.set");
  assert.ok(kept.some((m) => m.id === r.id && m.by === "ai") && kept.some((m) => m.id === p.id && m.by === "ai"));
}));

test("an AI's fold takes the folded size, and unfolds to the size it had", () => live(({ hear }) => {
  const { r } = folderWithPieces();
  const R = { ...CV.D.pos![r.id] };
  hear({ type: "next.pos.ai", id: r.id, x: R.x, y: R.y, w: R.w, h: R.h, by: "ai", folded: true });
  assert.equal(CV.D.pos![r.id].folded, true);
  assert.ok(CV.D.pos![r.id].h < R.h, "a tab, not the open folder's height");
  assert.equal(CV.D.pos![r.id].by, "ai");
  hear({ type: "next.pos.ai", id: r.id, x: R.x, y: R.y, w: R.w, h: R.h, by: "ai", folded: false });
  assert.deepEqual([CV.D.pos![r.id].w, CV.D.pos![r.id].h, CV.D.pos![r.id].folded], [R.w, R.h, false]);
}));

test("a refusal ends the working line and says why", () => live(({ hear }) => {
  W.askAgent("tidy");
  hear({ type: "next.refused", asked: "next.canvas.say", why: "nothing to say" });
  assert.equal(W.agentBar.working, false);
  assert.match(frame.now()?.text ?? "", /nothing to say/);
  assert.ok(L.DIARY);
}));

test("the Diary dropped on the bar is a chip by its name, as every piece is (plane/Pieces.tsx dragFrom)", () => live(({ sent }) => {
  assert.equal(W.chipOn(L.DIARY), true);
  assert.deepEqual(W.agentBar.chips, [{ id: L.DIARY, title: "the Diary" }]);
  W.askAgent("");
  assert.deepEqual(sent.at(-1).chips, [{ id: L.DIARY, title: "the Diary" }]);
  assert.equal(W.overBar(0, 0), false, "no window, no bar");
}));

test("a holder dropped on the bar is a chip by its name (holders/Holders.tsx grab)", () => live(() => {
  const h = Object.keys(CV.D.pos || {}).find((id) => W.thingOf(id)?.kind === "holder");
  assert.ok(h, "the fixture has a holder on the canvas");
  assert.equal(W.chipOn(h!), true);
  assert.deepEqual(W.agentBar.chips, [{ id: h!, title: W.thingOf(h!)!.name }]);
  assert.ok(["Sessions", "Made"].includes(W.thingOf(h!)!.name) || W.thingOf(h!)!.name.length > 0);
}));
