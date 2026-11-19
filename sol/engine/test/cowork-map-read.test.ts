// Cowork's map reads (#1464, team/map/read.ts): the window's comments read page by page to the end, and a cap reached
// is said on the spec (cut) rather than drawn as the whole count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { runners } = await import("../src/team/record/github.ts");
const { readMap, CAP } = await import("../src/team/map/read.ts");

const top = mkdtempSync(join(tmpdir(), "map-read-")), dir = join(top, "sol", "systems", "records");
mkdirSync(dir, { recursive: true }); mkdirSync(join(top, ".sol"));
execFileSync("git", ["init", "-q", top]);
execFileSync("git", ["-C", top, "remote", "add", "origin", "https://github.com/o/r.git"]);
writeFileSync(join(top, ".sol", "cowork-map.json"), JSON.stringify({
  people: [{ id: "i", name: "I", set: 1, logins: ["i-gh"] }], outcomes: [{ id: "one", name: "One", holder: "i", areas: [], labels: [] }],
  views: [{ id: "court", name: "Court", kind: "court", question: "?", why: "{lines_i} lines" }], view_order: {}, toggles: [], pins: {},
}));

/** a board holding `total` comments by one person in the last 48 h, served 100 a page, and `prs` open PRs */
function board(total: number, prs = 0) {
  const asked: string[][] = [], at = new Date(Date.now() - 2 * 3_600_000).toISOString();
  runners.board = (async (args: string[]) => {
    asked.push(args);
    if (args[0] === "api" && args[1] === "user") return "i-gh";
    if (args[0] === "api") {
      const page = Number(/[?&]page=(\d+)/.exec(args[1])![1]), n = Math.max(0, Math.min(100, total - (page - 1) * 100));
      return JSON.stringify(Array.from({ length: n }, (_, k) => ({ issue_url: "x/issues/1", created_at: at, user: { login: "i-gh" }, body: `line ${page}.${k}` })));
    }
    if (args[0] === "pr") return JSON.stringify(Array.from({ length: Math.min(prs, Number(args[args.indexOf("--limit") + 1])) }, (_, k) => ({ number: k + 1, title: "t", author: { login: "i-gh" }, files: [] })));
    return "[]";
  }) as typeof runners.board;
  return asked;
}

test("500 comments in the window are all counted, read with since= until a short page; nothing is cut", async () => {
  const asked = board(500);
  const r = await readMap(true, dir);
  assert.equal(r.spec?.views[0].why, "500 lines");
  assert.equal(r.spec?.cut, undefined);
  const pages = asked.filter((a) => a[0] === "api" && a[1].includes("issues/comments"));
  assert.equal(pages.length, 6);
  assert.ok(pages.every((a) => /since=\d{4}-/.test(a[1])));
  assert.ok(asked.some((a) => a[0] === "pr" && a.includes(String(CAP.prs))));
});

test("a read that reaches its cap says so on the spec", async () => {
  board(CAP.pages * 100 + 50, CAP.prs);
  const r = await readMap(true, dir);
  assert.deepEqual(r.spec?.cut, { notes: true, prs: true });
});
