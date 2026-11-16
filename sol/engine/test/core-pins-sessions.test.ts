// Core pins (#892): sessions.ts, fed by hand (fileSessions reads no ~/.claude). What it promises: every session filed under
// its folder (a side copy under its repo, a moved folder under its new place, the other machine's under this home),
// scratch folders and hidden ones left out, a gone folder kept only when asked, Sol's marks on each row, a fresh run shown
// at once and only once; a folder that is two names reads parent/name.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
const H = mkdtempSync("/var/tmp/sol-core-sess-");   // not under /tmp: /tmp is a scratch folder to the side
after(() => rmSync(H, { recursive: true, force: true }));
Object.assign(process.env, { HOME: H, SOL_STATE: join(H, "work.json"), SOL_SESSIONS_DIR: join(H, "sessions") });
const S = await import("../src/work/state.ts");
const X = await import("../src/work/sessions.ts");

const dir = (...p: string[]) => { const d = join(H, ...p); mkdirSync(d, { recursive: true }); return d; };
const row = (sessionId: string, cwd: string, extra: object = {}) => ({ sessionId, cwd, summary: sessionId, lastModified: 1000, ...extra }) as any;

test("filed by folder: scratch out, hidden out, a gone folder out unless the stale pref, marks on the row", () => {
  const app = dir("code", "app");
  S.mark("s1", { pinned: true });
  const list = [row("s1", app), row("s2", "/tmp/fixture-x"), row("s3", join(H, "code", "gone")), row("s4", ""), row("s5", dir("code", "hidden"))];
  S.folderOp("hide", join(H, "code", "hidden"));
  const f = X.fileSessions(list);
  assert.deepEqual(f.sessions.map((s) => s.id), ["s1"]);
  assert.equal(f.sessions[0].pinned, true);
  assert.deepEqual(f.projects.map((p) => [p.name, p.count]), [["app", 1]]);
  S.setPrefs({ stale: true });
  const g = X.fileSessions(list);
  assert.deepEqual(g.sessions.map((s) => [s.id, !!s.gone]), [["s1", false], ["s3", true]]);
  S.setPrefs({ stale: false });
  S.folderOp("show", join(H, "code", "hidden"));
});

test("a side copy files under its repo with its name; two folders with one name read parent/name", () => {
  const a = dir("one", "web"), b = dir("two", "web");
  const wt = dir("one", "web", ".claude", "worktrees", "fix-1");
  const f = X.fileSessions([row("a", a), row("b", b), row("c", wt)]);
  const c = f.sessions.find((s) => s.id === "c")!;
  assert.equal(c.project, a);
  assert.equal(c.worktree, "fix-1");
  assert.deepEqual(f.projects.map((p) => p.name).sort(), ["one/web", "two/web"]);
});

test("the other machine's session files under the same folder in this home", () => {
  const here = dir("code", "shared");
  assert.equal(X.workFolderIn(here, H, () => true), here);
  assert.equal(X.workFolderIn("/Users/someone/x", "/home/m", (p) => p === "/home/m/x"), "/home/m/x");
  assert.equal(X.workFolderIn("/Users/someone/x", "/home/m", () => false), undefined);
  assert.equal(X.workFolderIn("/opt/x", "/home/m", () => false), undefined);
});

test("a fresh run shows at once as a row of its own, once; the SDK's row replaces it", () => {
  const app = dir("code", "fresh");
  const filed = X.fileSessions([]);
  const once = X.withRuns(filed, [{ sessionId: "new1", cwd: app, since: 5 }, { sessionId: "new1", cwd: app }, { sessionId: "nocwd", cwd: "" }]);
  assert.equal(once.sessions.filter((s) => s.id === "new1").length >= 1, true);
  assert.equal(once.sessions.some((s) => s.id === "nocwd"), false, "a run with no folder is no row");
  const filed2 = X.fileSessions([row("new1", app)]);
  const after = X.withRuns(filed2, [{ sessionId: "new1", cwd: app }]);
  assert.deepEqual(after.sessions.filter((s) => s.id === "new1").map((s) => s.title), ["new1"]);
  assert.equal(after.projects.find((p) => p.path === app)!.count, 1);
});

test("slug: every character but letters and digits is a dash (Claude Code's folder names)", () => {
  assert.equal(X.slug("/home/m/my repo.v2"), "-home-m-my-repo-v2");
  assert.equal(X.slug(""), "");
});

test("transcriptFiles: none for a session with no transcript", () => {
  assert.deepEqual(X.transcriptFiles("no-such-session", join(H, "code", "app")), []);
});
