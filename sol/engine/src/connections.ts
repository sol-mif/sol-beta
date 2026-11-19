// One list of every way in (#1520, step 1 of #1222): which ways in work, each said once, for any face to read
// (parts/connections.ts answers `{ type: "connections" }` with `home.connections`). Three places know it and nothing
// joined them in the engine:
//   claude-account  the services connected in the person's Claude account, as the CLI reports them (connectors.ts)
//   mac-tool        the person's own tools signed in on this Mac: gh (GitHub) and gog (Google), each asked one call.
//                   Google is Sol's own sign-in (the sol:drive row): gog is a tool few Macs have, so it gives a row only
//                   where it is there, an extra one (#1641)
//   sol             Sol's own grants (team/grant.ts): Drive today, with the ran-out record (#1440)
// and, asked with `seats: true` while the new face is on (#1620, seatsOn), two more:
//   seat            the AI seats signed in on this Mac: Claude Code and Codex (team/control.ts). A seat signed out is
//                   missing, never lapsed: the CLIs' status cannot see a sign-in run out, only one taken away (#1620)
//   site            each site a folder agent reads (Blackboard, Outlook, …), from its rules' last runs (agent/)
// Each row is connected, lapsed (it worked and no longer does: `fix` brings it back), missing (never connected here),
// or unsure: the engine cannot tell, and says so rather than guess (a service the CLI reports failed or pending, a
// tool that answered something it does not know, a grant whose cloud did not answer). A row never carries a token;
// `account` is the email or login where one is known. Pure but for `checkTool` and `connections`, at the end.
import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { getSettings } from "./settings.js";

/** the switch, a name of ours: on unless it says off (#691). Off, the engine answers `off: true` and reads nothing */
export const CONNECTIONS_ENV = "SOL_CONNECTIONS";
export function connectionsOn(): boolean {
  const env = (process.env[CONNECTIONS_ENV] ?? "").trim().toLowerCase();
  return !(env === "off" || env === "0" || env === "false");
}
/** the new face's switch, ui.next (#1604): the seat and site rows, `expires`, connections.changed and agents.list's
 *  seat and blocked are there only with it on. SOL_UI_NEXT on or off decides first, else the setting ui.next. Until
 *  uiNext() (settings.ts, #1615) is on main the setting is not kept, so only the env turns it on; then this reads it */
export function seatsOn(): boolean {
  const env = (process.env.SOL_UI_NEXT ?? "").trim().toLowerCase();
  if (env === "on" || env === "1" || env === "true") return true;
  if (env === "off" || env === "0" || env === "false") return false;
  return (getSettings() as { ui?: { next?: unknown } }).ui?.next === true;
}

export type From = "claude-account" | "mac-tool" | "sol" | "seat" | "site";
export type State = "connected" | "lapsed" | "missing" | "unsure";
/** the one press that moves a row: a page (the account's connectors), a line run in a shell, or a wire message */
export type Fix = { kind: "page"; url: string } | { kind: "run"; run: string } | { kind: "send"; type: string; with?: Record<string, string> };
export type Connection = {
  id: string;        // claude:<service>, tool:gh, tool:gog, sol:<provider>
  name: string;      // what the person reads: "Gmail", "GitHub", "Google Drive"
  from: From;
  state: State;
  via?: string;      // the tool or service it goes through, where that is not the name
  account?: string;  // the email or login, where known
  since?: number;    // lapsed: when it ran out, where known (ms)
  expires?: number;  // when its sign-in runs out, where the service says so (ms); absent: not counted (#1620)
  why?: string;      // what was said, one line: the reason a row is lapsed, missing or unsure
  fix?: Fix;
};

/** where a lapsed Claude-account service signs in again */
export const ACCOUNT_PAGE = "https://claude.ai/settings/connectors";
const line = (s: unknown) => String(s ?? "").split("\n").map((x) => x.trim()).find(Boolean)?.slice(0, 200) ?? "";

// ---- the Claude account ----

/** one service as connectors.ts connectedServices lists it */
export type Service = { name: string; status: string; error?: string };
/** the Claude account's services as rows (pure). The CLI's word decides: connected; needs-auth is lapsed; disabled is
 *  turned off there, missing; failed and pending are unsure (a lapse, an organisation's block and a slow server all
 *  read failed). No answer at all is one unsure row */
export function fromAccount(list: Service[] | { error: string }): Connection[] {
  if (!Array.isArray(list)) return [{ id: "claude-account", name: "Claude account", from: "claude-account", state: "unsure", why: line(list.error) || "the account did not answer" }];
  return list.map((s) => {
    const base = { id: `claude:${s.name}`, name: s.name, from: "claude-account" as const };
    if (s.status === "connected") return { ...base, state: "connected" };
    if (s.status === "needs-auth") return { ...base, state: "lapsed", why: "its sign-in ran out", fix: { kind: "page", url: ACCOUNT_PAGE } };
    if (s.status === "disabled") return { ...base, state: "missing", why: "turned off in the Claude account", fix: { kind: "page", url: ACCOUNT_PAGE } };
    return { ...base, state: "unsure", why: line(s.error) || s.status };
  });
}

// ---- the Mac's own tools ----

/** what one tool said: not there; there with no account; or its one call's answer */
export type ToolCheck =
  | { tool: "gh" | "gog"; there: false }
  | { tool: "gh" | "gog"; there: true; account?: string; ok: true; expires?: number }
  | { tool: "gh" | "gog"; there: true; account?: string; ok: false; said: string };
/** what signs each tool in again, from Sol, never a line to type (#1641): gh by Sol's own device flow (team.github.connect,
 *  gh.ts); gog has none of its own, so its row carries no fix and Google signs in on the sol:drive row */
const TOOL: Record<"gh" | "gog", { name: string; fix?: Fix }> = { gh: { name: "GitHub", fix: { kind: "send", type: "team.github.connect" } }, gog: { name: "Google" } };
/** a sign-in that ran out, as the tools say it */
const LAPSED = /invalid_grant|token (has )?expired|expired token|token .*(is )?invalid|invalid token|bad credentials|\b401\b|reauth|re-?authenticate/i;
/** no sign-in was ever made, as the tools say it */
const NEVER = /not logged in|no (stored )?(refresh )?token|no accounts?|missing credentials|auth login|auth add/i;

/** a tool's check as a row (pure) */
export function fromTool(c: ToolCheck): Connection {
  const t = TOOL[c.tool], base = { id: `tool:${c.tool}`, name: t.name, from: "mac-tool" as const, via: c.tool };
  if (!c.there) return { ...base, state: "missing", why: `${c.tool} is not on this Mac` };   // sol/setup installs the GitHub CLI
  const who = c.account ? { account: c.account } : {};
  if (c.ok) return { ...base, ...who, state: "connected", ...(c.expires ? { expires: c.expires } : {}) };
  const fix = t.fix ? { fix: t.fix } : {};
  if (LAPSED.test(c.said)) return { ...base, ...who, state: "lapsed", why: line(c.said), ...fix };
  if (NEVER.test(c.said) || !c.said) return { ...base, ...who, state: "missing", why: line(c.said) || `${c.tool} has no account signed in`, ...fix };
  return { ...base, ...who, state: "unsure", why: line(c.said) };
}

/** when a GitHub token runs out, from its response's headers (pure): GitHub sends github-authentication-token-expiration
 *  ("2026-12-01 00:00:00 UTC", or with an offset "-0800") only for a token made with an end date. The token
 *  `gh auth login --web` makes has none, so there the row has no `expires`: not counted, never a guess */
export function expiresFrom(headers: string): number | undefined {
  const v = /^github-authentication-token-expiration:\s*(.+?)\s*$/im.exec(headers)?.[1];
  if (!v) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(UTC|Z|[+-]\d{2}:?\d{2})?$/i.exec(v);
  if (!m) return undefined;
  const zone = !m[3] || /^(utc|z)$/i.test(m[3]) ? "Z" : m[3].replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2");
  const at = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isFinite(at) ? at : undefined;
}

// ---- the AI seats and the folder agents' sites (#1620), only with seatsOn ----

export type Seat = "claude" | "codex";
const SEAT = { claude: { name: "Claude Code", cli: "claude" }, codex: { name: "Codex", cli: "codex" } } as const;
/** a seat as team/control.ts reads it (SeatAccount): signed in, signed out (`out`: the CLI said so plainly), the CLI
 *  not on this Mac, or none of these (an answer it could not read) */
export type SeatCheck = { seat: Seat; in: boolean; who?: string; missing?: boolean; out?: boolean; run: string };
/** a seat as a row (pure). `seen`: it was signed in at a read before (kept on disk). Signed in is connected; the CLI
 *  not here is missing with no fix (signing in needs it first); signed out is missing, "signed out on this Mac" when it
 *  was seen in, so a sign-out the person chose never reads lapsed and never asks them to renew it (#1620,
 *  marcocyl04-ux's agent). The status cannot see a sign-in run out (control.ts, claudeOut), so no seat is lapsed from
 *  it; an answer it could not read is unsure. The fix is the line control.ts keeps (SIGNIN), typed into a terminal pane */
export function fromSeat(c: SeatCheck, seen: boolean): Connection {
  const t = SEAT[c.seat], base = { id: `seat:${c.seat}`, name: t.name, from: "seat" as const, via: t.cli };
  if (c.in) return { ...base, ...(c.who ? { account: c.who } : {}), state: "connected" };
  if (c.missing) return { ...base, state: "missing", why: `${t.cli} is not on this Mac` };
  const fix = { kind: "run" as const, run: c.run };
  if (!c.out) return { ...base, state: "unsure", why: `${t.cli} did not say whether it is signed in`, fix };
  return { ...base, state: "missing", why: seen ? "signed out on this Mac" : "never signed in on this Mac", fix };
}

/** one site a folder agent reads: its folder (under the home), the site, what its rules' last runs found */
export type SiteCheck = { folder: string; site: string; name: string; found: "in" | "stopped" | "unread" | "opening"; since?: number };
/** a site as a row (pure). Its last run got through: connected; it stopped at a sign-in page: lapsed, since then; the
 *  sign-in window is open now, or no rule read it yet: unsure. The fix opens the window (agent.signin) */
export function fromSite(c: SiteCheck): Connection {
  const base = { id: `site:${c.folder}:${c.site}`, name: c.name, from: "site" as const, via: c.folder };
  const fix = { kind: "send" as const, type: "agent.signin", with: { folder: c.folder, site: c.site } };
  if (c.found === "in") return { ...base, state: "connected" };
  if (c.found === "stopped") return { ...base, state: "lapsed", ...(c.since ? { since: c.since } : {}), why: "a sign-in page stopped its last read", fix };
  if (c.found === "opening") return { ...base, state: "unsure", why: "its sign-in window is open" };
  return { ...base, state: "unsure", why: "no rule has read it yet", fix };
}

/** what blocks an AI that runs on `seat` and stopped at `stucks` (pure), from the kept rows: its seat row lapsed or
 *  missing, else the first site row it is stuck at that is not connected. null: known, and nothing blocks it.
 *  undefined: not known (no list with seats kept since the engine started); agents.list then leaves the field out */
export function blockedOf(seat: Seat, stucks: { folder: string; site: string }[], rows: Connection[] | null): { by: string; why: string } | null | undefined {
  if (!rows) return undefined;
  const s = rows.find((r) => r.id === `seat:${seat}`);
  if (s && (s.state === "lapsed" || s.state === "missing")) return { by: s.id, why: s.why ?? `${s.name} is not signed in` };
  for (const k of stucks) {
    const r = rows.find((x) => x.id === `site:${k.folder}:${k.site}`);
    if (r && r.state !== "connected") return { by: r.id, why: r.why ?? `${r.name} needs a sign-in` };
  }
  return null;
}

// ---- Sol's own grants ----

/** one provider's grant as grant.ts keeps it: the grant (or none), its ran-out record (or none), the wire message that
 *  connects it, and, when it was asked to refresh now, whether that worked (`refreshed`: true, false, or "no answer") */
export type GrantCheck = {
  id: string; name: string; connect: string;
  grant: { email: string } | null;
  ranOut: { email: string; at: number } | null;
  refreshed?: boolean | "no answer";
};
/** a grant as a row (pure). Held is connected, unless a refresh asked for now did not answer (unsure); refused and
 *  remembered is lapsed, with when; neither is missing */
export function fromGrant(g: GrantCheck): Connection {
  const base = { id: `sol:${g.id}`, name: g.name, from: "sol" as const, fix: { kind: "send" as const, type: g.connect } };
  if (g.grant) {
    const who = g.grant.email ? { account: g.grant.email } : {};
    if (g.refreshed === "no answer") return { ...base, ...who, state: "unsure", why: "Sol's cloud did not answer a refresh" };
    const { fix: _, ...held } = base;
    return { ...held, ...who, state: "connected" };
  }
  if (g.ranOut) return { ...base, ...(g.ranOut.email ? { account: g.ranOut.email } : {}), state: "lapsed", since: g.ranOut.at, why: "its sign-in ran out" };
  return { ...base, state: "missing" };
}

/** a tool's check that gives a row: gog only where it is on this Mac (an extra to Sol's own Google sign-in, #1641) */
export const extra = (c: ToolCheck) => c.there || c.tool !== "gog";

/** every row, ordered: what needs the person first (lapsed, unsure), then connected, then missing (pure) */
export function listOf(rows: Connection[]): Connection[] {
  const order: Record<State, number> = { lapsed: 0, unsure: 1, connected: 2, missing: 3 };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => order[a.r.state] - order[b.r.state] || a.i - b.i).map((x) => x.r);
}

// ---- impure: asking the tools, and the list ----

const BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), "go/bin"), join(homedir(), ".local/bin")];
/** a tool's path: only in `bin` when it is given (tests), else on PATH or in the usual install folders (an engine
 *  started by launchd has a short PATH) */
function find(name: string, bin?: string): string | null {
  const dirs = bin ? [bin] : [...(process.env.PATH ?? "").split(delimiter), ...BIN_DIRS];
  for (const d of dirs) {
    if (!d) continue;
    try { accessSync(join(d, name), constants.X_OK); return join(d, name); } catch { /* not here */ }
  }
  return null;
}
type Ran = { ok: boolean; out: string; said: string };
const run = (file: string, argv: string[], ms: number) => new Promise<Ran>((res) => {
  execFile(file, argv, { timeout: ms, maxBuffer: 4 << 20, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (e, out, err) =>
    res({ ok: !e, out: String(out ?? ""), said: e ? `${String(err ?? "")}\n${String(out ?? "")}\n${(e as Error).message}`.trim() : "" }));
});

/** ask one tool whether its sign-in answers: gh with `gh auth status` (it checks the token with GitHub), gog with its
 *  account list and one item of Drive (the same call the onboarding's reader makes; only its exit is kept) */
export async function checkTool(tool: "gh" | "gog", o: { bin?: string; ms?: number; expiry?: boolean } = {}): Promise<ToolCheck> {
  const ms = o.ms ?? 15_000, file = find(tool, o.bin);
  if (!file) return { tool, there: false };
  if (tool === "gh") {
    // `expiry` (seats on, #1620): one more call, its headers kept, for when the token runs out (expiresFrom)
    const until = async () => {
      if (!o.expiry) return {};
      const h = await run(file, ["api", "-i", "user"], ms);
      const at = h.ok ? expiresFrom(h.out.split(/\r?\n\r?\n/)[0] ?? "") : undefined;
      return at ? { expires: at } : {};
    };
    const r = await run(file, ["auth", "status"], ms);
    const text = `${r.out}\n${r.said}`;
    const account = /account (\S+)/.exec(text)?.[1] ?? /Logged in to \S+ as (\S+)/.exec(text)?.[1];
    const who = account ? { account: account.replace(/[()]/g, "") } : {};
    if (r.ok) return { tool, there: true, ...who, ok: true, ...(await until()) };
    // gh says "the token is invalid" for a dead token and for a network failure alike: one call settles which
    if (LAPSED.test(r.said)) {
      const api = await run(file, ["api", "rate_limit", "--silent"], ms);
      if (api.ok) return { tool, there: true, ...who, ok: true, ...(await until()) };
      if (!/\b401\b|bad credentials/i.test(api.said)) return { tool, there: true, ...who, ok: false, said: `GitHub did not answer: ${line(api.said)}` };
    }
    return { tool, there: true, ...who, ok: false, said: r.said };
  }
  const list = await run(file, ["auth", "list", "--plain"], ms);
  const acct = list.out.split("\n").map((l) => l.split("\t")[0]?.trim() ?? "").find((c) => /@/.test(c));
  if (!acct) return { tool, there: true, ok: false, said: list.ok ? "" : list.said };
  const one = await run(file, ["drive", "ls", "--max", "1", "-j", "-a", acct], ms);
  return one.ok ? { tool, there: true, account: acct, ok: true } : { tool, there: true, account: acct, ok: false, said: one.said };
}

/** what `connections` reads, each a promise of its source; the part wires the real ones, the tests their own. `seats`
 *  and `sites` are asked only for a list with seats (seatsOn and `seats: true`); `seen` keeps which seats were ever
 *  signed in, on disk */
export type Sources = {
  services: (fresh: boolean) => Promise<Service[] | { error: string }>;
  tools: (expiry: boolean) => Promise<ToolCheck[]>;
  grants: (fresh: boolean) => Promise<GrantCheck[]>;
  seats?: () => Promise<SeatCheck[]>;
  sites?: () => Promise<SiteCheck[]>;
  seen?: { read: () => Seat[]; write: (seats: Seat[]) => void };
};
// the kept list is always the whole one that was gathered; `seats` says whether it holds the seat and site rows. A list
// without them is cut from it, so a flagless read (the onboarding row) never sees a seat row, and a list with them is
// never answered from a kept one that lacks them (#1620, marcocyl04-ux's agent's first point)
let kept: { at: number; rows: Connection[]; seats: boolean } | null = null;
let asking: { p: Promise<Connection[]>; seats: boolean } | null = null;   // one ask at a time: an older answer never lands over a newer one
const hearers = new Set<(ids: string[]) => void>();
/** for the tests: nothing kept, nobody hearing */
export const resetConnections = () => { kept = null; asking = null; hearers.clear(); };
const cut = (rows: Connection[], seats: boolean) => seats ? rows : rows.filter((r) => r.from !== "seat" && r.from !== "site");
/** every way in, kept a minute; `fresh` asks each source again now (after the person renewed one); `seats` adds the
 *  seat and site rows (the caller checks seatsOn). A source that throws is one unsure row, never a missing list */
export async function connections(s: Sources, fresh = false, seats = false): Promise<Connection[]> {
  if (!fresh && kept && (kept.seats || !seats) && Date.now() - kept.at < 60_000) return cut(kept.rows, seats);
  // a fresh ask, or one wanting seats the ask out lacks, waits for it, then asks again; any other ask shares it
  while (asking) {
    const out = asking;
    if (!fresh && (out.seats || !seats)) return cut(await out.p, seats);
    await out.p.catch(() => {});
  }
  const p = gather(s, fresh, seats).finally(() => { asking = null; });
  asking = { p, seats };
  return cut(await p, seats);
}
/** the last list with seats, as kept (sync; null when none was read since the engine started): agents.list's blocked */
export const keptWithSeats = (): Connection[] | null => kept?.seats ? kept.rows : null;
/** hear connections.changed: the ids of the rows that changed (the part pushes it to every face) */
export function onConnectionsChanged(f: (ids: string[]) => void) { hearers.add(f); return () => { hearers.delete(f); }; }
/** something changed a row out of a read (a sign-in window closed): the kept list is read again on the next ask, and
 *  the hearers are told now, so the face asks again without a second press */
export function connectionsChanged(ids: string[]) {
  if (kept) kept = { ...kept, at: 0 };
  tell(ids);
}
function tell(ids: string[]) { if (ids.length) for (const f of hearers) { try { f(ids); } catch { /* one hearer's trouble is never the list's */ } } }
/** the rows that differ between two lists (pure): added, gone, or another state, account or expiry */
export function changedIds(before: Connection[], after: Connection[]): string[] {
  const key = (r: Connection) => `${r.state}|${r.account ?? ""}|${r.expires ?? ""}`;
  const was = new Map(before.map((r) => [r.id, key(r)])), now = new Map(after.map((r) => [r.id, key(r)]));
  return [...new Set([...was.keys(), ...now.keys()])].filter((id) => was.get(id) !== now.get(id));
}
async function gather(s: Sources, fresh: boolean, seats: boolean): Promise<Connection[]> {
  const unsure = (id: string, name: string, from: From) => (e: unknown): Connection[] => [{ id, name, from, state: "unsure", why: line((e as Error)?.message ?? e) || "no answer" }];
  const withSeats = seats && !!s.seats;
  const [a, t, g, st, si] = await Promise.all([
    s.services(fresh).then(fromAccount, unsure("claude-account", "Claude account", "claude-account")),
    s.tools(withSeats).then((cs) => cs.filter(extra).map(fromTool), unsure("mac-tools", "this Mac's tools", "mac-tool")),
    s.grants(fresh).then((gs) => gs.map(fromGrant), unsure("sol-grants", "Sol's own connections", "sol")),
    withSeats ? s.seats!().then((cs) => seatRows(cs, s.seen), unsure("seats", "the AI seats", "seat")) : Promise.resolve([]),
    withSeats && s.sites ? s.sites().then((cs) => cs.map(fromSite), unsure("sites", "the folder agents' sites", "site")) : Promise.resolve([]),
  ]);
  const rows = listOf([...a, ...t, ...g, ...st, ...si]);
  const was = kept;
  kept = { at: Date.now(), rows, seats: withSeats };
  // with seats on both sides, a list that reads differently is told (a lapse found by a read, not only by a window)
  if (was?.seats && withSeats) tell(changedIds(was.rows, rows));
  return rows;
}
/** the seats' rows, with the ones seen signed in kept on disk: a seat signed in now is written, so after a restart one
 *  signed out still reads "signed out on this Mac", not "never signed in" (#1620) */
function seatRows(cs: SeatCheck[], seen: Sources["seen"]): Connection[] {
  let was: Seat[] = [];
  try { was = seen?.read() ?? []; } catch { /* none kept */ }
  const now = [...new Set([...was, ...cs.filter((c) => c.in).map((c) => c.seat)])];
  if (now.length !== was.length) { try { seen?.write(now); } catch { /* kept next time */ } }
  return cs.map((c) => fromSeat(c, was.includes(c.seat)));
}
