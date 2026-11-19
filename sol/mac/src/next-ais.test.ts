// node --test src/*.test.ts: slice 5 of the port (#1615): the AIs page's rules, the agents.list wire's shapes, the AI's
// call path (gate, ledger, undo alone; Dev's night with the runs' moves stood in, as runs.js makes them), the marks'
// rules and the one voice. Signed: marcocyl04-ux's agent, slice 5 of the port (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { agent, call, undo, redo, hist, snapW, K, night, headline, partsOf, refusal, MOVE_FN, FN_MOVE, GATE, RUN, PERSON_ONLY } from "./next/agent/calls.ts";
import { FN, FN_NAMES } from "./next/agent/functions.ts";
import { stateOf, sayLine, onWhat } from "./next/ais/rules.ts";
import { fromList } from "./next/cv/wire/ais.ts";
import { proofSteps, toldLines, spotOf } from "./next/agent/marks.ts";
import { voice, chain } from "./next/cv/say/index.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

test("the AIs page: state in words from the work, one line for the page", () => {
  CV.load("dev-morning");
  const ada = CV.D.ais.find((a) => a.name === "Ada")!, mo = CV.D.ais.find((a) => a.name === "Mo")!;
  assert.equal(stateOf(CV.D, CV.open(), ada).say, "Has 2 questions");
  assert.equal(stateOf(CV.D, CV.open(), mo).say, "Has a question");
  const pia = CV.D.ais.find((a) => a.name === "Pia")!;
  assert.deepEqual([stateOf(CV.D, CV.open(), pia).cls, stateOf(CV.D, CV.open(), pia).say], ["st-work", "Working · tests: 1 failing"]);
  assert.equal(sayLine(CV.D.ais.map((a) => stateOf(CV.D, CV.open(), a))), "8 AIs. 7 need you; 1 working.");
  assert.equal(sayLine([]), "No AIs yet. One appears when you hand a piece of work to it.");
  assert.deepEqual(onWhat(CV.D, ada, (id) => CV.regionOf(id)?.name), { what: "fix-login", where: "api (repo)", tail: "40 files changed so far" });
  assert.equal(CV.D.routines?.filter((r) => r.ai === "Kai").length, 2, "an AI's routines are on its card");
});

test("agents.list fills the AIs and their routines; an agent with no piece says the engine's word", () => {
  const { ais, routines } = fromList([{ id: "a1", name: "Jev", state: "working", role: "keeps the inbox", steps: [{ when: "7:00", what: "read the mail" }], rules: [] },
    { id: "a2", name: "Rue", state: "needs", rules: [{ sentence: "sum up the week", folder: "notes" }] }, { id: "x" } as Any]);
  assert.deepEqual(ais.map((a) => [a.name, a.piece, a.from]), [["Jev", "agent:a1", "agents"], ["Rue", "agent:a2", "agents"]]);
  assert.deepEqual(routines, [{ ai: "Jev", what: "read the mail", when: "7:00" }, { ai: "Rue", what: "sum up the week", when: "in notes" }]);
  const d = { regions: [], pieces: {}, asks: {}, ais };
  assert.equal(stateOf(d, [], ais[0]).say, "Working");
  assert.equal(stateOf(d, [], ais[1]).cls, "st-need");
});

test("count 13's maps: 31 functions, 33 names, each with a gate and a move; every store move has its function", () => {
  assert.equal(FN.length, 31); assert.equal(FN_NAMES.length, 33);
  for (const f of FN_NAMES) { assert.ok(GATE[f], `gate ${f}`); assert.ok(RUN[f] || GATE[f]({}, "probe") !== "do", `run ${f}`); assert.ok(FN_MOVE[f]?.length, `moves for ${f}`); }
  const noFn = Object.keys(CV.M).filter((m) => !(MOVE_FN[m] && FN_NAMES.includes(MOVE_FN[m])));
  assert.deepEqual(noFn, [], "every move in M meets a function");
  CV.load("dev-morning");
  const w0 = K(snapW()), s0 = CV.snap();
  const personOnly = Object.keys(CV.M).filter((m) => PERSON_ONLY[m]);
  assert.ok(personOnly.length >= 14);
  assert.deepEqual(personOnly.filter((m) => call("probe", m, {}).gate !== "refused"), []);
  assert.equal(K(snapW()), w0, "a refused call changes nothing"); assert.equal(CV.snap(), s0);
  assert.equal(refusal("pan", {}), "Moving the camera is yours; I can point at it instead.");
  assert.equal(call("probe", "nonesuch", {}).line, "There is no function called nonesuch.");
});

test("a call is gated and writes one row; each row is undone alone and redone", () => {
  CV.load("dev-morning");
  const n0 = hist().length;
  const r1 = call("Ada", "point", { target: "s-Rex", words: "Rex's tests" });
  const r2 = call("Ada", "ask", { piece: "s-Ada", words: "Ada: may I rename session.ts?", reaches: "holds" });
  const r3 = call("Ada", "offer", { take: "group Oz and Pia every Friday" });
  assert.deepEqual([r1.gate, r2.gate, r3.gate], ["do", "do", "draft"]);
  assert.equal(hist().length - n0, 3, "one row per call");
  assert.equal(CV.D.asks[r2.value].rank, 3.51, "rank is computed from what it reaches (holds, after the landlord at 3), never claimed");
  assert.ok((CV.D.rings as Any)["s-Rex"]);
  const before = K(snapW());
  assert.ok(undo(r1.id).ok);
  assert.equal((CV.D.rings as Any)?.["s-Rex"], undefined, "the ring is gone");
  assert.ok(CV.D.asks[r2.value], "the ask stays: undone alone");
  assert.ok(redo(r1.id).ok); assert.equal(K(snapW()), before);
  // the AI may take back its own ask, and only its own
  assert.equal(call("Rex", "withdraw", { ask: r2.value }).ok, false);
  assert.equal(call("Ada", "withdraw", { ask: r2.value }).ok, true);
  // M.point and M.headline go through the same path, as the person's store moves
  const p = CV.M.point("api", "the api folder");
  assert.equal(p.ok, true); assert.equal(hist()[hist().length - 1].fn, "point");
  p.undo(); assert.equal((CV.D.rings as Any)?.api, undefined);
});

test("pass: a run goes to another AI with its steps; undo puts it back", () => {
  CV.load("dev-morning");
  const r = CV.M.pass("s-Lu", "Kai");
  assert.equal(r.ok, true);
  assert.equal(CV.D.pieces["s-Lu"].ai, "Kai");
  assert.equal(CV.D.pieces["s-Lu"].name, "Kai in nav-cleanup");
  assert.match(String(CV.D.pieces["s-Lu"].talk?.slice(-1)[0]), /^Lu: passed this to Kai with its 2 steps so far\.$/);
  r.undo();
  assert.equal(CV.D.pieces["s-Lu"].ai, "Lu");
  assert.equal(CV.M.pass("s-Lu", "Lu").ok, false, "not to the AI it has");
  assert.equal(chain("pass lu to kai")?.ok, true, "said: pass lu to kai");
});

/** the runs' moves the night calls, as runs.js makes them (slice 3's; stood in here so the call path is tried whole) */
function standIns(): () => void {
  const M = CV.M as Any, keep = { start: M.start, split_run: M.split_run, attach: M.attach, group: M.group };
  const wrap = (f: (...a: Any[]) => Any) => (...a: Any[]) => { const before = JSON.stringify(CV.D); const r = f(...a); if (!r) return { ok: false, undo() {} };
    CV.render(); return { ok: true, ...r, undo() { const d = JSON.parse(before); for (const k of Object.keys(CV.D)) delete (CV.D as Any)[k]; Object.assign(CV.D, d); } }; };
  M.start = wrap((c: Any) => { const id = "s-job1"; CV.D.pieces[id] = { id, region: c.region, kind: "session", ai: c.ai, name: `${c.ai} in login-keep`, copy: "login-keep", files: 0, state: "working", words: c.words,
    term: { lines: [], waiting: null, stateWord: "just started" }, talk: [`you: ${c.words}`, `${c.ai}: on it.`] }; return { id }; });
  M.split_run = wrap((parent: string, parts: Any[]) => { const p = CV.D.pieces[parent]; if (!p) return null; p.parts = parts.map((x, i) => ({ id: `${parent}.p${i + 1}`, kind: "session", part: true, ai: x.ai, name: x.words, words: x.words, region: p.region }));
    return { id: parent, parts: (p.parts as Any[]).map((x) => x.id) }; });
  M.attach = wrap((session: string, block: Any) => { const p = CV.D.pieces[session]; if (!p) return null; p.arrivals = [...((p.arrivals as Any[]) || []), { ...block, placed: false }]; return { id: session }; });
  M.group = wrap((pieces: string[]) => { const id = "rn1"; CV.D.asks[id] = { id, rank: 3, piece: pieces[0], kind: "code", source: "grouping", text: "Group these?", how: "inplace", answered: false, evidence: ["same file: session.ts"] }; return { id }; });
  return () => Object.assign(M, keep);
}

test("Dev's night, through call() only: four parts, two asks, a page waiting, a group asked, the headline with its proof; every row undone alone", async () => {
  const back = standIns();
  try {
    CV.load("ai-night");
    await new Promise((r) => setTimeout(r, 0));   // the seed's own night has run (a microtask after load)
    CV.load("ai-night"); agent.nightDue = false;
    const w0 = snapW(), cam0 = JSON.stringify(CV.S.cam), n0 = agent.calls;
    const rows = night();
    assert.equal(rows.length, 12); assert.equal(agent.calls - n0, 12); assert.equal(hist().length, 12, "every call is a row");
    assert.equal(rows.map((r) => `${r.fn}:${r.gate}`).join(" "), "look:do read:do start:do split_run:do ask:do ask:do pan:refused point:do attach:draft group:ask tell:do headline:do");
    const parent = rows[3].args.parent;
    assert.equal(partsOf(parent).length, 4);
    assert.equal(rows.filter((r) => r.fn === "ask" && r.ok && CV.D.asks[r.value]).length, 2);
    assert.ok(CV.open().some((a) => a.evidence), "the group is an ask with its evidence");
    assert.equal(headline()?.text, "Your login job ran overnight in four parts; two of them ask you one thing each.");
    assert.deepEqual(proofSteps(headline()!.proof, agent.rows(0)).map((s) => s.brief), ["split it 4 ways (Ada, Kai, Lu, Pia)", "asked you"]);
    assert.equal(JSON.stringify(CV.S.cam), cam0, "the camera did not move");
    assert.deepEqual(toldLines(CV.D, null).map((t) => t.words), ["I split the login job four ways and left your places as you had them."]);
    // each undo alone takes back that row and nothing else, or refuses in one line when a later row builds on it
    const w1 = snapW(); agent.batch = true;
    let alone = 0, refused = 0;
    for (const r of hist().filter((x) => x.changes.length)) {
      const u = undo(r.id);
      if (!u.ok) { refused++; assert.ok(u.on && !/\n/.test(u.line!)); assert.equal(K(snapW()), K(w1)); continue; }
      assert.ok(redo(r.id).ok); assert.equal(K(snapW()), K(w1)); alone++;
    }
    assert.equal(refused, 1, "the start: the group builds on it");
    assert.ok(alone >= 7);
    // all walked back from the end: the evening as it was
    for (const r of [...hist()].reverse()) if (r.changes.length) assert.ok(undo(r.id).ok, r.fn);
    assert.equal(K(snapW()), K(w0));
    agent.batch = false;
    assert.equal(headline(), null, "the headline goes with its proof");
  } finally { back(); agent.batch = false; }
});

test("the marks: a ring sits on the piece, or at Far on its folder; a part rings its parent", () => {
  const d = { regions: [{ id: "api", name: "api", kind: "code" as const }], pieces: { s: { id: "s", region: "api", kind: "session", name: "s", parts: [{ id: "s.p1", region: "api", kind: "session", name: "p" }] } }, asks: {}, ais: [],
    pos: { api: { x: 0, y: 0, w: 100, h: 100, by: "rule" as const, touched: false, at: 0 }, s: { x: 10, y: 10, w: 40, h: 40, by: "rule" as const, touched: false, at: 0 } } };
  assert.deepEqual(spotOf(d, "middle", () => false, "s.p1")?.q, d.pos.s);
  assert.deepEqual(spotOf(d, "far", () => false, "s")?.q, d.pos.api);
  assert.equal(spotOf(d, "far", () => false, "nope"), null);
});

test("one voice: the pill and the island call the same move with the same words; yes answers the ask here", () => {
  const as = (w: string, from: string, prep?: () => void) => { CV.load("dev-morning"); prep?.(); const h = voice(w, from); return h && h.fn ? `${h.fn}(${h.args})` : "none"; };
  for (const w of ["next ask", "zoom out", "go to api", "map", "this is a lot", "your ais"]) {
    const prep = w === "zoom out" ? () => { CV.M.goto("api"); } : undefined;
    const p = as(w, "pill", prep), i = as(w, "island", prep);
    assert.notEqual(p, "none", w); assert.equal(p, i, w);
  }
  assert.equal(as("go to api", "pill"), 'goto(["api"])');
  assert.equal(as("yes", "pill", () => { CV.S.askLine = "a5"; }), 'answer(["a5"])');
  assert.equal(CV.D.asks.a5.answered, true);
  assert.equal(as("later", "island", () => { CV.S.askLine = "a5"; }), 'answer(["a5","later"])');
  assert.equal(as("sing me a song", "pill"), "none");
  CV.load("dev-morning");
  assert.equal(CV.say("your ais")?.ok, true); assert.equal(CV.S.page, "ais");
  assert.equal(CV.say("sing me a song"), null, "no move: the pill says so");
});
