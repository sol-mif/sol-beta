// node --test src/*.test.ts: ⌘N's new session on a real engine (BR1 gate 1b, #1615). The engine's tab row has no
// rename, so a starter's tab becoming its session's is an open and a close, and the engine answers each with its whole
// row (engine next/tabs.ts). Played here in the order a real engine answers, with a row from elsewhere between: the tab
// stays in front and in its place, and the view stays on the session. A new session's tab left empty closes itself.
// Invented people only (the dev-morning fixture). Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { TB, heard, swapTab, tabsLink, type Tab } from "./next/cv/moves/tabs.ts";
import type { Engine } from "./next/cv/wire/types.ts";

/** an engine's tab row as engine next/tabs.ts keeps it: open appends (one per piece), close takes out; each answer the row */
function rowEngine() {
  let rows: Tab[] = [];
  const answers: object[] = [];
  const e = { send: (m: { type?: string; id?: string; by?: Tab["by"]; kind?: string }) => {
    if (m.type === "next.tab.open" && m.id && !rows.some((x) => x.id === m.id)) rows = [...rows, { id: m.id, by: m.by ?? "person", kind: m.kind, at: 1 }];
    if (m.type === "next.tab.close") rows = rows.filter((x) => x.id !== m.id);
    // the asker's answer, then every window's next.tabs (engine parts/next-tabs.ts)
    for (const type of [m.type, "next.tabs"]) answers.push({ type, ok: true, tabs: rows.map((x) => ({ ...x })), taken: {}, quiet: {} });
    return true;
  } };
  return { e: e as unknown as Engine, answers, rows: () => rows };
}

function liveWithTabs() {
  CV.load("dev-morning");
  const eng = rowEngine();
  CV.setMode("live"); tabsLink.e = eng.e;
  const [a, b] = Object.values(CV.D.pieces).filter((p) => p.kind === "session").slice(0, 2).map((p) => p.id);
  CV.M.tabOpen(a, false); CV.M.tabOpen(b, false);
  CV.M.tabNew();
  const st = TB().front!;
  return { eng, a, b, st };
}
const done = () => { tabsLink.e = null; CV.setMode("fixture"); };

test("the starter's tab becomes its session's in place and in front, whatever order the rows come in", () => {
  const { eng, a, b, st } = liveWithTabs();
  try {
    assert.equal(CV.D.pieces[st].kind, "starter");
    eng.answers.splice(0).forEach((m) => heard(m as never));
    // the start: the piece is the session's under its id (near.ts rekey), then its tab is swapped
    const sid = "0b9c2c7e-1d2f-4c3a-9e1b-2f3a4b5c6d7e", p = CV.D.pieces[st];
    delete CV.D.pieces[st]; p.id = sid; p.kind = "session"; p.sessionId = sid; CV.D.pieces[sid] = p;
    if (CV.D.pos?.[st]) { CV.D.pos[sid] = CV.D.pos[st]; delete CV.D.pos[st]; }
    const before = eng.rows().map((x) => x.id);
    heard({ ok: true, tabs: before.map((id) => ({ id, by: "person", at: 1 })) });   // a row from elsewhere, still the starter's
    assert.equal(TB().front, st, "the answers to the opens before it, each without the starter's tab, did not drop it");
    assert.equal(swapTab(st, sid), true);
    assert.deepEqual(TB().tabs.map((x) => x.id), [a, b, sid]);
    assert.equal(TB().front, sid, "in front after the swap");
    for (const m of eng.answers.splice(0)) {
      heard(m as never);
      assert.equal(TB().front, sid, `still in front after ${JSON.stringify(m).slice(0, 40)}`);
      assert.deepEqual(TB().tabs.map((x) => x.id), [a, b, sid], "in its place, never twice");
      assert.equal(CV.S.dist, "near"); assert.equal(CV.S.piece, sid, "the view stays on the session");
    }
    assert.deepEqual(eng.rows().map((x) => x.id), [a, b, sid], "the engine's row names the session, not the starter");
    // a later row from the engine keeps this window's order
    heard({ ok: true, tabs: [b, sid, a].map((id) => ({ id, by: "person", at: 1 })) });
    assert.deepEqual(TB().tabs.map((x) => x.id), [a, b, sid]);
  } finally { done(); }
});

test("the swap's open names the starter it swaps, so a ⌘N counts once, as a session (engine next.tab.open swapped)", () => {
  CV.load("dev-morning");
  const sent: { type?: string; id?: string; swapped?: string }[] = [];
  CV.setMode("live"); tabsLink.e = { send: (m: never) => { sent.push(m); return true; } } as unknown as Engine;
  try {
    const t0 = { ...TB().taken };
    CV.M.tabNew();
    const st = TB().front!, n = (k: string) => TB().taken[k]?.n ?? 0, n0 = (k: string) => t0[k]?.n ?? 0;
    assert.equal(n("page"), n0("page") + 1, "the starter's tab counts as a page until it starts");
    const sid = "5d0e8f1a-2b3c-4d5e-8f9a-0b1c2d3e4f5a", p = CV.D.pieces[st];
    delete CV.D.pieces[st]; p.id = sid; p.kind = "session"; p.sessionId = sid; CV.D.pieces[sid] = p;
    sent.splice(0);
    assert.equal(swapTab(st, sid), true);
    const open = sent.find((m) => m.type === "next.tab.open");
    assert.equal(open?.id, sid);
    assert.equal(open?.swapped, st, "the engine is told which tab it replaces");
    assert.ok(sent.findIndex((m) => m.type === "next.tab.open") < sent.findIndex((m) => m.type === "next.tab.close"), "the open first");
    assert.equal(n("page"), n0("page"), "no longer a page");
    assert.equal(n("session"), n0("session") + 1, "once, as a session");
  } finally { done(); }
});

test("a new session's tab left empty closes itself, and its starter goes; words typed and not sent keep it", () => {
  const { eng, a, st } = liveWithTabs();
  try {
    eng.answers.splice(0);
    CV.M.tabFront("canvas");
    assert.ok(!TB().tabs.some((x) => x.id === st), "the empty tab closed");
    assert.equal(CV.D.pieces[st], undefined, "its starter is gone from the canvas");
    assert.ok(!eng.rows().some((x) => x.id === st), "and from the engine's row");
    CV.M.tabNew();
    const st2 = TB().front!;
    CV.D.pieces[st2].draft = "fix the login";
    CV.M.tabFront(a);
    assert.ok(TB().tabs.some((x) => x.id === st2), "a draft keeps the tab");
    assert.equal(CV.D.pieces[st2].kind, "starter");
    // left by a crumb, not by the tab row: the same
    CV.D.pieces[st2].draft = "";
    CV.M.tabFront(st2);
    CV.go({ dist: "far", piece: null, beside: null, page: null }, "crumb");
    assert.ok(!TB().tabs.some((x) => x.id === st2), "left by the crumb, closed too");
  } finally { done(); }
});
