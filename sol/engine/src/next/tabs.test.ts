// Tabs on the canvas (next/tabs.ts, parts/next-tabs.ts, next/tabs-tool.ts; #1615 BR1), on a temp SOL_HOME: a tab opens
// once per piece, the Canvas is never kept or closed, closing the front tab brings the Canvas forward, an AI's tab arrives
// in the background marked fresh, the person's tabs count toward today's offer and "Keep in place" quiets it for the day,
// a broken file is set aside. With ui.next off the part answers nothing and writes nothing; another connection is
// refused. The three verbs are handed to the windows and refused while ui.next is off.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "sol-next-tabs-"));
process.env.SOL_SETTINGS = join(tmp, "settings.json");
const wasEnv = process.env.SOL_UI_NEXT;
after(() => { rmSync(tmp, { recursive: true, force: true }); if (wasEnv === undefined) delete process.env.SOL_UI_NEXT; else process.env.SOL_UI_NEXT = wasEnv; });

const T = await import("./tabs.js");
const part = (await import("../parts/next-tabs.js")).default;
const tool = await import("./tabs-tool.js");

let n = 0;
const home = () => join(tmp, `h${++n}`);
const ok = <X,>(r: ({ ok: true } & X) | { ok: false; why: string }): X => { assert.ok(r.ok, (r as { why?: string }).why); return r as X; };
const DAY = new Date(2026, 10, 21, 10).getTime();

test("one tab per piece; the Canvas is first and never kept; closing the front tab brings the Canvas forward", () => {
  const h = home();
  ok(T.openTab(h, { id: "s1", by: "person", kind: "session", front: true }, DAY));
  ok(T.openTab(h, { id: "s2", by: "person", kind: "session" }, DAY));
  const again = ok(T.openTab(h, { id: "s1", by: "person", kind: "session" }, DAY));
  assert.deepEqual(again.tabs.map((t) => t.id), ["s1", "s2"]);
  assert.equal(again.front, "s1");
  assert.equal(again.taken.session.n, 2, "a tab opened again is not counted twice");
  assert.equal(T.openTab(h, { id: "canvas", by: "person" }).ok, false);
  assert.equal(T.closeTab(h, { id: "canvas" }).ok, false);
  const closed = T.closeTab(h, { id: "s1" });
  assert.ok(closed.ok);
  assert.equal(ok(closed).front, null, "the Canvas is in front");
  assert.equal((closed as { closed?: { id: string } }).closed?.id, "s1");
  assert.deepEqual(T.readTabs(h).tabs.map((t) => t.id), ["s2"]);
  assert.equal(ok(T.frontTab(h, { id: "s2" })).front, "s2");
  assert.equal(ok(T.frontTab(h, { id: "canvas" })).front, null);
  assert.equal(T.frontTab(h, { id: "nope" }).ok, false);
});

test("an AI's tab arrives in the background, fresh, and is fresh no longer once in front; it never counts toward the offer", () => {
  const h = home();
  ok(T.openTab(h, { id: "s1", by: "person", kind: "session", front: true }, DAY));
  const r = ok(T.openTab(h, { id: "rex", by: "ai", kind: "session", front: true }, DAY));
  assert.equal(r.front, "s1", "an AI never takes the front here");
  assert.equal(r.tabs[1].fresh, true);
  assert.equal(r.taken.session.n, 1);
  const f = ok(T.frontTab(h, { id: "rex" }));
  assert.equal(f.tabs[1].fresh, undefined);
  assert.equal(T.openTab(h, { id: "x", by: "someone" }).ok, false);
});

test("four of a kind taken out in a day makes the offer; Keep in place quiets it for the day; a new day starts again", () => {
  const h = home();
  for (const id of ["a", "b", "c"]) ok(T.openTab(h, { id, by: "person", kind: "session" }, DAY));
  assert.deepEqual(T.offerable(T.readTabs(h), DAY), []);
  ok(T.openTab(h, { id: "d", by: "person", kind: "session" }, DAY));
  ok(T.openTab(h, { id: "p", by: "person", kind: "page" }, DAY));
  assert.deepEqual(T.offerable(T.readTabs(h), DAY), ["session"]);
  ok(T.quietTabs(h, { kind: "session" }, DAY));
  assert.deepEqual(T.offerable(T.readTabs(h), DAY), []);
  const next = DAY + 24 * 3600_000;
  ok(T.openTab(h, { id: "e", by: "person", kind: "session" }, next));
  assert.equal(T.readTabs(h).taken.session.n, 1, "the count starts again the next day");
  assert.equal(T.quietTabs(h, { kind: "Not a kind!" }).ok, false);
});

test("a starter swapped into its session counts once, as a session; its tab keeps the place in the row and the front", () => {
  const h = home();
  ok(T.openTab(h, { id: "s1", by: "person", kind: "session" }, DAY));
  ok(T.openTab(h, { id: "st-1", by: "person", kind: "page", front: true }, DAY));
  ok(T.openTab(h, { id: "s2", by: "person", kind: "session" }, DAY));
  const r = ok(T.openTab(h, { id: "real-1", by: "person", kind: "session", front: true, swapped: "st-1" }, DAY));
  assert.deepEqual(r.tabs.map((t) => t.id), ["s1", "real-1", "s2"], "in the starter's place");
  assert.equal(r.front, "real-1");
  assert.equal(r.taken.session.n, 3);
  assert.equal(r.taken.page.n, 0, "the starter's tab is not counted as a page");
  const c = T.closeTab(h, { id: "st-1" });
  assert.ok(c.ok);
  assert.equal((c as { closed?: unknown }).closed, undefined, "the close after the swap finds nothing to close");
  assert.deepEqual(T.readTabs(h).tabs.map((t) => t.id), ["s1", "real-1", "s2"]);
  const y = ok(T.openTab(h, { id: "real-2", by: "person", kind: "session", swapped: "not-open" }, DAY));
  assert.equal(y.taken.session.n, 4, "a swap from no tab is an ordinary open");
});

test("a broken file is set aside, never thrown away, and the tabs start fresh", () => {
  const h = home();
  mkdirSync(join(h, "next"), { recursive: true });
  writeFileSync(T.tabsFile(h), "{ not json");
  const r = ok(T.openTab(h, { id: "s1", by: "person" }, DAY));
  assert.match(r.aside ?? "", /^tabs\.broken-/);
  assert.ok(readdirSync(join(h, "next")).some((f) => f.startsWith("tabs.broken-")));
  assert.deepEqual(T.readTabs(h).tabs.map((t) => t.id), ["s1"]);
});

test("the part: off, nothing answered or written; on, only Sol's windows, and every window hears the row after a change", async () => {
  const h = home(), hs = new Map<string, (m: unknown, c: unknown) => Promise<void>>(), sent: any[] = [], told: any[] = [];
  part({ on: (t: string, f: never) => hs.set(t, f), atStart: () => {}, route: () => {} } as never);
  const conn = (fromSol: boolean) => ({ HOME: h, PORT: 0, ws: {}, send() {}, everyone: (m: object) => told.push(m), face: { send: (m: object) => sent.push(m) }, conn: { chars: 0 }, fromSol, fromApp: fromSol });
  const ask = async (m: any, fromSol = true) => { sent.length = 0; await hs.get(m.type)!(m, conn(fromSol)); return sent.at(-1); };
  process.env.SOL_UI_NEXT = "off";
  assert.equal(await ask({ type: "next.tab.open", id: "s1", by: "person" }), undefined);
  assert.equal(existsSync(T.tabsFile(h)), false);
  process.env.SOL_UI_NEXT = "on";
  const no = await ask({ type: "next.tab.open", id: "s1", by: "person" }, false);
  assert.deepEqual(no, { type: "next.tab.open", ok: false, why: "only Sol's own windows" });
  assert.equal(existsSync(T.tabsFile(h)), false);
  const yes = await ask({ type: "next.tab.open", rid: 7, id: "s1", by: "person", kind: "session", front: true });
  assert.equal(yes.rid, 7);
  assert.equal(yes.front, "s1");
  assert.equal(told.at(-1).type, "next.tabs");
  assert.deepEqual(told.at(-1).tabs.map((t: { id: string }) => t.id), ["s1"]);
  assert.equal((await ask({ type: "next.tabs" })).tabs.length, 1);
  await ask({ type: "next.tab.close", id: "s1" });
  assert.deepEqual(told.at(-1).tabs, []);
  assert.equal(told.at(-1).closed, undefined, "every window hears the row, not the closed tab");
});

test("the three verbs are handed to the windows; refused while ui.next is off or with no piece", async () => {
  const told: any[] = [], to = (m: object) => told.push(m);
  process.env.SOL_UI_NEXT = "off";
  assert.equal(tool.tabsToolsNow().length, 0);
  assert.ok((await tool.runTabsTool("take_to_tab", { piece: "Rex" }, {}, to)).isError);
  process.env.SOL_UI_NEXT = "on";
  assert.deepEqual(tool.tabsToolsNow().map((t) => t.name), ["open_piece", "take_to_tab", "put_back"]);
  const r = await tool.runTabsTool("take_to_tab", { piece: "Rex", front: true }, {}, to);
  assert.ok(!r.isError, r.content[0].text);
  assert.deepEqual(told.at(-1), { type: "next.tab.ai", verb: "tab", piece: "Rex", front: true });
  await tool.runTabsTool("put_back", { piece: "Rex" }, {}, to);
  assert.deepEqual(told.at(-1), { type: "next.tab.ai", verb: "back", piece: "Rex" });
  await tool.runTabsTool("open_piece", {}, { sessionId: "sess-1" }, to);
  assert.deepEqual(told.at(-1), { type: "next.tab.ai", verb: "open", piece: "sess-1" });
  assert.ok((await tool.runTabsTool("put_back", {}, {}, to)).isError);
  assert.ok((await tool.runTabsTool("take_to_tab", { piece: "Rex" }, {}, null)).isError, "no window: not done");
});
