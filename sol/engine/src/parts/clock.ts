// The clock's part (#1177, work/clock.ts): it keeps the person's clock checked and every face told.
//   off unless clockOn() (#1274): no check, no timer; a block still reads the record once
//   every 10 minutes while an item is not done, and at once when an ETA passes   checkAll: gh for a PR and its full ci run, systemctl for a builder
//                                                      unit (ssh to its machine when not this one), /runs for a release
//   clock.get        → clock.items { rid, items, checked }   a block asks once as it opens (and when the socket is back)
//   clock.check      → clock.items                            a press on the block's "check now"
//   (pushed)           clock.items { items, checked }         to every face whenever the record changes: no polling
//   GET /clock         the same, read once, for a script or a test
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Parts } from "../parts.js";
import { CHECK_MS, checkAll, clockAt, clockFileIn, clockOn, meIs, nextEta, onClock, pending, readClock, type Clock, type Probe } from "../work/clock.js";
import { STATE_DIR } from "../work/state.js";
import { syncClockTools } from "../work/tools.js";
import { runsNow } from "../team/runs.js";
import { fillMe, getTeam } from "../team/settings.js";

const run = promisify(execFile);
// sol/: from src/parts/ under tsx, dist/parts/ when built; gh reads the repo from the checkout
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const msg = (c: Clock) => ({ type: "clock.items", items: c.items, checked: c.checked ?? null });

/** this machine, by the names an item may give it */
const here = (m: string) => { const n = m.trim().toLowerCase(); return !n || n === "localhost" || n === hostname().toLowerCase() || n === (process.env.SOL_MACHINE ?? "").toLowerCase(); };

export const probe: Probe = {
  async pr(n) {
    try {
      const { stdout } = await run("gh", ["pr", "view", n, "--json", "state,headRefName,url"], { cwd: ROOT, timeout: 20_000 });
      const j = JSON.parse(stdout); return { state: j.state, branch: j.headRefName, url: j.url };
    } catch { return null; }
  },
  async ci(branch) {
    try {
      const { stdout } = await run("gh", ["run", "list", "--branch", branch, "--workflow", "ci", "--limit", "6", "--json", "status,conclusion,databaseId,url"], { cwd: ROOT, timeout: 20_000 });
      // a draft's own PR run cancels itself; the newest run that was not cancelled is the one that counts
      const runs = JSON.parse(stdout) as { status: string; conclusion?: string; databaseId: number; url?: string }[];
      const r = runs.find((x) => x.conclusion !== "cancelled") ?? runs[0]; return r ? { status: r.status, conclusion: r.conclusion ?? "", id: r.databaseId, url: r.url } : null;
    } catch { return null; }
  },
  async unit(machine, unit) {
    const args = ["--user", "is-active", unit];
    try {
      const { stdout } = here(machine) ? await run("systemctl", args, { timeout: 10_000 })
        : await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", machine, "systemctl", ...args], { timeout: 15_000 });
      return stdout.trim();
    } catch (e) {
      // is-active exits non-zero for inactive or failed and still says the word; nothing said = unreachable
      const out = String((e as { stdout?: string }).stdout ?? "").trim();
      return out && /^[a-z-]+$/.test(out) ? out : null;
    }
  },
  tags: () => runsNow().map((w) => w.tag).filter(Boolean),
};

export default function (p: Parts) {
  let timer: NodeJS.Timeout | undefined, atEta: NodeJS.Timeout | undefined;
  // whose clock: the login team.json fills from gh after start
  const me = () => { try { const l = getTeam().me?.login ?? ""; if (!l) void fillMe(); return l; } catch { return ""; } };
  const check = () => { meIs(me()); return checkAll(probe).catch(() => readClock()); };
  // the next ETA to pass: checked at once when it comes (one timer, set again after every change)
  const arm = (c: Clock) => {
    clearTimeout(atEta);
    const next = nextEta(c, Date.now());
    if (next !== null) { atEta = setTimeout(() => void check(), Math.min(next - Date.now() + 1000, 2 ** 31 - 1)); atEta.unref(); }
  };
  p.atStart(({ everyone }) => {
    clockAt(process.env.SOL_CLOCK ?? clockFileIn(STATE_DIR), me());
    syncClockTools(clockOn());
    if (!clockOn()) return;
    onClock((c) => { everyone(msg(c)); arm(c); });
    arm(readClock());
    setTimeout(() => void check(), 3000).unref();
    timer = setInterval(() => { if (pending(readClock())) void check(); }, CHECK_MS); timer.unref();
  });
  p.on("clock.get", (m, { ws, send }) => send(ws, { ...msg(readClock()), rid: m.rid }));
  p.on("clock.check", async (m, { ws, send }) => send(ws, { ...msg(clockOn() ? await check() : readClock()), rid: m.rid }));
  p.route("GET", "/clock", ({ res }) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(msg(readClock())));
  });
}
