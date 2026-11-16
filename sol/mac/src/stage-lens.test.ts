// node --test src/*.test.ts: the four lenses as placement rules (#701, stage/lens.ts) and pop out's pure half
// (stage/pop.ts), with no DOM: play.html's setLens and lensFolded, ported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adopt, cliAsks, leave, switchLens, tuiLines, tuiTerminal } from "./stage/lens.ts";
import { outside, popLabel, popUrl, poppedOf } from "./stage/pop.ts";
import type { Block, Place, StageJson } from "./stage/model.ts";

const blk = (id: string, kind: Block["kind"] = "page", state: Block["state"] = "live"): Block => ({ id, kind, title: id, state, versions: [], sessions: ["s"] });
const at = (id: string, x: number, extra: Partial<Place> = {}): Place => ({ id, x, y: 12, w: 300, h: 200, z: 1, ...extra });
const full = { x: 12, y: 12, w: 976, h: 576 };
const five = [blk("week"), blk("kit"), blk("diff", "diff"), blk("stills", "shots", "waits"), blk("gate", "card")];
const stage = (blocks: Place[], lens: StageJson["lens"] = "app"): StageJson => ({ lens, blocks, tiled: false });
const app = stage([at("week", 12), at("kit", 330), at("diff", 650), at("stills", 12, { folded: true }), at("gate", 330)]);

test("TUI on a stage with no terminal: the open blocks fold to lines, a terminal is wanted; app again restores them", () => {
  const t = switchLens(app, five, "tui", full);
  assert.equal(t.want, "terminal");
  assert.equal(t.stage.lens, "tui");
  const folded = t.stage.blocks.filter((p) => p.lensed).map((p) => p.id);
  assert.deepEqual(folded, ["week", "kit", "diff", "gate"], "the open ones fold; the one already folded is not the lens's");
  assert.ok(t.stage.blocks.every((p) => p.folded));
  // the terminal composed for the lens arrives: full, on top, the lens's own
  const withTerm = adopt({ ...t.stage, blocks: [...t.stage.blocks, at("term-1", 40)] }, "term-1", full);
  const term = withTerm.blocks.find((p) => p.id === "term-1")!;
  assert.deepEqual({ x: term.x, y: term.y, w: term.w, h: term.h, folded: term.folded, tui: term.tui }, { ...full, folded: false, tui: true });
  assert.ok(term.z > Math.max(...t.stage.blocks.map((p) => p.z)));
  // back to app: what the lens folded opens where it was, the lens's terminal folds, the folded one stays folded
  const back = switchLens(withTerm, [...five, blk("term-1", "terminal")], "app", full).stage;
  const by = (id: string) => back.blocks.find((p) => p.id === id)!;
  assert.equal(back.lens, "app");
  for (const id of ["week", "kit", "diff", "gate"]) { assert.equal(by(id).folded, false, id); assert.equal(by(id).lensed, undefined, id); assert.equal(by(id).x, app.blocks.find((p) => p.id === id)!.x); }
  assert.equal(by("stills").folded, true);
  assert.equal(by("term-1").folded, true, "its own terminal folds when you leave it");
  // TUI again: its own terminal is taken again, nothing new is wanted
  const again = switchLens(back, [...five, blk("term-1", "terminal")], "tui", full);
  assert.equal(again.want, null);
  assert.equal(again.stage.blocks.find((p) => p.id === "term-1")!.folded, false);
});

test("TUI borrows a terminal already on the stage and puts it back where it sat", () => {
  const live = [...five, blk("sh", "terminal")];
  const s = stage([...app.blocks, at("sh", 500)]);
  const t = switchLens(s, live, "tui", full);
  assert.equal(t.want, null);
  const sh = t.stage.blocks.find((p) => p.id === "sh")!;
  assert.equal(sh.w, full.w); assert.deepEqual(sh.was, { x: 500, y: 12, w: 300, h: 200 });
  assert.equal(tuiTerminal(t.stage.blocks, live)?.id, "sh");
  assert.deepEqual(tuiLines(t.stage.blocks, live, "sh").map((b) => b.id), ["week", "kit", "diff", "stills", "gate"], "every other block is a line, in ⌘1-9 order");
  const back = leave(t.stage.blocks).find((p) => p.id === "sh")!;
  assert.deepEqual({ x: back.x, w: back.w, folded: back.folded, was: back.was }, { x: 500, w: 300, folded: false, was: undefined }, "a borrowed terminal is not folded, it goes back");
});

test("CLI and IDE fold nothing; TUI to CLI restores what TUI folded; a popped block is never folded nor a line", () => {
  for (const l of ["cli", "ide"] as const) {
    const r = switchLens(app, five, l, full);
    assert.equal(r.want, null);
    assert.deepEqual(r.stage.blocks, app.blocks, l);
  }
  const popped = stage([...app.blocks.slice(0, 4), at("gate", 330, { popped: true })]);
  const t = switchLens(popped, five, "tui", full);
  assert.equal(t.stage.blocks.find((p) => p.id === "gate")!.lensed, undefined);
  const cli = switchLens(t.stage, five, "cli", full).stage;
  assert.equal(cli.lens, "cli");
  assert.ok(["week", "kit", "diff"].every((id) => !cli.blocks.find((p) => p.id === id)!.folded));
  assert.deepEqual(tuiLines(popped.blocks, five, "x").map((b) => b.id), ["week", "kit", "diff", "stills"]);
});

test("CLI: the stage opens only when a block asks (waits on you)", () => {
  assert.equal(cliAsks(five, app.blocks), true);
  assert.equal(cliAsks(five.map((b) => ({ ...b, state: "live" as const })), app.blocks), false);
  assert.equal(cliAsks(five, app.blocks.map((p) => (p.id === "stills" ? { ...p, popped: true } : p))), false, "a popped block asks in its own window");
});

test("a run (#703) in the lenses: no TUI line, it is its chip by the talk; in CLI it asks by the chip until it is opened", () => {
  const run = { name: "join", state: "waits", min: 12, said: "which one?", moves: [], files: [], turns: 1, tokens: 1, commits: 0 };
  const runs: Block = { ...five[0], id: "bg", kind: "list", title: "In the background", state: "waits", body: { where: "NucBox", cap: 240, steps: [{ t: "join", st: "waits", run }] } };
  const calm = five.map((b) => ({ ...b, state: "live" as const }));
  const folded = stage([...app.blocks, at("bg", 0, { folded: true })]);
  assert.deepEqual(tuiLines(folded.blocks, [...calm, runs], "x").map((b) => b.id), ["week", "kit", "diff", "stills", "gate"]);
  assert.equal(cliAsks([...calm, runs], folded.blocks), false, "a folded run that waits asks by its chip, the stage stays shut");
  assert.equal(cliAsks([...calm, { ...runs, state: "live" }], stage([...app.blocks, at("bg", 0)]).blocks), true, "a run opened from its chip opens the stage");
});

test("pop out: off the window, a block's window bound to its id, the page that draws it", () => {
  const win = { w: 1280, h: 800 };
  assert.equal(outside(win, 640, 400), false);
  for (const [x, y] of [[-1, 400], [1281, 400], [640, -2], [640, 801]]) assert.equal(outside(win, x, y), true, `${x},${y}`);
  assert.equal(popLabel("week-1a2b"), "pop-week-1a2b");
  for (const bad of ["", "-x", "Week", "a b", "../main", "a?b", "x".repeat(65)]) assert.equal(popLabel(bad), null, bad);
  assert.equal(popUrl("week", "sess-1"), "index.html?block=week&session=sess-1");
  assert.deepEqual(poppedOf("?block=week&session=sess-1"), { id: "week", session: "sess-1" });
  assert.equal(poppedOf("?block=../x&session=s"), null);
  assert.equal(poppedOf("?work=abc"), null);
});
