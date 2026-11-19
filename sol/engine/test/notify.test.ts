// One notification (#845): one moment, one place, gated by whether Sol is on his screen (src/notify.ts).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { addCreatureFace, removeCreatureFace, setRole, setPresence, onScreen } from "../src/creature.js";
import { addMomentFace, momentFaceIs, removeMomentFace, moment, seen, sessionSeen, heard, placeNow, watchViews, runPingTool, _moments, _reset, _setBanner, _setPrefs } from "../src/notify.js";

type Msg = { type: string; [k: string]: any };
const face = () => { const got: Msg[] = []; return { got, send: (m: object) => got.push(m as Msg) }; };
const moments = (f: { got: Msg[] }) => f.got.filter((m) => m.type === "moment");
let banners: string[][] = [];
let w: ReturnType<typeof face>, n: ReturnType<typeof face>;

beforeEach(() => {
  if (w) removeCreatureFace(w);
  _reset(); banners = []; _setBanner((t, b) => { banners.push([t, b]); }); _setPrefs(undefined);
  w = face(); n = face();
  addCreatureFace(w, w); setRole(w, "window");
  addMomentFace(w); momentFaceIs(w, "window");
  addMomentFace(n);   // a face that never says which it is: it hears nothing
});

test("the gate is visible, not focused: on screen without focus lands in the window", () => {
  setPresence(w, false, 5, true);
  assert.equal(onScreen(), true);
  const m = moment("done", "Sol: done, your move", { sessionId: "s1" })!;
  assert.equal(m.dest, "window");
  assert.equal(moments(w).length, 1);
  assert.equal(moments(n).length, 0, "never two places");
  assert.equal(banners.length, 0);
  assert.deepEqual(Object.keys(moments(w)[0]).sort(), ["at", "id", "kind", "line", "seat", "sessionId", "type"]);
});

test("out of sight: one banner, nothing kept; a face too old to say visible falls back to focus", () => {
  setPresence(w, true, 0, false);   // focused but covered (another space): not on screen
  assert.equal(placeNow(), "banner");
  const m = moment("question", "Which file?", { sessionId: "s1" });
  assert.equal(m, null);
  assert.equal(moments(w).length, 0);
  assert.equal(banners.length, 1);
  setPresence(w, true, 0);   // no visible field
  assert.equal(placeNow(), "window");
  assert.equal(_moments().length, 0, "a banner is not kept: nothing waits when Sol comes back");
});

test("out of sight, or no window at all: one banner each, nothing kept, no other face told", () => {
  setPresence(w, false, 0, false);
  removeMomentFace(n);
  assert.equal(moment("failed", "Sol stopped with an error", { sessionId: "s1" }), null);
  assert.equal(banners.length, 1);
  assert.equal(_moments().length, 0);
  addMomentFace(n);
  moment("ping", "the build is in");
  assert.equal(banners.length, 2);
  assert.equal(moments(n).length, 0);
  removeCreatureFace(w); w = face(); addCreatureFace(w, w);   // no window at all: not on screen
  _setPrefs(undefined);
  assert.equal(placeNow(), "banner");
});

test("seen counts only from the destination; all waves off that face's own", () => {
  setPresence(w, false, 0, true);
  const a = moment("ping", "one")!, b = moment("hand", "Frank handed you #9")!;
  assert.equal(seen(a.id, n), 0, "a face that never said which it is cannot see the window's moment");
  assert.equal(seen(a.id, w), 1);
  assert.ok(w.got.some((m) => m.type === "moment.gone" && m.id === a.id));
  const c = moment("ping", "two")!;
  assert.equal(seen(undefined, n, true), 0, "its mark waves off nothing it was not sent");
  assert.deepEqual(_moments().map((m) => m.id), [b.id, c.id]);
  assert.equal(seen(undefined, w, true), 2, "the window's mark waves off its own");
  assert.ok(!_moments().includes(b));
});

test("opening a session is seeing, wherever its moments are; one per kind and session; dedupe; the cap", () => {
  setPresence(w, false, 0, true);
  moment("done", "a", { sessionId: "s1" });
  const a2 = moment("done", "a again", { sessionId: "s1" })!;
  assert.equal(_moments().length, 1, "the newer replaces the older");
  assert.equal(_moments()[0].id, a2.id);
  moment("question", "q", { sessionId: "s1" });
  moment("done", "b", { sessionId: "s2" });
  sessionSeen("s1");
  assert.deepEqual(_moments().map((m) => m.sessionId), ["s2"]);
  const p = moment("ping", "same line", { seat: "codex" })!;
  assert.equal(moment("ping", "same  line ", { seat: "codex" })!.id, p.id, "one per (seat, line) within 30 s");
  for (let i = 0; i < 15; i++) moment("ping", `p${i}`);
  assert.equal(_moments().length, 12);
});

test("a kind off in Settings makes no moment at all", () => {
  setPresence(w, false, 0, true);
  _setPrefs({ moments: { done: false } });
  assert.equal(moment("done", "x", { sessionId: "s1" }), null);
  assert.equal(banners.length + _moments().length, 0);
  assert.ok(moment("failed", "y", { sessionId: "s1" }));
});

test("the Work bus: an ask until answered, a turn's end until he acts, a green card until pressed", () => {
  setPresence(w, false, 0, true);
  heard({ type: "work.item", sessionId: "s1", item: { id: "p1", kind: "perm", tool: "AskUserQuestion", state: "ask", input: { questions: [{ question: "Tabs or spaces?" }] } } });
  heard({ type: "work.item", sessionId: "s2", item: { id: "p2", kind: "perm", tool: "Bash", state: "ask", input: { description: "npm test" } } });
  assert.deepEqual(_moments().map((m) => [m.kind, m.line]), [["question", "Tabs or spaces?"], ["permission", "Claude wants to run: npm test"]]);
  heard({ type: "work.item", sessionId: "s1", item: { id: "p1", kind: "perm", tool: "AskUserQuestion", state: "ask" } });
  assert.equal(_moments().length, 2, "the same ask told again is one moment");
  heard({ type: "work.item", sessionId: "s1", item: { id: "p1", kind: "perm", state: "allowed" } });
  assert.deepEqual(_moments().map((m) => m.kind), ["permission"], "answered anywhere: gone");
  heard({ type: "work.run", sessionId: "s3", busy: false, ended: true, waiting: 0, cwd: "/x/sol-dev" });
  heard({ type: "work.run", sessionId: "s4", busy: false, ended: true, waiting: 0, failed: true });
  heard({ type: "work.run", sessionId: "s5", busy: false, ended: true, waiting: 1 });
  assert.deepEqual(_moments().slice(1).map((m) => [m.kind, m.sessionId]), [["done", "s3"], ["failed", "s4"]], "a turn waiting on an ask is the ask's moment");
  assert.match(_moments()[1].line, /sol-dev: done, your move/);
  heard({ type: "work.run", sessionId: "s3", busy: true });
  assert.ok(!_moments().some((m) => m.sessionId === "s3"), "a new turn in the session: he acted");
  heard({ type: "work.item", sessionId: "s6", item: { id: "h1", kind: "handin", number: 812, title: "the bar", state: undefined } });
  assert.equal(_moments().at(-1)!.kind, "green");
  heard({ type: "work.item", sessionId: "s6", item: { id: "h1", kind: "handin", number: 812, state: "in" } });
  assert.ok(!_moments().some((m) => m.kind === "green"));
});

test("nothing for the session in front of him; Life's end, a hand, a new stable", () => {
  setPresence(w, false, 0, true);
  watchViews((id) => id === "s1");
  heard({ type: "work.run", sessionId: "s1", ended: true, waiting: 0 });
  heard({ type: "life.done", sessionId: "s1", ok: true });
  assert.equal(_moments().length, 0, "he is looking at it");
  heard({ type: "life.done", sessionId: "s2", ok: true, seat: "codex" });
  heard({ type: "life.done", sessionId: "s3", stopped: true });
  assert.deepEqual(_moments().map((m) => [m.kind, m.seat]), [["done", "codex"]]);
  heard({ type: "team.handed", id: "h", from: "franktsai", issue: 9, title: "the relay" });
  heard({ type: "team.handed", id: "r", from: "franktsai", issue: 9, review: true });
  heard({ type: "team.stable", sha: "abcdef1234", tag: "v1.2", by: "marco", behind: true, channel: "stable" });
  heard({ type: "team.stable", sha: "abcdef1234", tag: "v1.2", by: "marco", behind: true, channel: "stable" });
  heard({ type: "team.stable", sha: "0123456789", behind: true, channel: "dev" });
  assert.deepEqual(_moments().slice(1).map((m) => [m.kind, m.line]), [["hand", "franktsai handed you #9 the relay"], ["stable", "a new stable: v1.2 from marco"]]);
  heard({ type: "team.stable", sha: "abcdef1234", behind: false, channel: "stable" });
  assert.ok(!_moments().some((m) => m.kind === "stable"), "updated: gone");
});

test("a face that says hello gets only its own; the ping tool feeds the one sender", async () => {
  setPresence(w, false, 0, true);
  const r = await runPingTool("ping", { line: "the timer row is in" }, { seat: "claude", sessionId: "s9" });
  assert.match(r.content[0].type === "text" ? r.content[0].text : "", /in the window/);
  const late = face(); addMomentFace(late); momentFaceIs(late, "window");
  assert.equal(moments(late).length, 1);
  const lateP = face(); addMomentFace(lateP); momentFaceIs(lateP, "phone");
  assert.equal(moments(lateP).length, 0);
  assert.equal((await runPingTool("ping", { line: " " })).isError, true);
});
