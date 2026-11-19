// The lean list (#870 item 3, work/lean.ts): a face that asked `work.list { lean: true }` is not sent a work.sessions
// that says what the last one it was sent said. A run's usage, context and cost move at every step and reach the face
// in work.run; a row's `seen` is drawn by no face: a list that differs only there is the same list. Anything else that
// moved is sent, whole. A face that never asked gets every list, as before. No engine, no disk: the two functions the
// wire calls, with stand-in faces.
import { test } from "node:test";
import assert from "node:assert/strict";

const L = await import("../src/work/lean.ts");
type Lean = import("../src/work/lean.ts").Lean;

const FOLDER = "/home/m/code/sol";
const run = (o: object = {}) => ({
  sessionId: "sess-aaaa0001", busy: true, waiting: 0, cwd: FOLDER, model: "opus", effort: "high", mode: "default", fast: false,
  context: 1000, window: 1_000_000, failed: false, cost: 0, tasks: [], since: 1, shown: false, usage: { total: 1000, parts: [] }, ...o,
});
const row = (o: object = {}) => ({ id: "sess-aaaa0001", title: "the stage lags", cwd: FOLDER, project: FOLDER, updatedAt: 1, size: 10, seen: 5, ...o });
const list = (o: object = {}) => ({
  type: "work.sessions", sessions: [row(), row({ id: "sess-bbbb0002", title: "another" })], projects: [{ path: FOLDER, name: "sol", count: 2 }],
  groups: [], order: [], runs: [run()], roomNames: {}, ...o,
});

// two faces on one engine: one asked lean, one never did
function faces() {
  const lean: object[] = [], plain: object[] = [];
  const a: Lean = {}, b: Lean = {};
  const first = list();
  L.listAsked(a, { type: "work.list", [L.LEAN]: true }, first);
  L.listAsked(b, { type: "work.list" }, first);
  const all: [{ send: (m: object) => void }, Lean][] = [[{ send: (m) => lean.push(m) }, a], [{ send: (m) => plain.push(m) }, b]];
  return { lean, plain, tell: (m: object) => L.tellList(all, m), a, b };
}

test("the same list offered again goes to the plain face and not to the lean one", () => {
  const f = faces();
  f.tell(list());   // what the ask was answered with, again
  assert.equal(f.lean.length, 0, "the lean face was answered with this list already");
  assert.equal(f.plain.length, 1);
  const next = list({ groups: [{ id: "g1", name: "product" }] });
  f.tell(next); f.tell(list({ groups: [{ id: "g1", name: "product" }] }));
  assert.equal(f.lean.length, 1, "sent once, not twice");
  assert.equal(f.lean[0], next, "and whole: what is compared is cut down, what is sent never is");
  assert.equal(f.plain.length, 3, "the face that never asked gets every one");
});

test("a list that differs only in a run's usage, context or cost is not sent to a lean face", () => {
  const f = faces();
  f.tell(list({ runs: [run({ usage: { total: 52_000, parts: [{ name: "messages", tokens: 51_000 }] } })] }));
  f.tell(list({ runs: [run({ context: 52_000 })] }));
  f.tell(list({ runs: [run({ cost: 0.42 })] }));
  f.tell(list({ runs: [run({ usage: { total: 90_000, parts: [] }, context: 90_000, cost: 1.5 })] }));
  assert.equal(f.lean.length, 0);
  assert.equal(f.plain.length, 4);
});

test("a row's `seen` alone is not a change: opening a session that was read already sends a lean face nothing", () => {
  const f = faces();
  f.tell(list({ sessions: [row({ seen: 99 }), row({ id: "sess-bbbb0002", title: "another" })] }));
  assert.equal(f.lean.length, 0);
  assert.equal(f.plain.length, 1);
  // the same press on an unread one takes its mark off: that is a change
  const f2 = faces();
  f2.tell(list({ sessions: [row({ unread: true }), row({ id: "sess-bbbb0002", title: "another" })] }));
  f2.tell(list({ sessions: [row({ seen: 99 }), row({ id: "sess-bbbb0002", title: "another" })] }));
  assert.equal(f2.lean.length, 2);
});

test("anything else that moved is sent to a lean face", () => {
  const rows = (o: object) => ({ sessions: [row(o), row({ id: "sess-bbbb0002", title: "another" })] });
  const moved: Record<string, object> = {
    "a session's title": list(rows({ title: "the stage is light" })),
    "a session's last message": list(rows({ updatedAt: 2, size: 20 })),
    "a pin": list(rows({ pinned: true })),
    "a new session": list({ sessions: [row(), row({ id: "sess-bbbb0002", title: "another" }), row({ id: "sess-cccc0003", title: "a third" })] }),
    "a run's busy": list({ runs: [run({ busy: false })] }),
    "a run's waiting": list({ runs: [run({ waiting: 1 })] }),
    "a run's failed": list({ runs: [run({ failed: true })] }),
    "a run's model": list({ runs: [run({ model: "sonnet" })] }),
    "a run's mode": list({ runs: [run({ mode: "plan" })] }),   // set after the last work.run when a plan is approved (runs.ts ask)
    "a run's background agents": list({ runs: [run({ tasks: ["read the tests"] })] }),
    "a run that began": list({ runs: [run(), run({ sessionId: "sess-bbbb0002" })] }),
    "a run that ended": list({ runs: [] }),
    // the bus marks the row unread when a turn ends with nobody looking (wire.ts bus)
    "a turn that ended unread": list({ ...rows({ unread: true }), runs: [run({ busy: false, cost: 0.2 })] }),
    "a group": list({ groups: [{ id: "g1", name: "product" }] }),
    "the order": list({ order: ["sess-bbbb0002", "sess-aaaa0001"] }),
    "a folder": list({ projects: [{ path: FOLDER, name: "sol", count: 2 }, { path: "/home/m/notes", name: "notes", count: 0, added: true }] }),
    "a group's name in Cowork": list({ roomNames: { r1: "the team" } }),
  };
  for (const [what, m] of Object.entries(moved)) {
    const f = faces();
    f.tell(m);
    assert.deepEqual(f.lean, [m], what);
    f.tell(list());   // and back to how it was: a change again
    assert.equal(f.lean.length, 2, `${what}, then back`);
  }
});

test("a face is lean only when it says exactly `lean: true`, stays so over a plain ask, and stops when it says false", () => {
  for (const said of ["true", 1, {}, null, undefined]) {
    const a: Lean = {}, got: object[] = [];
    L.listAsked(a, { type: "work.list", [L.LEAN]: said }, list());
    L.tellList([[{ send: (m) => got.push(m) }, a]], list());
    assert.equal(got.length, 1, `lean: ${JSON.stringify(said)} is not an ask for the lean list`);
  }
  const f = faces();
  L.listAsked(f.a, { type: "work.list" }, list());   // the same socket asks again without the word (pings.ts does)
  f.tell(list());
  assert.equal(f.lean.length, 0, "still lean");
  L.listAsked(f.a, { type: "work.list", [L.LEAN]: false }, list());
  f.tell(list()); f.tell(list());
  assert.equal(f.lean.length, 2, "it said false: every list again");
});

test("an ask is the start of what a lean face holds: the list it was answered with is not sent after it", () => {
  const a: Lean = {}, got: object[] = [];
  const all: [{ send: (m: object) => void }, Lean][] = [[{ send: (m) => got.push(m) }, a]];
  L.tellList(all, list());
  assert.equal(got.length, 1, "a new face has said nothing yet: it gets the list");
  const moved = list({ groups: [{ id: "g1", name: "product" }] });
  L.listAsked(a, { type: "work.list", [L.LEAN]: true }, moved);   // the wire answers the ask itself, always whole
  L.tellList(all, list({ groups: [{ id: "g1", name: "product" }] }));
  assert.equal(got.length, 1, "what the answer said is not said again");
  L.tellList(all, list());
  assert.equal(got.length, 2);
});

test("a list that could not be read is told, and the list after it is sent", () => {
  const f = faces();
  f.tell({ type: "work.sessions.error" });
  assert.deepEqual(f.lean, [{ type: "work.sessions.error" }]);
  f.tell({ type: "work.sessions.error" });
  assert.equal(f.lean.length, 1, "a second error in a row says nothing new");
  assert.equal(f.plain.length, 2);
  f.tell(list());
  assert.equal(f.lean.length, 2, "the face may have dropped what it held: the same list goes again");
});

test("rowKey: the list as a lean face compares it", () => {
  const k = L.rowKey(list());
  assert.equal(k, L.rowKey(list({ runs: [run({ usage: null, context: 7, cost: 9 })], sessions: [row({ seen: 1 }), row({ id: "sess-bbbb0002", title: "another" })] })));
  assert.notEqual(k, L.rowKey(list({ runs: [run({ since: 2 })] })));
  // only a run's and a row's own fields are left out, never the same word somewhere else in the list
  assert.notEqual(k, L.rowKey(list({ projects: [{ path: FOLDER, name: "sol", count: 2, seen: 1 }] })));
  assert.notEqual(k, L.rowKey(list({ cost: 1 })));
  // the list itself is not touched
  const m = list();
  L.rowKey(m);
  assert.deepEqual(m, list());
});
