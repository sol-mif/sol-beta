// Reconciling the log (the backend design's step 1, personify-lab): two checks, by hand. A third, the log's files against
// the old file in the home (the mirror), ran while the two were written side by side; they agreed, and the mirror went (#691).
//   1. the seats' steps on the log against the seats' own transcripts (Claude's under ~/.claude/projects, Codex's rollouts
//      under ~/.codex/sessions): per conversation, how many turns, how many tool steps, how many output tokens each side
//      says. The transcripts are the seats' own words and stay where they are; this only counts in them. The log says a
//      turn's tokens when it ends (seat.done), so while one is running its tokens are compared up to its start
//   2. the log's own chain (the event format v1, log.ts verifyLog): each v1 line's id is its body's hash, its prev the
//      line before it, its content the one its hash names
//   The second, with what an older Sol wrote that is not carried in yet, is what the engine does at every start (log.ts
//   carryOld, #1678), so nobody needs this file or a source tree.
// Run from sol/engine:  node --import tsx src/logcheck.ts [--home <home>] [--logdir <dir>] [--since <seq>]
// Pure parts (summarize, claudeCounts, codexCounts, reconcile) are tested in test/seat-log.test.ts. A
// background agent's steps (agent: true) are not counted: they are in the agent's own transcript, not the session's.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { logDir, logFile, logFiles, readLog, checkLog, checkWords, type AnyEv } from "./log.js";

/** an event as these counts read it: a line from before v1 (read with the name its kind has now) or a v1 one */
type Counted = Pick<AnyEv, "by" | "kind" | "at"> & { value?: unknown; ctx?: { session?: string } };

export type Side = { turns: number; steps: number; out: number | null };
export type Row = { session: string; seat: string; log: Side; transcript: Side | null; ok: boolean | null; note: string };

const asNum = (x: unknown) => (typeof x === "number" ? x : 0);
/** per conversation, what the log says a seat did: turns begun, tool steps, output tokens over the turns that ended, and
 *  when the turn still running began (null when the last one ended) */
export function summarize(events: Counted[]): Map<string, { seat: string; first: number; running: number | null } & Side> {
  const out = new Map<string, { seat: string; first: number; running: number | null } & Side>();
  for (const e of events) {
    if (e.by.person !== "seat") continue;
    const v = (e.value ?? {}) as Record<string, unknown>;
    const session = e.ctx?.session ?? v.session;   // a v1 event says its conversation in ctx too: it stays when the content is erased
    if (typeof session !== "string") continue;   // a step through a block's tool (tool.call) names no conversation
    const row = out.get(session) ?? { seat: e.by.agent ?? "?", first: e.at, running: null, turns: 0, steps: 0, out: 0 };
    if (e.kind === "seat.turn") { row.turns++; row.running = e.at; }
    else if (e.kind === "seat.step") { if (v.agent !== true) row.steps++; }
    else if (e.kind === "seat.done") {
      row.running = null;
      // Claude says this turn's tokens (summed); Codex says the thread's running total (the latest stands)
      const total = (v.tokensTotal as Record<string, unknown> | undefined)?.out;
      row.out = total !== undefined ? asNum(total) : (row.out ?? 0) + asNum((v.tokens as Record<string, unknown> | undefined)?.out);
    }
    out.set(session, row);
  }
  return out;
}

const parseLines = (text: string): any[] => text.split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
/** a Claude transcript, from a moment to another (ms): turns (what the person said), tool steps (each result), output
 *  tokens (one count per message id) */
export function claudeCounts(text: string, since = 0, until = Infinity): Side {
  let turns = 0, steps = 0, out = 0;
  const seen = new Set<string>();
  for (const o of parseLines(text)) {
    const at = Date.parse(o.timestamp ?? "") || 0;
    if (at && (at < since || at >= until)) continue;
    const c = o.message?.content;
    if (o.type === "user") {
      if (o.isMeta || o.isSynthetic || o.isCompactSummary) continue;
      if (typeof c === "string") { if (c.trim()) turns++; continue; }
      if (!Array.isArray(c)) continue;
      if (c.some((b: any) => b?.type === "tool_result")) steps += c.filter((b: any) => b?.type === "tool_result").length;
      else if (c.some((b: any) => b?.type === "text" && String(b.text ?? "").trim())) turns++;
    } else if (o.type === "assistant") {
      const id = String(o.message?.id ?? o.uuid);
      if (o.message?.usage && !seen.has(id)) { seen.add(id); out += asNum(o.message.usage.output_tokens); }
    }
  }
  return { turns, steps, out };
}
/** a Codex rollout, from a moment to another (ms): turns (task_started), tool steps (each call), output tokens (each
 *  token_usage_record) */
export function codexCounts(text: string, since = 0, until = Infinity): Side {
  let turns = 0, steps = 0, out = 0;
  for (const o of parseLines(text)) {
    const at = Date.parse(o.timestamp ?? "") || 0;
    if (at && (at < since || at >= until)) continue;
    const p = o.payload ?? {};
    if (o.type === "event_msg" && p.type === "task_started") turns++;
    else if (o.type === "response_item" && ["function_call", "custom_tool_call", "local_shell_call", "web_search_call"].includes(p.type)) steps++;
    else if (o.type === "token_usage_record") out += asNum(p.usage?.output_tokens);
  }
  return { turns, steps, out };
}

/** the rows: each conversation the log knows, against its transcript (null when none was found) */
export function reconcile(events: Counted[], transcriptOf: (seat: string, session: string) => string | null): Row[] {
  const rows: Row[] = [];
  for (const [session, s] of summarize(events)) {
    const text = transcriptOf(s.seat, session);
    const log: Side = { turns: s.turns, steps: s.steps, out: s.out };
    if (text === null) { rows.push({ session, seat: s.seat, log, transcript: null, ok: null, note: "no transcript found" }); continue; }
    // the transcript is counted from a minute before the log's first line on it: the log began mid-life for most talks
    const count = s.seat === "codex" ? codexCounts : claudeCounts;
    const t = count(text, s.first - 60_000);
    const same = t.turns === log.turns && t.steps === log.steps;
    // a turn still running has no tokens on the log yet (they come with its seat.done): the transcript's are counted up to its start
    const out = s.running === null ? t.out : count(text, s.first - 60_000, s.running).out;
    const upTo = s.running === null ? "" : " (a turn has no seat.done yet, running or cut off: up to its start)";
    const tokens = out === log.out ? `tokens agree${upTo}` : `tokens ${log.out} on the log, ${out} in the transcript${upTo}`;
    rows.push({ session, seat: s.seat, log, transcript: t, ok: same, note: same ? tokens : `turns ${log.turns}/${t.turns}, steps ${log.steps}/${t.steps} (log/transcript); ${tokens}` });
  }
  return rows;
}

// ---- by hand ----

function findTranscript(seat: string, session: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(session)) return null;
  if (seat === "codex") {
    const root = join(homedir(), ".codex", "sessions");
    const walk = (d: string): string | null => {
      if (!existsSync(d)) return null;
      for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { const r = walk(p); if (r) return r; } else if (n.endsWith(`${session}.jsonl`)) return readFileSync(p, "utf8"); }
      return null;
    };
    return walk(root);
  }
  const root = join(homedir(), ".claude", "projects");
  if (!existsSync(root)) return null;
  for (const n of readdirSync(root)) { const f = join(root, n, `${session}.jsonl`); if (existsSync(f)) return readFileSync(f, "utf8"); }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const home = resolve(arg("--home") ?? process.env.SOL_HOME ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "home"));
  const dir = resolve(arg("--logdir") ?? logDir(home));
  const since = Number(arg("--since") ?? 0) || 0;
  const files = logFiles(dir);
  console.log(`the log: ${dir} (${files.length} file${files.length === 1 ? "" : "s"})${files.length ? "" : "  (missing)"}`);
  const events = readLog(dir).filter((e) => e.seq > since);
  const rows = reconcile(events, findTranscript);
  console.log(`1. ${rows.length} conversation(s) on the log${since ? ` since seq ${since}` : ""}:`);
  for (const r of rows) console.log(`   ${r.ok === null ? "?" : r.ok ? "ok" : "NO"}  ${r.seat.padEnd(6)} ${r.session}  log turns ${r.log.turns} steps ${r.log.steps} out ${r.log.out}  ${r.transcript ? `transcript turns ${r.transcript.turns} steps ${r.transcript.steps} out ${r.transcript.out}` : ""}  ${r.note}`);
  const whole = checkLog(dir, logFile(home)), c = whole.chain;
  console.log(c.ok ? `2. the chain holds: ${c.events} v1 line(s), ${c.old} from before v1 (not chained), ${c.erased} with their content erased` : `2. the chain is BROKEN at ${c.bad.length} line(s), first: ${c.bad[0].say}`);
  console.log(`3. in plain words:\n${checkWords(whole).replace(/^/gm, "   ")}`);
  process.exit(rows.some((r) => r.ok === false) || !c.ok ? 1 : 0);
}
