// Pieces (#1092): a piece's third face, its verbs (pieceVerbs.ts). A session's agent uses a seated piece under its
// ceiling: read at any, say at draft, put away at act; past the ceiling it asks him on the piece and does nothing. The
// stage's update, bind and freeze are refused on a piece. In a home and a folder of their own; never the real ones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "sol-pieces-verbs-")));
process.env.SOL_HOME = join(ROOT, "home");
process.env.SOL_STATE = join(ROOT, "state", "work.json");
process.env.SOL_TEAM = join(ROOT, "team.json");   // the engine's person, made up
writeFileSync(process.env.SOL_TEAM, JSON.stringify({ me: { login: "tess-t", name: "Tess Tester" }, repos: [] }));
const B = await import("../src/work/blocks.ts");
const P = await import("../src/work/pieces.ts");
const V = await import("../src/work/pieceVerbs.ts");
P.setJev(null);
P.setTender(null);
after(() => { P.stopAll(); rmSync(ROOT, { recursive: true, force: true }); });

const REPO = join(ROOT, "proj");
mkdirSync(join(REPO, ".git"), { recursive: true });
mkdirSync(join(REPO, ".sol", "pieces"), { recursive: true });
const project = B.projectOf(REPO);
const who = { project, sessionId: "sess-anchor", by: "anchor", cwd: REPO };
const rows = [{ id: "pr-1", t: "#1070 the set stage", note: "green", wants: true, press: "open the PR" }, { id: "pr-2", t: "#1090 the registry", wants: true }];
const write = (ceiling: string) => writeFileSync(join(REPO, ".sol", "pieces", "waits.json"), JSON.stringify({ name: "waits", title: "waits on me", ceiling, source: { from: "rows", rows } }));
const settle = async () => { for (let i = 0; i < 50; i++) { const p = P.list(REPO).pieces.find((x) => x.name === "waits"); if (p && p.at > 0 && p.state !== "working") return p; await new Promise((r) => setTimeout(r, 20)); } throw new Error("never read"); };

test("the stage's own update, bind and freeze are refused on a piece, in words; placing stays as it is", () => {
  assert.match(V.stageRefusal("update", "piece-waits", "waits on me")!, /waits on me is a piece: its rows come from its source\. Use `piece`/);
  assert.ok(V.stageRefusal("bind", "piece-waits"));
  assert.ok(V.stageRefusal("freeze", "piece-waits"));
  assert.equal(V.stageRefusal("place", "piece-waits"), null);
  assert.equal(V.stageRefusal("update", "list-1"), null);
});

test("each verb needs its rung: read at any, say at draft, put away at act", () => {
  assert.equal(V.mayDo("look", "read"), true);
  assert.equal(V.mayDo("look", "say"), false);
  assert.equal(V.mayDo("draft", "say"), true);
  assert.equal(V.mayDo("draft", "put_away"), false);
  assert.equal(V.mayDo("act", "put_away"), true);
});

test("an agent reads a piece, and past its ceiling it asks him on the piece and changes nothing", async () => {
  write("draft");
  P.load(REPO);
  await settle();
  assert.match((await V.runPiece(who, { name: "waits on me", do: "read" })).text, /not seated in this session/, "only a piece the person seated in this session");
  P.drop(REPO, "waits", "sess-anchor");
  assert.match((await V.runPiece(who, { name: "waits", do: "say", row: "pr-1", text: "Merge it once the stage check is green." })).text, /lets an agent read, not draft/, "a committed recipe's ceiling is not his window's word: read only until he moves the notch");
  P.grant(REPO, "waits", "draft");   // his window wrote draft (a make or a notch there)
  const r = await V.runPiece(who, { name: "waits on me", do: "read" });
  assert.ok(r.ok);
  assert.match(r.text, /waits on me, a piece: 2 rows; you may read and draft/);
  assert.match(r.text, /#1070 the set stage · green · open the PR \[pr-1\]/);
  const away = await V.runPiece(who, { name: "waits", do: "put_away", row: "pr-1" });
  assert.equal(away.ok, false);
  assert.match(away.text, /lets an agent read and draft, not act\. It is asking Tess on the piece/, "the person this engine is, by name");
  const p = P.list(REPO).pieces.find((x) => x.name === "waits")!;
  assert.equal(p.may, "act", "the piece asks: let it act");
  assert.equal(p.mayFrom, "sess-anchor");
  const k = P.keptIn(project, "waits")!;
  const at = k.may!.at;
  k.may!.at = Date.now() - P.MAY_MS - 1;
  assert.equal(P.list(REPO).pieces.find((x) => x.name === "waits")!.may, undefined, "unanswered for ten minutes, the ask leaves by itself");
  k.may!.at = at;
  assert.equal(JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps[0].st, "wait", "nothing was put away");
  const said = await V.runPiece(who, { name: "waits", do: "say", row: "#1070 the set stage", text: "Merge it once the stage check is green." });
  assert.ok(said.ok);
  assert.equal(JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps[0].said, "Merge it once the stage check is green.");
  assert.ok(B.seen(project, "piece-waits", 20).lines.some((l: { by: string; note?: string }) => l.by === "anchor" && /drafted a line/.test(l.note ?? "")), "in the session's name");
  assert.equal((await V.runPiece(who, { name: "waits", do: "say", row: "pr-1", text: "#1070 the set stage." })).ok, false, "a line that repeats the title is refused");
});

test("once he lets it act, the agent puts a row away as his press does, in the session's name", async () => {
  write("act");   // the file says act, as an agent with file tools could write it
  P.load(REPO);
  await settle();
  assert.equal((await V.runPiece(who, { name: "waits", do: "put_away", row: "pr-2" })).ok, false, "an edited file raises nothing: held to what his window wrote");
  P.grant(REPO, "waits", "act");   // his press on "let it act" (work.pieces.set from Sol's window)
  const k0 = P.keptIn(project, "waits")!; k0.may = undefined;
  assert.equal(P.list(REPO).pieces.find((x) => x.name === "waits")!.may, undefined, "the ask is answered");
  const r = await V.runPiece(who, { name: "waits", do: "put_away", row: "pr-2" });
  assert.ok(r.ok, r.text);
  const steps = JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps;
  assert.equal(steps.find((s: { id: string }) => s.id === "pr-2").st, "done");
  assert.equal(steps.find((s: { id: string }) => s.id === "pr-2").by, "anchor", "the row keeps who put it away: the foot names the session");
  P.tick(REPO, "waits", { id: "pr-2", t: "#1090 the registry" });   // his undo brings it back
  assert.equal(JSON.parse(B.bodyOf(project, "piece-waits")!.text!).steps.find((s: { id: string }) => s.id === "pr-2").by, undefined, "back: no one's");
  assert.ok(B.seen(project, "piece-waits", 20).lines.some((l: { by: string; note?: string }) => l.by === "anchor" && /ticked/.test(l.note ?? "")));
  assert.match((await V.runPiece(who, { name: "nothing", do: "read" })).text, /no piece/);
});

test("with both switches off no session is given the piece tool; it comes when a face asks for pieces and goes after", async () => {
  P.stopAll();
  const T = await import("../src/work/tools.ts");
  const has = () => T.WORK_TOOLS.some((t) => (t.name as string) === "piece");
  assert.equal(has(), false, "no pieces kept (no face with a switch on asked): no piece tool");
  P.load(REPO);
  assert.equal(has(), true, "a face with a switch on asked: the tool is there");
  P.stopAll();
  assert.equal(has(), false, "let go: gone again");
});

test("let it act raises the ceiling on his engine only: the committed recipe is not rewritten; only Sol's window may", async () => {
  write("draft");
  P.load(REPO);
  await settle();
  const before = readFileSync(join(REPO, ".sol", "pieces", "waits.json"), "utf8");
  const send = async (m: object) => { const out: any[] = []; await P.piecesMsg({ send: (o) => out.push(o) }, m as never); return out[0]; };
  assert.match((await send({ type: "work.pieces.set", cwd: REPO, name: "waits", ceiling: "spend", here: true })).error, /only Sol's own window/);
  assert.equal((await send({ type: "work.pieces.set", cwd: REPO, name: "waits", ceiling: "act", here: true, fromSol: true })).ok, true);
  assert.equal(P.heldTo(REPO, "waits", "draft"), "act");
  assert.equal(readFileSync(join(REPO, ".sol", "pieces", "waits.json"), "utf8"), before, "the file every teammate reads is as it was");
});
