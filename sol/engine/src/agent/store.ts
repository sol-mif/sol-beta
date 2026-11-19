// The folder's agent on disk. Everything lives in the folder itself, so it syncs and backs up with it:
//   <folder>/policy.md                 the rules, one per bullet: `- [watch] blackboard: every night at 03:00 …`
//                                       (optionally `- [watch, draft] …` for the rung; read is the default)
//   <folder>/ledger.md                 one line per step, for the person: time · read · made · held
//   <folder>/.agent/                   the agent's own room (a folder with it is sealed, seal.ts)
//     tickets/<id>.json                one ticket each
//     thread.json                      { thread }: the folder's one Codex thread, resumed every run
//     ledger.jsonl                     the same lines as ledger.md, as data
//     <source>-last.json               what a source saw last (blackboard-last.json, folder-last.json, clock-last.json)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { MODES, RUNGS, type LedgerLine, type Mode, type Rule, type Rung, type Ticket } from "./harness.js";

export const agentDir = (folder: string) => join(folder, ".agent");
const ticketsDir = (folder: string) => join(agentDir(folder), "tickets");

const BULLET = /^(\s*[-*]\s+)\[([a-z]+)(?:\s*,\s*([a-z]+))?\]\s+([a-z][a-z0-9-]*)\s*:\s*(.+?)\s*$/i;

/** the rules in a policy.md (pure). A rule's id is its source and its place among that source's rules: clock-2 */
export function parsePolicy(text: string): Rule[] {
  const out: Rule[] = [], count = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = BULLET.exec(line);
    if (!m) continue;
    const mode = m[2].toLowerCase() as Mode, rung = (m[3]?.toLowerCase() ?? "read") as Rung, source = m[4].toLowerCase();
    if (!MODES.includes(mode) || !RUNGS.includes(rung)) continue;
    const n = (count.get(source) ?? 0) + 1;
    count.set(source, n);
    out.push({ id: `${source}-${n}`, sentence: m[5], source, mode, rung });
  }
  return out;
}

/** policy.md with one rule's mode changed, everything else as written (pure); null when there is no such rule */
export function setModeIn(text: string, ruleId: string, mode: Mode): string | null {
  const count = new Map<string, number>();
  let hit = false;
  const lines = text.split("\n").map((line) => {
    const m = BULLET.exec(line);
    if (!m || !MODES.includes(m[2].toLowerCase() as Mode)) return line;
    const source = m[4].toLowerCase(), n = (count.get(source) ?? 0) + 1;
    count.set(source, n);
    if (`${source}-${n}` !== ruleId) return line;
    hit = true;
    return line.replace(/\[[a-z]+(\s*,\s*[a-z]+)?\]/i, `[${mode}${m[3] ? `, ${m[3]}` : ""}]`);
  });
  return hit ? lines.join("\n") : null;
}

/** the short hash a ticket's mandate keeps: which policy.md it was opened under */
export const versionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 10);

export function readPolicy(folder: string): { text: string; rules: Rule[]; version: string } {
  let text = "";
  try { text = readFileSync(join(folder, "policy.md"), "utf8"); } catch { /* no policy: no rules */ }
  return { text, rules: parsePolicy(text), version: versionOf(text) };
}

export function setMode(folder: string, ruleId: string, mode: Mode): boolean {
  if (!MODES.includes(mode)) return false;
  const { text } = readPolicy(folder);
  const next = setModeIn(text, ruleId, mode);
  if (next === null) return false;
  writeAtomic(join(folder, "policy.md"), next);
  return true;
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
function ensure(folder: string) {
  mkdirSync(ticketsDir(folder), { recursive: true });
}

/** a ticket id: the day and four random letters, t-20261109-a3f9 */
export function newId(at: number): string {
  const d = new Date(at);
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `t-${day}-${randomBytes(2).toString("hex")}`;
}

const ID = /^t-\d{8}-[0-9a-f]{4}$/;
export function readTicket(folder: string, id: string): Ticket | null {
  if (!ID.test(id)) return null;
  try { return JSON.parse(readFileSync(join(ticketsDir(folder), `${id}.json`), "utf8")) as Ticket; } catch { return null; }
}
export function saveTicket(folder: string, t: Ticket) {
  ensure(folder);
  writeAtomic(join(ticketsDir(folder), `${t.id}.json`), JSON.stringify(t, null, 2) + "\n");
}
/** every ticket in the folder, newest first */
export function readTickets(folder: string): Ticket[] {
  let names: string[] = [];
  try { names = readdirSync(ticketsDir(folder)).filter((n) => n.endsWith(".json")); } catch { return []; }
  return names.map((n) => readTicket(folder, n.slice(0, -5))).filter((t): t is Ticket => !!t).sort((a, b) => b.opened - a.opened);
}

/** the folder's one Codex thread, or null before its first run */
export function readThread(folder: string): string | null {
  try { const t = JSON.parse(readFileSync(join(agentDir(folder), "thread.json"), "utf8")).thread; return typeof t === "string" && t ? t : null; } catch { return null; }
}
export function saveThread(folder: string, thread: string) {
  ensure(folder);
  writeAtomic(join(agentDir(folder), "thread.json"), JSON.stringify({ thread }, null, 2) + "\n");
}

/** what a source saw last (blackboard, folder, clock), or null */
export function readLast<T>(folder: string, source: string): T | null {
  try { return JSON.parse(readFileSync(join(agentDir(folder), `${source}-last.json`), "utf8")) as T; } catch { return null; }
}
export function saveLast(folder: string, source: string, value: unknown) {
  ensure(folder);
  writeAtomic(join(agentDir(folder), `${source}-last.json`), JSON.stringify(value, null, 2) + "\n");
}

const flat = (s: string) => s.replace(/\s+/g, " ").replace(/·/g, "-").trim() || "-";
/** a ledger line as ledger.md writes it (pure): `- 2026-11-09 03:00 · read: … · made: … · held: …` */
export function ledgerMd(l: LedgerLine): string {
  const d = new Date(l.at);
  const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `- ${when} · read: ${flat(l.read)} · made: ${flat(l.made)} · held: ${flat(l.held)}${l.rule ? ` (${l.rule}${l.ticket ? `, ${l.ticket}` : ""})` : ""}`;
}
export function appendLedger(folder: string, l: LedgerLine) {
  ensure(folder);
  const md = join(folder, "ledger.md");
  if (!existsSync(md)) writeFileSync(md, "# Ledger\n\nWhat this folder's agent read, made and held back, one line each (the agent writes it; newest last).\n\n");
  appendFileSync(md, ledgerMd(l) + "\n");
  appendFileSync(join(agentDir(folder), "ledger.jsonl"), JSON.stringify(l) + "\n");
}
/** the ledger, newest first, at most n lines */
export function readLedger(folder: string, n = 50): LedgerLine[] {
  let text = "";
  try { text = readFileSync(join(agentDir(folder), "ledger.jsonl"), "utf8"); } catch { return []; }
  const out: LedgerLine[] = [];
  for (const l of text.trim().split("\n").reverse()) {
    if (out.length >= n) break;
    try { out.push(JSON.parse(l)); } catch { /* a torn line */ }
  }
  return out;
}
