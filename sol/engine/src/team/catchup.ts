// The nightly catch-up test (#423, part of #413, area A6): every release of the last 30 days, installed with saved data
// that looks like a person's, then updated to the newest release, must come up healthy with nothing lost. A Sol that sat
// on an old release for weeks (away, a laptop shut) takes one update that runs every conversion step since (#422); this
// is where we find out first, every night, on our own machines.
//   which      every `dev-*` tag of the last 30 days, oldest first, each updated to the newest `dev-*`. Before the first
//              dev release there are only `stable-*` stamps: then the last stamp of each day stands for that day.
//              More than 30 days behind is a fresh install that keeps the data (a follow-up, not tested here).
//   one run    a clone of this repository (shared objects, so the person's own checkout is never touched) at the old
//              release; the engine built there (npm ci, tsc); the fixture written into the places a real Sol keeps its
//              data (the checkout's sol/home, the engine folder's settings.json and team.json, work.json under a
//              scratch HOME); the old engine started on a free port, asked /health, stopped. What it kept is read
//              ("before"). Then the same folder moves to the newest release the way an update moves it (git checkout,
//              npm ci, tsc), the new engine starts, and the run checks: /health ok, its `data` says every step ran
//              (version equal to latest, nothing failed), the engine reads a memory note back (/file) and its settings
//              (settings.get on its socket), and every fact the old release kept is still there after it stopped.
//   isolated   the engines get a short allowlist of the environment, a scratch HOME, SOL_QUIET (no relay, no
//              tracking, no update check, no renew: nothing leaves the machine) and nothing of the person's is read.
//   the report one comment, the first line `**Catch-up passed** on <machine>: …` or `**Catch-up failed** …`, which the
//              feed shows as a line of the room (feed.ts reviewedText) beside the review's folds and the build updates;
//              a red one names the day's dev reviewer (`.sol/rhythm.json`'s `dev`) so GitHub pings them.
// Run by .github/workflows/catchup.yml at night on the NucBox and the MacBook (sol-dev only, never sol-beta), and by hand
// with `bash sol/catchup` (sol/catchup says how). The pure parts are exported for the tests.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isQuiet } from "../quiet.js";

export const DAYS = 30;
export const RELEASE_TAG = /^(dev|stable)-(\d{8})(?:-(\d{4}))?$/;
export type Tag = { tag: string; at: number };   // at: the tag's own date, ms
export type Plan = { kind: "dev" | "stable" | "none"; from: Tag[]; to: Tag | null };

// ---- which releases (pure) ----

const dayOf = (tag: string) => RELEASE_TAG.exec(tag)?.[2] ?? "";
const order = (a: Tag, b: Tag) => a.at - b.at || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);

/** the releases to catch up from and the one to catch up to (pure). Dev releases when there is any: each of the window,
 *  to the newest. None yet: the stamps, the last of each day in the window, to the newest stamp. `to` given (a tag or
 *  "main"): that is the target, and the newest release is caught up from too */
export function planOf(tags: Tag[], now: number, o: { days?: number; to?: string; only?: string[]; max?: number } = {}): Plan {
  const since = now - (o.days ?? DAYS) * 86_400_000;
  const ok = tags.filter((t) => RELEASE_TAG.test(t.tag)).sort(order);
  const dev = ok.filter((t) => t.tag.startsWith("dev-"));
  const kind: Plan["kind"] = dev.length ? "dev" : ok.length ? "stable" : "none";
  const all = kind === "dev" ? dev : ok.filter((t) => t.tag.startsWith("stable-"));
  if (!all.length && !o.to) return { kind: "none", from: [], to: null };
  const to: Tag | null = o.to ? (all.find((t) => t.tag === o.to) ?? { tag: o.to, at: Number.POSITIVE_INFINITY }) : all[all.length - 1];   // main: after every release
  let from = all.filter((t) => t.at >= since && t.tag !== to?.tag && t.at <= (to?.at ?? now));
  if (kind === "stable") {
    // a stamp a few times a day: the day's last one stands for the day (the one Sols slept on)
    const last = new Map<string, Tag>();
    for (const t of from) last.set(dayOf(t.tag), t);
    from = [...last.values()].sort(order);
  }
  if (o.only?.length) from = all.filter((t) => o.only!.includes(t.tag) && t.tag !== to?.tag);
  if (o.max && from.length > o.max) from = from.slice(from.length - o.max);   // the newest ones
  return { kind, from, to };
}

/** `git for-each-ref` lines, "<tag> <unix seconds>", as tags (pure) */
export function tagsOf(text: string): Tag[] {
  return text.split("\n").flatMap((l) => {
    const [tag, s] = l.trim().split(/\s+/);
    return tag && RELEASE_TAG.test(tag) && /^\d+$/.test(s ?? "") ? [{ tag, at: Number(s) * 1000 }] : [];
  });
}

// ---- the saved data (pure) ----

/** where a fixture file lives: the checkout's home (sol/home), the engine's folder, or Work's state folder */
export type Root = "home" | "engine" | "state";
export type FixtureFile = { root: Root; path: string; text: string };
export const MARK = "catch-up fixture 423";

/** the saved data of a Sol that has been used (pure): memory and life notes, settings, the team file with the night
 *  job's numbers in their old place (step 0002 moves them), Work's groups, folders and drawers. `folder` is a real
 *  folder of the scratch, so Work keeps it */
export function fixture(folder: string): FixtureFile[] {
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  return [
    { root: "home", path: "memory/MEMORY.md", text: `- [Catch-up fixture note](catchup-note.md) — ${MARK}\n` },
    { root: "home", path: "memory/catchup-note.md", text: `---\nname: catch-up fixture note\n---\n${MARK}: remembered across the update.\n` },
    { root: "home", path: "life/catchup.md", text: `# Today\n\n${MARK}: a life note.\n` },
    { root: "engine", path: "settings.json", text: json({ voice: "Puck", patienceMs: 900, look: { color: "#101010", alpha: 0.78, blur: 24, bubble: "glass", text: 15 } }) },
    { root: "engine", path: "team.json", text: json({ me: { login: "catchup-fixture", name: "Catch Up" }, night: { hour: 4, staleDays: 11 } }) },
    { root: "state", path: "work.json", text: json({
      marks: {}, groups: [{ id: "g-catchup", name: "Catch-up fixture group", at: 1761800000000, folders: [folder], about: MARK }],
      folders: [folder], hidden: [], order: ["g:g-catchup"], prefs: { prefix: "catchup/", archiveDays: 9 },
    }) },
  ];
}

/** reads one fixture file as it is now: its text, or null when it is not there */
export type Files = (root: Root, path: string) => string | null;
export type Fact = { id: string; say: string; read: (f: Files) => unknown };
const parsed = (f: Files, root: Root, path: string): any => { try { const t = f(root, path); return t === null ? undefined : JSON.parse(t); } catch { return undefined; } };
const has = (f: Files, root: Root, path: string, s: string) => (f(root, path)?.includes(s) ? s : undefined);

/** what must read back after the update (pure): each fact's value, or undefined when it is gone. The night job's numbers
 *  may be in team.json (before step 0002) or night.json (after it): either place counts */
export function facts(folder: string): Fact[] {
  return [
    { id: "memory-index", say: "the memory index's line", read: (f) => has(f, "home", "memory/MEMORY.md", "[Catch-up fixture note](catchup-note.md)") },
    { id: "memory-note", say: "a memory note", read: (f) => has(f, "home", "memory/catchup-note.md", MARK) },
    { id: "life-note", say: "a life note", read: (f) => has(f, "home", "life/catchup.md", MARK) },
    { id: "voice", say: "the voice in settings", read: (f) => parsed(f, "engine", "settings.json")?.voice },
    { id: "patience", say: "the patience in settings", read: (f) => parsed(f, "engine", "settings.json")?.patienceMs },
    { id: "look", say: "the look's opacity", read: (f) => parsed(f, "engine", "settings.json")?.look?.alpha },
    { id: "me", say: "who this Sol is (team.json)", read: (f) => { const m = parsed(f, "engine", "team.json")?.me; return m ? `${m.login}|${m.name}` : undefined; } },
    { id: "night", say: "the night job's hour and still-claim days", read: (f) => {
      const n = parsed(f, "engine", "night.json") ?? parsed(f, "engine", "team.json")?.night;
      return n && typeof n === "object" ? `${n.hour}|${n.staleDays}` : undefined;
    } },
    { id: "group", say: "a Work group", read: (f) => (parsed(f, "state", "work.json")?.groups ?? []).find?.((g: any) => g?.id === "g-catchup")?.name },
    { id: "folder", say: "a folder added by hand", read: (f) => ((parsed(f, "state", "work.json")?.folders ?? []).includes?.(folder) ? folder : undefined) },
    { id: "prefs", say: "Work's drawers", read: (f) => { const p = parsed(f, "state", "work.json")?.prefs; return p ? `${p.prefix}|${p.archiveDays}` : undefined; } },
  ];
}

export type Read = Record<string, unknown>;
export const readFacts = (list: Fact[], f: Files): Read => Object.fromEntries(list.map((x) => [x.id, x.read(f)]));

/** what the update lost (pure): every fact the old release kept that is gone or different after; and, apart, the facts
 *  the old release never kept itself (an older shape: not a loss of the update) */
export function lostOf(list: Fact[], before: Read, after: Read): { lost: string[]; notKept: string[] } {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const lost: string[] = [], notKept: string[] = [];
  for (const x of list) {
    if (before[x.id] === undefined) { notKept.push(x.say); continue; }
    if (!same(before[x.id], after[x.id])) lost.push(x.say);
  }
  return { lost, notKept };
}

export type HealthAnswer = { ok?: unknown; data?: { ok?: unknown; version?: unknown; latest?: unknown; ran?: unknown; failed?: { step?: unknown; error?: unknown }; ahead?: unknown } };
/** what is wrong with the new engine's /health, or "" (pure): it answers ok, its conversions say ok, every step it knows
 *  ran (version = latest), none failed and the data is not ahead of it */
export function healthWrong(h: HealthAnswer | null): string {
  if (!h) return "/health did not answer";
  if (h.ok !== true) return "/health did not say ok";
  const d = h.data;
  if (!d || typeof d !== "object") return "/health has no conversion state (data)";
  if (d.failed) return `conversion ${String(d.failed.step ?? "?")} failed: ${String(d.failed.error ?? "").slice(0, 160)}`;
  if (d.ahead) return `the data is newer than the release (data-version ${String(d.version)})`;
  if (d.ok !== true) return "the conversions did not say ok";
  if (d.version !== d.latest) return `data-version ${String(d.version)}, not ${String(d.latest)}: a step did not run`;
  return "";
}

// ---- the report (pure) ----

export type Result = {
  from: string;
  ok: boolean;
  /** where it went wrong: install (the old release), update (the move and build), health, lost, read (the engine's own read) */
  stage?: "install" | "update" | "health" | "read" | "lost";
  said?: string;
  ran?: string[];        // the conversion steps the new engine ran
  lost?: string[];
  notKept?: string[];
  ms: number;
};
export type Report = { machine: string; to: string; kind: Plan["kind"]; results: Result[]; reviewers: string[]; at: string; url?: string };

const mins = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
const cell = (s: string) => s.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim().replace(/@/g, "@\u200b").slice(0, 200);   // a table cell: one line, no pings from its text

/** the comment (pure): the first line is what the feed reads; a red one names the day's dev reviewers */
export function reportOf(r: Report): string {
  const bad = r.results.filter((x) => !x.ok);
  const n = r.results.length;
  const span = r.kind === "stable" ? "stamps (one a day; no dev release is older yet)" : "releases";
  const head = !n ? `**Catch-up passed** on ${r.machine}: nothing to catch up from (no release of the last ${DAYS} days before ${r.to}).`
    : !bad.length ? `**Catch-up passed** on ${r.machine}: ${n} of ${n} ${span} of the last ${DAYS} days updated to ${r.to}, healthy, nothing lost.`
    : `**Catch-up failed** on ${r.machine}: ${bad.length} of ${n} ${span} of the last ${DAYS} days did not update to ${r.to} cleanly (${bad.map((x) => x.from).slice(0, 4).join(", ")}${bad.length > 4 ? ", …" : ""}).`;
  const rows = r.results.map((x) => `| ${x.from} | ${x.ok ? "ok" : `**${x.stage}**`} | ${cell(x.ok ? (x.ran?.length ? `ran ${x.ran.join(", ")}` : "no step to run") : x.said || (x.lost ?? []).join(", "))} | ${mins(x.ms)} |`);
  const notKept = [...new Set(r.results.flatMap((x) => x.notKept ?? []))];
  const ping = bad.length && r.reviewers.length ? `\n${r.reviewers.map((l) => `@${l}`).join(" ")}: the day's dev review, a Sol on one of these releases would not update cleanly tonight.` : "";
  return [
    head,
    n ? `\n| from | | what happened | took |\n|---|---|---|---|\n${rows.join("\n")}` : "",
    notKept.length ? `\nNot kept by an older release itself (its shape then, not a loss of the update): ${notKept.join(", ")}.` : "",
    r.url ? `\nThe run: ${r.url}` : "",
    ping,
    `\n— the nightly catch-up (#423), ${r.at.slice(0, 16).replace("T", " ")} UTC`,
  ].filter(Boolean).join("\n");
}

/** the dev reviewers of a rhythm file's text (pure): logins only, none when it cannot be read */
export function reviewersOf(text: string | null): string[] {
  try {
    const v = JSON.parse(text ?? "");
    const d = Array.isArray(v?.dev) ? v.dev : typeof v?.dev === "string" ? [v.dev] : [];
    return d.map(String).filter((l: string) => /^[A-Za-z0-9-]{1,39}$/.test(l)).slice(0, 4);
  } catch { return []; }
}

/** the standing issue the reports go on */
export const ISSUE_TITLE = "Nightly catch-up test (#423)";

// ---- the run (impure) ----

type Out = { code: number; out: string };
export const PASS = ["PATH", "TMPDIR", "LANG", "SHELL", "USER", "TERM"] as const;
/** the engines' environment (pure): an allowlist of mine, a scratch HOME, nothing that reaches out */
export function engineEnv(base: NodeJS.ProcessEnv, home: string, port: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of PASS) { const v = base[k]; if (v !== undefined) env[k] = v; }
  return {
    ...env, HOME: home, PORT: String(port), SOL_PORT: String(port),
    SOL_QUIET: "1",   // quiet (src/quiet.ts, #1293); the releases before it read only the list below, so it stays until they are 30 days old
    SOL_HUB: "off", SOL_TRACK: "off", SOL_TRACK_URL: "off", SOL_NO_RENEW: "1", SOL_NO_SHIP_CHECK: "1", SOL_TEAM_OFFLINE: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}
/** a build step's environment: the allowlist, the real HOME (npm's cache), no prompt, no fund or audit call */
const buildEnv = (base: NodeJS.ProcessEnv) => {
  const env: Record<string, string> = {};
  for (const k of [...PASS, "HOME", "npm_config_cache"]) { const v = base[k]; if (v !== undefined) env[k] = v; }
  return { ...env, CI: "1", npm_config_fund: "false", npm_config_audit: "false", npm_config_update_notifier: "false", GIT_TERMINAL_PROMPT: "0" };
};

function sh(cmd: string, args: string[], cwd: string, env: Record<string, string>, timeout = 15 * 60_000): Promise<Out> {
  return new Promise((ok) => {
    // its own process group, so a timeout takes npm's lifecycle scripts with it (a grandchild holding the pipe would
    // keep `close` from ever firing)
    const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let out = "";
    const keep = (b: Buffer) => { out = (out + b.toString()).slice(-8000); };
    p.stdout.on("data", keep); p.stderr.on("data", keep);
    const t = setTimeout(() => { try { process.kill(-p.pid!, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch { /* gone */ } } }, timeout);
    p.on("error", (e) => { clearTimeout(t); ok({ code: 127, out: String(e.message) }); });
    p.on("close", (code) => { clearTimeout(t); ok({ code: code ?? 1, out }); });
  });
}
const tail = (s: string) => s.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim()).filter(Boolean).slice(-3).join(" / ").slice(0, 300);

const freePort = () => new Promise<number>((ok, no) => {
  const s = createServer();
  s.once("error", no);
  s.listen(0, "127.0.0.1", () => { const a = s.address(); const p = typeof a === "object" && a ? a.port : 0; s.close(() => ok(p)); });
});

/** Work's state file as the engine finds it under a HOME (state.ts's default) */
export const stateDirOf = (home: string, platform = process.platform) =>
  platform === "darwin" ? join(home, "Library", "Application Support", "com.marcol04.sol") : join(home, ".local", "share", "sol");

type Engine = { stop: () => Promise<void>; log: () => string };
function startEngine(engineDir: string, env: Record<string, string>): Engine {
  const p = spawn(process.execPath, ["dist/index.js"], { cwd: engineDir, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  const keep = (b: Buffer) => { log = (log + b.toString()).slice(-8000); };
  p.stdout?.on("data", keep); p.stderr?.on("data", keep);
  let done = false;
  const gone = new Promise<void>((ok) => p.once("exit", () => { done = true; ok(); }));
  const kill = (sig: NodeJS.Signals) => { try { process.kill(-p.pid!, sig); } catch { try { p.kill(sig); } catch { /* gone */ } } };
  return {
    log: () => log,
    stop: async () => {
      if (done) return;
      kill("SIGTERM");
      await Promise.race([gone, new Promise((ok) => setTimeout(ok, 10_000))]);
      if (!done) { kill("SIGKILL"); await Promise.race([gone, new Promise((ok) => setTimeout(ok, 3000))]); }
    },
  };
}

async function health(port: number, waitMs: number): Promise<HealthAnswer | null> {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return (await r.json()) as HealthAnswer;
    } catch { /* not up yet */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return null;
}

/** the engine reads it back itself: a memory note through /file, and the voice through settings.get on its socket */
async function readBack(port: number): Promise<string> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/file?path=${encodeURIComponent("memory/catchup-note.md")}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok || !(await r.text()).includes(MARK)) return `the engine did not read the memory note back (/file ${r.status})`;
  } catch (e) { return `the engine did not read the memory note back (${e instanceof Error ? e.message : e})`; }
  const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) return "";   // a node without WebSocket: /file was the read
  const voice = await new Promise<string>((ok) => {
    const ws = new WS(`ws://127.0.0.1:${port}`);
    const t = setTimeout(() => { try { ws.close(); } catch { /* closed */ } ok("no answer"); }, 10_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "settings.get" }));
    ws.onmessage = (e) => {
      try { const m = JSON.parse(String(e.data)); if (m?.type === "settings") { clearTimeout(t); ws.close(); ok(String(m.settings?.voice ?? "")); } } catch { /* another message */ }
    };
    ws.onerror = () => { clearTimeout(t); ok("the socket would not open"); };
  });
  return voice === "Puck" ? "" : `the engine's settings say voice "${voice}", not the saved "Puck"`;
}

/** to: the release's name (a tag, or "main"); toSha: its commit, which the shared clone has */
export type RunOpts = { root: string; scratch: string; to: string; toSha: string; keep?: boolean; say: (l: string) => void; env?: NodeJS.ProcessEnv };

/** one release caught up: install with the fixture, run, update, run, check. Never throws */
export async function catchUp(from: string, o: RunOpts): Promise<Result> {
  const t0 = Date.now();
  const env = o.env ?? process.env;
  const dir = mkdtempSync(join(o.scratch, `${from}-`));
  const repo = join(dir, "sol-checkout"), home = join(dir, "HOME"), folder = join(dir, "a-folder");
  const engineDir = join(repo, "sol", "engine");
  const be = buildEnv(env);
  const fail = (stage: Result["stage"], said: string, extra: Partial<Result> = {}): Result => ({ from, ok: false, stage, said, ms: Date.now() - t0, ...extra });
  const build = async (what: string): Promise<string> => {
    const ci = await sh("npm", ["ci", "--no-audit", "--no-fund", "--prefer-offline"], engineDir, be);
    if (ci.code) return `npm ci at ${what}: ${tail(ci.out)}`;
    const b = await sh("npm", ["run", "build", "--silent"], engineDir, be);
    return b.code ? `the build at ${what}: ${tail(b.out)}` : "";
  };
  const roots = (): Record<Root, string> => ({ home: join(repo, "sol", "home"), engine: engineDir, state: stateDirOf(home) });
  const files: Files = (root, path) => { try { return readFileSync(join(roots()[root], path), "utf8"); } catch { return null; } };
  let eng: Engine | null = null;
  try {
    mkdirSync(home, { recursive: true }); mkdirSync(folder, { recursive: true });
    const g = { ...be };
    const c = await sh("git", ["clone", "-q", "--shared", "--no-checkout", o.root, repo], dir, g);
    if (c.code) return fail("install", `the clone: ${tail(c.out)}`);
    const co = await sh("git", ["checkout", "-q", "--detach", from], repo, g);
    if (co.code) return fail("install", `checking out ${from}: ${tail(co.out)}`);
    o.say(`${from}: building`);
    const b1 = await build(from);
    if (b1) return fail("install", b1);
    for (const f of fixture(folder)) {
      const p = join(roots()[f.root], f.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.text);
    }
    const list = facts(folder);
    // the old release runs once with the data: what it reads and writes at start is what a Sol on it had saved
    let port = await freePort();
    eng = startEngine(engineDir, engineEnv(env, home, port));
    const h1 = await health(port, 90_000);
    await new Promise((ok) => setTimeout(ok, 3000));   // what it writes just after the start
    await eng.stop(); const log1 = eng.log(); eng = null;
    if (!h1) return fail("install", `${from}'s engine did not come up: ${tail(log1) || "no output"}`);
    const before = readFacts(list, files);
    // the update, as a Sol takes it: the same folder moves to the release, then npm ci and the build
    o.say(`${from}: updating to ${o.to}`);
    const mv = await sh("git", ["checkout", "-q", "--detach", o.toSha], repo, g);
    if (mv.code) return fail("update", `moving to ${o.to}: ${tail(mv.out)}`);
    const b2 = await build(o.to);
    if (b2) return fail("update", b2);
    port = await freePort();
    eng = startEngine(engineDir, engineEnv(env, home, port));
    const h2 = await health(port, 90_000);
    const wrong = healthWrong(h2);
    const ran = Array.isArray(h2?.data?.ran) ? (h2!.data!.ran as unknown[]).map(String) : [];
    if (wrong) { await eng.stop(); return fail("health", `${wrong}${h2 ? "" : `: ${tail(eng.log()) || "no output"}`}`, { ran }); }
    const read = await readBack(port);
    await new Promise((ok) => setTimeout(ok, 2000));
    await eng.stop(); eng = null;
    if (read) return fail("read", read, { ran });
    const { lost, notKept } = lostOf(list, before, readFacts(list, files));
    if (lost.length) return fail("lost", `lost: ${lost.join(", ")}`, { ran, lost, notKept });
    return { from, ok: true, ran, notKept, ms: Date.now() - t0 };
  } catch (e) {
    return fail("install", `the run itself: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    if (eng) await eng.stop();
    if (!o.keep) rmSync(dir, { recursive: true, force: true });
  }
}

// ---- run as a program: node dist/team/catchup.js [--list] [--days N] [--to <tag|main>] [--only <tag>,…] [--max N]
//      [--keep] [--machine name] [--out file.md] [--post owner/name] [--url run-url] ----

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main(argv: string[]): Promise<number> {
  const val = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] ?? "" : undefined; };
  const root = resolve(ENGINE, "..", "..");
  const env = buildEnv(process.env);
  const refs = await sh("git", ["for-each-ref", "--format=%(refname:short) %(creatordate:unix)", "refs/tags/dev-*", "refs/tags/stable-*"], root, env, 60_000);
  if (refs.code) { console.error(`catchup: git could not list the tags: ${tail(refs.out)}`); return 2; }
  const days = Number(val("--days") ?? DAYS), max = Number(val("--max") ?? 0);
  if (!(days > 0 && days <= 365) || !(max >= 0)) { console.error("catchup: --days takes 1 to 365, --max a number"); return 2; }
  const only = (val("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const plan = planOf(tagsOf(refs.out), Date.now(), { days, to: val("--to") || undefined, only, max });
  const machine = (val("--machine") || hostname().split(".")[0] || "this machine").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40);
  if (!plan.to) { console.error("catchup: no release to catch up to (no dev-* or stable-* tag here; git fetch --tags)"); return 2; }
  // the target's commit: a tag as it is, main as origin knows it (else the local main), never this checkout's own branch
  // (any other name: a tag first, then whatever git reads it as, so a branch can be tried by hand: --to HEAD)
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(plan.to.tag) || plan.to.tag.includes("..")) { console.error("catchup: --to takes a release, main or a branch"); return 2; }
  const want = plan.to.tag === "main" ? ["refs/remotes/origin/main", "refs/heads/main"] : [`refs/tags/${plan.to.tag}`, plan.to.tag];
  let toSha = "";
  for (const r of want) { const x = await sh("git", ["rev-parse", "--verify", "-q", `${r}^{commit}`], root, env, 30_000); if (!x.code) { toSha = x.out.trim(); break; } }
  if (!/^[0-9a-f]{40}$/.test(toSha)) { console.error(`catchup: ${plan.to.tag} is not known here (git fetch --tags origin)`); return 2; }
  console.log(`catchup on ${machine}: ${plan.from.length} ${plan.kind === "stable" ? "stamp" : "release"}${plan.from.length === 1 ? "" : "s"} to ${plan.to.tag}${plan.from.length ? `: ${plan.from.map((t) => t.tag).join(" ")}` : ""}`);
  if (argv.includes("--list")) return 0;
  const scratch = mkdtempSync(join(tmpdir(), "sol-catchup-"));
  const results: Result[] = [];
  try {
    for (const t of plan.from) {
      const r = await catchUp(t.tag, { root, scratch, to: plan.to.tag, toSha, keep: argv.includes("--keep"), say: (l) => console.log(`  ${l}`) });
      console.log(`${r.ok ? "ok  " : "FAIL"} ${t.tag}${r.ok ? (r.ran?.length ? `: ran ${r.ran.join(", ")}` : "") : ` (${r.stage}): ${r.said}`}, ${mins(r.ms)}`);
      results.push(r);
    }
  } finally {
    if (!argv.includes("--keep")) rmSync(scratch, { recursive: true, force: true });
    else console.log(`kept: ${scratch}`);
  }
  const rhythm = (() => { try { return readFileSync(join(root, ".sol", "rhythm.json"), "utf8"); } catch { return null; } })();
  const text = reportOf({ machine, to: plan.to.tag, kind: plan.kind, results, reviewers: reviewersOf(rhythm), at: new Date().toISOString(), url: val("--url") || undefined });
  const out = val("--out");
  if (out) writeFileSync(out, text + "\n");
  const post = val("--post");
  if (post) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(post)) { console.error("catchup: --post takes owner/name"); return 2; }
    const said = await postReport(post, text, root);
    console.log(said);
  }
  console.log(text.split("\n")[0]);
  return results.every((r) => r.ok) ? 0 : 1;
}

/** the report on the standing issue (made once, by whoever posts first): gh with the job's token */
async function postReport(repo: string, text: string, cwd: string): Promise<string> {
  if (isQuiet()) return "catchup: quiet (SOL_QUIET), the report is not posted";
  const env = { ...buildEnv(process.env), ...(process.env.GH_TOKEN ? { GH_TOKEN: process.env.GH_TOKEN } : {}), ...(process.env.GITHUB_TOKEN ? { GITHUB_TOKEN: process.env.GITHUB_TOKEN } : {}) };
  const find = await sh("gh", ["issue", "list", "-R", repo, "--state", "open", "--search", `"${ISSUE_TITLE}" in:title`, "--json", "number,title", "--limit", "20"], cwd, env, 60_000);
  let n = 0;
  try { n = (JSON.parse(find.out) as { number: number; title: string }[]).find((i) => i.title === ISSUE_TITLE)?.number ?? 0; } catch { /* none */ }
  const body = join(mkdtempSync(join(tmpdir(), "sol-catchup-post-")), "body.md");
  try {
    if (!n) {
      writeFileSync(body, `Where the nightly catch-up test (#423, \`.github/workflows/catchup.yml\`) says each night how every release of the last ${DAYS} days updated to the newest one, on the NucBox and the MacBook. A red one names the day's dev reviewer.\n\n— the nightly catch-up (#423)\n`);
      const made = await sh("gh", ["issue", "create", "-R", repo, "--title", ISSUE_TITLE, "--body-file", body], cwd, env, 60_000);
      n = Number(/\/issues\/(\d+)/.exec(made.out)?.[1] ?? 0);
      if (!n) return `catchup: the issue could not be made: ${tail(made.out)}`;
    }
    writeFileSync(body, text + "\n");
    const c = await sh("gh", ["issue", "comment", String(n), "-R", repo, "--body-file", body], cwd, env, 60_000);
    return c.code ? `catchup: the report did not post: ${tail(c.out)}` : `catchup: the report is on ${repo}#${n}`;
  } finally { rmSync(dirname(body), { recursive: true, force: true }); }
}

const real = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`catchup: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
