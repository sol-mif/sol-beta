// node --test src/*.test.ts: the migration (BR1, #1615; mine/look/br1/migration.html C and D): the judge's own calls made
// into one move per kind (a group under a shared rules file, the folders inside another on disk, C-2's quick tries an AI
// made gathered into Experiments, the Shelf), the folders an AI made drawn apart, the folders tied to nothing asked after them, the canvas after the answers, and what next.movein.keep is sent. Invented people only
// (Lucy's studio, Denise's two folders, fixture.ts).
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CV from "./next/cv/index.ts";
import "./next/cv/fixture.ts";
import { DATA, blank } from "./next/movein/data.ts";
import { clear, ed, st } from "./next/movein/state.ts";
import { fromRead, toKeep } from "./next/movein/live.ts";
import { CALM_READ, CODER_READ, SHOOTS_READ, STUDIO_READ } from "./next/movein/fixture.ts";
import { after, calm, migKeep, migrates, steps, type Mig } from "./next/movein/plan.ts";

const L = "w:/Users/lucy";

test("the plan: one move per call of the judge, said once for all its folders; what is tied to nothing is asked, at most three", () => {
  const p = DATA.studio, plan = p.plan!;
  assert.deepEqual(plan.moves.map((m) => m.kind), ["group", "inside", "tries", "shelf"]);
  const [g, ins, tr, sh] = plan.moves;
  assert.deepEqual(g.folders.map((f) => f.name), ["bistro", "noodle-bar", "taqueria"]);
  assert.deepEqual(g.to, [{ folder: L + "/Sites", name: "Sites", fresh: true }], "the folder holding the rules file is new on the canvas");
  assert.equal(g.saw, "they all follow the CLAUDE.md in Sites");
  assert.deepEqual(ins.folders.map((f) => [f.name, f.into]), [["menu photos", L + "/Documents/Restaurant sites"], ["bistro drafts", L + "/Documents/Restaurant sites"]]);
  assert.deepEqual(ins.said, ["restaurants"], "the person's words on the folder they went into go with the move, apart from what Sol saw");
  assert.equal(ins.ai, 2, "both were made by her AIs (C-2)");
  assert.deepEqual([g.ai, g.suggest], [0, undefined], "a group by a rules file on disk is no suggestion");
  assert.deepEqual(tr.folders.map((f) => [f.name, f.into]), [["logo-test", "h:Experiments"], ["palette-try", "h:Experiments"]]);
  assert.deepEqual([tr.to, tr.suggest, tr.ai], [[{ folder: "h:Experiments", name: "Experiments", fresh: true }], true, 2], "a new group Sol suggests");
  assert.deepEqual(plan.ai.length, 4, "the folders an AI made, drawn apart");
  assert.deepEqual(sh.folders.map((f) => f.name), ["test-2", "bistro copy"]);
  assert.deepEqual(plan.asks.map((a) => a.name), ["mod-tools"], "a folder the person wrote about, or with a history, is never asked");
  assert.equal(steps(plan), 5);
  // a read with more lone folders asks three, never more
  const many = { ...STUDIO_READ, judged: [...STUDIO_READ.judged!, ...["a", "b", "c"].map((n) => ({ folder: "h:" + n, name: n, shelf: false, why: null, reading: null, parent: null, lived: { belongs: [] } }))],
    places: [...STUDIO_READ.places!, ...["a", "b", "c"].map((n) => ({ id: n, name: n, path: "/Users/someone/Sol/" + n, from: "home" as const, kind: null }))] };
  assert.equal(fromRead(many).plan!.asks.length, 3);
  // no judge, no plan: the list page stays (Kim's fixture, a read from an older engine)
  assert.equal(fromRead(CODER_READ).plan, undefined);
  assert.equal(migrates(DATA.coder), false);
});

test("the canvas after: Sol's moves as made gives six from twelve; a move changed back and the ask's answers move what they say", () => {
  const plan = DATA.studio.plan!, m: Mig = { at: 5, no: {}, ans: {} };
  let a = after(plan, m);
  assert.deepEqual(a.tops.map((t) => t.name), ["Sites", "Experiments", "Restaurant sites", "mod-tools", "Typography Course", "flat paperwork", "Studio"]);
  assert.deepEqual(a.tops.map((t) => [t.holds, t.pins]), [[3, [1]], [2, [3]], [2, [2]], [0, [5]], [0, []], [0, []], [0, []]]);
  assert.deepEqual([a.shelf.map((f) => f.name), a.shelfPins], [["test-2", "bistro copy"], [4]]);
  assert.deepEqual(a.same.map((f) => f.name), ["Typography Course", "flat paperwork", "Studio"]);
  // the group left as it was: its three folders back on top, no new folder; mod-tools folded into Studio
  a = after(plan, { at: 5, no: { ["group:" + L + "/Sites"]: 1 }, ans: { "h:mod-tools": "into:" + L + "/Studio" } });
  assert.ok(!a.tops.some((t) => t.name === "Sites" || t.name === "mod-tools"));
  assert.ok(["bistro", "noodle-bar", "taqueria"].every((n) => a.tops.some((t) => t.name === n)));
  assert.deepEqual(a.tops.find((t) => t.name === "Studio")!.pins, [5]);
  assert.equal(a.tops.find((t) => t.name === "Studio")!.holds, 1);
  // the quick tries left as they were: no Experiments, the two back on top
  a = after(plan, { at: 5, no: { "tries:h:Experiments": 1 }, ans: {} });
  assert.ok(!a.tops.some((t) => t.name === "Experiments") && ["logo-test", "palette-try"].every((n) => a.tops.some((t) => t.name === n)));
  // on the Shelf
  a = after(plan, { at: 5, no: {}, ans: { "h:mod-tools": "shelf" } });
  assert.deepEqual([a.shelf.length, a.shelfPins], [3, [4, 5]]);
});

test("the keep: a move changed back is apart, an ask folded in is into, one put on the Shelf is a drop; nothing else is sent", () => {
  const p = DATA.studio, plan = p.plan!, c = blank();
  assert.deepEqual(migKeep(plan, c), { apart: [], into: {}, drop: [] });
  assert.deepEqual(Object.keys(toKeep(p, c)).sort(), ["drop", "fix", "keep"], "no answers: the keep is as before");
  c.mig = { at: 4, no: { shelf: 1 }, ans: { "h:mod-tools": "into:" + L + "/Studio" } };
  const k = toKeep(p, c);
  assert.deepEqual(k.apart, [L + "/Desktop/test-2", L + "/Downloads/bistro copy"]);
  assert.deepEqual(k.into, { "h:mod-tools": L + "/Studio" });
  c.mig.ans["h:mod-tools"] = "shelf";
  assert.ok(toKeep(p, c).drop.includes("h:mod-tools"));
});

test("the moves: Looks right and Change go on, an answer goes on, Skip takes the rest, a line goes back, Yes, move in keeps", () => {
  clear(); CV.load("studio");
  assert.ok(CV.M.move_in("studio").ok);
  const m = () => ed("studio").mig!;
  assert.ok(CV.M.move_in_mig("ok").ok); assert.equal(m().at, 1);
  assert.ok(CV.M.move_in_mig("no").ok); assert.deepEqual([m().at, m().no], [2, { inside: 1 }]);
  assert.equal(CV.M.move_in_mig("ans", "h:mod-tools", "fold").ok, false, "an answer is keep, shelf or into:<folder>");
  assert.ok(CV.M.move_in_mig("skip").ok); assert.deepEqual([m().at, m().skip], [5, 2]);
  assert.ok(CV.M.move_in_mig("to", 4).ok); assert.equal(m().at, 4);
  assert.ok(CV.M.move_in_mig("ans", "h:mod-tools", "shelf").ok); assert.equal(m().at, 5);
  assert.equal(ed("studio").drop["h:mod-tools"], 1, "on the Shelf is a drop, as Remove is");
  assert.ok(CV.M.move_in_mig("ans", "h:mod-tools", "keep").ok); assert.equal(ed("studio").drop["h:mod-tools"], undefined);
  assert.equal(CV.M.move_in_mig("ok").ok, false, "past the moves there is no move to agree to");
  assert.ok(CV.M.move_in_mig("again").ok); assert.deepEqual([m().at, m().skip], [0, undefined]);
  assert.ok(CV.M.these_are_mine().ok);
  assert.equal(st.open, null);
  clear();
});

test("D: a judged read with nothing to sort is calm, and still the migration's screen", () => {
  const p = fromRead(CALM_READ);
  assert.ok(calm(p.plan!));
  assert.ok(migrates({ ...p, live: false }));
  assert.equal(p.plan!.folders.length, 2);
  assert.ok(!migrates({ ...p, moved: true }), "a move-in kept before keeps the list page");
});

test("C-2's shape: three folders one word of hers names, of one shape, are one suggested group; the word alone groups nothing", () => {
  const p = fromRead(SHOOTS_READ), plan = p.plan!;
  assert.deepEqual(plan.moves.map((m) => m.kind), ["group"]);
  const [g] = plan.moves;
  assert.deepEqual(g.folders.map((f) => f.name), ["okafor-wedding", "lindqvist", "reyes shoot"]);
  assert.deepEqual([g.to, g.suggest], [[{ folder: "h:Clients", name: "Clients", fresh: true }], true], "named by her word, new, a suggestion");
  assert.equal(g.saw, "the same shape: edits, raw, pictures");
  assert.deepEqual(g.said, ["clients"]);
  assert.ok(!plan.moves.some((m) => m.folders.some((f) => f.name === "client invoices")), "“clients” too, but sheets: it stays where it is");
  assert.ok(migrates({ ...p, live: false }));
  assert.equal(DATA.shoots?.who, "Maya", "the dev page's scene");
});
