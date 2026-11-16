// Core pins (#892): state.ts (and the moved map sessions.ts reads). What it promises: Sol's own marks, groups, folders,
// order and prefs, kept in one JSON file written whole (never half-written); a mark's value is checked for its kind, a
// role is set once; a folder sits in one group at most; prefs are clamped or refused; a folder that moved takes every
// path Sol keeps with it, and a chain of moves of the same folder collapses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const D = mkdtempSync(join(tmpdir(), "sol-core-state-"));
process.env.SOL_STATE = join(D, "work.json");
const S = await import("../src/work/state.ts");
const { relocated, movedTo } = await import("../src/work/sessions.ts");
const settle = () => new Promise((r) => setTimeout(r, 300));

test("no file yet: an empty state, and a write makes the file whole, with no temp file left", async () => {
  assert.deepEqual(S.workState().marks, {});
  S.mark("s1", { pinned: true });
  S.mark("s1", { unread: true });   // two marks inside the debounce: one write with both
  await settle();
  const v = JSON.parse(readFileSync(process.env.SOL_STATE!, "utf8"));
  assert.deepEqual(v.marks.s1, { pinned: true, unread: true });
  assert.deepEqual(readdirSync(D), ["work.json"]);
});

test("a mark takes its kind: booleans are true or gone, seen a number, mode one of three, unknown keys ignored", () => {
  S.mark("s2", { pinned: "yes", seen: "123", mode: "anything", group: 7, bogus: 1 } as any);
  assert.deepEqual(S.workState().marks.s2, { pinned: true, seen: 123, mode: "work", group: "7" });
  S.mark("s2", { pinned: false, seen: null, mode: "", group: undefined });
  assert.equal(S.workState().marks.s2, undefined, "a session with no marks left is gone from the file");
});

test("a role is set once: never changed, never taken off; an unknown role is the strictest-but-one, builder", () => {
  S.mark("s3", { role: "dev" });
  S.mark("s3", { role: "first-timer" });
  S.mark("s3", { role: null });
  assert.equal(S.workState().marks.s3.role, "dev");
  assert.equal(S.roleIn("typo"), "builder");
  assert.equal(S.roleIn("  "), undefined);
  assert.equal(S.stricter("dev", "first-timer"), "first-timer");
  assert.equal(S.stricter("first-timer", undefined), "first-timer");
  assert.equal(S.stricter(undefined, "nonsense"), "builder");
});

test("settled ends merge; they never replace each other", () => {
  S.mark("s4", { settled: { a: "fold" } });
  S.mark("s4", { settled: { b: "fork:x" } });
  assert.deepEqual(S.workState().marks.s4.settled, { a: "fold", b: "fork:x" });
});

test("groups: two made in the same moment get two ids; a folder sits in one group at most; a delete takes the marks off", () => {
  const a = S.groupOp("add", { name: "one", folders: ["/p"] })!;
  const b = S.groupOp("add", { name: "two", folders: ["/p"], sessions: ["s5"] })!;
  assert.notEqual(a, b);
  const g = (id: string) => S.workState().groups.find((x) => x.id === id)!;
  assert.equal(g(a).folders, undefined);
  assert.deepEqual(g(b).folders, ["/p"]);
  assert.equal(S.workState().marks.s5.group, b);
  S.groupOp("delete", { id: b });
  assert.equal(S.workState().marks.s5, undefined);
  assert.equal(S.groupOp("rename", { id: "no-such", name: "x" }), undefined);
  // a topic group holds sessions only, never folders
  const t = S.groupOp("add", { name: "topic", in: "/p", folders: ["/q"] })!;
  assert.equal(g(t).folders, undefined);
});

test("the order keeps groups and absolute folders only, once each, at most 500", () => {
  assert.deepEqual(S.setOrder(["g:a", "/x", "relative", "g:a", 5, "g: spaced", "/x"]), ["g:a", "/x"]);
  assert.equal(S.setOrder(Array.from({ length: 900 }, (_, i) => `/f${i}`)).length, 500);
  assert.deepEqual(S.setOrder("not a list"), []);
});

test("prefs: numbers clamped, folders must be full paths, a prefix is a branch-safe word, unknown keys ignored", () => {
  assert.equal(S.setPrefs({ archiveDays: 9999 }).archiveDays, 365);
  assert.equal(S.setPrefs({ archiveDays: "x" }).archiveDays, 0);
  assert.equal(S.setPrefs({ archiveDays: -4 }).archiveDays, 0);
  assert.throws(() => S.setPrefs({ wtDir: "relative/dir" }), /full path/);
  assert.equal(S.setPrefs({ wtDir: "/w///" }).wtDir, "/w");
  assert.throws(() => S.setPrefs({ prefix: "../evil" }));
  assert.throws(() => S.setPrefs({ prefix: "a..b" }));
  assert.equal(S.setPrefs({ prefix: "sol/" }).prefix, "sol/");
  assert.equal((S.setPrefs({ nope: 1 }) as any).nope, undefined);
});

test("a folder moved: every kept path follows, a sibling with the same prefix does not, and a chain of the same folder collapses", () => {
  S.folderOp("add", "/m/a");
  S.folderOp("add", "/m/ab");
  S.folderMoved("/m/a", "/m/b");
  assert.deepEqual(S.workState().folders.filter((f) => f.startsWith("/m/")), ["/m/b", "/m/ab"]);
  assert.equal(relocated("/m/a/x"), "/m/b/x");
  assert.equal(relocated("/m/ab/x"), "/m/ab/x");
  S.folderMoved("/m/b", "/m/c");
  assert.equal(relocated("/m/a/x"), "/m/c/x");
  // moving it back where it started: the place is a real folder again, so no move starts there
  S.folderMoved("/m/c", "/m/a");
  assert.equal(relocated("/m/a/x"), "/m/a/x");
  assert.equal(movedTo({})("/anything"), "/anything");
});
