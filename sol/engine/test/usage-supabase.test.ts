// Beta usage on Supabase (#1350): the checks its function (sol/supabase/functions/track) makes on a day's file are the
// cloud's (sol/cloud/src/track.ts parseLine and take), so a line one keeps the other keeps, and nothing that is not a
// count reaches the summary or the raw file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readDay, checkHeaders, parseLine, addressOf } from "../../supabase/functions/track/lines.ts";

const T = "t_abcdefghij";
const line = (o: Record<string, unknown> = {}) => JSON.stringify({ at: "2026-11-16T10:00:00Z", tester: T, sol: "dev-1", face: "window", mode: "work", seat: "claude", name: "app.open", ...o });

test("a line is kept only as the engine writes it", () => {
  assert.ok(parseLine(line(), T));
  assert.deepEqual(parseLine(line({ props: { folder: "secret-client", dir: "abcdef012345" } }), T)!.props, { dir: "abcdef012345" }, "an older Sol's folder name is not kept (#1249)");
  assert.doesNotMatch(readDay(line({ props: { folder: "secret-client", n: 1 } }) + "\n", T).kept.join("\n"), /secret-client/, "nor stored in the raw file");
  assert.ok(parseLine(line({ props: { n: 2, on: true, part: "things" } }), T));
  assert.equal(parseLine(line({ tester: "t_other00000" }), T), null, "another code's line");
  assert.equal(parseLine(line({ name: "a sentence" }), T), null);
  assert.equal(parseLine(line({ props: { text: "hello there" } }), T), null, "a prop that is not a word");
  assert.equal(parseLine(line({ props: { p: "/Users/me" } }), T), null, "a path");
  assert.equal(parseLine(line({ extra: 1 }), T), null, "a field the engine does not write");
  assert.equal(parseLine(line({ mode: "life" }), T), null);
  assert.equal(parseLine("not json", T), null);
});

test("a day read: the lines kept, the dropped counted, the summary by name, mode and version", () => {
  const body = [line(), line({ at: "2026-11-16T10:01:00Z" }), line({ name: "talk.sent", mode: "cowork" }), "{\"x\":1}", "", line({ sol: "dev-2" })].join("\n");
  const d = readDay(body, T);
  assert.equal(d.kept.length, 4);
  assert.equal(d.dropped, 1);
  assert.deepEqual(d.rows.sort((a, b) => a.name.localeCompare(b.name) || a.sol.localeCompare(b.sol)), [
    { name: "app.open", mode: "work", sol: "dev-1", events: 2 },
    { name: "app.open", mode: "work", sol: "dev-2", events: 1 },
    { name: "talk.sent", mode: "cowork", sol: "dev-1", events: 1 },
  ]);
  assert.ok(!d.kept.some((l) => l.includes("\"x\"")), "a dropped line is not in the raw file");
});

test("the headers, as the cloud checks them", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  const ok = { tester: T, day: "2026-11-16", sha: "a".repeat(64), sol: "dev-1", who: "frank", user: "f" };
  assert.equal(checkHeaders(ok, now), null);
  assert.equal(checkHeaders({ ...ok, tester: "bob" }, now)?.status, 400);
  assert.equal(checkHeaders({ ...ok, who: "two words" }, now)?.status, 400);
  assert.equal(checkHeaders({ ...ok, day: "2026-11-19" }, now)?.status, 400, "later than tomorrow");
  assert.equal(checkHeaders({ ...ok, day: "2026-01-01" }, now)?.status, 400, "older than 120 days");
  assert.equal(checkHeaders({ ...ok, sha: "x" }, now)?.status, 400);
});

test("an address's bucket: the edge's own address, an IPv6 /64 as one", () => {
  assert.equal(addressOf(" 203.0.113.9 "), "203.0.113.9");
  assert.equal(addressOf("2001:db8:1:2:aaaa::1"), addressOf("2001:db8:1:2:bbbb::9"));
  assert.equal(addressOf(null), "");
});
