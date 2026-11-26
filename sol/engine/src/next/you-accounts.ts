// Before the read (BR1 "How Sol sees you", #1615; the brief on #1615, E14, E15, E17): what is already here,
// found without reading anything private, so the screens can pre-tick and point.
//   accountsOf   the AIs (Claude Code and Codex signed in or not; a mainstream provider by its key in the Keychain) and
//                the connections already found (the Claude account's connectors, connectors.ts; the MCP servers in
//                ~/.claude.json and ~/.codex/config.toml, by name), each { name, kind, via, connected }
//   checkKey     one cheapest call to the provider with the key; when it answers, the key goes into the macOS Keychain
//                (service sol-ai-<provider>), never a file or a log; the answer is ok or the provider's reason in plain words
//   permsOf      each Mac permission: granted (what Sol.app knows, or what the engine can see), why, and its deep link
//   suggestOf    the sources present on this Mac, so the screen pre-ticks them; nothing is read, only looked for
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { appsWhere } from "./carry-apps.js";
import { type Source } from "./you-read.js";

// ------------------------------------------------------------------------------------------------ the Keychain

export type Keychain = { has: (service: string) => Promise<boolean>; set: (service: string, key: string) => Promise<boolean> };
/** `security`, the key given on its stdin (`security -i`), never as an argument a process list shows */
export const macKeychain: Keychain = {
  has: (service) => new Promise((resolve) => {
    const c = spawn("security", ["find-generic-password", "-s", service], { stdio: "ignore" });
    c.on("close", (code) => resolve(code === 0)); c.on("error", () => resolve(false));
  }),
  set: (service, key) => new Promise((resolve) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key) || !/^sol-ai-[a-z]+$/.test(service)) return resolve(false);
    const c = spawn("security", ["-i"], { stdio: ["pipe", "ignore", "ignore"] });
    c.on("close", (code) => resolve(code === 0)); c.on("error", () => resolve(false));
    c.stdin.on("error", () => {});
    c.stdin.end(`add-generic-password -U -a sol -s ${service} -w ${key}\n`);
  }),
};

export const PROVIDERS: Record<string, { name: string; url: string; head: (k: string) => Record<string, string>; shape: RegExp }> = {
  anthropic: { name: "Claude (API)", url: "https://api.anthropic.com/v1/models?limit=1", head: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }), shape: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  openai: { name: "ChatGPT (OpenAI)", url: "https://api.openai.com/v1/models", head: (k) => ({ authorization: `Bearer ${k}` }), shape: /^sk-[A-Za-z0-9_-]{20,}$/ },
  google: { name: "Gemini (Google)", url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", head: (k) => ({ "x-goog-api-key": k }), shape: /^AIza[0-9A-Za-z_-]{30,}$/ },
  mistral: { name: "Mistral", url: "https://api.mistral.ai/v1/models", head: (k) => ({ authorization: `Bearer ${k}` }), shape: /^[A-Za-z0-9]{24,}$/ },
  xai: { name: "Grok (xAI)", url: "https://api.x.ai/v1/models", head: (k) => ({ authorization: `Bearer ${k}` }), shape: /^xai-[A-Za-z0-9_-]{20,}$/ },
  openrouter: { name: "OpenRouter", url: "https://openrouter.ai/api/v1/key", head: (k) => ({ authorization: `Bearer ${k}` }), shape: /^sk-or-[A-Za-z0-9_-]{20,}$/ },
  groq: { name: "Groq", url: "https://api.groq.com/openai/v1/models", head: (k) => ({ authorization: `Bearer ${k}` }), shape: /^gsk_[A-Za-z0-9]{20,}$/ },
};
export const serviceOf = (provider: string) => `sol-ai-${provider}`;

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>;

/** next.you.key { provider, key }: the key tried once, kept in the Keychain when the provider says yes. Nothing of the key
 *  is written anywhere else or said back (the provider's words are cleaned of it) */
export async function checkKey(a: { provider?: unknown; key?: unknown }, d: { fetch?: Fetch; keychain?: Keychain } = {}): Promise<{ ok: true; provider: string } | { ok: false; provider?: string; why: string }> {
  const provider = typeof a.provider === "string" ? a.provider : "";
  const p = PROVIDERS[provider];
  if (!p) return { ok: false, why: `Sol knows these providers: ${Object.keys(PROVIDERS).join(", ")}` };
  const key = typeof a.key === "string" ? a.key.trim() : "";
  if (!key || key.length > 400 || !/^[A-Za-z0-9._-]+$/.test(key)) return { ok: false, provider, why: "that does not look like a key" };
  if (!p.shape.test(key)) return { ok: false, provider, why: `that does not look like a ${p.name} key` };
  const f = d.fetch ?? (globalThis.fetch as unknown as Fetch);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
  let status = 0, body = "";
  try { const r = await f(p.url, { headers: p.head(key), signal: ctl.signal }); status = r.status; body = (await r.text()).slice(0, 4000); }
  catch { return { ok: false, provider, why: `Sol could not reach ${p.name}; the key was not kept` }; }
  finally { clearTimeout(t); }
  if (status >= 200 && status < 300) {
    const kept = await (d.keychain ?? macKeychain).set(serviceOf(provider), key);
    return kept ? { ok: true, provider } : { ok: false, provider, why: "the key works, but the Keychain would not keep it" };
  }
  let said = "";
  try { const j = JSON.parse(body); said = String(j?.error?.message ?? j?.error ?? j?.message ?? ""); } catch { /* not JSON */ }
  said = said.split(key).join("…").replace(/sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{6,}|xai-[A-Za-z0-9_-]{6,}|gsk_[A-Za-z0-9]{6,}/g, "…").slice(0, 200);
  const plain = status === 401 ? `${p.name} says this key is not valid` : status === 403 ? `${p.name} says this key has no access` : status === 429 ? `${p.name} says too many tries just now; try again in a minute` : `${p.name} answered ${status}`;
  return { ok: false, provider, why: said ? `${plain}: ${said}` : plain };
}

// ------------------------------------------------------------------------------------------------- the accounts

export type Connector = { name: string; kind: "account" | "mcp"; via: "claude" | "claude-account" | "codex" | "gh"; connected: boolean };
/** `gh`: the Mac's own GitHub CLI, as connections.ts checkTool("gh") reads it (`gh auth status`, one call) */
export type AccountsDeps = { keychain?: Keychain; services?: () => Promise<{ name: string; status: string }[]>; gh?: () => Promise<{ there: boolean; ok?: boolean }> };

/** next.you.accounts {}: the AIs and the connections already here, by name; a connector with no sign-in is listed as not
 *  connected, never faked */
export async function accountsOf(user: string, d: AccountsDeps = {}) {
  const w = appsWhere(user, { HOME: user });
  const claudeJson = join(user, ".claude.json");
  let cj: any = null;
  try { cj = JSON.parse(readFileSync(claudeJson, "utf8")); } catch { /* none */ }
  const kc = d.keychain ?? macKeychain;
  const ais: { id: string; name: string; via: "sign-in" | "key"; signedIn: boolean; present: boolean }[] = [
    { id: "claude-code", name: "Claude Code", via: "sign-in", present: !!cj || (!!w.claude && existsSync(w.claude)), signedIn: !!cj?.oauthAccount },
    { id: "codex", name: "Codex", via: "sign-in", present: !!w.codex && existsSync(w.codex), signedIn: !!w.codex && existsSync(join(w.codex, "auth.json")) },
  ];
  for (const [id, p] of Object.entries(PROVIDERS)) ais.push({ id, name: p.name, via: "key", present: true, signedIn: await kc.has(serviceOf(id)).catch(() => false) });

  const connectors: Connector[] = [];
  const add = (c: Connector) => { if (c.name && !connectors.some((x) => x.name === c.name && x.via === c.via)) connectors.push(c); };
  for (const name of Object.keys(isObj(cj?.mcpServers) ? cj.mcpServers : {})) add({ name, kind: "mcp", via: "claude", connected: true });
  if (isObj(cj?.projects)) for (const pr of Object.values(cj.projects) as any[]) for (const name of Object.keys(isObj(pr?.mcpServers) ? pr.mcpServers : {})) add({ name, kind: "mcp", via: "claude", connected: true });
  if (w.codex) {
    let toml = "";
    try { toml = readFileSync(join(w.codex, "config.toml"), "utf8"); } catch { /* none */ }
    for (const m of toml.matchAll(/^\[mcp_servers\.("?)([A-Za-z0-9_-]{1,80})\1\]/gm)) add({ name: m[2], kind: "mcp", via: "codex", connected: true });
  }
  const slow = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 12000))]);
  // GitHub through gh, where gh is on this Mac: signed in or not, as gh itself says (walk note w2, #1615); asked
  // beside the account's list, so the two together wait no longer than one
  const gh = d.gh ? slow(d.gh()).catch(() => null) : Promise.resolve(null);
  if (d.services) {
    try {
      const list = await slow(d.services());
      for (const s of list) add({ name: s.name, kind: "account", via: "claude-account", connected: s.status === "connected" });
    } catch { /* the account's list another time: the rest stands */ }
  }
  const g = await gh;
  if (g?.there) add({ name: "GitHub", kind: "account", via: "gh", connected: g.ok === true });
  return { ais, connectors };
}
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------- the permissions

const PANE = "x-apple.systempreferences:com.apple.preference.security?";
export const PERMS = [
  { id: "full-disk", name: "Full Disk Access", why: "so Sol can read the names in Notes, Calendar and Safari's history (never what they hold)", link: `${PANE}Privacy_AllFiles` },
  { id: "accessibility", name: "Accessibility", why: "so Sol can see which window is in front and help in it when you ask", link: `${PANE}Privacy_Accessibility` },
  { id: "calendar", name: "Calendars", why: "so Sol can put your dates in the Diary and plan around them", link: `${PANE}Privacy_Calendars` },
  { id: "automation", name: "Automation", why: "so Sol can ask an app you name to do one thing, only when you ask", link: `${PANE}Privacy_Automation` },
  { id: "screen", name: "Screen Recording", why: "so Sol can see a screen you point it at, only while you show it", link: `${PANE}Privacy_ScreenCapture` },
] as const;

/** next.you.perms { known? }: each permission granted, not, or null when nobody here can tell; Sol.app's own knowledge
 *  (`known`, from its permit_state: `files` is Full Disk Access) wins; Full Disk Access is also seen by the engine (whether a closed folder lists).
 *  A folder that lists says on. One the Mac refuses says off only when Sol.app started this engine (underSolApp): the
 *  Mac judges the process that asks, and an engine started by launchd or a terminal is not Sol, so its refusal says
 *  nothing of Sol's switch (null, "can't tell"; walk note w1, #1615) */
export function permsOf(user: string, known: unknown, closed: { what: string; perm: string; line: string }[] = [], at: { underApp?: boolean; list?: (dir: string) => unknown } = {}) {
  const k = isObj(known) ? known : {};
  const list = at.list ?? readdirSync;
  const underApp = () => at.underApp ?? underSolApp();
  let disk: boolean | null = null;
  try { list(join(user, "Library", "Safari")); disk = true; } catch (e) { disk = (e as NodeJS.ErrnoException).code === "EPERM" && underApp() ? false : null; }
  // Sol.app's permit_state names Full Disk Access `files` (#1828); the permission's own id, when sent, comes first
  const word = (id: string) => typeof k[id] === "boolean" ? (k[id] as boolean) : id === "full-disk" && typeof k.files === "boolean" ? (k.files as boolean) : undefined;
  // `opens`: what the last read had to skip that this permission would open, by name ("Safari", "your calendar")
  return PERMS.map((p) => ({ ...p, granted: word(p.id) ?? (p.id === "full-disk" ? disk : null), opens: [...new Set(closed.filter((c) => c.perm === p.id).map((c) => c.what))] }));
}
/** whether Sol.app is among this process's parents (its binary, …/Sol.app/Contents/MacOS/…), by `ps`, up to launchd;
 *  `ps` is given one pid at a time, so a process list is never read whole */
export function underSolApp(ps: (pid: number) => string = (pid) => execFileSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 })): boolean {
  let pid = process.ppid;
  for (let i = 0; i < 12 && pid > 1; i++) {
    let row: RegExpMatchArray | null;
    try { row = ps(pid).trim().match(/^(\d+)\s+(.*)$/); } catch { return false; }
    if (!row) return false;
    if (/\/Sol[^/]*\.app\/Contents\/MacOS\//.test(row[2])) return true;
    pid = Number(row[1]);
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ the suggestion

/** next.you.suggest's sources: the ones present on this Mac, found by whether their place exists (nothing opened, nothing
 *  read); a source whose place is not here is not suggested */
export function presentSources(user: string, from: string | null = null): Source[] {
  const w = appsWhere(user, { HOME: user });
  const lib = join(user, "Library");
  const has = (...p: string[]) => existsSync(join(...p));
  const out: Source[] = [];
  if (w.claude && has(w.claude, "projects")) out.push("claude-sessions");
  if (w.codex && has(w.codex, "sessions")) out.push("codex-sessions");
  if (existsSync("/Applications") && process.platform === "darwin") out.push("apps");
  const app = join(lib, "Application Support");
  if ([join(app, "Google", "Chrome"), join(app, "Arc"), join(app, "BraveSoftware"), join(app, "Microsoft Edge"), join(lib, "Safari")].some(existsSync) || (from && existsSync(join(from, "Library", "Safari")))) out.push("browser");
  if (has(lib, "Calendars") || has(lib, "Group Containers", "group.com.apple.calendar")) out.push("calendar-store");
  if (has(lib, "Group Containers", "group.com.apple.notes")) out.push("notes");
  if (["Documents", "Desktop", "Downloads"].some((d) => has(user, d))) out.push("files");
  // git folders are found by a walk, which is a read: suggested where an AI that codes is here, or a usual code folder is
  if (out.includes("claude-sessions") || out.includes("codex-sessions") || ["Developer", "code", "src", "projects", "dev", "repos", "git"].some((d) => has(user, d))) out.push("projects");
  return out;
}
