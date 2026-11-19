// The tools a Work session's agent is given (work/runs.ts start, work/tools.ts): the browser's come with the browser
// pref (the Browser drawer), and the rest stay either way. A Run is started for real, with the Agent SDK's three calls
// swapped for stand-ins (test/sdk-stub.mjs) that keep the names of the tools on the "sol" server it made; no CLI starts.
// state.ts reads its paths once, so the Runs live in a child process with a temp home.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME = mkdtempSync(join(tmpdir(), "work-tools-"));
after(() => rmSync(HOME, { recursive: true, force: true }));
const ENGINE = new URL("..", import.meta.url).pathname;
const HOOKS = new URL("./sdk-stub-hooks.mjs", import.meta.url).href;

// the script: for each setting of the pref, a Run on a new session id is started and the "sol" server it built is read
const SCRIPT = `
import { register } from "node:module";
register(${JSON.stringify(HOOKS)});
const S = await import("./src/work/state.ts");
const { Run } = await import("./src/work/runs.ts");
const { TOOLS } = await import("./src/browser.ts");
const out = { browser: TOOLS.map((t) => t.name), on: null, off: null };
for (const [key, on] of [["on", true], ["off", false]]) {
  S.setPrefs({ browser: on });
  const before = globalThis.__sdk?.servers.length ?? 0;
  const run = new Run("session-browser-" + key, process.cwd(), "m", "high", "default", false, () => {});
  run.start(true);
  const made = globalThis.__sdk.servers.slice(before);
  out[key] = made.length === 1 && made[0].name === "sol" ? made[0].tools : made;
  clearTimeout(run.idle); run.end();
}
console.log("RESULT " + JSON.stringify(out));
process.exit(0);
`;

test("the browser pref gives or takes the browser tools: the sol server of a run lists them with it on and none with it off", () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", SCRIPT], {
    cwd: ENGINE, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, HOME, SOL_STATE: join(HOME, "work.json"), SOL_HOME: join(HOME, "home"), SOL_SESSIONS_DIR: join(HOME, "sessions"), SOL_TEAM: join(HOME, "team.json"), SOL_TEAM_OFFLINE: "1" },
  });
  assert.equal(r.status, 0, `the child ended with ${r.status}: ${r.stderr.slice(-600)}`);
  const line = r.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  assert.ok(line, `no answer from the child: ${r.stdout.slice(-300)} ${r.stderr.slice(-300)}`);
  const { browser, on, off } = JSON.parse(line.slice(7)) as { browser: string[]; on: string[]; off: string[] };
  assert.ok(browser.length >= 5 && browser.includes("browser_open"), "the browser's own tools are known");
  assert.ok(Array.isArray(on) && Array.isArray(off), `one sol server per run: ${JSON.stringify({ on, off })}`);
  for (const name of browser) assert.ok(on.includes(name), `pref on: ${name} is on the server`);
  for (const name of browser) assert.ok(!off.includes(name), `pref off: ${name} is not on the server`);
  // the rest is the same either way: Sol's other tools and the session tools stay
  assert.deepEqual(off, on.filter((n) => !browser.includes(n)), "off takes the browser's tools and nothing else");
  assert.ok(off.includes("wrap_up") && off.includes("list_sessions"), "the session's own tools stay with the browser off");
});
