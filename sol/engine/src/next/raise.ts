// Relevance before anything is raised (BR1 quiet canvas, #1615; mine/look/br1/quiet.html round 2 §3, Marco's yes 15:58).
// Silence is the default. Each ask that waits on the person gets one judgment, "would this person genuinely care, now?",
// answered by an AI over the folder's context and written as one sentence, the because… the person can open. Never a
// score from kinds or keywords, and nothing here names a person, a folder or a word of one home (meta is designed blind).
//   care      { level: 0 silence | 1 dot | 2 line | 3 question, why }: the most a raise says at rest (the face's slot)
//   the floor work stopped on the person (a permission, a session that stopped before a step) is never silent: a dot
//   outcomes  each raise is checked afterwards (answer, open, later, pass: next.known.fix lines, builder K's helper) and
//             the next judgment reads them as the folder's own lines
//   the bar   "raises you acted on" this week; under ACTED_FLOOR (with at least ACTED_MIN outcomes) Sol raises less:
//             the judgment is told the bar is raised, and every raise but a stopped one says one step less
// The judgments are kept in <sol>/next/raises.json, by ask, so the model is asked once per ask (again when its words or
// its stop change, or after JUDGE_AGAIN_MS, as a deadline comes closer). The AI is the person's own Claude, its cheapest
// family, in a bare seat (agent/meta/own.ts), held to the same day's number; none (a test, a quiet Sol, no answer):
// stopped work is a dot and everything else stays silent, and it is asked again next time.
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";

export type Level = 0 | 1 | 2 | 3;
export type Care = { level: Level; why: string };
/** what is judged: one ask, where it is, what it is in words, whether work is stopped on it */
export type Cand = { id: string; folder: string; words: string; from: string; stopped: boolean; due?: number | null; most?: Level };
/** the moment: the folder the person is in now, and what Sol knows at each folder (newest first, outcomes among them) */
export type Moment = { now: number; here?: string | null; lines: Record<string, string[]>; bar: Bar };
export type Bar = "usual" | "raised";
/** one outcome of a raise, as the known() line holds it */
export type Outcome = { how: "answer" | "open" | "later" | "pass"; at: number; place?: string | null; reason?: string };

/** the floor (quiet.html §3): raises acted on this week, under it Sol raises less */
export const ACTED_FLOOR = 0.7;
/** the fewest outcomes in a week before the floor can raise the bar: one passed-by raise is not a week */
export const ACTED_MIN = 5;
export const WEEK_MS = 7 * 864e5;
/** an ask is judged again after this long, its context having moved (a deadline closer, the person elsewhere) */
export const JUDGE_AGAIN_MS = 3 * 3600e3;
/** the words a dot says when the judgment could not run and work is stopped on the person */
export const STOPPED_WHY = "It has stopped until you answer.";

// ------------------------------------------------------------------------------- the floor's meter

/** "raises you acted on, this week": answered or opened, of every outcome in the week; null rate with none */
export function actedOf(outs: readonly Outcome[], now = Date.now()): { rate: number | null; n: number; acted: number; floor: number; raised: boolean } {
  const week = outs.filter((o) => now - o.at <= WEEK_MS && o.at <= now);
  const acted = week.filter((o) => o.how === "answer" || o.how === "open").length;
  const rate = week.length ? Math.round((acted / week.length) * 100) / 100 : null;
  return { rate, n: week.length, acted, floor: ACTED_FLOOR, raised: rate !== null && week.length >= ACTED_MIN && rate < ACTED_FLOOR };
}
/** the outcomes as the meter and the judgment take them, from builder K's outcomesOf (you-known.ts), the one reader of
 *  known()'s outcome lines; a line with no readable time is none */
export const outcomesFrom = (lines: readonly { how: string; at: string; place: string | null; reason: string }[]): Outcome[] =>
  lines.flatMap((l) => { const at = Date.parse(l.at); return Number.isFinite(at) ? [{ how: l.how as Outcome["how"], at, place: l.place, reason: l.reason }] : []; });

const SAID: Record<Outcome["how"], string> ={ answer: "You answered", open: "You opened", later: "You said later to", pass: "You passed by" };
/** each ask's own outcomes as lines of its folder (pure): the face says them with the ask's id in their reason
 *  ("ask:<id>") and its region as their place, which is not always the engine's folder (a session's ask) */
export function outcomeLines(outs: readonly Outcome[], cands: readonly Cand[], now: number): Record<string, { at: number; line: string }[]> {
  const out: Record<string, { at: number; line: string }[]> = {};
  for (const c of cands) {
    for (const o of outs) {
      if (o.reason !== `ask:${c.id}` || o.at > now) continue;
      (out[c.folder] ??= []).push({ at: o.at, line: `${SAID[o.how]} this ask: ${c.words.slice(0, 120)} (${ago(now - o.at)})` });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------- the one question, asked

const ago = (ms: number) => (ms < 90e3 ? "just now" : ms < 90 * 60e3 ? `${Math.round(ms / 60e3)} min ago` : ms < 36 * 3600e3 ? `${Math.round(ms / 3600e3)} h ago` : `${Math.round(ms / 864e5)} days ago`);
const until = (ms: number) => (ms <= 0 ? "now" : ms < 90 * 60e3 ? `in ${Math.round(ms / 60e3)} min` : ms < 36 * 3600e3 ? `in ${Math.round(ms / 3600e3)} h` : `in ${Math.round(ms / 864e5)} days`);
export { ago as agoWords };

/** the judgment's seat: told its one job */
export const JUDGE_SYSTEM = "You judge, for one person, which waiting items deserve to be raised on their screen now. Silence is the default. You answer only with the JSON lines asked for.";

/** the prompt (pure): the one question over each ask's folder, and the answer's shape, one JSON object per ask */
export function judgePrompt(m: Moment, cands: readonly Cand[]): string {
  const folders = [...new Set(cands.map((c) => c.folder))];
  const out = [
    "You decide what an assistant raises on a person's screen of folders. Silence is the default: most things are not raised.",
    "For each item, answer one question: would this person genuinely care about it, now, in this context?",
    "They care when not knowing now would cost them: work is stopped until they answer, something they promised or a deadline is close, something broke and will break again soon, or they asked for it and are coming back to it.",
    "\"Something happened\" is never enough on its own: a session that finished normally, a routine run that went as usual, a file saved, something new in a folder they have not touched in weeks. Those go to the diary, not to a raise.",
    "If the folder's own lines already answer the item's question, it is not raised: the assistant reads them instead of asking.",
    "Earlier outcomes are in the folder's lines: what this person passed by or put off, raise less of the same; what they answered or opened, the same again.",
    ...(m.bar === "raised" ? ["This week fewer than 70% of raises were acted on, so the bar is higher: raise only what is clearly worth it now."] : []),
    "Levels when they care: \"dot\" (something is there, not worth words yet), \"line\" (worth a glance: who it is, in one line), \"question\" (they should answer now).",
    "",
    `Now: ${m.here ? `the person is in ${m.here}` : "the person is looking at all their folders"}.`,
  ];
  for (const f of folders) {
    const lines = (m.lines[f] ?? []).slice(0, 12);
    out.push("", `FOLDER ${f}`, ...(lines.length ? lines.map((l) => `  - ${l.slice(0, 240)}`) : ["  (nothing known here yet)"]));
    for (const c of cands.filter((x) => x.folder === f)) {
      const due = c.due ? `; due ${until(c.due - m.now)}` : "";
      out.push(`  ITEM ${c.id}: ${c.words.slice(0, 240)} (${c.from}${c.stopped ? "; work is stopped until they answer" : ""}${due})`);
    }
  }
  out.push("", "Answer with one JSON object per item, one per line, nothing else:",
    "{\"id\": \"<item id>\", \"care\": true or false, \"level\": \"dot\" | \"line\" | \"question\", \"because\": \"<one sentence to the person, saying what in their context makes it matter now, or why it can wait>\"}");
  return out.join("\n");
}

const LEVELS: Record<string, Level> = { dot: 1, line: 2, question: 3 };
/** the answer (pure): each item's judgment, by id; an item missing or unreadable is not in it */
export function readJudgment(text: string | null, ids: readonly string[]): Record<string, { care: boolean; level: Level; because: string }> {
  const got: Record<string, { care: boolean; level: Level; because: string }> = {};
  for (const m of (text ?? "").matchAll(/\{[^{}]*\}/g)) {
    try {
      const j = JSON.parse(m[0]);
      const id = String(j.id ?? ""), because = String(j.because ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!ids.includes(id) || typeof j.care !== "boolean" || !because) continue;
      got[id] = { care: j.care, level: j.care ? LEVELS[String(j.level)] ?? 2 : 0, because };
    } catch { /* one bad line costs its item only */ }
  }
  return got;
}

/** the floor and the bar over one judgment (pure): silence unless it cares; stopped work is never silent; a raised bar
 *  says one step less, but never of stopped work */
export function careOf(c: Cand, j: { care: boolean; level: Level; because: string } | undefined, bar: Bar): Care {
  if (!j) return c.stopped ? { level: 1, why: STOPPED_WHY } : { level: 0, why: "" };
  let level: Level = j.care ? j.level : 0;
  if (bar === "raised" && !c.stopped && level > 0) level = (level - 1) as Level;
  if (c.stopped && level < 1) level = 1;
  if (c.most !== undefined && level > c.most) level = c.most;
  return { level, why: j.because };
}

// ------------------------------------------------------------------------------- kept by ask

export type Kept = { key: string; care: Care; at: number; folder: string; words: string; judged: boolean };
export type Raises = { v: 1; judged: Record<string, Kept> };
const keyOf = (c: Cand) => `${c.folder}\u0000${c.words}\u0000${c.stopped ? 1 : 0}`;
export const raisesFile = (sol: string) => join(nextDir(sol), "raises.json");
export function readRaises(sol: string): Raises {
  const { data } = readJson(raisesFile(sol));
  return { v: 1, judged: data && typeof data.judged === "object" && data.judged ? (data.judged as Record<string, Kept>) : {} };
}
/** the asks still to be judged: new, changed, judged without the model, or judged long enough ago (pure) */
export function stale(r: Raises, cands: readonly Cand[], now: number): Cand[] {
  return cands.filter((c) => { const k = r.judged[c.id]; return !k || !k.judged || k.key !== keyOf(c) || now - k.at > JUDGE_AGAIN_MS; });
}
/** each ask's care now, from what is kept; one not judged yet is the floor's (pure) */
export function caresOf(r: Raises, cands: readonly Cand[]): Record<string, Care> {
  const out: Record<string, Care> = {};
  for (const c of cands) { const k = r.judged[c.id]; out[c.id] = k && k.key === keyOf(c) ? k.care : careOf(c, undefined, "usual"); }
  return out;
}

/** one turn of the model: the prompt in, its text out, or null (none, slow, refused) */
export type Say = (prompt: string) => Promise<string | null>;
/** judge the stale asks in one turn and keep the answers; the asks gone are dropped from the file. Answers whether
 *  anything changed (a care the face shows), so the caller pushes the new list only then */
export async function judge(sol: string, cands: readonly Cand[], m: Moment, say: Say | null): Promise<boolean> {
  const r = readRaises(sol), todo = stale(r, cands, m.now);
  const before = JSON.stringify(caresOf(r, cands));
  const live = new Set(cands.map((c) => c.id));
  for (const id of Object.keys(r.judged)) if (!live.has(id)) delete r.judged[id];
  if (todo.length) {
    const text = say ? await say(judgePrompt(m, todo)) : null;
    const got = readJudgment(text, todo.map((c) => c.id));
    for (const c of todo) {
      const j = got[c.id];
      r.judged[c.id] = { key: keyOf(c), care: careOf(c, j, m.bar), at: m.now, folder: c.folder, words: c.words, judged: !!j };
    }
  }
  writeJson(raisesFile(sol), r);
  return JSON.stringify(caresOf(r, cands)) !== before;
}

// ------------------------------------------------------------------------------- an ask of the needs list, judged

/** an offer (builder T's "o:" needs: Sol offers to sort folders that came in after the move-in) holds nothing up, so it
 *  is never more than a line: it is not a question the person must answer now */
export const OFFER_MOST: Level = 2;
/** a need (next/needs.ts) as a thing to judge: the folder it sits in, its words, where it came from in words */
export function candOf(n: { id: string; piece: string; words: string; why: string; due: number | null; stopped?: boolean }): Cand {
  const offer = n.id.startsWith("o:");
  const from = n.id.startsWith("p:") ? "a working session asks permission" : n.id.startsWith("s:") ? "a block on the stage asks" : n.id.startsWith("d:") ? "an agent's draft or step waits"
    : offer ? "the assistant offers to sort folders that came in since the person set Sol up; nothing waits on it" : "a thing in the folder waits on the person";
  return { id: n.id, folder: n.piece, words: n.words, from: `${from}; ${n.why}`.slice(0, 240), stopped: !offer && (!!n.stopped || n.id.startsWith("p:")), due: n.due, ...(offer ? { most: OFFER_MOST } : {}) };
}
