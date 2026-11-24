// The window older than its engine (#1824, ticket K): a tester whose Sol.app is from before BR1 (dev-20261120-1820 and
// earlier: its face bundled, no updater of its own) takes the new engine by Update, and its old face would go on as if
// nothing were missing. The engine reads the running Sol.app on the disk (never what the face says of itself) and, on a
// beta Sol, says one plain line through the offer the old face already shows, with the download; Update answers with
// the same download and never says the face updated; and the new face's switch stays off, since the old app's copy of
// the new face has no line at all. Real git in a temp repo, as together-ship.test.ts; the app is a folder made here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  SOL_NO_SHIP_CHECK: "1", SOL_TEAM_FILE: join(mkdtempSync(join(tmpdir(), "sol-team-")), "team.json"),
  SOL_SETTINGS: join(mkdtempSync(join(tmpdir(), "sol-settings-")), "settings.json"),
});
delete process.env.SOL_VERSION;
delete process.env.SOL_UI_NEXT;
const { startShip, offerNow, hear } = await import("../src/team/ship.ts");
const { handleTeam, addTeamFace } = await import("../src/team/wire.ts");
const { appOld, appsIn, readApp, checkWindow, windowOld, FRESH_DOWNLOAD } = await import("../src/team/window.ts");
const { uiNext, patchSettings } = await import("../src/settings.ts");
type Channel = import("../src/team/ship.ts").Channel;

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const LINK = "https://github.com/sol-mif/sol-beta/releases/latest/download/Sol-mac.zip";

/** a Sol.app as a release zip unpacks it: Info.plist (XML, as Tauri writes it) and the face binary, built at `built` */
function app(dir: string, version: string, built: string, id = "com.marcol04.sol") {
  const a = join(dir, "Sol.app");
  mkdirSync(join(a, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(a, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleIdentifier</key>\n\t<string>${id}</string>\n\t<key>CFBundleShortVersionString</key>\n\t<string>${version}</string>\n</dict>\n</plist>\n`);
  const bin = join(a, "Contents", "MacOS", "face");
  writeFileSync(bin, "");
  const t = new Date(built);
  utimesSync(bin, t, t);
  return a;
}
const psOf = (...apps: string[]) => ["/sbin/launchd", "/usr/libexec/logd", ...apps.map((a) => `${a}/Contents/MacOS/face`), "/usr/local/bin/node"].join("\n") + "\n";

function checkout() {
  const top = mkdtempSync(join(tmpdir(), "sol-window-"));
  const origin = join(top, "origin.git");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const repo = join(top, "tester");
  mkdirSync(join(repo, "sol", "engine", "src"), { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "sol", "engine", "src", "index.ts"), "export const a = 1;\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "start");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "-q", "-u", "origin", "main");
  git(repo, "push", "-q", "origin", "main:stable");
  return { top, repo, sol: join(repo, "sol") };
}

test("which app is old (pure): unstamped and built before 2026-11-22, or stamped with an earlier day; the running ones from ps", () => {
  assert.equal(appOld({ version: "0.1.0", builtMs: Date.parse("2026-11-20T23:36:43Z") }), true, "dev-20261120-1820's app");
  assert.equal(appOld({ version: "0.1.0", builtMs: Date.parse("2026-11-24T17:00:00Z") }), false, "BR1's app, should J2's stamp not be in it");
  assert.equal(appOld({ version: "0.20261124.1200", builtMs: Date.parse("2026-11-24T17:00:00Z") }), false, "a stamped release (J2)");
  assert.equal(appOld({ version: "0.20261124.1200", builtMs: Date.parse("2026-11-01T00:00:00Z") }), false, "the stamp says, not the time");
  assert.equal(appOld({ version: "0.20261120.1820", builtMs: Date.parse("2026-12-01T00:00:00Z") }), true, "a stamp from before the floor");
  assert.deepEqual(appsIn(psOf("/Applications/Sol.app", "/Users/t/Downloads/Sol 2.app")), ["/Applications/Sol.app", "/Users/t/Downloads/Sol 2.app"]);
  assert.deepEqual(appsIn("/Applications/Safari.app/Contents/MacOS/Safari\n/x/face\n"), []);
  assert.equal(FRESH_DOWNLOAD, LINK);
});

test("readApp reads the plist and the binary's time; another app's bundle, or none, is not Sol's", () => {
  const d = mkdtempSync(join(tmpdir(), "sol-app-"));
  const a = app(d, "0.1.0", "2026-11-20T23:36:43Z");
  assert.deepEqual(readApp(a), { version: "0.1.0", builtMs: Date.parse("2026-11-20T23:36:43Z") });
  const other = app(mkdtempSync(join(tmpdir(), "sol-app-")), "0.1.0", "2026-11-20T23:36:43Z", "com.example.face");
  assert.equal(readApp(other), null);
  assert.equal(readApp(join(d, "Nothing.app")), null);
});

test("an old app on a beta Sol: one line with the download, Update does not pretend, the new face stays off; the new app clears it", async () => {
  const c = checkout();
  const told: any[] = [];
  let channel: Channel = "beta";
  startShip(c.sol, (m) => told.push(m), { root: c.sol, channel: async () => channel, auto: false });
  const face = { send: (m: object) => got.push(m) };
  const got: any[] = [];
  addTeamFace(face);
  patchSettings({ ui: { next: true } });   // BR1 turns it on for a beta Sol (#1813); here by hand, the same reading
  assert.equal(uiNext(), true);

  // nothing runs: nobody looks, nothing said
  let ps = psOf();
  await checkWindow({ channel: async () => channel, ps: async () => ps });
  assert.equal(windowOld(), false);
  await handleTeam(face, { type: "team.stable.get", rid: "g0" });
  assert.deepEqual(got.at(-1), { type: "team.stable", rid: "g0", sha: null });

  // dev-20261120-1820's app runs: the offer the old face shows carries the line and the download
  const old = app(mkdtempSync(join(tmpdir(), "sol-app-")), "0.1.0", "2026-11-20T23:36:43Z");
  ps = psOf(old);
  await checkWindow({ channel: async () => channel, ps: async () => ps });
  assert.equal(windowOld(), true);
  const said = told.at(-1);
  assert.equal(said.type, "team.stable", "every face hears it at once");
  assert.match(said.sha, /^[0-9a-f]{40}$/, "a sha the old face takes");
  assert.equal(said.behind, true, "behind: the old face shows only an offer behind");
  assert.equal(said.channel, "beta");
  assert.equal(said.by, "");
  assert.ok(said.tag.includes("github.com/sol-mif/sol-beta/releases/latest"), "where to download, in the words the old face shows in bold");
  assert.ok(`a new stable is out ${said.tag}`.length <= 92, "one line that fits the old face's row in a 900px window (it clips at the end)");
  await handleTeam(face, { type: "team.stable.get", rid: "g1" });
  assert.deepEqual(got.at(-1), { ...said, rid: "g1" }, "a face that connects later is told the same");
  assert.equal(uiNext(), false, "the old app's copy of the new face shows no line: the old face stays");

  // Update on that line: no update, the download in its words (the old face shows `could not update: <error>`)
  const head = git(c.repo, "rev-parse", "HEAD");
  await handleTeam(face, { type: "team.update", rid: "u1" });
  const u = got.at(-1);
  assert.equal(u.ok, undefined);
  assert.ok(String(u.error).includes(LINK), "its words carry the download");
  assert.equal(git(c.repo, "rev-parse", "HEAD"), head, "nothing moved");

  // a real release on top: offered as a release (the engine installs it), the line back once it stands answered
  writeFileSync(join(c.repo, "sol", "engine", "src", "index.ts"), "export const a = 2;\n");
  git(c.repo, "commit", "-qam", "next"); git(c.repo, "push", "-q", "origin", "main:stable");
  const rel = git(c.repo, "rev-parse", "HEAD");
  git(c.repo, "reset", "-q", "--hard", "HEAD~1");
  await hear({ sha: rel, tag: "dev-20261125", by: "", channel: "beta" });
  assert.deepEqual({ sha: offerNow()?.sha, tag: offerNow()?.tag, behind: offerNow()?.behind }, { sha: rel, tag: "dev-20261125", behind: true });
  await handleTeam(face, { type: "team.update", rid: "u2" });
  assert.equal(got.at(-1).ok, true, "a real release still updates the engine");
  assert.equal(told.at(-1).sha, said.sha, "answered: the faces hear the line again, never just behind:false");
  assert.equal(told.at(-1).behind, true);

  // ps does not answer: what was seen stands (never the old app's copy of the new face for half a minute)
  await checkWindow({ channel: async () => channel, ps: async () => { throw new Error("ps timed out"); } });
  assert.equal(windowOld(), true);
  assert.equal(uiNext(), false);

  // the new app downloaded: the line goes, the switch comes back
  const fresh = app(mkdtempSync(join(tmpdir(), "sol-app-")), "0.20261124.1200", "2026-11-24T17:00:00Z");
  ps = psOf(fresh);
  await checkWindow({ channel: async () => channel, ps: async () => ps });
  assert.equal(windowOld(), false);
  assert.equal(told.at(-1).behind, false, "every face hears the line is gone");
  assert.equal(uiNext(), true);

  // a developer's Sol (dev) is never told, whatever app it runs
  channel = "dev";
  ps = psOf(old);
  await checkWindow({ channel: async () => channel, ps: async () => ps });
  assert.equal(windowOld(), false);
});
