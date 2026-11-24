// The read behind "How Sol sees you" (BR1, #1615; the brief on #1615, E3, E5, E12, E13, E18): what this Mac says
// about how a person works, names and counts only, every item through the sieve (sieve.ts) before it is counted, and
// every step streamed as it happens so the person watches Sol read. It runs only the sources it is given (you.ts gives
// only the ones the person's record says yes to), one at a time, in the order their aims chose. It composes the readers
// that exist and copies none of them:
//   claude-sessions, codex-sessions   carry-apps.ts readApps (places, skills, MCP servers, how each app asks), and here:
//                                     each session file's time (the day strip), length, and the names of the tools and
//                                     skills its turns used, counted (tool_use names, never a word of the text)
//   apps, files, projects             onboard/explore.mjs, the explorer, as a child (--stops-said, only those stops,
//                                     --deny notes), its live file followed while it works
//   notes, calendar-store             onboard/places/read.mjs readStore (titles and dates; Sol.app's places_copy folder
//                                     first, given as `from`)
//   browser                           the browsers' history, hosts and visit counts only: titles are never selected
// Mail and Messages wait for BR2. A reader that cannot run says so in one plain line and the read goes on: never a throw.
// READ ONLY: nothing is written outside SOL_HOME/next/ (the explorer's live file sits in a 0700 folder there and is
// deleted at the end).
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { execFileSync, spawn } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fsReader, type Reader } from "./carry.js";
import { readApps, appsWhere, type AppsRead } from "./carry-apps.js";
import { cwdIn } from "../work/listed.js";
import { makeSieve, type Bin, type Thrown } from "./sieve.js";
import { nextDir } from "./file.js";

export const SOURCES = ["claude-sessions", "codex-sessions", "apps", "browser", "calendar-store", "notes", "files", "projects"] as const;
export type Source = (typeof SOURCES)[number];
export const okSources = (v: unknown): Source[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is Source => (SOURCES as readonly string[]).includes(s)))] : []);
/** each source in the person's words (the face may say them in its own) */
export const LABEL: Record<Source, string> = {
  "claude-sessions": "Claude Code", "codex-sessions": "Codex", apps: "your apps", browser: "your browsers",
  "calendar-store": "your calendar", notes: "your notes", files: "your files", projects: "your code",
};

/** a tool in the person's words, or null when it is no tool they would know. Known: one they set up themselves (a server
 *  in their AI's own config, `mine`; a connector on their Claude account, claude_ai_<Name>; a plugin's, plugin_<p>_<name>)
 *  by its name in plain words; one their app brings, by the thing it is (a browser, a terminal); a server named in one
 *  word, as a product is (github). Left out: an app's internal id (words run together by underscores, ccd_turn) and
 *  Sol's own. The rule is the id's shape and where it came from, never a list of names (pure) */
const OWN = "sol";   // the server Sol hands its seats itself (index.ts: mcpServers { sol })
const KINDS: [RegExp, string][] = [[/\b(browser|chrome)\b/i, "the browser"], [/\b(terminal|shell)\b/i, "the terminal"]];
export function plainTool(id: string, mine: ReadonlySet<string>): string | null {
  if (id.toLowerCase() === OWN) return null;
  const words = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b(mcp|server)\b/gi, " ").replace(/\s+/g, " ").trim() || null;
  const own = /^claude_ai_(.+)$/.exec(id) ?? /^plugin_[^_]+_(.+)$/.exec(id);
  if (own) return words(own[1]);
  if (mine.has(id)) return words(id);
  const said = words(id) ?? "";
  for (const [re, name] of KINDS) if (re.test(said)) return name;
  return /^[A-Za-z][A-Za-z0-9.-]*$/.test(id) ? id : null;
}

/** the names the read knows as places (a folder's or a repository's name, its folder's own name, its label), lowercased:
 *  a tool by one of these is the project itself ("Uses sol here" in sol), never a tool (pure) */
export const namesOf = (places: readonly { name: string; path: string; label?: string }[]): Set<string> =>
  new Set(places.flatMap((p) => [p.name, p.path ? basename(p.path) : "", p.label ?? ""]).map((s) => s.trim().toLowerCase()).filter(Boolean));

export type State = "waiting" | "reading" | "done" | "skipped" | "stopped";
export type Closed = { what: string; perm: string; line: string };
/** one step of the read, as the face draws it (E12, E18). `item` names a thing, never a body */
export type Ev =
  | { kind: "order"; order: Source[]; because: { aim: string; line: string } | null }
  | { kind: "source"; source: Source; state: State; line: string; perm?: string }
  | { kind: "item"; source: Source; item: string; notice?: string; setup?: string; perm?: string; place?: string; more?: More; open?: Open; again?: string }   // place: a folder's line, said again with its new count; again: the row next.you.read.again was asked from
  | { kind: "thrown"; source: Source; item: string; bin: Bin; n: number }
  | { kind: "place"; id: string; name: string; colour: string; share: number };
/** what one read row took, for the row opened on the Reading screen (BR1 rapid 13:05, #1615): the thing's own name, what
 *  Sol takes it to be, and what it added to how Sol sees the person (`adds`, one sentence), with the facts behind it:
 *  a folder's kinds of files, its sessions per AI and its last activity; a browser's sites grouped by what they are for;
 *  a file's kind and where it is (its name only: the read never opens a file). Names and counts, as the item itself */
export type More = {
  kind: "folder" | "sites" | "file" | "app" | "notes" | "date" | "skill" | "tool";
  name: string; adds: string;
  is?: string; where?: string; kinds?: string[]; sessions?: { claude?: number; codex?: number }; last?: string;
  groups?: { what: string; n: number; sites: string[] }[]; n?: number; open?: boolean; at?: string; by?: string;
};
/** a skill's id in words: the part after its pack's prefix, its dashes as spaces ("pack-name:grilling" → "grilling") */
export const plainSkill = (id: string) => id.slice(id.lastIndexOf(":") + 1).replace(/[-_]+/g, " ").trim() || id;
/** what a working folder is, from what is in it: code (its main language), instructions for an AI, or a folder of work */
export const folderIs = (p: Pick<SeenPlace, "repo" | "langs" | "rules">) =>
  p.repo || p.langs.length ? (p.langs.length ? `a code project, mostly ${p.langs[0]}` : "a code project")
    : p.rules.length ? "a folder with instructions for your AI" : "a folder you work on with your AI";
/** a file's kind from its name's ending, in words */
export function fileIs(name: string): string {
  const x = extname(name).slice(1).toLowerCase();
  if (x === "pdf") return "a PDF";
  if (/^(docx?|pages|odt|rtf)$/.test(x)) return "a document";
  if (/^(xlsx?|numbers|csv|ods)$/.test(x)) return "a spreadsheet";
  if (/^(pptx?|key|odp)$/.test(x)) return "a slide deck";
  if (/^(png|jpe?g|heic|gif|webp|tiff?)$/.test(x)) return "a picture";
  if (/^(mp4|mov|m4v|avi)$/.test(x)) return "a video";
  if (/^(mp3|m4a|wav|aiff?)$/.test(x)) return "a recording";
  if (/^(zip|dmg|tar|gz|rar)$/.test(x)) return "an archive";
  if (/^(md|txt)$/.test(x)) return "a text file";
  return LANG[x] ? `${LANG[x]} code` : "a file";
}
/** a browser's sites grouped by what they are for, most visited first: each group's visits and its three most visited */
export function siteGroups(hosts: readonly { host: string; n: number; group: string }[]): { what: string; n: number; sites: string[] }[] {
  const g = new Map<string, { host: string; n: number }[]>();
  for (const h of hosts) g.set(h.group, [...(g.get(h.group) ?? []), h]);
  return [...g].map(([what, hs]) => ({ what, n: hs.reduce((s, h) => s + h.n, 0), sites: [...hs].sort((x, y) => y.n - x.n).slice(0, 3).map((h) => h.host) }))
    .sort((x, y) => (x.what === "other" ? 1 : 0) - (y.what === "other" ? 1 : 0) || y.n - x.n).slice(0, 6);
}

/** a read row opened (BR1 reading.html screen 2, #1615): what Sol looked at to make it (names, counts, dates: never a
 *  body), the lines it kept of the person, each with where it came from and its key, and what it left alone. A kept
 *  line's k goes to next.you.fact.forget (×): a place's language is tool:<place>:<it>, as the picture's knows say it; any
 *  other thing the read saw is read:<kind>:<name>, which keeps that thing out of every later read (ReadIn.forgot) */
export type Open = { looked: string[]; kept: { line: string; from: string; k: string }[]; left: string[] };
export type ReadKind = "skill" | "tool" | "app" | "date" | "sites" | "notes" | "file";
export const readKey = (kind: ReadKind, name: string) => `read:${kind}:${name}`;
export const READ_KEY = /^read:(skill|tool|app|date|sites|notes|file):.+$/;
const APP_W = { claude: "Claude Code", codex: "Codex" } as const;
/** a row's Open from its own More (pure). id: the place a folder row stands for; rules: the rules files it has (their
 *  names: the read never opens one); forgot: the keys already forgotten, whose lines are not kept again */
export function openOf(source: Source, m: More, x: { id?: string; rules?: readonly string[]; forgot?: ReadonlySet<string> } = {}): Open {
  const by = LABEL[source], gone = x.forgot ?? new Set<string>();
  const keep = (ls: Open["kept"]) => ls.filter((l) => !gone.has(l.k));
  const one = (kind: ReadKind, line: string, from: string) => keep([{ line, from, k: readKey(kind, m.name) }]);
  const langs = (from: string) => (x.id ? keep((m.kinds ?? []).map((l) => ({ line: `Uses ${l} here`, from, k: `tool:${x.id}:${l}` }))) : []);
  const where = m.where ? ` and where it is (${m.where})` : "";
  switch (m.kind) {
    case "folder": {
      if (source === "claude-sessions" || source === "codex-sessions") {
        const s = m.sessions ?? {}, n = (s.claude ?? 0) + (s.codex ?? 0);
        const who = (["claude", "codex"] as const).filter((a) => s[a]).map((a) => APP_W[a]).join(" and ");
        return {
          looked: [`its name${where}`, `the times and lengths of its ${plural(n, "session")} with ${who}`, "the names of the tools those sessions used",
            ...(x.rules?.length ? [`that it has ${x.rules.join(" and ")}: the file's name, not what it says`] : []),
            ...(m.kinds?.length ? ["the names of the files at its top, for its languages"] : [])],
          kept: langs("from the names of its files"),
          left: ["what was said in its sessions: only their times, lengths and the tools' names", "what is inside its files", `nothing changes in the folder or in ${who || by}`],
        };
      }
      if (source === "projects") return {
        looked: [`the repository's name${where}`, "the names of the files at its top, for its languages", ...(m.last ? ["when it last changed"] : [])],
        kept: langs("from the names of its files"),
        left: ["its code: Sol does not open a file", "nothing changes in the repository"],
      };
      return { looked: [`its name${where}`, "the names and dates of the files in it"], kept: [], left: ["what is inside its files: Sol does not open them", "nothing changes in the folder"] };
    }
    case "skill": return {
      looked: [`its name, ${m.name}`, `how often your ${by} sessions used it (${plural(m.n ?? 0, "time")})`],
      kept: one("skill", `You work with ${m.name}`, `from ${plural(m.n ?? 0, "use")} in ${by}`),
      left: ["what the skill says or does: only its name", `nothing changes in ${by}`],
    };
    case "tool": return {
      looked: [`its name, ${m.name}`, `how often your ${by} sessions reached for it (${plural(m.n ?? 0, "time")})`],
      kept: one("tool", `Your AI reaches for ${m.name}`, `from ${plural(m.n ?? 0, "use")} in ${by}`),
      left: ["what your AI sent it or got back: never read", `nothing changes in ${by}`],
    };
    case "sites": {
      if (!m.groups) return { looked: [], kept: [], left: [`${m.name}'s history: closed to Sol until Full Disk Access is on`] };
      return {
        looked: [`the names of the ${plural(m.n ?? 0, "site")} you visited in ${m.name}, and how often you visited each`],
        kept: keep(m.groups.filter((g) => g.what !== "other").slice(0, 3).map((g) => ({ line: `You visit ${g.what === "ai" ? "AI" : g.what} sites`, from: `from ${plural(g.n, "visit")}: ${g.sites.join(", ")}`, k: readKey("sites", g.what) }))),
        left: ["the pages and their titles: only the sites' names", `your history stays in ${m.name}`],
      };
    }
    case "app": return {
      looked: [`its name${m.open ? ", and that it is open now" : ""}`],
      kept: one("app", m.open ? `You have ${m.name} open today` : `You have ${m.name}`, "from the apps on this Mac"),
      left: [`what you do in ${m.name}: never read`, `nothing changes in ${m.name}`],
    };
    case "notes": return {
      looked: [`the folder's name, and the titles and dates of its ${plural(m.n ?? 0, "note")}`],
      kept: one("notes", `You keep notes in ${m.name}`, `from ${plural(m.n ?? 0, "note")}`),
      left: ["what the notes say: only their titles and dates", "nothing changes in Notes"],
    };
    case "date": return {
      looked: ["its title and its day"],
      kept: one("date", `${m.name} is coming up`, "from your calendar"),
      left: ["who it is with and what its notes say: only the title and the day", "nothing changes in your calendar"],
    };
    case "file": return {
      looked: [`its name${where}${m.last ? ", and when it last changed" : ""}`],
      kept: one("file", `${m.name}, ${m.is ?? "a file"}`, "from its name"),
      left: ["what is inside it: Sol never opened it", "nothing changes in your files"],
    };
  }
}

/** what one read saw, after the sieve: names and counts, nothing else */
export type SeenPlace = {
  id: string; name: string; path: string; label?: string; from: Source[]; hours: number[]; sessions: { claude?: number; codex?: number };
  minutes: number; ais: string[]; tools: string[]; langs: string[]; rules: string[]; repo: boolean; last: number; weight: number;
};
export type Seen = {
  places: SeenPlace[];
  hours: number[];
  skills: { name: string; n: number; app: string }[];
  servers: { name: string; n: number; app: string }[];
  ais: { id: string; name: string; skills: number; tools: number; mode?: string }[];
  apps: { name: string; bundle?: string; open: boolean }[];
  hosts: { host: string; n: number; group: string }[];
  dates: { name: string; at?: string; repeats: boolean }[];
  notes: { n: number; folders: number };
  files: { name: string; dir: boolean }[];
  repos: { name: string; path: string }[];
  thrown: Thrown;
  sources: { source: Source; state: State; line: string; perm?: string }[];
  /** what Sol could not open this time, each with the permission (you-accounts PERMS id) that would open it */
  closed?: Closed[];
};

export type Deps = {
  reader?: Reader;
  /** the explorer as a child: its out file followed, `tick` called with what it holds so far; resolves at its end */
  explore?: (args: string[], out: string, tick: (j: any) => void, stop?: AbortSignal) => Promise<void>;
  /** places/read.mjs readStore, or null when it cannot be had */
  store?: () => Promise<((a: Record<string, unknown>) => any) | null>;
  /** the browsers' hosts and visit counts in the last `days`; null when no history can be read here */
  hosts?: (user: string, from: string | null, days: number) => Promise<{ host: string; n: number; browser: string }[] | null>;
  /** an app's bundle id, from its Info.plist */
  bundle?: (app: string) => string | null;
  /** the browsers here whose history is closed to Sol (macOS keeps Safari's behind Full Disk Access) */
  closedBrowsers?: (user: string, from: string | null) => string[];
  now?: () => number;
};
/** stop: the person's "Stop here, keep what's read"; every source not finished by then is `stopped`, never `done` */
/** out: the folders the person removed when moving in (their paths): never read as a place, never offered again */
export type ReadIn = { home: string; user: string; sources: Source[]; keep?: Bin[]; from?: string | null; days?: number; order?: Source[]; because?: { aim: string; line: string } | null; stop?: AbortSignal; out?: string[];
  /** kept: the folders the person keeps (their paths, movein.ts keptFolders): once there are any they are the one list, and
   *  the read draws no other folder (no line, no disc, no "a place for"); none yet, the read finds the places itself */
  kept?: string[];
  /** forgot: the read:<kind>:<name> keys the person took out with × on an opened row (next.you.fact.forget): that thing is
   *  not counted, said or kept again; and the tool:<place>:<it> keys, whose lines an opened row does not keep again */
  forgot?: string[] };

/** the notes a Notes folder holds before it reads as a part of the person's life (every person's, a small number) */
const NOTES_PLACE = 5;
const COLOURS = ["coral", "sky", "mint", "lilac", "amber", "pink", "lime", "teal"];
const MCP = /"type":"tool_use","id":"[^"]{1,80}","name":"(mcp__[A-Za-z0-9_-]{1,80})__[A-Za-z0-9_-]{1,80}"/g;
const SKILL = /"name":"Skill","input":\{"skill":"([^"\\]{1,80})"/g;
const STAMP = /"timestamp":"(\d{4}-\d\d-\d\dT[\d:.]+Z?)"/;
const CODEX_CALL = /"type":"function_call","name":"([A-Za-z0-9_.-]{1,80})"/g;
const LANG: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift", c: "C", cpp: "C++", cs: "C#", php: "PHP", ex: "Elixir", dart: "Dart", vue: "Vue", svelte: "Svelte", md: "Markdown", ipynb: "Notebooks", sql: "SQL" };
const MANIFEST_LANG: Record<string, string> = { "package.json": "JavaScript", "tsconfig.json": "TypeScript", "Cargo.toml": "Rust", "go.mod": "Go", "pyproject.toml": "Python", "requirements.txt": "Python", "Gemfile": "Ruby", "Package.swift": "Swift", "pom.xml": "Java" };
/** a host's group, by what mainstream sites are for (never a person's own list) */
const GROUPS: [string, RegExp][] = [
  ["code", /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|vercel\.com|netlify\.app|npmjs\.com|pypi\.org|localhost|codepen\.io|replit\.com|huggingface\.co|crates\.io)$/],
  ["docs", /(^|\.)(docs\.|developer\.|developers\.|readthedocs|mdn|wikipedia\.org|notion\.(so|site)|confluence|gitbook|medium\.com|substack\.com|dev\.to)/],
  ["mail", /(^|\.)(mail\.|gmail\.com|outlook\.|proton\.me|fastmail|hey\.com)/],
  ["talk", /(^|\.)(slack\.com|discord\.com|teams\.microsoft|whatsapp|messenger|telegram|zoom\.us|meet\.google)/],
  ["design", /(^|\.)(figma\.com|canva\.com|dribbble\.com|behance\.net|pinterest\.|adobe\.com|framer\.com|unsplash\.com|coolors\.co)/],
  ["work", /(^|\.)(linear\.app|atlassian|asana\.com|trello\.com|monday\.com|clickup\.com|airtable\.com|calendar\.google|docs\.google|drive\.google|dropbox\.com|stripe\.com|shopify\.com|hubspot|salesforce)/],
  ["shopping", /(^|\.)(amazon\.|ebay\.|etsy\.com|aliexpress|walmart\.com|target\.com|ikea\.|zalando|bol\.com|coupang\.com)/],
  ["news", /(^|\.)(nytimes|bbc\.|cnn\.com|theguardian|reuters|news\.ycombinator\.com|reddit\.com|x\.com|twitter\.com|naver\.com|daum\.net)/],
  ["video", /(^|\.)(youtube\.com|netflix\.com|twitch\.tv|vimeo\.com|spotify\.com|disneyplus|primevideo)/],
  ["ai", /(^|\.)(claude\.ai|chatgpt\.com|gemini\.google|perplexity\.ai|openai\.com|anthropic\.com)$/],
];
export const groupOf = (host: string) => GROUPS.find(([, re]) => re.test(host))?.[0] ?? "other";
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const hourOf = (ms: number) => new Date(ms).getHours();

/** the explorer and the store reader, beside this engine in the repo (sol/mac/src/onboard); SOL_EXPLORE overrides */
const here = dirname(fileURLToPath(import.meta.url));
const ONBOARD = [process.env.SOL_ONBOARD_DIR, join(here, "..", "..", "..", "mac", "src", "onboard"), join(here, "..", "..", "..", "..", "mac", "src", "onboard")].filter((x): x is string => !!x);
export const explorePath = () => ONBOARD.map((d) => join(d, "explore.mjs")).find((p) => existsSync(p)) ?? null;
const storePath = () => ONBOARD.map((d) => join(d, "places", "read.mjs")).find((p) => existsSync(p)) ?? null;

const realDeps: Required<Deps> = {
  reader: fsReader,
  explore: (args, out, tick, halt) => new Promise((resolve) => {
    const p = explorePath();
    if (!p || halt?.aborted) return resolve();
    const child = spawn(process.execPath, [p, ...args], { stdio: ["ignore", "ignore", "ignore"] });
    halt?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });   // Stop: the explorer ends now
    const follow = () => { try { tick(JSON.parse(readFileSync(out, "utf8"))); } catch { /* half written: the next tick */ } };
    const t = setInterval(follow, 150);
    const stop = setTimeout(() => child.kill("SIGTERM"), 45000);
    child.on("close", () => { clearInterval(t); clearTimeout(stop); follow(); resolve(); });
    child.on("error", () => { clearInterval(t); clearTimeout(stop); resolve(); });
  }),
  store: async () => { const p = storePath(); if (!p) return null; try { return (await import(pathToFileURL(p).href)).readStore ?? null; } catch { return null; } },
  hosts: browserHosts,
  bundle: bundleOf,
  // Safari's folder is there but will not list (EPERM), and Sol.app has not handed over a copy
  closedBrowsers: (user, from) => {
    if (from && existsSync(join(from, "Library", "Safari", "History.db"))) return [];
    try { readdirSync(join(user, "Library", "Safari")); return []; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM" ? ["Safari"] : []; }
  },
  now: () => Date.now(),
};

/** the browsers' hosts by visit count (Chrome-family and Safari, Safari from Sol.app's copy first): one SELECT of urls and
 *  counts, never a title; the history is copied to a temp folder first (a browser holds its file open) */
async function browserHosts(user: string, from: string | null, days: number) {
  let sqlite: any; try { sqlite = await import("node:sqlite"); } catch { return null; }
  const since = Date.now() - days * 864e5;
  const chrome = ["SELECT u.url AS url, COUNT(v.id) AS n FROM urls u JOIN visits v ON v.url = u.id WHERE v.visit_time > ? GROUP BY u.id", (since / 1000 + 11644473600) * 1e6] as const;
  const safari = ["SELECT i.url AS url, COUNT(v.id) AS n FROM history_visits v JOIN history_items i ON v.history_item = i.id WHERE v.visit_time > ? GROUP BY i.id", since / 1000 - 978307200] as const;
  const lib = join(user, "Library", "Application Support");
  const safariAt = [from && join(from, "Library", "Safari", "History.db"), join(user, "Library", "Safari", "History.db")].find((p) => p && existsSync(p));
  const list: [string, string, readonly [string, number]][] = [
    ["Chrome", join(lib, "Google", "Chrome", "Default", "History"), chrome], ["Arc", join(lib, "Arc", "User Data", "Default", "History"), chrome],
    ["Brave", join(lib, "BraveSoftware", "Brave-Browser", "Default", "History"), chrome], ["Edge", join(lib, "Microsoft Edge", "Default", "History"), chrome],
    ...(safariAt ? [["Safari", safariAt, safari] as [string, string, readonly [string, number]]] : []),
  ];
  const by = new Map<string, { host: string; n: number; browser: string }>();
  let any = false;
  for (const [br, f, [sql, at]] of list) {
    if (!existsSync(f)) continue;
    const tmp = mkdtempSync(join(tmpdir(), "sol-you-"));
    try {
      copyFileSync(f, join(tmp, "h"));
      for (const x of ["-wal", "-shm"]) if (existsSync(f + x)) copyFileSync(f + x, join(tmp, "h" + x));
      const db = new sqlite.DatabaseSync(join(tmp, "h"), { readOnly: true });
      for (const r of db.prepare(sql).all(at) as { url: string; n: number }[]) {
        let host: string; try { host = new URL(r.url).hostname.replace(/^www\./, ""); } catch { continue; }
        if (!host || /^(newtab|localhost|127\.0\.0\.1)$/.test(host)) continue;
        const x = by.get(host) ?? { host, n: 0, browser: br };
        x.n += Number(r.n) || 0; by.set(host, x);
      }
      db.close();
      any = true;
    } catch { /* this browser's history is closed to Sol: the next */ } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  return any ? [...by.values()].sort((a, b) => b.n - a.n) : null;
}

/** an app's bundle id from its Info.plist (the XML kind; a binary plist through plutil), null when it cannot be had */
function bundleOf(app: string): string | null {
  for (const dir of ["/Applications", "/System/Applications"]) {
    const plist = join(dir, `${app}.app`, "Contents", "Info.plist");
    if (!existsSync(plist)) continue;
    try {
      const t = readFileSync(plist, "utf8");
      const m = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]{1,200})<\/string>/.exec(t);
      if (m) return m[1];
      const r = plutilId(plist);
      if (r) return r;
    } catch { /* unreadable */ }
  }
  return null;
}
function plutilId(plist: string): string | null {
  try {
    const out = String(execFileSync("plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", plist], { timeout: 2000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim();
    return /^[\w.-]{1,200}$/.test(out) ? out : null;
  } catch { return null; }
}

/** the read: runs each source in order, streams every step to `emit`, and answers what it saw (never throws) */
export async function runRead(a: ReadIn, emit: (e: Ev) => void, d: Deps = {}): Promise<Seen> {
  const dep: Required<Deps> = { ...realDeps, ...d } as Required<Deps>;
  const r = dep.reader, days = a.days ?? 30;
  const sieve = makeSieve(a.keep ?? []);
  const order = (a.order ?? []).filter((s) => a.sources.includes(s));
  const run: Source[] = [...order, ...a.sources.filter((s) => !order.includes(s))];
  const seen: Seen = { places: [], hours: Array(24).fill(0), skills: [], servers: [], ais: [], apps: [], hosts: [], dates: [], notes: { n: 0, folders: 0 }, files: [], repos: [], thrown: sieve.thrown, sources: [] };
  const mine = new Set<string>();   // the tool servers the person set up in their AIs' own config (plainTool)
  const places = new Map<string, SeenPlace>();
  const sent = new Map<string, number>();
  emit({ kind: "order", order: run, because: a.because ?? null });
  for (const s of run) emit({ kind: "source", source: s, state: "waiting", line: `${LABEL[s]}: next` });

  /** a name through the sieve: true when it may be counted; a drop streams as a count */
  const thrownSince = new Map<string, number>();
  const bare = (p: string) => (p.startsWith("~/") ? join(a.user, p.slice(2)) : p).replace(/[\\/]+$/, "");
  const removed = new Set((a.out ?? []).map(bare));
  /** a path as the person reads it: ~/… under their home */
  const tildeOf = (p: string) => (p === a.user ? "~" : p.startsWith(a.user + "/") ? "~" + p.slice(a.user.length) : p);
  // BR1 hold 1 (#1615), one folder list: a folder the read finds that the person has not kept is not shown
  const keptSet = new Set((a.kept ?? []).map(bare));
  const shown = (path: string) => !keptSet.size || keptSet.has(bare(path));
  // a row says what Sol looked at, kept and left alone (openOf); a thing the person took out with × is not read again
  const forgot = new Set(a.forgot ?? []);
  const gone = (kind: ReadKind, name: string) => forgot.has(readKey(kind, name));
  const say = (e: Extract<Ev, { kind: "item" }>, x: { id?: string; rules?: readonly string[] } = {}) => emit(e.more ? { ...e, open: openOf(e.source, e.more, { ...x, forgot }) } : e);
  const pass = (source: Source, it: { name: string; host?: string; path?: string; kind?: "app" | "name" }) => {
    if (it.path && removed.has(bare(it.path))) return false;   // the person removed it: no count, no line
    const b = sieve.drop(it);
    if (!b) return true;
    thrownSince.set(`${source}|${b}`, (thrownSince.get(`${source}|${b}`) ?? 0) + 1);
    return false;
  };
  const flushThrown = (source: Source) => {
    for (const [k, n] of thrownSince) {
      const [src, bin] = k.split("|") as [Source, Bin];
      if (src !== source) continue;
      emit({ kind: "thrown", source, item: `${n} thrown away: ${bin}`, bin, n });
      thrownSince.delete(k);
    }
  };
  const placeOf = (path: string, name: string, source: Source, label?: string): SeenPlace => {
    let p = places.get(path);
    if (!p) { p = { id: path, name, path, ...(label ? { label } : {}), from: [], hours: Array(24).fill(0), sessions: {}, minutes: 0, ais: [], tools: [], langs: [], rules: [], repo: false, last: 0, weight: 0 }; places.set(path, p); }
    if (!p.from.includes(source)) p.from.push(source);
    return p;
  };
  /** the places' shares now; a place event for each one new or moved by a point or more */
  const shareNow = () => {
    const list = [...places.values()].filter((p) => p.weight > 0).sort((x, y) => y.weight - x.weight);
    const total = list.reduce((n, p) => n + p.weight, 0) || 1;
    list.forEach((p, i) => {
      const share = Math.round((p.weight / total) * 100) / 100;
      const was = sent.get(p.id);
      if (was !== undefined && Math.abs(was - share) < 0.01) return;
      sent.set(p.id, share);
      emit({ kind: "place", id: p.id, name: p.name, colour: COLOURS[i % COLOURS.length], share });
    });
  };
  // a skip says why in its line; one a permission would open names it (`perm`), and is kept for next.you.perms
  const closed: Closed[] = [];
  const stopped = () => !!a.stop?.aborted;
  const done = (source: Source, state: State, line: string, perm?: string) => {
    // a source the person stopped part way never claims it read the whole, nor that it was empty: what it saw is kept, its
    // line says so (a skip a permission explains stays that skip: it would not have been read)
    if (stopped() && state !== "stopped" && !perm) { state = "stopped"; line = `${LABEL[source]}: stopped before the end`; }
    flushThrown(source);
    seen.sources.push({ source, state, line, ...(perm ? { perm } : {}) });
    if (perm && state === "skipped") closed.push({ what: LABEL[source], perm, line });
    emit({ kind: "source", source, state, line, ...(perm ? { perm } : {}) });
  };
  seen.closed = closed;

  let apps: AppsRead | null = null;
  // a temporary root that holds the person's own home is not a throwaway for them (a home made for a test, a guest home)
  const appsOnce = () => {
    if (apps) return apps;
    const w = appsWhere(a.user, { HOME: a.user }, [a.home]);
    w.temp = (w.temp ?? []).filter((t) => !(a.user === t || a.user.startsWith(t.replace(/\/+$/, "") + "/")));
    return (apps = readApps(w, r));
  };

  for (const source of run) {
    if (stopped()) { done(source, "stopped", `${LABEL[source]}: stopped, not read`); continue; }
    emit({ kind: "source", source, state: "reading", line: `${LABEL[source]}: reading` });
    try {
      if (source === "claude-sessions" || source === "codex-sessions") {
        const app = source === "claude-sessions" ? "claude" : "codex";
        const got = appsOnce();
        const ai = got.ais.find((x) => x.app === app);
        if (!ai && !got.places.some((p) => p.sessions[app])) { done(source, "skipped", `${LABEL[source]}: skipped, not on this Mac`); continue; }
        let n = 0, folders = 0;
        for (const ap of got.places.filter((p) => p.sessions[app])) {
          if (!pass(source, { name: ap.name, path: ap.path }) || !shown(ap.path)) continue;
          folders++;
          const p = placeOf(ap.path, ap.name, source, ap.label);
          p.sessions[app] = ap.sessions[app]; p.repo = ap.repo; p.rules = ap.rules; p.last = Math.max(p.last, ap.last);
          p.weight += ap.sessions[app] ?? 0;
          if (!p.ais.includes(app)) p.ais.push(app);
          for (const l of langsOf(r, ap.path)) if (!p.langs.includes(l)) p.langs.push(l);
          n += ap.sessions[app] ?? 0;
          // BR1 hold 2: one line per folder with its one count, whichever AI ran the sessions (the face's sessionsOf); a
          // folder Codex reads after Claude Code says its line again with the sum, and the face puts it where the first was
          const all = (p.sessions.claude ?? 0) + (p.sessions.codex ?? 0), by = p.ais.map((x) => (x === "claude" ? LABEL["claude-sessions"] : LABEL["codex-sessions"])).join(" and ");
          say({ kind: "item", source, place: p.id, item: `folder ${p.name}, from ${by}`, notice: `${plural(all, "session")}${p.langs.length ? `, ${p.langs.slice(0, 2).join(" and ")}` : ""}`, setup: `a place for ${p.name}`,
            more: { kind: "folder", name: p.name, where: tildeOf(dirname(p.path)), is: folderIs(p), kinds: [...p.langs], sessions: { ...p.sessions }, ...(p.last ? { last: new Date(p.last).toISOString() } : {}), adds: `A place for ${p.name} on your canvas, its sessions kept inside it` } }, { id: p.id, rules: p.rules });
          shareNow();
        }
        // each session file: its time, its length, the tools and skills its turns used (names, counted)
        // a long scan says how far it is, once a second, so the screen never waits on nothing
        const t = app === "claude" ? await claudeTimes(r, a.user, got, places, dep.now() - days * 864e5, a.stop, (k, of) => emit({ kind: "source", source, state: "reading", line: `${LABEL[source]}: reading the tools of ${plural(k, "session")} of ${of.toLocaleString("en-US")}` })) : codexTimes(r, a.user, got, places);
        for (const h of t.hours) seen.hours[h] += 1;
        for (const [name, k] of t.skills) if (!gone("skill", plainSkill(name)) && pass(source, { name })) seen.skills.push({ name, n: k, app });
        // a tool in the person's words, merged under them; one they would not know is left out (plainTool)
        for (const x of got.ais) for (const k of x.tools) mine.add(k);
        for (const [id, k] of t.servers) {
          const name = plainTool(id, mine);
          if (!name || gone("tool", name) || !pass(source, { name: id })) continue;
          const was = seen.servers.find((x) => x.name === name && x.app === app);
          if (was) was.n += k; else seen.servers.push({ name, n: k, app });
        }
        for (const sk of seen.skills.filter((x) => x.app === app).sort((x, y) => y.n - x.n).slice(0, 4)) {
          const w = plainSkill(sk.name);
          say({ kind: "item", source, item: `skill ${w}, used ${plural(sk.n, "time")}`, notice: "a way you work", setup: `${w} ready in every place`,
            more: { kind: "skill", name: w, n: sk.n, by: LABEL[source], is: "a way you work", adds: `${w} ready in every place, for any AI you start there` } });
        }
        for (const sv of seen.servers.filter((x) => x.app === app).sort((x, y) => y.n - x.n).slice(0, 3))
          say({ kind: "item", source, item: `${sv.name}, used ${plural(sv.n, "time")}`, notice: "a tool your AI reaches for",
            more: { kind: "tool", name: sv.name, n: sv.n, by: LABEL[source], is: "a tool your AI reaches for", adds: "Shown with your AIs and skills in how Sol sees you" } });
        if (ai) {
          const skills = ai.skills.filter((x) => !gone("skill", plainSkill(x)) && pass(source, { name: x })), tools = ai.tools.filter((x) => pass(source, { name: x }));
          seen.ais.push({ id: ai.id, name: ai.name, skills: skills.length, tools: tools.length, ...(ai.mode ? { mode: ai.mode } : {}) });
          for (const k of skills) if (!seen.skills.some((x) => x.name === k && x.app === app)) seen.skills.push({ name: k, n: 0, app });
          for (const k of tools) { const name = plainTool(k, mine); if (name && !gone("tool", name) && !seen.servers.some((x) => x.name === name && x.app === app)) seen.servers.push({ name, n: 0, app }); }
        }
        done(source, "done", `${LABEL[source]}: ${plural(n, "session")} in ${plural(folders, "folder")}${t.skills.size ? `, ${plural(t.skills.size, "skill")} used` : ""}${t.of && t.read! < t.of ? ` (tools from the newest ${t.read} of ${t.of} sessions)` : ""}`);
      } else if (source === "browser") {
        const got = await dep.hosts(a.user, a.from ?? null, days);
        const shut = dep.closedBrowsers(a.user, a.from ?? null), need = "Sol needs Full Disk Access";
        for (const br of shut) {
          const line = `${br}: skipped, ${need}`;
          closed.push({ what: br, perm: "full-disk", line });
          say({ kind: "item", source, item: line, perm: "full-disk", notice: "closed to Sol for now",
            more: { kind: "sites", name: br, is: "closed to Sol until Full Disk Access is on", adds: "Nothing yet: Sol can't open its history" } });
        }
        if (!got) {
          if (shut.length) done(source, "skipped", `Your browsers: skipped, ${need} to open ${shut.join(" and ")}`, "full-disk");
          else done(source, "skipped", "Your browsers: skipped, no history Sol can open here");
          continue;
        }
        for (const h of got) if (!gone("sites", groupOf(h.host)) && pass(source, { name: h.host, host: h.host })) seen.hosts.push({ host: h.host, n: h.n, group: groupOf(h.host) });
        const groups = new Map<string, number>();
        for (const h of seen.hosts) groups.set(h.group, (groups.get(h.group) ?? 0) + h.n);
        // "mostly" only for a group that holds a quarter of the visits or more (one visit of thirty is not "mostly")
        const visits = [...groups.values()].reduce((s, n) => s + n, 0);
        const top = [...groups].filter(([g, n]) => g !== "other" && n >= visits / 4).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([g]) => g);
        const browsers = [...new Set(got.map((h) => h.browser))];
        for (const br of browsers) {
          const mine = seen.hosts.filter((h) => got.find((g) => g.host === h.host)?.browser === br);
          const groups = siteGroups(mine);
          say({ kind: "item", source, item: `${br}: ${plural(mine.length, "site")}${top.length ? `, mostly ${top.join(" and ")}` : ""}`,
            notice: top.length ? `you spend your browsing on ${top.join(" and ")}` : `${plural(groups.length, "kind")} of sites, none most`,
            more: { kind: "sites", name: br, n: mine.length, groups, adds: "Which kinds of sites you visit, in Sol's summary of you; never the pages" } });
        }
        done(source, "done", `Your browsers: ${plural(seen.hosts.length, "site")}${top.length ? `, mostly ${top.join(" and ")}` : ""}${shut.length ? `; ${shut.join(" and ")} skipped, ${need}` : ""}`);
      } else if (source === "calendar-store" || source === "notes") {
        const read = await dep.store();
        if (!read) { done(source, "skipped", `${source === "notes" ? "Notes" : "Calendar"}: skipped, its reader is not in this build`); continue; }
        const res = read({ store: source === "notes" ? "notes" : "calendar", home: a.user, from: a.from ?? null, days, hosts: [], bin: null, max: null, chats: null });
        if (!res?.ok) {
          // "switch": macOS refused the store's folder, which Full Disk Access opens
          const shutOut = res?.need?.kind === "switch";
          const why = shutOut ? "skipped, Sol needs Full Disk Access" : res?.need?.kind === "missing" ? "skipped, not on this Mac" : "skipped, it could not be read this time";
          done(source, "skipped", `${source === "notes" ? "Notes" : "Calendar"}: ${why}`, shutOut ? "full-disk" : undefined); continue;
        }
        if (source === "notes") {
          let n = 0, folders = 0;
          for (const g of res.groups ?? []) {
            if (gone("notes", String(g.name ?? ""))) continue;
            let inThis = 0;
            const times: number[] = [];
            for (const it of g.items ?? []) if (pass(source, { name: String(it.title ?? "") })) { n++; inThis++; const t = Date.parse(String(it.at ?? "")); if (!isNaN(t)) times.push(t); }
            const gname = String(g.name ?? "");
            if (!inThis || !pass(source, { name: gname })) continue;
            folders++;
            // a Notes folder the person keeps filling is a part of their life: a place, its notes its weight
            const big = inThis >= NOTES_PLACE && !/^(notes|all|recently deleted|메모|notas)$/i.test(gname) && shown(`notes:${gname}`);
            const last = times.length ? new Date(Math.max(...times)).toISOString() : undefined;
            say({ kind: "item", source, item: `Notes folder ${gname}: ${plural(inThis, "note")}`, notice: plural(inThis, "note"), ...(big ? { setup: `a place for ${gname}` } : {}),
              more: { kind: "notes", name: gname, n: inThis, ...(last ? { last } : {}), is: "a Notes folder", adds: big ? `A place for ${gname} on your canvas` : "Counted in Sol's summary of you; too few notes for a place of its own" } });
            if (big) {
              const p = placeOf(`notes:${gname}`, gname, source);
              p.weight += inThis;
              for (const t of times) { p.last = Math.max(p.last, t); p.hours[hourOf(t)] += 1; }
              shareNow();
            }
          }
          seen.notes = { n, folders };
          done(source, "done", `Notes: ${plural(n, "note")} in ${plural(folders, "folder")}`);
        } else {
          const soon: { name: string; at: string }[] = [];
          for (const g of res.groups ?? []) for (const it of g.items ?? []) {
            const name = String(it.title ?? "");
            if (!name || gone("date", name) || !pass(source, { name })) continue;
            const at = typeof it.at === "string" || typeof it.at === "number" ? new Date(it.at) : null;
            seen.dates.push({ name, ...(at && !isNaN(+at) ? { at: at.toISOString() } : {}), repeats: !!it.repeats });
            if (at && !isNaN(+at)) seen.hours[at.getHours()] += 1;
            if (soon.length < 3 && at && +at >= dep.now()) soon.push({ name, at: at.toISOString() });
          }
          for (const d of soon) say({ kind: "item", source, item: `date ${d.name}`, notice: "coming up", setup: "in your Diary", more: { kind: "date", name: d.name, at: d.at, is: "a date coming up", adds: "In your Diary on its day" } });
          done(source, "done", `Calendar: ${plural(seen.dates.length, "date")}`);
        }
      } else {
        // apps, files, projects: the explorer, only that stop, its live file followed
        const exp = explorePath();
        if (!exp && !d.explore) { done(source, "skipped", `${LABEL[source]}: skipped, its reader is not in this build`); continue; }
        const stop = source === "apps" ? "machine" : source;
        const work = join(nextDir(a.home), "reading");
        mkdirSync(work, { recursive: true, mode: 0o700 });
        const dir = mkdtempSync(join(work, "x-")), out = join(dir, "explore.json");
        const skip = ["machine", "ai", "tools", "calendar", "files", "projects", "browser"].filter((x) => x !== stop);
        const args = ["--out", out, "--home", a.user, "--stops-said", "--apps-max", "500", "--skip", skip.join(","), "--deny", "notes,gdrive,github,ai-setup,claude-sessions,codex-sessions", "--days", String(days), ...(a.from ? ["--from", a.from] : [])];
        const took = new Set<string>();
        const take = (j: any) => {
          const st = (Array.isArray(j?.stops) ? j.stops : []).find((x: any) => x?.id === stop);
          for (const f of Array.isArray(st?.facts) ? st.facts : []) {
            if (!f || typeof f.id !== "string" || took.has(f.id)) continue;
            took.add(f.id);
            const name = String(f.v ?? "");
            if (!name) continue;
            if (source === "apps" && f.k === "app") {
              if (gone("app", name) || !pass(source, { name, kind: "app" })) continue;
              const bundle = dep.bundle(name) ?? undefined;
              seen.apps.push({ name, ...(bundle ? { bundle } : {}), open: !!f.open });
              if (seen.apps.length <= 6) say({ kind: "item", source, item: `${name}${f.open ? ", open now" : ""}`, notice: f.open ? "in use today" : "an app you use",
                more: { kind: "app", name, open: !!f.open, is: f.open ? "an app open now" : "an app on this Mac", adds: "The apps you use, in Sol's summary of you" } });
            } else if (source === "files" && (f.k === "file" || f.k === "folder")) {
              // what the person threw away is theirs to forget: the Trash is not read, not even counted (#1615)
              if (/(^|\/)\.Trash(\/|$)/.test(String(f.path ?? "")) || gone("file", name)) continue;
              if (!pass(source, { name, path: String(f.path ?? "") })) continue;
              seen.files.push({ name, dir: f.k === "folder" });
              const at = typeof f.at === "string" ? Date.parse(f.at) : NaN;
              if (seen.files.length <= 5) {
                const fp = String(f.path ?? ""), is = f.k === "folder" ? "a folder" : fileIs(name), where = fp.includes("/") ? fp.slice(0, fp.lastIndexOf("/")) : "";
                say({ kind: "item", source, item: `${f.k} ${name}`, notice: where ? `${is} in ${where}` : is,
                  more: { kind: "file", name, is, ...(where ? { where } : {}), ...(!isNaN(at) ? { last: new Date(at).toISOString() } : {}), adds: "Its name, in Sol's summary of you; Sol never opened it" } });
              }
              if (!isNaN(at)) seen.hours[hourOf(at)] += 1;
              // a folder of the person's own under a usual top folder (~/Documents/<it>/…) is a place: its files its weight
              const m = /^~\/(Documents|Desktop|Downloads|iCloud Drive[^/]*|Library\/Mobile Documents\/com~apple~CloudDocs)\/([^/]+)\/./.exec(String(f.path ?? ""));
              if (m && pass(source, { name: m[2], path: `~/${m[1]}/${m[2]}` }) && shown(join(a.user, m[1], m[2]))) {
                const path = join(a.user, m[1], m[2]), had = places.has(path);
                const p = placeOf(path, m[2], source);
                p.weight += 1;
                if (!isNaN(at)) { p.last = Math.max(p.last, at); p.hours[hourOf(at)] += 1; }
                if (!had) say({ kind: "item", source, item: `folder ${m[2]}, from your files`, notice: `a folder in ~/${m[1]}`, setup: `a place for ${m[2]}`,
                  more: { kind: "folder", name: m[2], where: `~/${m[1]}`, is: "a folder of your own files", ...(!isNaN(at) ? { last: new Date(at).toISOString() } : {}), adds: `A place for ${m[2]} on your canvas` } });
                shareNow();
              }
            } else if (source === "projects" && f.k === "project") {
              const path = String(f.src ?? "").replace(/^~(?=\/|$)/, a.user);
              if (!pass(source, { name, path }) || !shown(path)) continue;
              seen.repos.push({ name, path });
              const p = placeOf(path, name, source);
              p.repo = true;
              const at = typeof f.at === "string" ? Date.parse(f.at) : NaN;
              if (!isNaN(at)) { p.last = Math.max(p.last, at); p.hours[hourOf(at)] += 1; seen.hours[hourOf(at)] += 1; }
              p.weight += 1;
              for (const l of langsOf(r, path)) if (!p.langs.includes(l)) p.langs.push(l);
              say({ kind: "item", source, item: `repository ${name}`, notice: p.langs.length ? p.langs.slice(0, 2).join(" and ") : "a code project", setup: `a place for ${name}`,
                more: { kind: "folder", name, where: tildeOf(dirname(path)), is: folderIs(p), kinds: [...p.langs], ...(p.last ? { last: new Date(p.last).toISOString() } : {}), adds: `A place for ${name} on your canvas` } }, { id: p.id });
              shareNow();
            }
          }
        };
        try { await dep.explore(args, out, take, a.stop); } finally { rmSync(dir, { recursive: true, force: true }); }
        const n = source === "apps" ? seen.apps.length : source === "files" ? seen.files.length : seen.repos.length;
        const unit = source === "apps" ? "app" : source === "files" ? "file and folder" : "repository";
        if (!n) done(source, "skipped", `${LABEL[source]}: skipped, nothing Sol can read here`);
        else done(source, "done", source === "apps" ? `Your apps: ${plural(n, "app")}, ${seen.apps.filter((x) => x.open).length} open now` : `${LABEL[source]}: ${plural(n, unit, unit === "repository" ? "repositories" : "files and folders")}`);
      }
    } catch {
      done(source, "skipped", `${LABEL[source]}: skipped, it could not be read this time`);
    }
  }
  // each place's tools in the person's words too, now that every AI's own setup is known
  // and never a project's or a folder's own name, which is the place, not a tool it uses
  const names = namesOf([...places.values(), ...seen.repos.map((r) => ({ name: r.name, path: r.path }))]);
  for (const p of places.values()) {
    p.tools = [...new Set(p.tools.map((t) => plainTool(t, mine)).filter((t): t is string => !!t && !names.has(t.toLowerCase())))];
    p.langs = p.langs.filter((l) => !names.has(l.toLowerCase()));
  }
  seen.places = [...places.values()].filter((p) => p.weight > 0).sort((x, y) => y.weight - x.weight);
  return seen;
}

/** the languages a folder holds, from its top-level names (never a file opened) */
function langsOf(r: Reader, path: string): string[] {
  const out = new Map<string, number>();
  for (const x of r.list(path) ?? []) {
    if (x.dir) continue;
    const l = MANIFEST_LANG[x.name] ?? LANG[extname(x.name).slice(1).toLowerCase()];
    if (l && l !== "Markdown") out.set(l, (out.get(l) ?? 0) + (MANIFEST_LANG[x.name] ? 5 : 1));
  }
  return [...out].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 3);
}

/** `read`/`of`: the window's session files whose tools were read, of all of them (short of all only past the budget) */
type Times = { hours: number[]; skills: Map<string, number>; servers: Map<string, number>; read?: number; of?: number };
const FILES = 150, BYTES = 512 * 1024;
// the tools a turn used sit anywhere in a transcript, which can run to hundreds of MB: whole files of the read's window,
// newest first, scanned in chunks for the two markers only, up to a budget of bytes (a real Mac: 4 GB in 605 files over
// 30 days, about 8 s); the engine is one thread, so the scan gives way after every chunk
const SCAN_FILES = 2000, SCAN_BUDGET = 8 * 1024 * 1024 * 1024, CHUNK = 8 * 1024 * 1024, TAIL = 512;
const MARKS = [Buffer.from('"name":"Skill"'), Buffer.from('"name":"mcp__')];
const giveWay = () => new Promise<void>((ok) => setImmediate(ok));
/** each place in the file where one of the markers is, as the text around it (never the rest); false: unreadable */
async function scanFile(p: string, budget: { left: number }, hit: (near: string, at: number) => void): Promise<boolean> {
  let fd: number;
  try { fd = openSync(p, "r"); } catch { return false; }
  try {
    const buf = Buffer.alloc(CHUNK + TAIL);
    let pos = 0, carry = 0, done = 0;   // done: marks below this index were seen in the chunk before
    for (;;) {
      if (budget.left <= 0) return true;
      const n = readSync(fd, buf, carry, CHUNK, pos);
      if (n <= 0) return true;
      pos += n; budget.left -= n;
      const end = carry + n, last = n < CHUNK;
      for (const mark of MARKS) {
        for (let i = buf.indexOf(mark, done); i >= 0 && i < end; i = buf.indexOf(mark, i + mark.length)) {
          // a mark too near the chunk's end waits for the next chunk, where the carried tail holds it whole
          if ((!last && end - i < 200) || i + mark.length > end) break;
          const from = Math.max(0, i - 160);
          hit(buf.toString("latin1", from, Math.min(end, i + 200)), i - from);
        }
      }
      if (last) return true;
      await giveWay();
      carry = Math.min(TAIL, end);
      buf.copy(buf, 0, end - carry, end);
      done = carry - 200;
    }
  } finally { closeSync(fd); }
}
const placeFor = (places: Map<string, SeenPlace>, cwd: string) => {
  let best: SeenPlace | undefined;
  for (const p of places.values()) if ((cwd === p.path || cwd.startsWith(p.path + "/")) && (!best || p.path.length > best.path.length)) best = p;
  return best;
};

/** Claude Code's session files: each one's time (its last write) into the day strip, the newest ones' tool and skill
 *  names counted, each session's length (its first stamp to its last write) on its place */
async function claudeTimes(r: Reader, user: string, got: AppsRead, places: Map<string, SeenPlace>, since: number, halt?: AbortSignal, beat: (read: number, of: number) => void = () => {}): Promise<Times> {
  const out: Times = { hours: [], skills: new Map(), servers: new Map() };
  const root = join(appsWhere(user, { HOME: user }).claude!, "projects");
  const all: { p: string; t: number; place?: SeenPlace; mine: boolean }[] = [];
  // the person's own sessions: an app's or Sol's own (under ~/Library, in a temporary folder) are not their day or their tools
  // (a home that is itself in a temporary folder, a test's or a guest's, keeps what is under it)
  const TEMP = /^\/(private\/)?(tmp|var\/folders)(\/|$)/;
  const theirs = (cwd: string) => !!cwd && !cwd.startsWith(join(user, "Library") + "/") && (!TEMP.test(cwd) || cwd.startsWith(user + "/"));
  for (const d of r.list(root) ?? []) {
    if (!d.dir) continue;
    const dir = join(root, d.name);
    const files = (r.list(dir) ?? []).filter((f) => !f.dir && f.name.endsWith(".jsonl")).map((f) => ({ p: join(dir, f.name), t: r.time(join(dir, f.name)) ?? 0 })).sort((x, y) => y.t - x.t);
    if (!files.length) continue;
    const cwd = cwdIn(r.head(files[0].p, 16384) ?? "");
    const place = cwd ? placeFor(places, cwd) : undefined;
    for (const f of files) all.push({ ...f, place, mine: theirs(cwd) });
  }
  void got;
  for (const f of all) { if (!f.mine) continue; const h = hourOf(f.t); out.hours.push(h); if (f.place) f.place.hours[h] += 1; }
  all.sort((x, y) => y.t - x.t);
  for (const f of all.slice(0, FILES)) {
    const first = STAMP.exec(r.head(f.p, 16384) ?? "")?.[1];
    if (first && f.place) { const mins = Math.round((f.t - Date.parse(first)) / 60000); if (mins > 0 && mins < 24 * 60) f.place.minutes += mins; }
  }
  const budget = { left: SCAN_BUDGET }, win = all.filter((x) => x.mine && x.t >= since);
  halt?.addEventListener("abort", () => { budget.left = 0; }, { once: true });   // Stop ends the file being scanned at its next chunk
  out.read = 0; out.of = win.length;
  let said = Date.now();
  for (const f of win.slice(0, SCAN_FILES)) {
    if (budget.left <= 0 || halt?.aborted) break;
    out.read += 1;
    if (Date.now() - said >= 1000) { said = Date.now(); beat(out.read, Math.min(win.length, SCAN_FILES)); }
    // only the match at this mark counts (another mark in its window is counted at its own); the text is bytes as latin1,
    // so offsets are bytes, and a name is turned back into UTF-8
    await scanFile(f.p, budget, (near, at) => {
      for (const m of near.matchAll(MCP)) {
        if (m.index! + m[0].indexOf('"name":"mcp__') !== at) continue;
        const s = m[1].split("__")[1];
        if (s) out.servers.set(s, (out.servers.get(s) ?? 0) + 1);
        if (f.place && s && !f.place.tools.includes(s)) f.place.tools.push(s);
      }
      for (const m of near.matchAll(SKILL)) {
        if (m.index !== at) continue;
        const k = Buffer.from(m[1], "latin1").toString("utf8");
        out.skills.set(k, (out.skills.get(k) ?? 0) + 1);
      }
    });
  }
  return out;
}

/** Codex's rollouts: each one's start (in its name) and last write into the day strip, the newest ones' function call
 *  names counted (an MCP tool is "<server>.<tool>" or "mcp__<server>__…") */
function codexTimes(r: Reader, user: string, got: AppsRead, places: Map<string, SeenPlace>): Times {
  const out: Times = { hours: [], skills: new Map(), servers: new Map() };
  const root = join(appsWhere(user, { HOME: user }).codex!, "sessions");
  const desc = (p: string, re: RegExp) => (r.list(p) ?? []).filter((x) => x.dir && re.test(x.name)).map((x) => x.name).sort().reverse();
  let n = 0;
  void got;
  outer: for (const y of desc(root, /^\d{4}$/)) for (const m of desc(join(root, y), /^\d{2}$/)) for (const dd of desc(join(root, y, m), /^\d{2}$/)) {
    const day = join(root, y, m, dd);
    for (const f of (r.list(day) ?? []).filter((x) => !x.dir && /^rollout-.*\.jsonl$/.test(x.name)).map((x) => x.name).sort().reverse()) {
      if (n++ >= 600) break outer;
      const p = join(day, f), t = r.time(p) ?? 0;
      const head = r.head(p, n <= 100 ? BYTES : 4096) ?? "";
      const line = head.split("\n")[0];
      if (/"originator":"(codex_exec|sol_internal)"/.test(line)) continue;
      const cwd = cwdIn(line), place = cwd ? placeFor(places, cwd) : undefined;
      const h = hourOf(t); out.hours.push(h); if (place) place.hours[h] += 1;
      const start = /^rollout-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)/.exec(f);
      if (start && place) { const s = new Date(`${start[1]}T${start[2]}:${start[3]}:${start[4]}`).getTime(); const mins = Math.round((t - s) / 60000); if (mins > 0 && mins < 24 * 60) place.minutes += mins; }
      if (n <= 100) for (const mm of head.matchAll(CODEX_CALL)) {
        const nm = mm[1], server = nm.startsWith("mcp__") ? nm.split("__")[1] : nm.includes(".") ? nm.split(".")[0] : null;
        if (server) { out.servers.set(server, (out.servers.get(server) ?? 0) + 1); if (place && !place.tools.includes(server)) place.tools.push(server); }
      }
    }
  }
  return out;
}

export const _test = { langsOf, placeFor };
