// What Sol reads, and how each way in stands (#1229): one list, in Settings › home, reached the same way from any Home.
// It is the one onboarding's sources step's list (#1217), not a second one: its rows are the consent's named sources
// (consent.ts SOURCES), the connectors the reader found and the record keeps (record.connectors, with `via`), and the AI
// tools the record names, each read live now: the Claude account's services as the engine lists them (reach.ts
// connectedServices, `fresh` after a renew), and the reader's own check of each way (places/read.mjs --check: gh's and
// gog's sign-ins answer one call; the AI tools' session folders and the Mac's stores are looked for).
// A row's state is one of:
//   connected  read now; `where` names where it is read (the proof, never a sentence about it)
//   lapsed     it was connected and no longer answers; one press renews it (`fix`)
//   never      not connected yet; one press connects it where Sol can (`fix`), else the line says what it needs
//   blocked    the person's organisation refuses outside apps (a university's or a company's Google): renewing cannot
//              work, so no renew; the way round is named on the same row (`round`)
//   off        "not here", by the person's rule (consent.sources "no"); one press turns it back on, and the reader and
//              the engine never open it while it is off (explore.mjs `allowed`, engine connectors.ts servicesOff)
//   export     no connector exists (ChatGPT): it comes in with its export, said once here
// The Claude account behind the services is Sol's plumbing: a row names the way in the person's words ("your Google
// sign-in"), never "Claude account" (#1229, X12). Pure but for `readConnections` and `renew`, at the end.
import type { Consent } from "./consent";
import type { Record as Rec } from "./record";
import type { Service } from "./reach";

export type State = "connected" | "lapsed" | "never" | "blocked" | "off" | "export";
export type Group = "apps" | "signins" | "ai" | "mac" | "elsewhere";
/** what one press does: open a page (an app's sign-in, a Mac switch), GitHub's own sign-in, a sign-in line typed in a
 *  shell, or the consent's yes */
export type Fix =
  | { kind: "page"; url: string; words: string }
  | { kind: "github"; words: string }
  | { kind: "run"; run: string; words: string }
  | { kind: "yes"; words: string };
export type Row = {
  id: string;   // the consent's name for it: a named source (claude-sessions, github, …) or `account:<service>`
  name: string; group: Group; state: State;
  where: string;   // where it is read, or would be: the proof beside the fact
  line: string;    // the state in the person's words
  fix?: Fix;
  round?: string;  // blocked: the way round, named on the same row
  drop: boolean;   // "not here" may be said to it
};
/** one way's check, as places/read.mjs --check answers it */
export type Check = { ok: boolean; need?: { kind: string; line: string; run?: string } };
export type In = { services: Service[] | null; checks: Record<string, Check> | null; consent: Consent | null; rec: Rec | null };

export const GROUPS: [Group, string][] = [["apps", "your apps"], ["signins", "signed in on this computer"], ["ai", "your AI tools"], ["mac", "this Mac"], ["elsewhere", "no connector"]];
/** the account's connector settings, where a lapsed service signs in again */
export const APPS_PAGE = "https://claude.ai/settings/connectors";
/** macOS's Full Disk Access pane: the switch the Mac's stores need */
export const DISK_PAGE = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
/** what a service says when an organisation's admin refuses outside apps (Google Workspace, Microsoft 365) */
export const BLOCKED = /\b(admin(istrator)?|organi[sz]ation|workspace|domain)\b.*\b(block|restrict|disallow|not allowed|policy|denied|approv)|\b(block|restrict|disallow)\w*\b.*\b(admin|organi[sz]ation|workspace|domain)\b|admin_policy_enforced|org_internal|access_denied.*admin/i;

/** the way in, in the person's words: Google's services are one sign-in */
export const wayOf = (name: string) => (/^(gmail|google\b)/i.test(name) || /^g(oogle )?(calendar|drive|docs|sheets)$/i.test(name) ? "Google" : name.replace(/\s+(mail|calendar)$/i, ""));
/** the way round an organisation's block: the copy this Mac keeps */
const roundOf = (name: string) => (/mail/i.test(name) ? "Mail on this Mac has a copy; Sol reads it there once Mail is a source" : /calendar/i.test(name) ? "Calendar on this Mac has a copy; Sol reads it under this Mac" : /drive|docs/i.test(name) ? "Files you keep on this Mac are read under this Mac" : "a copy on this Mac, where there is one");

/** a service's state, from the engine's word (pure) */
export function serviceState(s: Pick<Service, "status"> & { error?: string }): "connected" | "lapsed" | "never" | "blocked" {
  if (s.status === "connected") return "connected";
  if (s.status === "disabled") return "never";
  if (s.error && BLOCKED.test(s.error)) return "blocked";
  return "lapsed";
}
const said = (c: Consent | null, id: string) => c?.sources?.[id];
const careful = (c: Consent | null) => c?.agreed?.said === "only what I tell you";

/** the one list (pure): every way in, each with its state, where it is read and the one press that moves it */
export function rowsOf({ services, checks, consent, rec }: In): { rows: Row[]; unread: string[] } {
  const rows: Row[] = [], unread: string[] = [];
  const turnOn = (what: string): Fix => ({ kind: "yes", words: `read ${what} again` });

  // your apps: the services connected in the person's Claude account, and the ones the onboarding found there before
  const known = new Map<string, (Service & { error?: string }) | null>();
  for (const s of services ?? []) known.set(s.name, s);
  for (const c of rec?.connectors ?? []) if (c.via === "claude account" && !known.has(c.name)) known.set(c.name, null);
  if (!services) unread.push("which apps are connected: the engine did not answer; asked again when you come back here");
  for (const [name, s] of known) {
    const id = `account:${name}`, way = wayOf(name);
    if (said(consent, id) === "no") { rows.push({ id, name, group: "apps", state: "off", where: `through your ${way} sign-in`, line: "not here, by your rule", fix: turnOn(name), drop: false }); continue; }
    if (!s) {
      if (!services) continue;   // the engine could not say: not "gone", unknown (named in `unread`)
      rows.push({ id, name, group: "apps", state: "lapsed", where: `through your ${way} sign-in`, line: "connected when you set up Home; not answering now", fix: { kind: "page", url: APPS_PAGE, words: `sign in to ${way} again` }, drop: true });
      continue;
    }
    const st = serviceState(s);
    const n = s.read?.length ?? 0;
    rows.push({ id, name, group: "apps", state: st, where: `through your ${way} sign-in`,
      line: st === "connected" ? `read only${n ? `: ${n} ways to list and read, none that send` : ""}` : st === "blocked" ? "blocked by your organisation" : st === "never" ? "turned off" : `lapsed${s.status === "needs-auth" ? ": its sign-in ran out" : ""}`,
      ...(st === "lapsed" || st === "never" ? { fix: { kind: "page" as const, url: APPS_PAGE, words: st === "never" ? `turn on ${name}` : `sign in to ${way} again` } } : {}),
      ...(st === "blocked" ? { round: roundOf(name) } : {}), drop: st !== "blocked" });
  }

  // signed in on this computer: Sol's own gh and gog
  const signin = (id: string, check: string[], name: string, tool: string, fix: (c: Check) => Fix | undefined) => {
    if (said(consent, id) === "no") { rows.push({ id, name, group: "signins", state: "off", where: tool, line: "not here, by your rule", fix: turnOn(name), drop: false }); return; }
    const cs = check.map((k) => checks?.[k]).filter((c): c is Check => !!c);
    if (!checks) return;
    if (!cs.length) { unread.push(`${name}: not checked`); return; }
    const ok = cs.find((c) => c.ok), need = cs.find((c) => !c.ok)?.need;
    const st: State = ok ? "connected" : need?.kind === "once" ? "lapsed" : need?.kind === "missing" ? "never" : "lapsed";
    const f = st === "connected" ? undefined : fix(cs.find((c) => !c.ok)!);
    rows.push({ id, name, group: "signins", state: st, where: tool, line: st === "connected" ? "signed in" : st === "never" ? (need?.line && /not on this|no signed-in/i.test(need.line) ? `${tool} is not signed in here` : `not signed in`) : need?.kind === "once" ? "lapsed: its sign-in ran out" : `could not answer: ${need?.line ?? "no word"}`, ...(f ? { fix: f } : {}), drop: true });
  };
  signin("github", ["github"], "GitHub", "gh", () => ({ kind: "github", words: "sign in to GitHub" }));
  signin("gdrive", ["gdrive", "gmail"], "Google Drive and Gmail", "gog", (c) => (c.need?.run ? { kind: "run", run: c.need.run, words: "sign in to Google again" } : undefined));

  // your AI tools: their session files (names, titles and dates, never a message's text), and their own connectors
  const sessions: [string, string, string][] = [["claude-sessions", "Claude Code", "~/.claude/projects"], ["codex-sessions", "Codex", "~/.codex/sessions"]];
  for (const [id, name, where] of sessions) {
    const say = said(consent, id), c = checks?.[id];
    if (say === "no") { rows.push({ id, name: `${name}'s sessions`, group: "ai", state: "off", where, line: "not here, by your rule", fix: turnOn(`${name}'s sessions`), drop: false }); continue; }
    if (!c) { if (checks) unread.push(`${name}'s sessions: not checked`); continue; }
    if (!c.ok) { rows.push({ id, name: `${name}'s sessions`, group: "ai", state: "never", where, line: c.need?.kind === "switch" ? "this Mac keeps it closed to Sol" : `${name} has not run on this computer`, drop: false }); continue; }
    if (careful(consent) && say !== "yes") { rows.push({ id, name: `${name}'s sessions`, group: "ai", state: "never", where, line: "you said only what you tell me", fix: { kind: "yes", words: "read their names and dates" }, drop: false }); continue; }
    rows.push({ id, name: `${name}'s sessions`, group: "ai", state: "connected", where, line: "folder names, session titles and dates; never what was said", drop: true });
  }
  for (const c of rec?.connectors ?? []) if (c.via === "claude code" || c.via === "codex")
    rows.push({ id: `tool:${c.via}:${c.name}`, name: c.name, group: "ai", state: "connected", where: c.src ?? (c.via === "codex" ? "Codex's settings" : "Claude Code's settings"), line: `connected in ${c.via === "codex" ? "Codex" : "Claude Code"}`, drop: false });

  // this Mac: its own stores, read from Sol's copy (places_copy)
  for (const [id, check, name, where] of [["notes", "notes", "Notes", "Notes on this Mac"], ["calendar-store", "calendar", "Calendar", "Calendar on this Mac"]] as const) {
    if (said(consent, id) === "no") { rows.push({ id, name, group: "mac", state: "off", where, line: "not here, by your rule", fix: turnOn(name), drop: false }); continue; }
    const c = checks?.[check];
    if (!c) { if (checks) unread.push(`${name}: not checked`); continue; }
    if (c.ok) { rows.push({ id, name, group: "mac", state: "connected", where, line: id === "notes" ? "titles and dates, never a note's words" : "event names and times", drop: true }); continue; }
    if (c.need?.kind === "switch") { rows.push({ id, name, group: "mac", state: "never", where, line: "needs Full Disk Access for Sol", fix: { kind: "page", url: DISK_PAGE, words: "open the switch" }, drop: true }); continue; }
    rows.push({ id, name, group: "mac", state: "never", where, line: c.need?.line ?? "not on this computer", drop: false });
  }

  // no connector: said once, with the way it comes in
  for (const a of rec?.ai ?? []) if (a.reach === "export")
    rows.push({ id: `export:${a.name}`, name: a.name, group: "elsewhere", state: "export", where: `${a.name}'s export`, line: "no connector; it comes in with its export", drop: false });
  return { rows, unread };
}

/** the counts the row's head shows: what needs the person now */
export const needs = (rows: Row[]) => rows.filter((r) => r.state === "lapsed" || r.state === "blocked").length;

// ── impure: reading the list, and the one press ──
type Ask = <T>(o: object, ms: number) => Promise<T | null>;
type Wire = { send: (o: object) => unknown; subscribe: (fn: (m: any) => void) => () => void };

/** the reader's check of every way this list shows, run through the engine's shell (places/read.mjs --check), written
 *  under ~/.sol/onboard like the explorer's; null when no shell opened or it did not answer in time */
export async function checkWays(ask: Ask, e: Wire, reader: string): Promise<Record<string, Check> | null> {
  const w = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: ".sol/onboard/read.mjs", text: reader }, 8000);
  if (!w?.ok) return null;
  await ask({ type: "work.write", cwd: "~", path: ".sol/onboard/ways.json", text: "" }, 6000);
  const t = await ask<{ tid?: string }>({ type: "work.term.open", cwd: "~", cols: 120, rows: 10 }, 8000);
  if (!t?.tid) return null;
  e.send({ type: "work.term.in", tid: t.tid, data: "node ~/.sol/onboard/read.mjs --check github,gdrive,gmail,claude-sessions,codex-sessions,notes,calendar --out ~/.sol/onboard/ways.json; exit\n" });
  try {
    for (let i = 0; i < 100; i++) {   // 20 s at most: gh and gog each answer one call
      await new Promise((r) => window.setTimeout(r, 200));
      const r = await ask<{ text?: string }>({ type: "work.read", cwd: "~", path: ".sol/onboard/ways.json" }, 3000);
      if (r?.text?.trim()) { try { return (JSON.parse(r.text) as { checks?: Record<string, Check> }).checks ?? null; } catch { return null; } }
    }
    return null;
  } finally { e.send({ type: "work.term.close", tid: t.tid }); }
}

/** a sign-in line typed in a shell of its own (gog opens the browser itself); resolves when the line ends, or after
 *  `ms` with false */
export async function runSignIn(ask: Ask, e: Wire, run: string, ms = 5 * 60_000): Promise<boolean> {
  const t = await ask<{ tid?: string }>({ type: "work.term.open", cwd: "~", cols: 120, rows: 10 }, 8000);
  if (!t?.tid) return false;
  const tid = t.tid;
  return new Promise<boolean>((res) => {
    let out = "";
    const tm = window.setTimeout(() => done(false), ms);
    const off = e.subscribe((m: any) => {
      if (m?.tid !== tid) return;
      if (m.type === "work.term.out") { out += String(m.data ?? ""); const x = /SOL-42-SIGNED-(\d+)/.exec(out); if (x) done(x[1] === "0"); }
      else if (m.type === "work.term.exit") done(false);
    });
    function done(ok: boolean) { window.clearTimeout(tm); off(); e.send({ type: "work.term.close", tid }); res(ok); }
    e.send({ type: "work.term.in", tid, data: `${run}; echo SOL-$((40+2))-SIGNED-$?\n` });
  });
}
