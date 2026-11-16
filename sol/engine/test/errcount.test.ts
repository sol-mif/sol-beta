// Error counts per feature (#485, decision 20): engine/src/errcount.ts. Counts only: the engine's own file, the type of
// error, where it was caught, and the Sol version track.ts puts on every event; never the message, the stack or a path.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTrackHome, dayFile } from "../src/track.ts";
import { audienceOf, countsErrors, typeOf, fileOf, propsOf, setErrorCount, countError, shippedOf, isFileWord, headOf, type Audience } from "../src/errcount.ts";

const ENGINE = ["", "Users", "sam", "Sol", "sol", "engine"].join("/");   // in pieces: this file goes out in the export, whose leak check refuses a home path
let home = "", consent = { usage: true }, who: Audience = "tester";
const now = new Date(2026, 9, 31, 9, 40, 0);
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sol-errcount-"));
  consent = { usage: true }; who = "tester";
  setTrackHome(home, { version: "abc1234", consent: () => consent, now: () => now });
  setErrorCount(ENGINE, () => who, () => SHIPPED);
});
// Sol's own source as the release has it (git ls-tree in sol/engine)
const SHIPPED = shippedOf("src/index.ts\nsrc/team/pages.ts\nsrc/team/live.ts\nsrc/team/a b.ts\nREADME.md\n");
const HEAD = "TypeError: cannot read the plan in /Users/someone/secret/plan.md";
const counted = () => (existsSync(dayFile(now)) ? readFileSync(dayFile(now), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []).filter((l) => l.name === "error.count");

const stack = (top: string) => `${HEAD}\n    at JSON.parse (<anonymous>)\n    at readPlan (node:internal/fs/utils:12:3)\n    at x (${ENGINE}/node_modules/ws/lib/a.js:3:1)\n    at ${top}\n    at async main (${ENGINE}/dist/index.js:1:1)`;

test("who is counted: Sol testers (sol-beta) and Sol developers (sol-dev); a Sol user, any other origin or none, is not", () => {
  assert.equal(audienceOf("https://github.com/marcocyl04-ux/sol-beta.git\n"), "tester");
  assert.equal(audienceOf("git@github.com:sol-mif/sol-dev.git"), "developer");
  assert.equal(audienceOf("https://github.com/someone/sol"), "user");
  assert.equal(audienceOf(""), "user");
  assert.equal(audienceOf("https://github.com/x/sol-beta-fork"), "user");
  assert.equal(audienceOf("https://github.com/someone/sol-beta.git"), "user", "a fork of the beta, another owner: a Sol user");
  assert.equal(audienceOf("https://github.com/marcocyl04-ux/ecosystem.git"), "developer", "sol-dev's old name, as old checkouts say it");
  assert.equal(audienceOf("ssh://git@github.com/sol-mif/sol-dev"), "developer");
  assert.equal(audienceOf("https://example.com/marcocyl04-ux/sol-beta.git"), "user");
  assert.deepEqual(["tester", "developer", "user"].map((a) => countsErrors(a as Audience)), [true, true, false]);
});

test("the type of error: node's code, else its class when it is JavaScript's, node's or Sol's own, else Error; a thrown value is never looked at", () => {
  assert.equal(typeOf(Object.assign(new Error("x"), { name: "JaneDoe" })), "Error", "a capitalised name that is no known class: never sent");
  class JaneDiaryError extends Error {}
  assert.equal(typeOf(new JaneDiaryError("x")), "Error", "a class of the person's own code: Error");
  assert.equal(typeOf(new RangeError("x")), "RangeError");
  assert.equal(typeOf(Object.assign(new Error("x"), { name: "Held" })), "Held", "Sol's own");
  assert.equal(typeOf(Object.assign(new Error("no such file /Users/someone/x"), { code: "ENOENT" })), "ENOENT");
  assert.equal(typeOf(new TypeError("x")), "TypeError");
  assert.equal(typeOf(Object.assign(new Error("x"), { name: "AbortError" })), "AbortError");
  assert.equal(typeOf(Object.assign(new Error("x"), { name: "my secret words" })), "Error");
  assert.equal(typeOf(Object.assign(new Error("x"), { code: "a path /x" })), "Error");
  assert.equal(typeOf(Object.assign(new Error("x"), { code: "EJANEDOE" })), "Error", "a code shaped like node's that is none of its: dropped");
  assert.equal(typeOf(Object.assign(new TypeError("x"), { code: "ERR_JANE_DOE" })), "TypeError", "dropped, the class said instead");
  assert.equal(typeOf(Object.assign(new Error("x"), { code: "ECONNREFUSED" })), "ECONNREFUSED");
  assert.equal(typeOf(Object.assign(new TypeError("x"), { code: "ERR_INVALID_ARG_TYPE" })), "ERR_INVALID_ARG_TYPE");
  assert.equal(typeOf("the plan is in /Users/someone"), "thrown");
  assert.equal(typeOf(null), "thrown");
  assert.equal(typeOf({ name: "Frank" }), "thrown", "an object that is no error: its name is data, never read");
});

test("the file: the first frame in the engine's own shipped code, dist read as its src file, never a package, node or a path elsewhere", () => {
  const f = (top: string) => fileOf(stack(top), ENGINE, HEAD, SHIPPED);
  assert.equal(f(`readPage (${ENGINE}/dist/team/pages.js:40:11)`), "src:team:pages.ts");
  assert.equal(f(`file://${ENGINE}/src/team/live.ts:9:2`), "src:team:live.ts");
  assert.equal(f(`${ENGINE}/src/index.ts:9:2`), "src:index.ts");
  assert.equal(f(`y (/Users/someone/Sol/other/thing.js:1:1)`), "src:index.ts", "a frame outside the engine is passed over");
  assert.equal(fileOf("Error: x\n    at y (/Users/someone/home/a.js:1:1)", ENGINE, "Error: x", SHIPPED), "", "no frame of the engine's own: nothing");
  assert.equal(fileOf(undefined, ENGINE, HEAD, SHIPPED), "");
  assert.equal(f(`z (${ENGINE}/src/team/a b.ts:1:1)`), "src:index.ts", "a file name that is not a word is passed over");
});

test("#495's review: a name of the person's never rides as a file, from the message, from .., or from a file of their own", () => {
  // a message that runs over lines and looks like frames: the head is cut off first, so none of it is read
  const msg = `could not sync\n    at x (${ENGINE}/src/mine/jane-diary-sync.ts:1:1)\n    at y (${ENGINE}/src/team/pages.ts:2:2)`;
  const e = new Error(msg);
  e.stack = `${headOf(e)}\n    at real (${ENGINE}/dist/index.js:5:5)`;
  assert.equal(fileOf(e.stack, ENGINE, headOf(e), SHIPPED), "src:index.ts", "the frames in the message are never looked at");
  assert.equal(fileOf(e.stack, ENGINE, "Error: something else", SHIPPED), "", "a stack whose head is not the error's: nothing");
  // .. in a frame: passed over, whatever it would name
  assert.equal(fileOf(stack(`t (${ENGINE}/src/../../../../Documents/Taxes-Jane.ts:1:1)`), ENGINE, HEAD, SHIPPED), "src:index.ts");
  assert.equal(fileOf(stack(`t (${ENGINE}/src/./team/pages.ts:1:1)`), ENGINE, HEAD, SHIPPED), "src:index.ts");
  // a file the person added on their own branch: not in the release's list, so other
  const own = new Error("x");
  own.stack = `${headOf(own)}\n    at s (${ENGINE}/src/mine/jane-diary-sync.ts:1:1)`;
  assert.deepEqual(propsOf(own, "team", ENGINE, undefined, SHIPPED).file, "other");
  assert.deepEqual(propsOf(own, "team", ENGINE, undefined, null).file, "other", "no list read yet: every file is other");
  // the cloud's and the live block's word check
  for (const bad of ["src:..:..:Documents:Taxes-Jane.ts", "src:.:x.ts", "src::x.ts"]) assert.equal(isFileWord(bad), false, bad);
  assert.equal(isFileWord("src:team:pages.ts"), true);
  assert.deepEqual([...shippedOf("src/a.ts\nsrc/x.md\nREADME.md\nsrc/b/c.js\n")], ["src/a.ts", "src/b/c.js"]);
});

test("the props: file, type, kind and the request's type; never the message", () => {
  const e = new TypeError("cannot read the plan in /Users/someone/secret/plan.md");
  e.stack = stack(`readPage (${ENGINE}/dist/team/pages.js:40:11)`);
  assert.deepEqual(propsOf(e, "team", ENGINE, "team.page.write", SHIPPED), { file: "src:team:pages.ts", type: "TypeError", kind: "team", msg: "team.page.write" });
  assert.deepEqual(propsOf("x", "uncaught", ENGINE), { file: "other", type: "thrown", kind: "uncaught" });
  assert.equal(propsOf(e, "work", ENGINE, "Work: a sentence").msg, undefined, "a request type that is not a wire word is left out");
});

test("a count on a Sol tester's Mac: one error.count line with the version, and not a word of the error", () => {
  const e = Object.assign(new Error("ENOENT: no such file, open '/Users/someone/secret/plan.md'"), { code: "ENOENT" });
  e.stack = stack(`readPage (${ENGINE}/dist/team/pages.js:40:11)`).replace(HEAD, headOf(e));
  countError(e, "team", "team.page.write");
  const raw = readFileSync(dayFile(now), "utf8");
  assert.doesNotMatch(raw, /secret|plan\.md|sam|cannot|no such file/, "never the message, the stack or a path");
  const [c] = counted();
  assert.equal(c.sol, "abc1234");
  assert.equal(c.mode, "cowork");
  assert.deepEqual(c.props, { file: "src:team:pages.ts", type: "ENOENT", kind: "team", msg: "team.page.write" });
});

test("nothing for a Sol user, nothing with usage off, nothing before the engine says where it is", () => {
  who = "user";
  countError(new Error("x"), "uncaught");
  assert.equal(counted().length, 0, "a Sol user waits for personalization");
  who = "tester"; consent = { usage: false };
  countError(new Error("x"), "uncaught");
  assert.equal(counted().length, 0, "the usage switch turns it off with the rest");
  consent = { usage: true };
  setErrorCount("", () => "tester");
  countError(new Error("x"), "uncaught");
  assert.equal(counted().length, 0);
  setErrorCount(ENGINE, () => "developer");
  countError(new Error("x"), "uncaught");
  assert.equal(counted().length, 1, "a Sol developer is counted");
});
