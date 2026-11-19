// node --test src/*.test.ts: Build becomes yours (#1089, yours/model.ts). The switch is off unless set; the line says
// what was noticed and leaves the question to the press; only a `yours.fill` with words, from a page in the stage or
// the sheet, may fill the box; the box is filled the way typing fills it and is never sent; the list's words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILD_YOURS, fillFrom, makeYoursSwitch, sinceOf } from "./yours/model.ts";
import { floorOf, pageFit } from "./stage/kinds/pageFit.ts";

const kv = (m: Record<string, string> = {}) => ({ getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } });
const env = (m: Record<string, string> = {}, search = "") => ({ storage: () => kv(m), search: () => search, target: null });

test("the switch: off by default, on by its storage or its link, Build's own key", () => {
  assert.equal(BUILD_YOURS, "build.yours");
  assert.equal(makeYoursSwitch(env()).get(), false);
  assert.equal(makeYoursSwitch(env({ "build.yours": "1" })).get(), true);
  assert.equal(makeYoursSwitch(env({ "build.yours": "1" }, "?build.yours=off")).get(), false);
  assert.equal(makeYoursSwitch(env({}, "?build.yours=on")).get(), true);
});

test("only a page in the stage or the sheet fills the box, only with words, only by yours.fill", () => {
  assert.equal(fillFrom({ sol: "yours.fill", text: "  review #1084 " }, true), "review #1084");
  assert.equal(fillFrom({ sol: "yours.fill", text: "review" }, false), null, "a message from any other window");
  assert.equal(fillFrom({ sol: "part", part: "x" }, true), null);
  assert.equal(fillFrom({ sol: "yours.fill", text: 42 }, true), null);
  assert.equal(fillFrom({ sol: "yours.fill", text: "   " }, true), null);
  assert.equal(fillFrom(null, true), null);
  assert.equal(fillFrom({ sol: "yours.fill", text: "x".repeat(9000) }, true)?.length, 8000);
});

test("the list's words: when", () => {
  const now = Date.parse("2026-11-13T09:00:00Z");
  assert.equal(sinceOf(now - 3_600_000, now), "today");
  assert.equal(sinceOf(now - 86_400_000, now), "yesterday");
  assert.equal(sinceOf(now - 3 * 86_400_000, now), "3 days ago");
  assert.equal(sinceOf(Date.parse("2026-10-01T12:00:00Z"), now), "1 Oct", "dates are one form everywhere: 10 Nov");
});

test("a page may say the width it is made at; the stage lays it out there and never scales it down in a block it fits", () => {
  assert.equal(floorOf('<!doctype html><html><head><meta name="sol-width" content="320"><style></style>'), 320);
  assert.equal(floorOf("<html><head></head>"), undefined);
  assert.equal(floorOf('<meta name="sol-width" content="40">'), undefined, "too narrow to be a page");
  assert.equal(pageFit(457, 300, 320).scale, 1, "a 320 piece in a 457 block: its own size");
  assert.ok(pageFit(457, 300).scale < 1, "a page that says nothing is laid at 720 and scaled, as before");
});

test("the look's versions: theirs first; narrower leads to narrower and the foot; wider to wider and the whole window; full is one", async () => {
  const { laysOf } = await import("./yours/lays.ts");
  assert.deepEqual(laysOf({ dock: "right", width: 0.34 }).map((v: any) => v.lay), [{ dock: "right", width: 0.34 }, { dock: "right", width: 0.24 }, { dock: "bottom" }]);
  assert.deepEqual(laysOf({ dock: "right", width: 0.3 }).map((v: any) => v.words), ["as you leave it", "at the foot"], "already near the floor: no narrower");
  assert.deepEqual(laysOf({ dock: "left", width: 0.5 }).map((v: any) => v.lay), [{ dock: "left", width: 0.5 }, { dock: "left", width: 0.6 }, { dock: "full" }]);
  assert.equal(laysOf({ dock: "full" }).length, 1);
});

test("a send is heard once: at the box with the switch on, whether its line comes back or not; its line takes it, never asks again", async () => {
  const { makeHeard, HEARD_MS } = await import("./yours/model.ts");
  const h = makeHeard<string>();
  let asked = 0;
  const ask = () => `ask${++asked}`;
  const T = 1_000_000;   // one clock for the whole test
  const send = (text: string, o: { on?: boolean; session?: string; filled?: boolean } = {}, now = T) =>
    h.hear({ on: o.on ?? true, session: o.session ?? "s1", text, filled: !!o.filled }, ask, now);
  // off: nothing told, nothing held for the line
  assert.equal(send("make a list of my classes", { on: false }), null);
  assert.equal(asked, 0);
  assert.equal(h.take("s1", "make a list of my classes", T), null, "the switch off holds nothing");
  // a new session's first send, its turn failed: told at the box, once
  assert.equal(send("make a list of my classes"), "ask1");
  assert.equal(asked, 1);
  // the line comes back (its spaces as the engine reads them): it takes that ask, once; a second line of it asks for itself
  assert.equal(h.take("s1", "  make a list   of my classes ", T), "ask1");
  assert.equal(h.take("s1", "make a list of my classes", T), null);
  assert.equal(asked, 1, "one send, one ask");
  // another session's line never takes it
  send("review #12", { session: "s2" });
  assert.equal(h.take("s1", "review #12", T), null);
  assert.equal(h.take("s2", "review #12", T), "ask2");
  // not a send: a kept tool's fill (its own path tells it), a stop's line, a wrapper, nothing, no session
  for (const [t, o] of [["fill me", { filled: true }], ["[Request interrupted by user]", {}], ["<command-name>", {}], ["   ", {}], ["x", { session: "" }]] as const)
    assert.equal(send(t, o), null, t);
  assert.equal(asked, 2);
  // a send whose line never came is forgotten after a while: a later line of the same words asks for itself
  send("check the build", {}, T);
  assert.equal(h.take("s1", "check the build", T + HEARD_MS + 1), null);
});

test("#1131 the send-time decision: the session's folder goes with the ask; a fill is for one send only; an offer standing keeps a record only", async () => {
  const { atSend, FILL_FRESH_MS } = await import("./yours/model.ts");
  const T = 2_000_000;
  // a new session's first ask carries the folder it opens in (the engine has no run for it yet); a folder that is not a path, none
  assert.deepEqual(atSend({ session: "s1", text: "plan the garden beds", cwd: "/work/garden", standing: false }, null, T),
    { filled: false, fill: null, said: { sessionId: "s1", said: "plan the garden beds", cwd: "/work/garden" } });
  assert.equal("cwd" in atSend({ session: "s1", text: "x", cwd: "", standing: false }, null, T).said, false);
  assert.equal("cwd" in atSend({ session: "s1", text: "x", cwd: "~", standing: false }, null, T).said, false);
  // a kept tool's fill: the one send after it is the fill's (its own path tells it); it stays, marked sent, for its line
  const fill = { id: "yours-0a1b2c3d", at: T, session: "s1" };
  const one = atSend({ session: "s1", text: "Draft invoice #1049", standing: false }, fill, T + 1000);
  assert.equal(one.filled, true);
  assert.deepEqual(one.fill, { ...fill, sent: true });
  // its turn failed (no line came back to take the fill): the next send in that session is typed, and the fill is gone
  const two = atSend({ session: "s1", text: "what is on my list today", standing: false }, one.fill, T + 60_000);
  assert.equal(two.filled, false, "a fill whose turn failed never swallows a later typed send");
  assert.equal(two.fill, null);
  // another session's send never reads against the fill, nor clears it; a stale fill is dropped
  const other = atSend({ session: "s2", text: "y", standing: false }, fill, T + 1000);
  assert.equal(other.filled, false);
  assert.equal(other.fill, fill);
  const stale = atSend({ session: "s1", text: "y", standing: false }, fill, T + FILL_FRESH_MS);
  assert.deepEqual([stale.filled, stale.fill], [false, null]);
  // an offer already stands on the line: the send is a record only (no other offer marked shown unseen)
  assert.equal(atSend({ session: "s1", text: "z", standing: true }, null, T).said.record, true);
  assert.equal("record" in atSend({ session: "s1", text: "z", standing: false }, null, T).said, false);
});
