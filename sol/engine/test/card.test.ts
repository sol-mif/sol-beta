// The gate's five checks and the card (the design's step 4): format (the record, its versions and their files), declared
// exists (Sol's tools, data names, keys pasted), not past the record (each call, and ten refusals in a row mark a block
// suspect), loads (the install tool's answer, a big room tried once), and a person's press for what goes beyond the wall
// (card.ts), kept in Sol's own folder. Each test makes its own home, log folder and Sol folder under the temp folder.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync, statSync, symlinkSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { toolName, useSolTools, SUSPECT_AFTER } from "../src/kernel.ts";
import { Kernel } from "./kernels.ts";
import { askOf, widerThan, cardOf, pressedFile, readPress, printOf } from "../src/card.ts";
import { pasteKey, listKeys, removeKey, readKey, noteScope, keyMeta, keyFile } from "../src/keys.ts";
import { columnsOf, type Columns } from "../src/record.ts";
import { useSend } from "../src/bigroom.ts";

const mac = platform() === "darwin" && existsSync("/usr/bin/sandbox-exec");
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });
function home() {
  const h = realpathSync(mkdtempSync(join(tmpdir(), "sol-card-")));
  homes.push(h);
  mkdirSync(join(h, "things"));
  mkdirSync(join(h, "app"));
  return h;
}
const opts = (h: string) => ({ logDir: join(h, "lab-log"), appDir: join(h, "app"), big: { idleMs: 60_000 } });
function block(h: string, id: string, engine: string | null, rec: Record<string, unknown> = {}) {
  const d = join(h, "things", id);
  mkdirSync(d, { recursive: true });
  const r = { id, title: id, place: "card", reads: [], writes: [], versions: [{ v: 1, file: "v1.html", at: "2026-11-08", contract: 1 }], ...rec };
  writeFileSync(join(d, "record.json"), JSON.stringify(r));
  writeFileSync(join(d, "v1.html"), "<p>x</p>");
  if (engine !== null) writeFileSync(join(d, "engine.js"), engine);
}
const cols = (r: Record<string, unknown>) => (columnsOf(r) as { columns: Columns }).columns;
const text = (r: { content: { type: string; text?: string }[] }) => (r.content[0] as { text: string }).text;
const kinds = (k: Kernel, id: string, kind: string) => k.since().filter((e) => e.kind === kind && e.item === id);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the card, pure: what it asks, what is wider, and the sentences it always says", () => {
  const c = cols({ room: "big", needs: { why: "to file issues", domains: ["api.github.com"], programs: ["gh", "screencapture"], keys: ["github"], screen: true }, hears: ["seat.turn", "plugin.load"] });
  const a = askOf(c);
  assert.deepEqual(a, { domains: ["api.github.com"], folders: [], programs: ["gh", "screencapture"], sol: [], keys: ["github"], screen: true, hears: ["seat.turn"], big: true, provides: [] }, "a seat's kinds only: a block's own kinds ask nothing");
  const app = realpathSync(mkdtempSync(join(tmpdir(), "sol-card-app-")));
  homes.push(app);
  const card = cardOf(app, "file-it", c, null, () => ["file-it", "notes"]);
  assert.equal(card.why, "to file issues");
  assert.equal(card.again, false);
  assert.deepEqual(card.missing, ["github"], "no key pasted yet: the card asks for one");
  assert.deepEqual(card.keys, [{ name: "github", have: false, also: ["notes"] }]);
  const all = card.plain.join("\n");
  assert.match(all, /Giving it GitHub \(the key github\) means it can do anything your GitHub account can/);
  assert.match(all, /whole screen, every window and its title, not only Sol's/);
  assert.match(all, /The key github is also used by notes: one key, given to 2 blocks/);
  assert.match(all, /It hears what your AI does \(turn\).*Never the words/);
  assert.equal(card.print, printOf(a, "to file issues", card.plain));
  const pat = cardOf(app, "x", cols({ room: "big", needs: { why: "x", domains: ["api.github.com"], keys: ["pat"] } }), null, () => []);
  assert.match(pat.plain.join("\n"), /Giving it GitHub \(the key pat\)/, "a key for a GitHub host is GitHub, whatever its name, before it is pasted");
  // pressed, then the record asks for more: again, with what is new; less asks nothing
  const pressed = { ...a, print: card.print };
  assert.deepEqual(widerThan(pressed, a), []);
  assert.deepEqual(widerThan(pressed, askOf(cols({ room: "big", needs: { why: "x", domains: ["api.github.com"] } }))), [], "narrower asks nothing");
  const wider = cardOf(app, "file-it", cols({ room: "big", needs: { why: "to file issues", domains: ["api.github.com", "uploads.github.com"], programs: ["gh", "screencapture"], keys: ["github"], screen: true }, hears: ["seat.turn", "seat.step"] }), pressed, () => []);
  assert.equal(wider.again, true);
  assert.deepEqual(wider.more, ["domain uploads.github.com", "hearing a seat's step"]);
  assert.notEqual(wider.print, card.print, "a wider record is another card");
  assert.deepEqual(askOf(cols({})), { domains: [], folders: [], programs: [], sol: [], keys: [], screen: false, hears: [], big: false, provides: [] }, "a plain small room asks nothing");
});

test("a small room that hears a seat waits for a press; the press names the card's print, is kept in Sol's folder, and is one line on the log", async () => {
  const h = home();
  block(h, "ear", `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`, { hears: ["seat.turn"] });
  block(h, "plain", `export default (sol) => { sol.tool({ name: "x", run: () => "x" }); };`);
  const k = new Kernel(h, opts(h));
  await k.sync();
  assert.equal(k.state("plain")?.state, "loaded", "asks nothing beyond its wall: never asked, as before");
  assert.equal(k.waiting("plain"), null);
  assert.equal(k.state("ear")?.state, "broken");
  assert.match(k.state("ear")?.why ?? "", /waiting for a person to press its card/);
  const card = k.waiting("ear")!;
  assert.deepEqual(card.asks.hears, ["seat.turn"]);
  k.seat("seat.turn", "claude", { session: "s1" });
  await wait(100);
  assert.equal(kinds(k, "ear", "plugin.line").length, 0, "waiting: it hears nothing");
  assert.deepEqual(await k.approve("ear", "not-the-print"), { ok: false, why: "its record changed since the card was drawn: the card is drawn again, to be pressed again" });
  assert.equal(readPress(join(h, "app"), h, "ear"), null, "a wrong print presses nothing");
  assert.deepEqual(await k.approve("plain", "x"), { ok: false, why: "plain is not waiting for a press" });
  const r = await k.approve("ear", card.print);
  assert.equal(r.ok, true);
  assert.equal(k.state("ear")?.state, "loaded", "pressed: it loads");
  assert.equal(k.waiting("ear"), null);
  const f = pressedFile(join(h, "app"), h, "ear");
  assert.ok(f.startsWith(join(h, "app", "approved")), "beside the log, in Sol's own folder, not in the home");
  assert.equal(statSync(f).mode & 0o777, 0o600);
  assert.deepEqual(readPress(join(h, "app"), h, "ear")?.hears, ["seat.turn"]);
  assert.equal(readPress(join(h, "app"), h, "ear")?.print, card.print);
  const line = kinds(k, "ear", "plugin.approve")[0];
  assert.equal(line.by.person, "person");
  assert.deepEqual(line.value, { print: card.print, asks: { hears: ["seat.turn"] } });
  k.seat("seat.turn", "claude", { session: "s2" });
  await wait(150);
  assert.ok(kinds(k, "ear", "plugin.line").some((e) => (e.value as { line: string }).line === "heard seat.turn"), "now it hears the seat");
  // wider: waits again, the press kept; narrower: no question
  block(h, "ear", `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`, { hears: ["seat.turn", "seat.step"] });
  await k.sync();
  assert.match(k.state("ear")?.why ?? "", /press its card again: its record asks for more than was pressed \(hearing a seat's step\)/);
  assert.equal(k.waiting("ear")?.again, true);
  block(h, "ear", `export default (sol) => { sol.listen((e) => sol.log("heard " + e.kind)); };`, { hears: [] });
  await k.sync();
  assert.equal(k.state("ear")?.state, "loaded", "narrower: it loads, nobody asked");
  await k.stop();
});

test("declared exists: Sol's tools it names are Sol's, never a block's or the install tool; a small room cannot ask past its wall", async () => {
  const h = home();
  useSolTools(async () => ({ content: [{ type: "text", text: "x" }] }), ["sticky", "ping", "things"]);
  block(h, "ghost", null, { room: "big", needs: { why: "x", sol: ["no_such_tool"] } });
  block(h, "installer", null, { room: "big", needs: { why: "x", sol: ["things"] } });
  block(h, "small", `export default () => {};`, { needs: { why: "x", domains: ["api.github.com"] } });
  block(h, "tooly", `export default () => {};`, { needs: { why: "a tool", tools: [{ name: "x" }] } });
  const k = new Kernel(h, opts(h));
  await k.sync();
  assert.match(k.state("ghost")?.why ?? "", /needs.sol names no_such_tool, which is not one of Sol's tools/);
  assert.match(k.state("installer")?.why ?? "", /needs.sol names things, which a block may not call/);
  assert.match(k.state("small")?.why ?? "", /a small room cannot reach beyond its wall, and its record asks for domains: room "big" is where that runs/);
  assert.equal(k.state("tooly")?.state, "loaded", "tools and times are not past the wall");
  useSolTools(null);
  await k.stop();
});

test("not past the record: ten refusals in a row mark a block suspect, in its place and once on the log; a call that passes ends the run", async () => {
  const h = home();
  block(h, "nosy", `export default (sol) => {
    sol.tool({ name: "peek", run: () => { try { sol.read("secrets"); return "read"; } catch (e) { return "refused"; } } });
    sol.tool({ name: "own", run: () => { sol.write("notes", 1); return "ok"; } });
  };`, { writes: ["notes"] });
  const k = new Kernel(h, opts(h));
  await k.sync();
  for (let i = 0; i < SUSPECT_AFTER - 1; i++) assert.equal(text(await k.runTool(toolName("nosy", "peek"), {})), "refused");
  assert.equal(k.state("nosy")?.suspect, undefined);
  await k.runTool(toolName("nosy", "own"), {});   // one that passes: the run is over
  for (let i = 0; i < SUSPECT_AFTER - 1; i++) await k.runTool(toolName("nosy", "peek"), {});
  assert.equal(k.state("nosy")?.suspect, undefined, "nine, a pass, nine: not ten in a row");
  await k.runTool(toolName("nosy", "peek"), {});
  assert.equal(k.state("nosy")?.suspect, true);
  assert.equal(k.state("nosy")?.state, "loaded", "a refusal never kills it, ten neither");
  for (let i = 0; i < 5; i++) await k.runTool(toolName("nosy", "peek"), {});
  assert.equal(kinds(k, "nosy", "plugin.suspect").length, 1, "said once");
  block(h, "nosy", `export default (sol) => { sol.tool({ name: "peek", run: () => "quiet" }); };`, { writes: ["notes"] });
  await k.sync();
  assert.equal(k.state("nosy")?.suspect, true, "kept across a load");
  assert.equal((await k.install("nosy")).status, "restart");
  assert.equal(k.state("nosy")?.suspect, true, "the install tool does not wipe it: the mark is for the person");
  await k.stop();
});

test("the install tool: install checks the versions and answers done, restart or failed; remove takes it out; version and undo move it", async () => {
  const h = home();
  const k = new Kernel(h, opts(h));
  assert.deepEqual(await k.install("none"), { status: "failed", say: "there is no block none in the home (write it into things/none/ first)" });
  block(h, "half", null, { versions: [{ v: 1, file: "v1.html" }, { v: 2, file: "v2.html" }] });
  assert.equal((await k.install("half")).say, "version 2's file v2.html is not beside the record");
  block(h, "twice", null, { versions: [{ v: 1, file: "v1.html" }, { v: 1, file: "v1.html" }] });
  assert.match((await k.install("twice")).say, /version 1 is listed twice/);
  block(h, "noeng", null, { versions: [{ v: 1, file: "v1.html", engine: "gone.js" }] });
  assert.equal((await k.install("noeng")).say, "version 1's engine half gone.js is not beside the record");
  block(h, "face", null);
  assert.deepEqual(await k.install("face"), { status: "done", say: "loaded, version 1", state: { state: "none", v: 1, tools: [] } });
  block(h, "week", `export default (sol) => { sol.tool({ name: "show", run: () => "v" + sol.id }); };`, { versions: [{ v: 1, file: "v1.html" }, { v: 2, file: "v1.html" }], current: 2 });
  const got = await k.install("week");
  assert.equal(got.status, "restart");
  assert.match(got.say, /loaded, version 2\. Its tools \(thing_week_show\) reach a seat from the seat's next conversation/);
  const back = await k.back("week");
  assert.equal(back.status, "restart");
  assert.equal(k.state("week")?.v, 1);
  assert.equal((await k.version("week", 7)).say, "7 is not one of its versions (1, 2)");
  assert.equal((await k.version("week", 2)).status, "restart");
  assert.equal(k.state("week")?.v, 2);
  const off = await k.remove("week");
  assert.deepEqual(off, { status: "done", say: "week is taken out: nothing of it runs, its folder stays" });
  assert.equal(k.state("week")?.off, true);
  assert.deepEqual(k.tools(), [], "taken out: its tools go");
  assert.ok(existsSync(join(h, "things", "week", "engine.js")), "its folder stays");
  assert.equal(kinds(k, "week", "plugin.off").length, 1);
  assert.equal((await k.remove("week")).say, "it is taken out already");
  assert.equal((await k.version("week", 2)).status, "restart", "a version puts it back");
  assert.equal(k.state("week")?.off, undefined);
  await k.remove("week");
  assert.equal((await k.install("week")).status, "restart", "an install puts it back too");
  assert.equal(k.state("week")?.off, undefined);
  assert.equal(JSON.parse(readFileSync(join(h, "things", "week", "record.json"), "utf8")).off, undefined);
  // a block that asks past its wall: the tool says it waits for the person's press, and cannot press it
  block(h, "ear", null, { hears: ["seat.done"] });
  const w = await k.install("ear");
  assert.equal(w.status, "failed");
  assert.match(w.say, /waiting for a person to press its card.*Tell the person: its card is in Sol, waiting for their press/);
  await k.stop();
});

test("the keys: pasted 0600 with their notes, listed without their text, a scope kept once, taken away", () => {
  const app = realpathSync(mkdtempSync(join(tmpdir(), "sol-card-keys-")));
  homes.push(app);
  assert.equal(pasteKey(app, { name: "../x", key: "k" }).ok, false);
  assert.equal(pasteKey(app, { name: "a.json", key: "k" }).ok, false, "never a name that is a note's");
  assert.equal(pasteKey(app, { name: "github", key: "two\nlines" }).ok, false);
  assert.equal(pasteKey(app, { name: "github", key: "k", hosts: ["https://x"] }).ok, false);
  const p = pasteKey(app, { name: "github", key: "  ghp_SECRET123  ", purpose: "file issues", hosts: ["API.github.com"] }, 1000);
  assert.ok(p.ok);
  assert.equal(statSync(keyFile(app, "github")).mode & 0o777, 0o600);
  assert.equal(statSync(join(app, "keys")).mode & 0o777, 0o700);
  assert.deepEqual(readKey(app, "github"), { key: "ghp_SECRET123", hosts: ["api.github.com"] });
  const list = listKeys(app);
  assert.deepEqual(list, [{ name: "github", purpose: "file issues", hosts: ["api.github.com"], users: [], added: 1000 }]);
  assert.ok(!JSON.stringify(list).includes("SECRET"), "never the text");
  noteScope(app, "github", "repo, workflow");
  noteScope(app, "github", "admin");
  assert.equal(keyMeta(app, "github")?.scope, "repo, workflow", "the first the service said");
  assert.equal(removeKey(app, "github"), true);
  assert.equal(removeKey(app, "github"), false);
  assert.deepEqual(listKeys(app), []);
});

test("a big room: waits for its press and for its keys; pressed, the key's users are noted; a key taken away makes it wait again", { skip: !mac }, async () => {
  const h = home();
  block(h, "filer", `export default (sol) => { sol.tool({ name: "go", run: () => "went" }); };`, { room: "big", needs: { why: "to file issues", domains: ["api.github.com"], keys: ["github"], tools: [{ name: "go" }] } });
  block(h, "other", null, { room: "big", needs: { why: "x", keys: ["github"] } });
  const k = new Kernel(h, opts(h));
  await k.sync();
  const card = k.waiting("filer")!;
  assert.deepEqual(card.missing, ["github"]);
  assert.deepEqual(card.keys[0].also, ["other"], "one key, two blocks: said on the card");
  assert.match(card.plain.join("\n"), /also used by other/);
  const r = await k.approve("filer", card.print);
  assert.equal(r.ok, true);
  assert.match(k.state("filer")?.why ?? "", /waiting for the key github: a person pastes it on its card/, "pressed, but no key yet");
  assert.deepEqual(k.waiting("filer")?.missing, ["github"]);
  pasteKey(join(h, "app"), { name: "github", key: "ghp_x", hosts: ["api.github.com"] });
  await k.sync();
  assert.equal(k.state("filer")?.state, "loaded", "the key pasted: it loads at the next look");
  assert.deepEqual(k.keys().map((x) => [x.name, x.users]), [["github", ["filer", "other"]]], "who uses it, by the home as it is");
  const inst = await k.install("filer");
  assert.equal(inst.status, "restart", "started once at install, then put away: " + inst.say);
  assert.ok(kinds(k, "filer", "plugin.wake").length >= 1 && kinds(k, "filer", "plugin.sleep").length >= 1);
  assert.equal(text(await k.runTool(toolName("filer", "go"), {})), "went");
  removeKey(join(h, "app"), "github");
  await k.sync();
  assert.match(k.state("filer")?.why ?? "", /waiting for the key github/);
  await k.stop();
});

test("a big room that cannot start is said by install, not at its first use", { skip: !mac }, async () => {
  const h = home();
  block(h, "bad", `throw new Error("nope at load");`, { room: "big", needs: { why: "x", tools: [{ name: "go" }] } });
  const k = new Kernel(h, opts(h));
  await k.sync();
  await k.approve("bad", k.waiting("bad")!.print);
  assert.equal(k.state("bad")?.state, "loaded", "nothing started yet");
  const r = await k.install("bad");
  assert.equal(r.status, "failed");
  assert.match(r.say, /its room would not start: .*nope at load/);
  await k.stop();
});

test("an engine write never follows a link a seat planted: a data folder swapped for a link into Sol's folder is refused, a linked data file reads as never written; a press goes with its block", async () => {
  const h = home();
  block(h, "keeper", `export default (sol) => {
    sol.tool({ name: "put", run: () => { try { sol.write("evil", { domains: ["x.example"], big: true }); return "wrote"; } catch (e) { return "refused: " + e.message; } } });
    sol.tool({ name: "get", run: () => JSON.stringify(sol.read("peek")) });
  };`, { stores: ["evil"], reads: ["peek"] });
  block(h, "ear", null, { hears: ["seat.turn"] });
  const k = new Kernel(h, opts(h));
  await k.sync();
  const approved = join(h, "app", "approved");
  mkdirSync(approved, { recursive: true });
  mkdirSync(join(h, "data"), { recursive: true });
  symlinkSync(approved, join(h, "data", "keeper"));
  assert.match(text(await k.runTool(toolName("keeper", "put"), {})), /refused: .*leads outside/);
  assert.ok(!existsSync(join(approved, "evil.json")), "nothing written into Sol's folder");
  writeFileSync(join(h, "app", "secret.json"), '{"s":1}');
  symlinkSync(join(h, "app", "secret.json"), join(h, "data", "peek.json"));
  assert.equal(text(await k.runTool(toolName("keeper", "get"), {})), "null", "a link reads as nothing");
  await k.approve("ear", k.waiting("ear")!.print);
  assert.ok(readPress(join(h, "app"), h, "ear"));
  rmSync(join(h, "things", "ear"), { recursive: true });
  await k.sync();
  assert.equal(readPress(join(h, "app"), h, "ear"), null, "gone from the home: its press too");
  block(h, "ear", null, { hears: ["seat.turn"] });
  await k.sync();
  assert.match(k.state("ear")?.why ?? "", /waiting for a person to press its card/, "a new block under the old id is asked again");
  await k.stop();
});

test("a fetch is one line on the log, never the key; the scope the service says is kept on the key once", { skip: !mac }, async () => {
  const h = home();
  pasteKey(join(h, "app"), { name: "github", key: "ghp_TESTKEY_123456", hosts: ["api.github.com"] });
  block(h, "asker", `export default (sol) => { sol.tool({ name: "go", run: async () => JSON.stringify(await sol.fetch("https://api.github.com/user", { key: "github" })) }); };`, { room: "big", needs: { why: "x", domains: ["api.github.com"], keys: ["github"], tools: [{ name: "go" }] } });
  let sent = "";
  useSend(async (_u, init) => { sent = init.headers.authorization; return { status: 200, headers: { "x-oauth-scopes": "repo, workflow" }, body: '{"login":"x"}' }; });   // the engine's sender (bigroom.ts), not the network
  try {
    const k = new Kernel(h, opts(h));
    await k.sync();
    await k.approve("asker", k.waiting("asker")!.print);
    const r = JSON.parse(text(await k.runTool(toolName("asker", "go"), {})));
    assert.equal(r.status, 200);
    assert.equal(sent, "Bearer ghp_TESTKEY_123456", "the engine put the key in");
    assert.deepEqual(kinds(k, "asker", "plugin.fetched").map((e) => e.value), [{ host: "api.github.com", key: "github", status: 200, out: true }]);
    assert.ok(!JSON.stringify(k.since()).includes("ghp_TESTKEY"), "never the key on the log");
    assert.equal(keyMeta(join(h, "app"), "github")?.scope, "repo, workflow");
    await k.stop();
  } finally { useSend(null); }
});
