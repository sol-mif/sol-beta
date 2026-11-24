// "Take that line out" (#1789, part of #1678; gate one q4 for engine/log): the person's AI finds the person's words in
// Sol's history and erases them, from inside the app, on the person's own words. Two tools on the sol server, only while
// the kernel is there (the frame on: with it off there is no log):
//   log_find    the newest events the person wrote whose kept words hold a phrase, with their ids (read only)
//   log_erase   one event's words gone for good, the kernel's erase (log.ts erase: the value file, then a log.erase line),
//               only on the person's own words this turn (`yes`, heard as set_setting hears it, openfor.ts saidThisTurn)
// Only the person's own lines (by.person "you" or "person", no agent): a seat's, a block's or the engine's are the record of what was done,
// and neither tool shows or takes their words.
// What is gone is the log's own say, and nothing else keeps it: a value file that is not there reads as `erased`, and
// log.erase names the event and who asked. No list of removed lines is kept beside it.
// Beside the new face (sol/mac/src/next/): its remove_line takes a line off the diary page (next/diary.ts, an undoable
// `remove` event in the diary's own day file), and an AI there removes only its own lines. The diary's lines are never
// written to the log, so the two never hold the same line; this erase is the log's, and it is not undone.
// Changing which kinds the log keeps by talking (log.kinds) is set_setting's, not here (#1694).
import { z } from "zod";
import type { ToolResult, TurnCtx } from "./browser.js";
import { KEEP, canErase, type AnyEv } from "./log.js";
import { canonical } from "./canonical.js";
import { saidThisTurn } from "./openfor.js";

const tx = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) });

export const LOG_TOOLS = [
  { name: "log_find", description: "Find the newest lines the person wrote in this Sol's history (its log) whose kept words hold a phrase, " +
      "with the id of each, so one can be taken out with log_erase when the person asks for it (\"take that line out of my history\"). Read only; only the person's own lines that can be erased are listed.",
    shape: { words: z.string().min(2).max(200).describe("a phrase from the line, as the person remembers it") } },
  { name: "log_erase", description: "Take the words of one of the person's own lines out of this Sol's history for good (its id from log_find). The event stays, saying it was erased; another event that holds exactly the same words loses them too (the words are kept once); " +
      "it cannot be undone. Only when the person asked for it in this very turn: `yes` is their own words from this turn that ask for it, two words at least " +
      "(in Chinese or Japanese, four characters), copied exactly.",
    shape: { id: z.string().min(1).max(100), yes: z.string().min(2).max(400) } },
] as const;
export const LOG_NAMES = new Set<string>(LOG_TOOLS.map((t) => t.name));
/** offered only while the kernel is there (in the engine; in Codex's stdio server, SOL_KERNEL) */
export const logToolsNow = (kernel: boolean) => (kernel || process.env.SOL_KERNEL === "on" ? [...LOG_TOOLS] : []);

/** a short piece of a text around a phrase (pure) */
const around = (t: string, at: number, n: number) => `${at > 30 ? "…" : ""}${t.slice(Math.max(0, at - 30), at + n + 30)}${at + n + 30 < t.length ? "…" : ""}`;
/** a line the person wrote (not through an agent) whose words erase can take (pure but for canErase) */
const PERSON = new Set(["you", "person"]);   // the face's press (home/log.ts YOU) and the kernel's own name for the person
export const theirs = (e: AnyEv): boolean => PERSON.has(e.by?.person) && !e.by?.agent && canErase(e) && e.value !== undefined;
/** the newest of the person's erasable lines in `list` whose words hold `words`, newest first (pure but for canErase) */
export function findWords(list: AnyEv[], words: string, max = 10): { id: string; kind: string; at: number; text: string }[] {
  const w = words.trim().toLowerCase();
  if (!w) return [];
  const out: { id: string; kind: string; at: number; text: string }[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < max; i--) {
    const e = list[i];
    if (!theirs(e)) continue;
    const t = canonical(e.value), at = t.toLowerCase().indexOf(w);
    if (at >= 0) out.push({ id: e.id, kind: e.kind, at: e.at, text: around(t, at, w.length) });
  }
  return out;
}

const recent = (k: { since(seq: number): AnyEv[]; lastSeq(): number }) => k.since(Math.max(0, k.lastSeq() - KEEP));

export async function runLogTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  const k = (await import("./kernel.js")).kernelNow();   // asked here, not imported at the top: tools.ts loads this file and the kernel loads tools
  if (!k) return tx("This Sol keeps no history right now: \"things your AI made\" is off in Settings.", true);
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "log_find") {
    const found = findWords(recent(k), String(a.words ?? ""));
    if (!found.length) return tx("Nothing in the recent history holds those words in a form that can be erased.");
    return tx(found.map((f) => `${f.id}  ${new Date(f.at).toISOString().slice(0, 16)}Z  ${f.kind}  ${f.text}`).join("\n"));
  }
  if (name === "log_erase") {
    if (!saidThisTurn(turn, String(a.yes ?? ""))) return tx("not erased: those words are not in what the person said this turn. Ask them, and erase it when they say so.", true);
    const id = String(a.id ?? ""), e = recent(k).find((x) => x.id === id);
    if (!e || !theirs(e)) return tx("not erased: that is not a line of the person's own in the recent history (find it with log_find).", true);
    try {
      const done = k.erase(id, { person: "person", ...(turn.seat ? { agent: turn.seat } : {}) });
      return tx(`Erased: the event's words are gone for good (log.erase, seq ${done.seq}).`);
    } catch (e) { return tx(`not erased: ${String((e as Error)?.message ?? e)}`, true); }
  }
  return tx(`Unknown tool: ${name}`, true);
}
