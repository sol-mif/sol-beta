// The one onboarding's reader (#1195; onboardRead.ts): onboard.read { said, rid } is the person's few sentences, and the
// answer goes to the face that asked and to no other: { by: "ai", areas, off, unsure } when their own Claude read them,
// or { by: "none", why } when nothing did, and then the face goes on with its own rules as it does today. One small turn,
// nothing in its hands (SEAT, below), nothing kept: the sentences go where everything the person types to their agent
// goes, and nowhere else (never to Jev: jev.ts sends kinds and counts only). The log line is counts and time, never a
// word of what was typed, and never a line of an error it did not write itself.
// Behind onboardReads() (settings.ts), off by default; off, the answer is "none" at once and no model is asked.
import { tmpdir } from "node:os";
import { query, type Options, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Parts } from "../parts.js";
import { leftover } from "../leftover.js";
import { onboardReads } from "../settings.js";
import { SYSTEM, promptOf, readOf, unread, type Read } from "../onboardRead.js";

/** what the seat is given, which is nothing but the sentences: the small model, no tool of Claude Code's, none of the
 *  person's connected servers, none of their settings, hooks or CLAUDE.md, and "no" to anything it asks to use. What is
 *  typed on this screen is the only thing it reads and its answer the only thing it does */
export const SEAT = {
  model: "haiku", systemPrompt: SYSTEM, thinking: { type: "disabled" },
  tools: [], mcpServers: {}, strictMcpConfig: true, settingSources: [], permissionMode: "dontAsk",
  canUseTool: async () => ({ behavior: "deny", message: "this seat uses nothing" }),
  persistSession: false,   // what was read is not a conversation of the person's
} satisfies Options;

/** a failure this file names itself: its words are its own, so they may be logged */
class Known extends Error {}
/** the seat is gone (its process ended, or it was closed) before it answered: a fresh one may still read */
export class Gone extends Known {}
/** no answer within the wait */
class Slow extends Known {}
/** what a failure is in the log: its kind and a number if it has one, never its words (an error may quote what it was sent) */
function kindOf(err: unknown): string {
  if (err instanceof Known) return err.message;
  if (!(err instanceof Error)) return typeof err;
  const code = /\b(?:code|status)\D{0,3}(\d{1,4})\b/i.exec(err.message)?.[1];
  return code ? `${err.name} ${code}` : err.name;
}

/** the small model on the person's own Claude, up before it is asked: one text in, its answer out, then closed. The
 *  process takes most of the wait, so the face says onboard.warm when the person starts typing and the turn itself is
 *  what is left at "go". One seat reads once: what an earlier reading held is never beside a later one */
class Seat {
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private waiting: { ok: (t: string) => void; no: (e: Error) => void } | null = null;
  private q: Query;
  constructor() {
    const self = this;
    async function* stream(): AsyncGenerator<SDKUserMessage> {
      while (!self.closed) {
        const m = self.queue.shift();
        if (m) { yield m; continue; }
        await new Promise<void>((r) => (self.wake = r));
        self.wake = null;
      }
    }
    this.q = query({
      prompt: stream(),
      options: { ...SEAT, cwd: tmpdir() },   // and it sits in no project
    });
    void this.read();
  }
  private async read() {
    try {
      for await (const m of this.q as AsyncIterable<SDKMessage>) {
        if (m.type !== "result") continue;
        const w = this.waiting; this.waiting = null;
        if (!w) continue;
        if (m.subtype === "success" && !m.is_error) w.ok(m.result ?? ""); else w.no(new Known("the turn failed"));
      }
    } catch (err) {
      if (!this.closed) console.log(`onboard.read: the seat stopped: ${kindOf(err)}`);
    }
    this.closed = true;
    const w = this.waiting; this.waiting = null;
    w?.no(new Gone("the seat closed"));
  }
  ask(text: string): Promise<string> {
    if (this.closed) return Promise.reject(new Gone("the seat closed"));
    if (this.waiting) return Promise.reject(new Known("the seat is busy"));
    return new Promise((ok, no) => {
      this.waiting = { ok, no };
      this.queue.push({ type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "text", text }] } } as SDKUserMessage);
      this.wake?.();
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.wake?.();
    try { this.q.close(); } catch { /* gone already */ }
  }
}

/** what the part asks, how long it waits for an answer, how long a seat nobody asked stays up, and how many readings
 *  there may be at once (one person on one screen asks one); a test puts its own here */
export const hands = { seat: (): { ask: (text: string) => Promise<string>; close: () => void } => new Seat(), ms: 12_000, idle: 5 * 60_000, most: 2 };

// the one seat that is up and not yet asked, and the clock that closes it when nobody does
let spare: ReturnType<typeof hands.seat> | null = null, spareClock: ReturnType<typeof setTimeout> | null = null, reading = 0;
function drop() { if (spareClock) clearTimeout(spareClock); spareClock = null; try { spare?.close(); } catch { /* gone already */ } spare = null; }
/** the seat comes up, or stays up: each time the person is still typing the clock starts again */
function warm() {
  spare ??= hands.seat();
  if (spareClock) clearTimeout(spareClock);
  spareClock = setTimeout(drop, hands.idle);
  spareClock.unref?.();
}
/** one seat asked once, closed either way: its answer, or a throw (Slow when none came within `ms`) */
async function once(seat: ReturnType<typeof hands.seat>, text: string, ms: number): Promise<string> {
  let stop: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([seat.ask(text), new Promise<never>((_, no) => { stop = setTimeout(() => no(new Slow("no answer in time")), Math.max(0, ms)); })]);
  } finally { clearTimeout(stop); try { seat.close(); } catch { /* gone already */ } }
}
/** one reading: the answer's text, or a throw. The seat that was warmed may have gone while it waited (five minutes is
 *  long for a process nobody talks to): then a fresh one reads, once, in the time that is left */
async function ask(text: string): Promise<string> {
  const t0 = Date.now(), warmed = spare;
  if (spareClock) clearTimeout(spareClock);
  spare = null; spareClock = null;
  try { return await once(warmed ?? hands.seat(), text, hands.ms); }
  catch (err) {
    if (!warmed || !(err instanceof Gone)) throw err;
    return once(hands.seat(), text, hands.ms - (Date.now() - t0));
  }
}
/** the rid a face sent, to send back: a short text or a number, nothing else */
const ridOf = (v: unknown) => ((typeof v === "string" && v.length <= 80) || (typeof v === "number" && Number.isFinite(v)) ? v : undefined);

export default function (p: Parts) {
  if (leftover(import.meta.url)) return;   // built by a later release than the one running
  // the person began to type: the seat comes up now, so "go" waits for the turn alone. The answer says whether their
  // sentences will be read here at all (on), which is how the face knows to ask; switched off, a seat left up is closed
  p.on("onboard.warm", (msg, { face, fromSol }) => {
    const on = !!fromSol && onboardReads();
    if (on) { try { warm(); } catch (err) { console.log(`onboard.warm: no seat: ${kindOf(err)}`); } }
    else if (fromSol) drop();
    face.send({ type: "onboard.warm", rid: ridOf(msg?.rid), v: 1, on });
  });
  p.on("onboard.read", async (msg, { face, fromSol }) => {
    const said = typeof msg?.said === "string" ? msg.said.trim() : "", rid = ridOf(msg?.rid);
    const none = (why: string, r?: Read) => face.send({ type: "onboard.read", rid, v: 1, by: "none", why, ...(r ? { unsure: r.unsure } : {}) });
    if (!fromSol) return none("not sol");
    if (!onboardReads()) { drop(); return none("off"); }
    if (!said) return none("empty");
    // with no reading the face's rules stand; a sentence that looks like a refusal by its words alone is still to be asked
    if (reading >= hands.most) return none("busy", unread(said));
    const t0 = Date.now();
    let read: Read | null = null, why = "not read";
    reading++;
    try { read = readOf(await ask(promptOf(said)), said); }
    catch (err) { why = err instanceof Slow ? "slow" : "failed"; console.log(`onboard.read: ${why} after ${Date.now() - t0} ms: ${kindOf(err)}`); }
    finally { reading--; }
    if (!read) return none(why, unread(said));
    const ms = Date.now() - t0;
    console.log(`onboard.read: ${read.areas.length} parts, ${read.off.length} off-limits, ${read.unsure.length} to ask, ${ms} ms`);
    face.send({ type: "onboard.read", rid, v: 1, by: "ai", ms, ...read });
  });
}
