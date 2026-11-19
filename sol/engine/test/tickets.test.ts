// The ticket store (tickets.ts): one file per ticket under <STATE_DIR>/tickets, the contract in ticketTypes.ts.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "sol-tickets-"));
process.env.SOL_STATE = join(dir, "work.json");
const T = await import("../src/work/tickets.ts");
const { store, LOG_CAP } = T;
const TD = join(dir, "tickets");

// a clock that moves a second at every look, so "newest first" is never a tie of the same millisecond
let clock = 1_800_000_000_000;
Date.now = () => (clock += 1000);

beforeEach(() => { rmSync(TD, { recursive: true, force: true }); store._reload(); });

const onDisk = (id: string) => JSON.parse(readFileSync(join(TD, `${id}.json`), "utf8"));
const jsonl = (id: string) => readFileSync(join(TD, `${id}.log.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("store is the same functions as the named exports", () => {
  for (const k of ["open", "get", "list", "find", "log", "setState", "setMandate", "setExecutor", "setCwd", "setFill", "subscribe", "unsubscribe", "subscribed", "repoint", "ofSession", "brief", "summary", "onChange", "_reload"] as const)
    assert.equal(typeof store[k], "function", k);
  assert.equal(store.open, T.open);
  assert.equal(LOG_CAP, 200);
});

test("open writes one whole file: 8-hex id, number 1, defaults, first log line, a session subscription", () => {
  const t = store.open({ title: "Fix the login redirect", ask: "the login page sends me back to itself", sub: "orch-1" });
  assert.match(t.id, /^[0-9a-f]{8}$/);
  assert.equal(t.n, 1);
  assert.equal(t.state, "open");
  assert.equal(t.summary, "just opened");
  assert.deepEqual(t.mandate, { may: [], mayNot: [], until: "it comes back with what it made and stops", free: "edits" });
  assert.equal(t.log.length, 1);
  assert.equal(t.log[0].kind, "opened");
  assert.equal(t.log[0].text, "opened");
  assert.equal(typeof t.log[0].at, "number");
  assert.deepEqual(t.subs.map((s) => [s.kind, s.key]), [["session", "orch-1"]]);
  assert.deepEqual(t.past, []);
  assert.deepEqual(onDisk(t.id), t);
  assert.deepEqual(readdirSync(TD), [`${t.id}.json`], "no tmp left behind, no index");
  assert.equal(store.open({ title: "b", ask: "" }).subs.length, 0, "no sub given: nobody subscribed");
});

test("open cuts the title to 80 and keeps the ask verbatim up to 4000", () => {
  const ask = "  line one\n\n  line two with  spaces  \n" + "x".repeat(5000);
  const t = store.open({ title: "t".repeat(100), ask });
  assert.equal(t.title.length, 80);
  assert.equal(t.ask, ask.slice(0, 4000));
});

test("open merges the mandate given: lists cut to 12 of 200, where only when absolute", () => {
  const t = store.open({ title: "a", ask: "", mandate: { may: Array.from({ length: 20 }, (_, i) => `${i} ` + "m".repeat(300)), mayNot: ["merge"], free: "ask", where: "relative/path" } });
  assert.equal(t.mandate.may.length, 12);
  assert.ok(t.mandate.may.every((x) => x.length === 200));
  assert.deepEqual(t.mandate.mayNot, ["merge"]);
  assert.equal(t.mandate.free, "ask");
  assert.equal(t.mandate.until, "it comes back with what it made and stops");
  assert.equal("where" in t.mandate, false, "a relative where is dropped");
  assert.equal(store.open({ title: "b", ask: "", mandate: { where: "/home/x/proj" } }).mandate.where, "/home/x/proj");
});

test("numbers are never reused: next is max on disk + 1, also after closed tickets and a restart", () => {
  const a = store.open({ title: "a", ask: "" }), b = store.open({ title: "b", ask: "" });
  store.setState(b.id, { state: "done", by: "person" });
  store._reload();
  assert.equal(store.open({ title: "c", ask: "" }).n, 3);
  rmSync(join(TD, `${a.id}.json`));   // even with a lower one gone
  store._reload();
  assert.equal(store.open({ title: "d", ask: "" }).n, 4);
});

test("get takes the id, the number, \"3\", \"#3\", \"ticket 3\" in any case", () => {
  store.open({ title: "a", ask: "" }); store.open({ title: "b", ask: "" });
  const c = store.open({ title: "c", ask: "" });
  for (const r of [c.id, c.id.toUpperCase(), "3", "#3", "ticket 3", "Ticket #3", "TICKET 3", " #3 "]) assert.equal(store.get(r)?.id, c.id, r);
  assert.equal((store.get as (x: unknown) => any)(3)?.id, c.id);
  assert.equal(store.get("9"), undefined);
  assert.equal(store.get("nonsense"), undefined);
});

test("what get returns is a copy: changing it changes nothing stored", () => {
  const t = store.open({ title: "a", ask: "" });
  const g = store.get(t.id)!;
  g.title = "changed"; g.log.push({ at: 1, by: "person", kind: "words", text: "x" });
  assert.equal(store.get(t.id)!.title, "a");
  assert.equal(store.get(t.id)!.log.length, 1);
});

test("two stores on one folder (a restart) read back identical tickets", () => {
  const a = store.open({ title: "Login redirect", ask: "fix it", sub: "s1", mandate: { may: ["edit"], where: "/p" } });
  store.log(a.id, { by: "executor", kind: "note", text: "found the loop", session: "e1" });
  store.setExecutor(a.id, { sessionId: "e1", cwd: "/p" });
  store.setFill(a.id, 50_000, 200_000);
  store.setState(a.id, { state: "waiting", waitsOn: "your call on the cookie", summary: "found it", by: "executor" });
  const b = store.open({ title: "b", ask: "" });
  const before = store.list({ closed: true });
  store._reload();
  assert.deepEqual(store.list({ closed: true }), before);
  assert.deepEqual(store.get(a.id), before.find((t) => t.id === a.id));
  assert.deepEqual(store.get(b.id), before.find((t) => t.id === b.id));
});

test("list: newest updated first, closed ones only when asked", () => {
  const a = store.open({ title: "a", ask: "" }), b = store.open({ title: "b", ask: "" }), c = store.open({ title: "c", ask: "" });
  store.log(a.id, { by: "person", kind: "words", text: "hello" });
  store.setState(b.id, { state: "dropped", by: "person" });
  assert.deepEqual(store.list().map((t) => t.n), [a.n, c.n]);
  assert.deepEqual(store.list({ closed: true }).map((t) => t.n), [b.n, a.n, c.n]);
});

test("a corrupt file is skipped and left untouched; the others still list", () => {
  const a = store.open({ title: "a", ask: "" });
  const bad = join(TD, "deadbeef.json"), junk = '{"id":"deadbeef","n":7, broken';
  writeFileSync(bad, junk);
  writeFileSync(join(TD, "cafecafe.json"), JSON.stringify({ hello: 1 }));   // parses, but is no ticket
  store._reload();
  assert.deepEqual(store.list().map((t) => t.id), [a.id]);
  assert.equal(store.get("deadbeef"), undefined);
  const b = store.open({ title: "b", ask: "" });
  assert.equal(b.n, 8, "the corrupt one's number is not given again");
  store.log(a.id, { by: "person", kind: "words", text: "x" });
  assert.equal(readFileSync(bad, "utf8"), junk);
  assert.ok(existsSync(join(TD, "cafecafe.json")));
});

test("find: a number or id in the words wins outright", () => {
  const a = store.open({ title: "Fix the login redirect", ask: "" });
  const b = store.open({ title: "Write the login docs", ask: "" });
  assert.deepEqual(store.find("ticket 1 please, the docs one").map((t) => t.id), [a.id]);
  assert.deepEqual(store.find("what about #2").map((t) => t.id), [b.id]);
  assert.deepEqual(store.find("2").map((t) => t.id), [b.id]);
  assert.deepEqual(store.find(`see ${a.id} for login docs`).map((t) => t.id), [a.id]);
  assert.deepEqual(store.find("#9 the login docs").map((t) => t.id)[0], b.id, "an unknown number falls back to the words");
});

test("find: \"the login thing\" reaches its ticket among realistic titles", () => {
  const login = store.open({ title: "Fix the login redirect loop on Safari", ask: "When I sign in on Safari the page reloads forever." });
  store.open({ title: "Draft the November newsletter", ask: "Three items: the release, the meetup, the pricing change." });
  store.open({ title: "Speed up the test suite", ask: "CI takes 14 minutes; get it under 5." });
  const pr = store.open({ title: "Review Frank's PR on the runners", ask: "Check the Legion runner config, nothing merged." });
  assert.deepEqual(store.find("the login thing").map((t) => t.id), [login.id]);
  assert.equal(store.find("how is the newsletter going?")[0]?.title, "Draft the November newsletter");
  assert.equal(store.find("did the runners PR get reviewed")[0]?.id, pr.id);
  assert.equal(store.find("Safari keeps reloading when I sign in")[0]?.id, login.id, "words of the ask count too");
  assert.equal(store.find("logins")[0]?.id, login.id, "a plural reaches the singular");
  assert.deepEqual(store.find("the weather in Lisbon"), [], "nothing shared: nothing");
  assert.deepEqual(store.find("it is the one"), [], "only small and stop words: nothing");
});

test("find: best first, open before closed at equal score, at most 5", () => {
  const closed = store.open({ title: "Login button colour", ask: "" });
  store.setState(closed.id, { state: "done", by: "person" });
  const open = store.open({ title: "Login button size", ask: "" });
  const best = store.open({ title: "Login button colour and size", ask: "" });
  assert.deepEqual(store.find("login button colour size").map((t) => t.id).slice(0, 1), [best.id]);
  const r = store.find("login button");
  assert.ok(r.findIndex((t) => t.id === open.id) < r.findIndex((t) => t.id === closed.id));
  for (let i = 0; i < 8; i++) store.open({ title: `Login button variant ${i}`, ask: "" });
  assert.equal(store.find("login button").length, 5);
});

test("log appends with at, cuts text to 2000", () => {
  const t = store.open({ title: "a", ask: "" });
  const r = store.log(t.id, { by: "executor", kind: "report", text: "y".repeat(3000), session: "e1" });
  const l = r.log[1];
  assert.equal(l.text.length, 2000);
  assert.equal(l.session, "e1");
  assert.ok(l.at > r.log[0].at);
  assert.deepEqual(onDisk(t.id).log, r.log);
  assert.throws(() => store.log("nope", { by: "person", kind: "words", text: "x" }), /no ticket/);
});

test("300 log lines keep the file at the cap; the jsonl holds the rest, oldest first and in order", () => {
  const t = store.open({ title: "a", ask: "" });
  for (let i = 0; i < 300; i++) store.log(t.id, { by: "executor", kind: "report", text: `line ${i}` });
  const f = onDisk(t.id);
  assert.equal(f.log.length, LOG_CAP);
  assert.equal(f.log[f.log.length - 1].text, "line 299");
  const out = jsonl(t.id);
  assert.equal(out.length + f.log.length, 301);
  assert.deepEqual([...out, ...f.log].map((l) => l.text), ["opened", ...Array.from({ length: 300 }, (_, i) => `line ${i}`)]);
  const ats = [...out, ...f.log].map((l) => l.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
});

test("setState: from → to logged, summary one line of 160, waitsOn only with waiting", () => {
  const t = store.open({ title: "a", ask: "" });
  let r = store.setState(t.id, { state: "waiting", waitsOn: "your pick\nof colour", summary: "line\n  two " + "s".repeat(300), by: "executor" });
  assert.equal(r.state, "waiting");
  assert.equal(r.waitsOn, "your pick of colour");
  assert.equal(r.summary.length, 160);
  assert.ok(!r.summary.includes("\n"));
  assert.ok(r.summary.startsWith("line two s"));
  assert.match(r.log.at(-1)!.text, /^open → waiting/);
  assert.equal(r.log.at(-1)!.kind, "state");
  r = store.setState(t.id, { state: "working", by: "engine" });
  assert.equal(r.waitsOn, undefined);
  assert.equal("waitsOn" in onDisk(t.id), false);
  assert.ok(r.summary.startsWith("line two"), "no summary given: the old one stays");
  assert.match(r.log.at(-1)!.text, /^waiting → working/);
});

test("setState: a closed ticket changes state only by a reopen", () => {
  const t = store.open({ title: "a", ask: "" });
  store.setState(t.id, { state: "done", summary: "made it", by: "person" });
  const n = store.get(t.id)!.log.length;
  for (const s of ["working", "waiting", "dropped"] as const) assert.equal(store.setState(t.id, { state: s, summary: "late", by: "executor" }).state, "done");
  assert.equal(store.get(t.id)!.summary, "made it");
  assert.equal(store.get(t.id)!.log.length, n, "a refused change writes nothing");
  const r = store.setState(t.id, { state: "open", by: "person" });
  assert.equal(r.state, "open");
  assert.match(r.log.at(-1)!.text, /^done → open/);
});

test("setMandate merges and logs what changed in words", () => {
  const t = store.open({ title: "a", ask: "", mandate: { may: ["edit files"] } });
  const r = store.setMandate(t.id, { mayNot: ["merge", "push to main"], until: "a draft PR", where: "/home/m/proj" }, "person");
  assert.deepEqual(r.mandate.may, ["edit files"]);
  assert.deepEqual(r.mandate.mayNot, ["merge", "push to main"]);
  assert.equal(r.mandate.until, "a draft PR");
  assert.equal(r.mandate.where, "/home/m/proj");
  const l = r.log.at(-1)!;
  assert.equal(l.kind, "mandate");
  assert.equal(l.by, "person");
  assert.match(l.text, /may not now: merge, push to main/);
  assert.match(l.text, /until: a draft PR/);
  assert.match(l.text, /where: \/home\/m\/proj/);
  assert.doesNotMatch(l.text, /may now/);
  const n = r.log.length;
  assert.equal(store.setMandate(t.id, { until: "a draft PR" }, "person").log.length, n, "nothing changed: nothing logged");
  assert.equal(store.setMandate(t.id, { free: "ask" }, "person").log.at(-1)!.text, "how free: asks before every step");
});

test("setExecutor: the first is copy 1; a replaced one goes to past with its fill and why", () => {
  const t = store.open({ title: "a", ask: "" });
  let r = store.setExecutor(t.id, { sessionId: "e1", cwd: "/w/a" });
  assert.equal(r.executor?.n, 1);
  assert.equal(r.executor?.sessionId, "e1");
  assert.equal(r.log.at(-1)!.text, "copy 1 started in /w/a");
  assert.equal(r.log.at(-1)!.kind, "executor");
  const started = r.executor!.at;
  store.setFill(t.id, 180_000, 200_000);
  r = store.setExecutor(t.id, { sessionId: "e2", cwd: "/w/a" }, { why: "full", noted: true });
  assert.equal(r.executor?.n, 2);
  assert.match(r.log.at(-1)!.text, /^copy 2 started in \/w\/a/);
  assert.equal(r.past.length, 1);
  const p = r.past[0];
  assert.deepEqual({ ...p, to: 0 }, { sessionId: "e1", from: started, to: 0, context: 180_000, window: 200_000, why: "full", noted: true });
  assert.ok(p.to > p.from);
  r = store.setExecutor(t.id, { sessionId: "e3", cwd: "/w/a" });
  assert.deepEqual([r.past[1].why, r.past[1].noted, r.past[1].context], ["lost", false, 0], "defaults: lost, not noted, no fill");
  assert.equal(r.executor?.n, 3);
});

test("setExecutor null: the current goes to past, none after; the same session again is no new copy", () => {
  const t = store.open({ title: "a", ask: "" });
  store.setExecutor(t.id, { sessionId: "e1", cwd: "/w" });
  const n = store.get(t.id)!.log.length;
  assert.equal(store.setExecutor(t.id, { sessionId: "e1", cwd: "/w" }).log.length, n);
  const r = store.setExecutor(t.id, null, { why: "asked", noted: false });
  assert.equal(r.executor, undefined);
  assert.equal("executor" in onDisk(t.id), false);
  assert.equal(r.past[0].why, "asked");
  assert.match(r.log.at(-1)!.text, /copy 1 stopped/);
  assert.equal(store.setExecutor(t.id, { sessionId: "e2", cwd: "/w" }).executor?.n, 2);
});

test("setCwd records where the current executor really works: absolute only, no executor no change, no log line, read back after a restart", () => {
  const t = store.open({ title: "a", ask: "", mandate: { where: "/src/repo" } });
  let writes = 0;
  const off = store.onChange(() => writes++);
  store.setCwd(t.id, "/src/repo/.claude/worktrees/side-1");
  assert.equal(writes, 0, "no executor: nothing to record");
  assert.equal(store.get(t.id)!.executor, undefined);
  store.setExecutor(t.id, { sessionId: "e1", cwd: "/src/repo" });
  writes = 0;
  const lines = store.get(t.id)!.log.length;
  store.setCwd(t.id, "relative/side");
  store.setCwd(t.id, "/src/repo");
  assert.equal(writes, 0, "a relative path, or the same folder: nothing written");
  store.setCwd("#1", "/src/repo/.claude/worktrees/side-1");
  assert.equal(writes, 1);
  assert.equal(onDisk(t.id).executor.cwd, "/src/repo/.claude/worktrees/side-1");
  assert.equal(onDisk(t.id).executor.n, 1, "the same copy");
  assert.equal(onDisk(t.id).log.length, lines, "no log line: the start line said where it began");
  store._reload();
  assert.equal(store.get(1)!.executor!.cwd, "/src/repo/.claude/worktrees/side-1");
  assert.throws(() => store.setCwd("#9", "/x"), /no ticket #9/);
  off();
});

test("brief with next: read before setExecutor for the copy that replaces the current one, it names the number setExecutor then gives", () => {
  const t = store.open({ title: "a", ask: "the ask" });
  store.setExecutor(t.id, { sessionId: "e1", cwd: "/w" });
  assert.match(store.brief(t.id), /- this is copy 1 of its executor$/m);
  const next = store.brief(t.id, undefined, { why: "full", noted: true });
  assert.match(next, /- this is copy 2 of its executor; copy 1 was replaced because its talk was full, after writing its closing note$/m);
  const after = store.setExecutor(t.id, { sessionId: "e2", cwd: "/w" }, { why: "full", noted: true });
  assert.equal(after.executor!.n, 2);
  assert.match(store.brief(t.id), /- this is copy 2 of its executor; copy 1 was replaced because its talk was full, after writing its closing note$/m, "the same words once it is recorded");
  assert.match(store.brief(t.id, undefined, { why: "asked", noted: false }), /- this is copy 3 of its executor; copy 2 was replaced because it was asked for, without a closing note$/m);
  const none = store.open({ title: "b", ask: "" });
  assert.match(store.brief(none.id, undefined, { why: "lost", noted: false }), /- this is copy 1 of its executor$/m, "no executor to replace: next changes nothing");
});

test("setFill stores context and window, and writes only when the numbers changed", () => {
  const t = store.open({ title: "a", ask: "" });
  let writes = 0;
  const off = store.onChange(() => writes++);
  store.setFill(t.id, 1, 2);
  assert.equal(writes, 0, "no executor: nothing to fill");
  store.setExecutor(t.id, { sessionId: "e1", cwd: "/w" });
  writes = 0;
  store.setFill(t.id, 1000, 200_000);
  store.setFill(t.id, 1000, 200_000);
  assert.equal(writes, 1);
  assert.deepEqual([onDisk(t.id).executor.context, onDisk(t.id).executor.window], [1000, 200_000]);
  store.setFill(t.id, 2000, 200_000);
  assert.equal(writes, 2);
  off();
});

test("ofSession: the ticket whose current executor is that session, never a past one", () => {
  const a = store.open({ title: "a", ask: "" }), b = store.open({ title: "b", ask: "" });
  store.setExecutor(a.id, { sessionId: "e1", cwd: "/w" });
  store.setExecutor(b.id, { sessionId: "e2", cwd: "/w" });
  assert.equal(store.ofSession("e1")?.id, a.id);
  assert.equal(store.ofSession("e2")?.id, b.id);
  store.setExecutor(a.id, { sessionId: "e3", cwd: "/w" }, { why: "full", noted: true });
  assert.equal(store.ofSession("e1"), undefined);
  assert.equal(store.ofSession("e3")?.id, a.id);
});

test("subscribe is idempotent per kind and key; unsubscribe removes; subscribed is open tickets only", () => {
  const a = store.open({ title: "a", ask: "", sub: "s1" }), b = store.open({ title: "b", ask: "" });
  store.subscribe(a.id, { kind: "session", key: "s1" });
  store.subscribe(a.id, { kind: "thread", key: "s1" });
  assert.equal(store.get(a.id)!.subs.length, 2);
  store.subscribe(b.id, { kind: "session", key: "s1" });
  assert.deepEqual(store.subscribed("session", "s1").map((t) => t.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(store.subscribed("thread", "s1").map((t) => t.id), [a.id]);
  store.setState(b.id, { state: "done", by: "person" });
  assert.deepEqual(store.subscribed("session", "s1").map((t) => t.id), [a.id]);
  store.unsubscribe(a.id, { kind: "session", key: "s1" });
  assert.deepEqual(store.subscribed("session", "s1"), []);
  assert.deepEqual(store.get(a.id)!.subs.map((s) => s.kind), ["thread"]);
});

test("repoint moves every matching subscription, merges duplicates, counts tickets; the old key hears nothing", () => {
  const a = store.open({ title: "a", ask: "", sub: "old" });
  const b = store.open({ title: "b", ask: "", sub: "old" });
  store.subscribe(b.id, { kind: "session", key: "new" });       // already hears the new key: merged, not doubled
  store.subscribe(b.id, { kind: "thread", key: "old" });        // another kind: left alone
  const c = store.open({ title: "c", ask: "", sub: "other" });
  assert.equal(store.repoint("session", "old", "new"), 2);
  assert.deepEqual(store.subscribed("session", "old"), []);
  assert.deepEqual(store.subscribed("session", "new").map((t) => t.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(store.get(b.id)!.subs.map((s) => `${s.kind}:${s.key}`).sort(), ["session:new", "thread:old"]);
  assert.deepEqual(store.get(c.id)!.subs.map((s) => s.key), ["other"]);
  store._reload();
  assert.deepEqual(store.subscribed("session", "old"), [], "and after a restart");
  assert.equal(store.repoint("session", "old", "new"), 0);
});

test("brief: the sections in order, the ask verbatim, notes newest last, the log tail with time and who", () => {
  const ask = "Fix the login loop.\n\nIt happens on Safari only.\n  - keep the cookie";
  const t = store.open({ title: "Login loop", ask, mandate: { may: ["edit files"], mayNot: ["merge"], until: "a draft PR", where: "/home/m/app", free: "ask" } });
  store.log(t.id, { by: "person", kind: "words", text: "start with the redirect" });
  store.log(t.id, { by: "executor", kind: "note", text: "the redirect checks the wrong cookie" });
  store.log(t.id, { by: "executor", kind: "note", text: "fixed in auth.ts" });
  store.setExecutor(t.id, { sessionId: "e1", cwd: "/home/m/app" });
  store.setExecutor(t.id, { sessionId: "e2", cwd: "/home/m/app" }, { why: "full", noted: true });
  store.setState(t.id, { state: "waiting", waitsOn: "your try on Safari", summary: "fixed, needs a try", by: "executor" });
  const b = store.brief(t.id);
  const at = (s: string) => { const i = b.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(b.startsWith(`# Ticket #${t.n}: Login loop`));
  const order = ["## The ask (the person's words)", "## Mandate", "## Where it stands", "## Notes", "## Log"].map(at);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.ok(b.includes(ask), "the ask verbatim");
  for (const s of ["may: edit files", "may not: merge", "until: a draft PR", "where: /home/m/app", "how free: ask before every step",
    "state: waiting (waits on: your try on Safari)", "summary: fixed, needs a try", "copy 2", "its talk was full"]) at(s);
  assert.ok(at("the redirect checks the wrong cookie") < at("fixed in auth.ts"), "notes newest last");
  const logPart = b.slice(at("## Log"));
  assert.doesNotMatch(logPart, /wrong cookie/, "notes are not repeated in the log");
  assert.match(logPart, /- \d{4}-\d\d-\d\d \d\d:\d\d person words: start with the redirect/);
});

test("brief over max: ask and mandate whole, the log tail goes first, then the oldest notes, with a line saying so", () => {
  const ask = "A".repeat(4000);
  const t = store.open({ title: "big", ask, mandate: { may: ["edit"], until: "a draft PR" } });
  for (let i = 0; i < 40; i++) store.log(t.id, { by: "executor", kind: "note", text: `note ${i} ` + "n".repeat(100) });
  for (let i = 0; i < 150; i++) store.log(t.id, { by: "executor", kind: "report", text: `report ${i} ` + "r".repeat(100) });
  const b = store.brief(t.id);
  assert.ok(b.length <= 6000, String(b.length));
  assert.ok(b.includes(ask));
  assert.ok(b.includes("until: a draft PR"));
  assert.ok(b.includes("note 39 "), "the newest note stays");
  assert.ok(!b.includes("note 0 "), "the oldest note went");
  assert.ok(!b.includes("report 149"), "the log tail went before the notes");
  assert.match(b, /\d+ older lines left out here; the full log is in .*tickets\/[0-9a-f]{8}\.json/);
  // room enough for notes and some log: only the oldest log lines go
  const c = store.brief(t.id, 30_000);
  assert.ok(c.includes("report 149") && c.includes("note 0 "));
  const d = store.brief(t.id, 10_500);
  assert.ok(d.length <= 10_500);
  assert.ok(d.includes("note 0 ") && d.includes("report 149") && !d.includes("report 0 "));
});

test("brief names the jsonl when lines were pushed out of the ticket", () => {
  const t = store.open({ title: "a", ask: "" });
  for (let i = 0; i < 210; i++) store.log(t.id, { by: "engine", kind: "report", text: `x${i}` });
  assert.match(store.brief(t.id), /\.log\.jsonl\)/);
});

test("summary: waiting first with what it waits on, then working, then open, newest first inside, then the closed count", () => {
  assert.equal(store.summary(), "no tickets yet");
  const o1 = store.open({ title: "Open old", ask: "" });
  const w1 = store.open({ title: "Work old", ask: "" });
  const o2 = store.open({ title: "Open new", ask: "" });
  const q = store.open({ title: "Wait", ask: "" });
  const w2 = store.open({ title: "Work new", ask: "" });
  const d = store.open({ title: "Done", ask: "" });
  store.setState(w1.id, { state: "working", summary: "on it", by: "engine" });
  store.setState(q.id, { state: "waiting", waitsOn: "your pick", summary: "two ways", by: "executor" });
  store.setState(w2.id, { state: "working", summary: "on it too", by: "engine" });
  store.setState(d.id, { state: "done", by: "person" });
  store.log(o2.id, { by: "person", kind: "words", text: "x" });
  assert.equal(store.summary(), [
    `#${q.n} [waiting] Wait: two ways (waits on: your pick)`,
    `#${w2.n} [working] Work new: on it too`,
    `#${w1.n} [working] Work old: on it`,
    `#${o2.n} [open] Open new: just opened`,
    `#${o1.n} [open] Open old: just opened`,
    "1 closed",
  ].join("\n"));
});

test("summary with 200 tickets stays under max: lines shortened, the oldest open ones collapse, waiting ones kept", () => {
  for (let i = 0; i < 200; i++) {
    const t = store.open({ title: `Ticket number ${i} about ` + "word ".repeat(20), ask: "A".repeat(4000) });
    if (i % 10 === 0) store.setState(t.id, { state: "done", by: "person" });
    else if (i === 5) store.setState(t.id, { state: "waiting", waitsOn: "the long wait " + "w".repeat(150), summary: "s".repeat(160), by: "executor" });
    else store.setState(t.id, { state: "working", summary: "s".repeat(160), by: "executor" });
  }
  const s = store.summary();
  assert.ok(s.length <= 1200, String(s.length));
  const lines = s.split("\n");
  assert.match(lines[0], /^#6 \[waiting\] .*waits on:/);
  assert.match(lines.at(-2)!, /^and \d+ more open \(tickets with find, or ticket_read by number\)$/);
  assert.equal(lines.at(-1), "20 closed");
  const shown = lines.length - 2, more = Number(/and (\d+)/.exec(lines.at(-2)!)![1]);
  assert.equal(shown + more, 180);
  for (const max of [300, 100, 40]) assert.ok(store.summary(max).length <= max, String(max));
  // shortened lines alone are enough for a few tickets: nothing collapses
  rmSync(TD, { recursive: true, force: true }); store._reload();
  for (let i = 0; i < 8; i++) store.open({ title: "T".repeat(80), ask: "" });
  const few = store.summary(560);   // 8 full lines need ~830, shortened ~520
  assert.ok(few.length <= 560 && few.includes("…"));
  assert.doesNotMatch(few, /more open/);
});

test("brief with 200 tickets and a 4000-letter ask stays under its max", () => {
  let last = "";
  for (let i = 0; i < 200; i++) last = store.open({ title: `t${i}`, ask: "Q".repeat(4000) }).id;
  for (let i = 0; i < 199; i++) store.log(last, { by: "executor", kind: i % 3 ? "report" : "note", text: "z".repeat(500) });
  const b = store.brief(last);
  assert.ok(b.length <= 6000, String(b.length));
  assert.ok(b.includes("Q".repeat(4000)));
});

test("onChange hears every write with the ticket; a throwing listener breaks nothing; off stops it", () => {
  const heard: string[] = [];
  const off1 = store.onChange(() => { throw new Error("boom"); });
  const off2 = store.onChange((t) => heard.push(`${t.n}:${t.state}`));
  const t = store.open({ title: "a", ask: "" });
  store.log(t.id, { by: "person", kind: "words", text: "x" });
  store.setState(t.id, { state: "working", by: "engine" });
  store.setMandate(t.id, { may: ["x"] }, "person");
  store.subscribe(t.id, { kind: "session", key: "k" });
  assert.deepEqual(heard, ["1:open", "1:open", "1:working", "1:working", "1:working"]);
  assert.equal(onDisk(t.id).subs.length, 1, "the write went through despite the throw");
  off1(); off2();
  store.log(t.id, { by: "person", kind: "words", text: "y" });
  assert.equal(heard.length, 5);
});

test("a ticket file left by an older hand without subs or past still reads", () => {
  mkdirSync(TD, { recursive: true });
  writeFileSync(join(TD, "0badf00d.json"), JSON.stringify({ id: "0badf00d", n: 4, title: "hand made", ask: "x", state: "open", log: [], at: 1, updatedAt: 1 }));
  store._reload();
  const t = store.get("#4")!;
  assert.deepEqual([t.subs, t.past, t.mandate.free], [[], [], "edits"]);
  assert.equal(store.subscribe(t.id, { kind: "session", key: "s" }).subs.length, 1);
  assert.match(store.summary(), /#4 \[open\] hand made/);
});
