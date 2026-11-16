// The used-Cowork mark (#431): which tool calls count as a real use, the reply after a read wearing the mark (and only
// that reply, once), the project's per-writer monthly marks (once a part a day, a file someone else wrote started again,
// one not written by its name ignored on a read), who used what lately, and the `cowork.used` count with words only.
// A fake record with a real compare-and-swap; nothing reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TZ = "UTC";
const dir = mkdtempSync(join(tmpdir(), "sol-used-"));
process.env.SOL_STATE = join(dir, "work.json");
writeFileSync(join(dir, "team.json"), JSON.stringify({ me: { login: "frank", name: "Frank" }, repos: [] }));
process.env.SOL_TEAM = join(dir, "team.json");
process.env.SOL_TEAM_OFFLINE = "1";
const U = await import("../src/team/used.ts");
const { Items } = await import("../src/work/items.ts");
const { badProp } = await import("../src/track.ts");

const AT = Date.UTC(2026, 9, 30, 14, 5);   // 2026-10-30T14:05Z
const ghError = (word: string) => Object.assign(new Error(word.split("\n")[0]), { full: word });
const b64 = (s: string) => Buffer.from(s).toString("base64");

function fakeRecord(me = "frank") {
  const files = new Map<string, { text: string; sha: string; by: string }>();
  let n = 0;
  const messages: string[] = [];
  const rec = { files: {
    branch: async () => "main",
    readSha: async (_r: string, path: string) => {
      const f = files.get(path);
      if (!f) throw ghError("gh: Not Found (HTTP 404)");
      return JSON.stringify({ sha: f.sha, content: b64(f.text), by: f.by });
    },
    putBody: async (_r: string, path: string, w: { content: string; sha?: string; message: string }) => {
      messages.push(w.message);
      if (files.get(path)?.sha !== w.sha) throw ghError("gh: is at abc but expected def (HTTP 409)");
      files.set(path, { text: Buffer.from(w.content, "base64").toString("utf8"), sha: `s${++n}`, by: me });
      return "";
    },
    list: async (_r: string, d: string) => {
      const pre = d.replace(/\/+$/, "") + "/";
      const here = [...files.entries()].filter(([p]) => p.startsWith(pre) && !p.slice(pre.length).includes("/"));
      if (!here.length) throw ghError("gh: Not Found (HTTP 404)");
      return JSON.stringify(here.map(([p, f]) => ({ name: p.slice(pre.length), path: p, sha: f.sha, size: f.text.length, type: "file", by: f.by })));
    },
    lastCommits: async (_r: string, items: { path: string }[]) => items.map((i) => ({ author: { user: { login: files.get(i.path)?.by } }, committer: { user: { login: files.get(i.path)?.by } } })),
  } } as any;
  const d = { record: () => rec, log: () => {} };
  const put = (path: string, text: string, by: string) => files.set(path, { text, sha: `s${++n}`, by });
  return { d, files, messages, put };
}

test("usedPart: a Cowork-reading tool that answered, by either name; an error, a write, presence or the no-record line is not a use", () => {
  assert.equal(U.usedPart("mcp__sol__room_memory", true, "the group's memory…"), "memory");
  assert.equal(U.usedPart("room_feed", true, "nothing has happened in this room yet"), "feed");   // an empty read is still a read
  assert.equal(U.usedPart("goal", true, "no goal set yet"), "goal");
  assert.equal(U.usedPart("mcp__sol__room_things", false, "boom"), null);
  assert.equal(U.usedPart("mcp__sol__room_things", true, "this room has no record yet"), null);
  assert.equal(U.usedPart("room_memory", true, "memory needs a cloud or GitHub room"), null);
  assert.equal(U.usedPart("mcp__sol__room_thing_add", true, "added"), null);
  assert.equal(U.usedPart("mcp__sol__in_thing", true, "you are in it"), null);
  assert.equal(U.usedPart("Read", true, "x"), null);
  assert.equal(U.usedPart("mcp__other__room_feed", true, "x"), null);
});

test("Items: the reply after a read wears usedCowork once, with each part once; a new turn forgets a read no reply followed", () => {
  const it = new Items();
  const tool = (id: string, name: string) => it.feed({ type: "assistant", message: { id: `m${id}`, content: [{ type: "tool_use", id, name, input: {} }] } });
  const result = (id: string, text: string, err = false) => it.feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text, is_error: err }] } });
  const say = (mid: string, text: string) => it.feed({ type: "assistant", message: { id: mid, content: [{ type: "text", text }] } });
  const me = (uuid: string) => it.feed({ type: "user", uuid, message: { content: "next" } });
  tool("a", "mcp__sol__room_memory"); result("a", "notes");
  tool("b", "mcp__sol__room_feed"); result("b", "lines");
  tool("c", "mcp__sol__room_memory"); result("c", "notes again");
  result("a", "notes");   // told twice: one read
  tool("d", "mcp__sol__room_polls"); result("d", "boom", true);
  say("r1", "here is what I found");
  say("r2", "and one more thing");
  const r1 = it.list.find((x) => x.id === "r1:t0")!, r2 = it.list.find((x) => x.id === "r2:t0")!;
  assert.deepEqual(r1.usedCowork, ["memory", "feed"]);
  assert.equal(r2.usedCowork, undefined);
  tool("e", "mcp__sol__goal"); result("e", "the goal");
  me("u1");
  say("r3", "a new turn");
  assert.equal(it.list.find((x) => x.id === "r3:t0")!.usedCowork, undefined);
});

test("writeUse: one line a part a UTC day in my file of the month; another part or day appends; a file someone else wrote starts again", async () => {
  U.forgetMarked();
  const f = fakeRecord("frank");
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "memory", "dev-20261030-0900", AT), "written");
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "memory", "dev-20261030-0900", AT + 3_600_000), "again");
  U.forgetMarked();   // another engine run: the file itself says it is there
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "memory", "dev-20261030-0900", AT + 7_200_000), "again");
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "feed", "", AT), "written");
  assert.equal(f.files.get(".sol/used/2026-10/frank.md")!.text, "- 2026-10-30T14:05Z · memory · dev-20261030-0900\n- 2026-10-30T14:05Z · feed\n");
  assert.ok(f.messages.every((m) => m.endsWith("[skip ci]")));
  // someone else wrote my file last: started again from my line, their words never become mine
  f.put(".sol/used/2026-10/frank.md", "- 2026-10-30T09:00Z · goal · fake\n", "isaac");
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "polls", "", AT), "written");
  assert.equal(f.files.get(".sol/used/2026-10/frank.md")!.text, "- 2026-10-30T14:05Z · polls\n");
  // refused: no record, a Drive project, no name
  assert.deepEqual(await U.writeUse(f.d, "", "frank", "goal", "", AT), { error: "this room has no record yet" });
  assert.ok("error" in (await U.writeUse(f.d, "drive:abc", "frank", "goal", "", AT) as object));
  assert.ok("error" in (await U.writeUse(f.d, "cloud:ABC123", "not a login", "goal", "", AT) as object));
});

test("writeUse: a put that fails is dropped and can be made again by the next use", async () => {
  U.forgetMarked();
  const f = fakeRecord("frank");
  const put = f.d.record().files.putBody;
  f.d.record().files.putBody = async () => { throw ghError("gh: Forbidden (HTTP 403)"); };
  assert.deepEqual(await U.writeUse(f.d, "cloud:ABC123", "frank", "goal", "", AT), { error: "you can't write to this project yet" });
  f.d.record().files.putBody = put;
  assert.equal(await U.writeUse(f.d, "cloud:ABC123", "frank", "goal", "", AT), "written");
});

test("readUses: each person's newest use of each part over 30 days, newest first; a file not written by its name and a stray line ignored", async () => {
  const f = fakeRecord();
  f.put(".sol/used/2026-10/frank.md", "- 2026-10-30T14:05Z · memory · dev-20261030-0900\n- 2026-10-02T08:00Z · memory\n- 2026-10-29T10:00Z · feed\nnot a mark\n- 2026-10-29T10:00Z · secrets\n", "frank");
  f.put(".sol/used/2026-10/isaac.md", "- 2026-10-30T12:00Z · goal\n", "frank");   // not written by isaac: ignored
  f.put(".sol/used/2026-09/marco.md", "- 2026-09-30T20:00Z · things\n- 2026-09-20T12:00Z · polls\n", "marco");   // the 20th is past 30 days
  f.put(".sol/used/2026-10/w0ngtap.md", "- 2026-11-30T12:00Z · goal\n", "w0ngtap");   // from the future
  const r = await U.readUses(f.d, "cloud:ABC123", AT);
  assert.deepEqual(Object.keys(r.people).sort(), ["frank", "marco"]);
  assert.deepEqual(r.people.frank.map((u) => [u.part, u.at, u.version]), [["memory", "2026-10-30T14:05Z", "dev-20261030-0900"], ["feed", "2026-10-29T10:00Z", ""]]);
  assert.deepEqual(r.people.marco.map((u) => u.part), ["things"]);
  assert.deepEqual(await U.readUses(f.d, "", AT), { people: {}, note: "this room has no record yet" });
});

test("noteUse: counted with words only (part, the record as a word, the release); marked only when my agent may write; nothing without a record", async () => {
  U.forgetMarked();
  const f = fakeRecord("frank");
  const counted: [string, string, string][] = [];
  const deps = (room: { repo: string; login: string; may: boolean } | null) => ({ ...f.d, room: async () => room, version: () => U.releaseWord({ release: "dev-20261030-0900", mine: 3 }),
    count: (p: string, project: string, release: string) => { counted.push([p, project, release]); }, now: () => AT });
  assert.equal(await U.noteUse(deps({ repo: "sol-mif/sol-dev", login: "frank", may: true }), "memory"), "written");
  assert.deepEqual(counted[0], ["memory", "sol-mif-sol-dev", "dev-20261030-0900:mine3"]);
  assert.equal(badProp({ part: counted[0][0], project: counted[0][1], release: counted[0][2] }), null);   // a track event, not a dropped one
  assert.equal(await U.noteUse(deps({ repo: "cloud:ABC123", login: "frank", may: false }), "goal"), "counted");
  assert.equal(f.files.has(".sol/used/2026-10/frank.md"), true);
  assert.equal(f.files.size, 1);   // the second project was counted, not marked
  assert.equal(await U.noteUse(deps({ repo: "", login: "frank", may: true }), "goal"), "none");
  assert.equal(await U.noteUse(deps(null), "goal"), "none");
  assert.equal(counted.length, 2);
});

test("releaseWord: a word a track line takes; nothing when the version is unknown", () => {
  assert.equal(U.releaseWord({ release: "dev-20261030-0900" }), "dev-20261030-0900");
  assert.equal(U.releaseWord({ release: "main", mine: 2 }), "main:mine2");
  assert.equal(U.releaseWord(null), "");
  assert.equal(badProp({ r: U.releaseWord({ release: "x".repeat(80), mine: 999 }) }), null);
});

test("runWorkTool: a read that answered tells the used hook with its session and part; a write or a failure does not", async () => {
  const T = await import("../src/work/tools.ts");
  const told: [string, string][] = [];
  T.setWorkHooks({ feed: async () => "lines", things: async () => "this room has no record yet", goal: async () => { throw new Error("down"); }, thingAdd: async () => "added" } as any);
  T.setUsedHook((self, part) => { told.push([self, part]); });
  await T.runWorkTool("room_feed", {}, "s1");
  await T.runWorkTool("room_things", {}, "s1");
  await T.runWorkTool("goal", {}, "s1");
  await T.runWorkTool("room_thing_add", { url: "https://x" }, "s1");
  T.setUsedHook((): void => { throw new Error("a broken hook"); });
  assert.equal((await T.runWorkTool("room_feed", {}, "s2")).content[0].text, "lines");   // the tool's answer stands
  T.setUsedHook(null);
  assert.deepEqual(told, [["s1", "feed"]]);
});
