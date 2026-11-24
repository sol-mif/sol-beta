// The move-in's second read (#1615, BR1; mine/look/br1/movein.html): what a person already has in Claude Code and Codex
// on this Mac, so that downloading Sol improves what they already have. READ ONLY, through carry's one Reader (read a
// file, read a file's head, a file's time, list a folder; nothing else): nothing is ever written under ~/.claude,
// ~/.codex, or anywhere. carry.test.ts hashes every file before and after and lists every path opened.
// What it reads, and from where:
//   places   each Claude Code project's newest transcripts (CLAUDE_CONFIG_DIR or ~/.claude, projects/<dir>/*.jsonl): the
//            cwd in a transcript's head (listed.ts cwdIn; the folder names are never decoded); each Codex rollout
//            (CODEX_HOME or ~/.codex, sessions/YYYY/MM/DD/rollout-*.jsonl): the cwd and originator of its session_meta.
//            One place per folder that is still on disk (a linked git worktree counts as its repo; a folder inside a
//            project folds into it unless it has its own git root, rules file or .claude/), with its session
//            count per app, when it was last used and when its first session began (C-2: who made a folder); the home folder itself, temporary folders and Sol's own are left
//            out, as are Codex's own one-shot and internal runs. Its kind is read from what it holds, never its name: a
//            repo or code is build; anything else is unsure (null), for the person to say
//   rules    whether CLAUDE.md, .claude/CLAUDE.md or AGENTS.md exists in the place: which file, never what it says
//   ais      one row per app found: its skill names (folders with SKILL.md under skills/ and enabled plugins' skills/, grouped ones too), its connected tools'
//            names (Claude: mcpServers in .claude.json and settings.json; Codex: config.toml [mcp_servers.<name>]), and
//            how it asks before acting (Claude: permissions.defaultMode; Codex: approval_policy), in plain words.
//            NAMES ONLY: no key, env, header, command, arg or token is ever carried
//   apps     { app, projects, sessions } per app found
// Signed: marcocyl04-ux's agent, BR1 move-in (#1615).
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cwdIn } from "../work/listed.js";
import type { Reader } from "./carry.js";

export type App = "claude" | "codex";
/** skip: apps' own folders; home: Sol's own home, left out but for a project of the person's inside it (its own rules
 *  file or git root: a Home folder); temp: the machine's temporary folders (a session there is a throwaway, never a place) */
export type Apps = { claude?: string; claudeJson?: string; codex?: string; user?: string; skip?: string[]; home?: string[]; temp?: string[] };
export type AppPlace = {
  path: string; name: string; label: string; kind: "build" | null; repo: boolean; code: boolean;
  rules: string[]; sessions: Partial<Record<App, number>>; last: number; from: App;
  /** when its first session began (ms): the oldest transcript's first timestamp (a Codex rollout's name), else its time */
  first: number;
  /** another copy of the repo at this path, listed too (copiesOf) */
  copyOf?: string;
};
export type AppAi = { id: string; name: string; app: App; skills: string[]; tools: string[]; mode?: string };
export type AppsRead = { places: AppPlace[]; ais: AppAi[]; apps: { app: App; projects: number; sessions: number }[] };

const CAP = 60, CODEX_FILES = 1500, CLAUDE_TRIES = 3;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const json = (r: Reader, p: string): unknown => { const t = r.text(p); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } };
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|kts|swift|c|cc|cpp|h|hpp|cs|php|scala|ex|exs|clj|dart|lua|r|jl|zig|vue|svelte|sh|sql)$/i;
const MANIFEST = new Set(["package.json", "Cargo.toml", "pyproject.toml", "go.mod", "Makefile", "Gemfile", "pom.xml", "build.gradle", "Package.swift", "requirements.txt", "deno.json", "composer.json", "CMakeLists.txt", "mix.exs"]);
const RULES = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"];

/** what a folder holds, from its names alone: a repo or code is build, anything else unsure; which rules files it has */
export function holdsOf(r: Reader, path: string): { repo: boolean; code: boolean; kind: "build" | null; rules: string[] } {
  const names = r.list(path) ?? [];
  const has = (n: string, dir?: boolean) => names.some((x) => x.name === n && (dir === undefined || x.dir === dir));
  const repo = has(".git");
  const code = names.some((x) => (!x.dir && (CODE.test(x.name) || MANIFEST.has(x.name))) || (x.dir && (x.name === "src" || x.name === "lib")));
  const inner = has(".claude", true) ? r.list(join(path, ".claude")) ?? [] : [];
  const rules = RULES.filter((f) => f.startsWith(".claude/") ? inner.some((x) => !x.dir && x.name === "CLAUDE.md") : names.some((x) => !x.dir && x.name === f));
  return { repo, code, kind: repo || code ? "build" : null, rules };
}

/** a folder's git checkout: the nearest folder at or above it holding a .git (the walk ends before `stop`, the person's
 *  home), whether it is the repo's own (not a linked worktree), and what makes two checkouts one repo: its common git
 *  folder and its origin's address. Read only: the .git file, commondir and config, never anything else; null: none */
export function checkoutOf(r: Reader, path: string, stop = ""): { root: string; main: boolean; same: string[] } | null {
  const has = (dir: string, f: string) => (r.list(dir) ?? []).some((x) => !x.dir && x.name === f);   // a file is opened only once its folder lists it
  for (let d = path.replace(/\/+$/, ""), n = 0; d && d !== "/" && d !== stop && n < 16; d = dirname(d), n++) {
    const g = (r.list(d) ?? []).find((x) => x.name === ".git");
    if (!g) continue;
    let common = join(d, ".git");
    if (!g.dir) {
      const m = /gitdir:\s*(.+?)\s*$/m.exec(r.text(common) ?? "");
      if (!m) return null;
      const gd = resolve(d, m[1]), cd = has(gd, "commondir") ? r.text(join(gd, "commondir"))?.trim() : "";
      common = cd ? resolve(gd, cd) : gd.replace(/\/worktrees\/[^/]+$/, "");
    }
    const url = has(common, "config") ? /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(r.text(join(common, "config")) ?? "")?.[1] : undefined;
    return { root: d, main: g.dir, same: [`git:${common.replace(/\/+$/, "")}`, ...(url ? [`url:${urlKey(url)}`] : [])] };
  }
  return null;
}
/** one address for a remote however it is written: git@host:a/b.git, https://host/a/b, ssh://git@host/a/b → host/a/b */
const urlKey = (u: string) => u.trim().toLowerCase().replace(/^[a-z+]+:\/\/(?:[^@/]+@)?/, "").replace(/^[^@/]+@([^:/]+):/, "$1/").replace(/\/+$/, "").replace(/\.git$/, "");

/** which places are another copy of a repo listed among them: path → the repo's path. The repo is a place that is a
 *  repo's own checkout, the one with the most sessions first (then the shorter path); a copy is a place in another
 *  checkout of the same repo (its worktree, a clone with the same remote, or a folder inside either). A folder inside
 *  the repo's own checkout is not a copy (it is the repo); a repo's own checkout is a copy only of one ranked before it */
export function copiesOf(r: Reader, ps: readonly { path: string; sessions: Partial<Record<App, number>> }[], stop = ""): Map<string, string> {
  const lists = new Map<string, ReturnType<Reader["list"]>>();
  const rr: Reader = { ...r, list: (p) => { if (!lists.has(p)) lists.set(p, r.list(p)); return lists.get(p)!; } };
  const co = new Map(ps.map((p) => [p.path, checkoutOf(rr, p.path, stop)] as const));
  const n = (p: (typeof ps)[number]) => (p.sessions.claude ?? 0) + (p.sessions.codex ?? 0);
  const repos = ps.filter((p) => { const c = co.get(p.path); return !!c && c.main && c.root === p.path; }).sort((a, b) => n(b) - n(a) || a.path.length - b.path.length);
  const out = new Map<string, string>();
  for (const p of ps) {
    const c = co.get(p.path), rank = repos.indexOf(p);
    if (!c || (rank < 0 && repos.some((q) => co.get(q.path)!.root === c.root))) continue;   // inside a listed repo's own checkout: that repo
    const of = repos.find((q, i) => q !== p && (rank < 0 || i < rank) && co.get(q.path)!.root !== c.root && co.get(q.path)!.same.some((k) => c.same.includes(k)));
    if (of) out.set(p.path, of.path);
  }
  return out;
}

/** where the apps live on this machine, from the environment (CLAUDE_CONFIG_DIR, CODEX_HOME, HOME); ~/Library holds
 *  apps' own folders (Sol's among them), never a person's project; home: Sol's own home(s) */
export function appsWhere(user: string, env: NodeJS.ProcessEnv = process.env, home: string[] = []): Apps {
  const claude = env.CLAUDE_CONFIG_DIR?.trim() || join(user, ".claude");
  return {
    claude, claudeJson: env.CLAUDE_CONFIG_DIR?.trim() ? join(claude, ".claude.json") : join(user, ".claude.json"),
    codex: env.CODEX_HOME?.trim() || join(user, ".codex"), user, skip: [join(user, "Library")], home,
    temp: [...new Set(["/tmp", "/private/tmp", "/var/folders", "/private/var/folders", tmpdir()])],
  };
}

/** the words for how an app asks before it acts (null: not simply readable) */
const CLAUDE_MODE: Record<string, string> = { default: "asks before it edits", acceptEdits: "edits without asking", plan: "plans before it acts", bypassPermissions: "doesn't ask", dontAsk: "doesn't ask", auto: "decides when to ask" };
const CODEX_MODE: Record<string, string> = { untrusted: "asks before most commands", "on-request": "asks when it needs to", "on-failure": "asks when a command fails", never: "doesn't ask" };

export function readApps(a: Apps, r: Reader): AppsRead {
  const user = (a.user ?? "").replace(/\/+$/, "");
  const own = [a.claude, a.codex, ...(a.skip ?? [])].filter((x): x is string => !!x).map((x) => x.replace(/\/+$/, ""));
  const under = (p: string, root: string) => p === root || p.startsWith(root + "/");
  const temp = (a.temp ?? []).map((x) => x.replace(/\/+$/, "")).filter(Boolean);
  const homes = (a.home ?? []).map((x) => x.replace(/\/+$/, "")).filter(Boolean);
  const heldIn = (p: string) => homes.find((h) => under(p, h));
  const left = (p: string) => !p.startsWith("/") || p === "/" || p === user || temp.some((t) => under(p, t)) || own.some((o) => under(p, o))
    || /\/Library\/Application Support\/[^/]+\/scratch-workspaces\//.test(p);
  const seen = new Map<string, AppPlace>();
  const roots = new Map<string, string | null>();

  /** the folder a cwd counts as: a linked git worktree's repo, else itself; null when gone or left out */
  const rootOf = (cwd: string): string | null => {
    const c = cwd.replace(/\/+$/, "") || "/";
    if (roots.has(c)) return roots.get(c)!;
    let out: string | null = null;
    if (!left(c)) {
      const names = r.list(c);
      if (names) {
        out = c;
        const g = names.find((n) => n.name === ".git");
        if (g && !g.dir) {
          const m = /gitdir:\s*(.+?)\/\.git\/worktrees\/[^/\s]+\s*$/m.exec(r.text(join(c, ".git")) ?? "");
          if (m && m[1] !== c && !left(m[1]) && r.list(m[1])) out = m[1];
        }
      }
    }
    roots.set(c, out);
    return out;
  };
  const count = (cwd: string, app: App, n: number, last: number, first: number) => {
    const p = rootOf(cwd);
    if (!p) return;
    const had = seen.get(p);
    if (had) { had.sessions[app] = (had.sessions[app] ?? 0) + n; had.last = Math.max(had.last, last); had.first = Math.min(had.first, first); return; }
    seen.set(p, { path: p, name: basename(p), label: user && under(p, user) ? "~" + p.slice(user.length) : p, kind: null, repo: false, code: false, rules: [], sessions: { [app]: n }, last, first, from: app });
  };

  // Claude Code: one folder per project under projects/, each holding its sessions' transcripts
  const pj = a.claude ? join(a.claude, "projects") : "";
  let claudeFound = false;
  for (const d of (pj ? r.list(pj) : null) ?? []) {
    if (!d.dir) continue;
    const dir = join(pj, d.name);
    const files = (r.list(dir) ?? []).filter((f) => !f.dir && f.name.endsWith(".jsonl")).map((f) => ({ p: join(dir, f.name), t: r.time(join(dir, f.name)) ?? 0 })).sort((x, y) => y.t - x.t);
    if (!files.length) continue;
    claudeFound = true;
    // the newest transcripts name where they ran; a project's sessions all ran in one folder (the SDK's own grouping)
    let cwd = "";
    for (const f of files.slice(0, CLAUDE_TRIES)) { cwd = cwdIn(r.head(f.p, 16384) ?? "") || cwdIn(r.head(f.p, 65536) ?? ""); if (cwd) break; }
    if (!cwd) continue;
    // the first session began at the oldest transcript's first timestamp (its time when its head says none)
    const old = files[files.length - 1], t0 = Date.parse(/"timestamp":"([^"]+)"/.exec(r.head(old.p, 4096) ?? "")?.[1] ?? "");
    count(cwd, "claude", files.length, files[0].t, Number.isFinite(t0) ? t0 : old.t);
  }

  // Codex: every rollout's first line says where it ran and what started it
  const cx = a.codex ? join(a.codex, "sessions") : "";
  let codexFound = false, read = 0;
  const desc = (p: string, re: RegExp) => (r.list(p) ?? []).filter((x) => x.dir && re.test(x.name)).map((x) => x.name).sort().reverse();
  outer: for (const y of cx ? desc(cx, /^\d{4}$/) : []) for (const m of desc(join(cx, y), /^\d{2}$/)) for (const dd of desc(join(cx, y, m), /^\d{2}$/)) {
    const day = join(cx, y, m, dd);
    for (const f of (r.list(day) ?? []).filter((x) => !x.dir && /^rollout-.*\.jsonl$/.test(x.name)).map((x) => x.name).sort().reverse()) {
      if (read++ >= CODEX_FILES) break outer;
      const p = join(day, f);
      const head = r.head(p, 4096) ?? "";
      const line = (head.includes("\n") || head.length < 4096 ? head : r.head(p, 65536) ?? "").split("\n")[0];
      codexFound = true;
      const cwd = cwdIn(line), origin = /"originator":"([^"\\]*)"/.exec(line)?.[1] ?? "";
      if (!cwd || origin === "codex_exec" || origin === "sol_internal") continue;
      const at = /^rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/.exec(f), t = r.time(p) ?? 0;
      count(cwd, "codex", 1, t, at ? new Date(+at[1], +at[2] - 1, +at[3], +at[4], +at[5], +at[6]).getTime() : t);
    }
  }

  // each place: what it holds and which rules files it has
  // what each holds; a folder inside a project found here is part of it (its sessions go to the innermost one), unless
  // it is a project of its own: its own git root, its own rules file (CLAUDE.md, AGENTS.md) or its own .claude/. Inside
  // Sol's own home only such projects count (the person's Home folders); its root and its plain folders are Sol's
  const all = [...seen.values()].sort((x, y) => x.path.length - y.path.length);
  for (const p of all) Object.assign(p, holdsOf(r, p.path));
  const self = new Set(all.filter((p) => !homes.includes(p.path) && (p.repo || p.rules.length || (r.list(p.path) ?? []).some((x) => x.dir && x.name === ".claude"))).map((p) => p.path));
  const kept: AppPlace[] = [];
  for (const p of all) {
    const h = heldIn(p.path);
    const up = self.has(p.path) ? null : kept.filter((q) => self.has(q.path) && under(p.path, q.path) && (!h || under(q.path, h))).pop();
    if (h && !self.has(p.path) && !up) continue;
    if (!up) { kept.push(p); continue; }
    for (const app of ["claude", "codex"] as const) if (p.sessions[app]) up.sessions[app] = (up.sessions[app] ?? 0) + p.sessions[app]!;
    up.last = Math.max(up.last, p.last); up.first = Math.min(up.first, p.first);
  }
  for (const p of kept) p.from = (p.sessions.codex ?? 0) > (p.sessions.claude ?? 0) ? "codex" : "claude";
  const places = kept.sort((x, y) => y.last - x.last || (x.path < y.path ? -1 : 1)).slice(0, CAP);
  // a second checkout of a repo listed here (a linked worktree of it, a clone with its remote), or a folder inside one,
  // stands inside that repo's folder as another copy, never at the top (BR1 order 4e): copyOf, the repo's path
  for (const [p, of] of copiesOf(r, places, user)) places.find((x) => x.path === p)!.copyOf = of;
  const tally = (app: App) => ({ app, projects: kept.filter((p) => p.sessions[app]).length, sessions: kept.reduce((n, p) => n + (p.sessions[app] ?? 0), 0) });

  // the apps themselves
  const ais: AppAi[] = [];
  // a skill is a folder holding SKILL.md (or holding no folders); any other folder groups skills (a plugin's categories,
  // a synced bucket) and is looked into, three levels at most
  const skillsIn = (dir: string, depth = 3): string[] => (r.list(dir) ?? []).filter((x) => x.dir && !x.name.startsWith(".")).flatMap((x) => {
    const inside = r.list(join(dir, x.name)) ?? [];
    const group = depth > 1 && !inside.some((y) => !y.dir && y.name === "SKILL.md") && inside.some((y) => y.dir && !y.name.startsWith("."));
    return group ? skillsIn(join(dir, x.name), depth - 1) : [x.name];
  });
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => typeof x === "string" && x && x.length <= 200))].sort((x, y) => x.localeCompare(y));
  if (a.claude) {
    const settings = json(r, join(a.claude, "settings.json"));
    const cj = a.claudeJson ? json(r, a.claudeJson) : null;
    const own = skillsIn(join(a.claude, "skills"));
    const enabled = isObj(settings) && isObj(settings.enabledPlugins) ? settings.enabledPlugins : null;
    const inst = json(r, join(a.claude, "plugins", "installed_plugins.json"));
    const plug: string[] = [];
    if (isObj(inst) && isObj(inst.plugins)) for (const [name, list] of Object.entries(inst.plugins)) {
      if (enabled && enabled[name] === false) continue;
      for (const e of Array.isArray(list) ? list : []) if (isObj(e) && typeof e.installPath === "string") plug.push(...skillsIn(join(e.installPath, "skills")));
    }
    const tools = [cj, settings].flatMap((o) => (isObj(o) && isObj(o.mcpServers) ? Object.keys(o.mcpServers) : []));
    const dm = isObj(settings) && isObj(settings.permissions) ? settings.permissions.defaultMode : undefined;
    const mode = dm === undefined ? CLAUDE_MODE.default : typeof dm === "string" ? CLAUDE_MODE[dm] : undefined;
    const any = claudeFound || own.length || plug.length || tools.length || settings !== null;
    if (any) ais.push({ id: "app:claude", name: "Claude Code", app: "claude", skills: uniq([...own, ...plug]), tools: uniq(tools), ...(mode ? { mode } : {}) });
  }
  if (a.codex) {
    const toml = r.text(join(a.codex, "config.toml"));
    const tools: string[] = [];
    let mode: string | undefined;
    if (toml !== null) {
      let top = true;
      for (const l of toml.split("\n")) {
        const s = l.trim();
        if (s.startsWith("[")) {
          top = false;
          const m = /^\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))/.exec(s);
          if (m) tools.push(m[1] ?? m[2] ?? m[3]);
        } else if (top) {
          const m = /^approval_policy\s*=\s*["']([^"']+)["']/.exec(s);
          if (m) mode = CODEX_MODE[m[1]];
        }
      }
    }
    const skills = skillsIn(join(a.codex, "skills"));
    if (codexFound || toml !== null || skills.length) ais.push({ id: "app:codex", name: "Codex", app: "codex", skills: uniq(skills), tools: uniq(tools), ...(mode ? { mode } : {}) });
  }

  const apps: AppsRead["apps"] = [];
  if (ais.some((x) => x.app === "claude")) apps.push(tally("claude"));
  if (ais.some((x) => x.app === "codex")) apps.push(tally("codex"));
  return { places, ais, apps };
}

