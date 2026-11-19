// The agent's hands on its stage (#1437): `place` with the hand's own moves (beside, under, foot, width, large, chat, and
// go with say: the lens on every kind), sent to the face as `work.stage.hand`, where the one space makes them with the
// hand's edits (mac/src/pieces/hands.ts, Space.tsx). The face's report (eyes.ts, #1435) decides first: no report, the
// switch "the agent arranges the stage" off, or a piece Marco placed by hand, and the move is refused in words. Sol
// never moves anything by itself; its agent moves only by a verb in the talk that ⌥⌘Z undoes.
import * as eyes from "./eyes.js";

export type HandMove = {
  id: string; beside?: string; under?: string; foot?: boolean; width?: "narrow" | "half" | "wide";
  large?: boolean; chat?: "col" | "lines" | "line"; go?: string; say?: string;
};
const WIDTHS = new Set(["narrow", "half", "wide"]), CHATS = new Set(["col", "lines", "line"]);
const ID = /^[A-Za-z0-9_-]{1,80}$/;
export const TALK = "talk";
const word = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, n) : "");

/** the hand's moves in a place call's arguments, made safe; null when it asks for none (pure) */
export function moveOf(a: Record<string, unknown>): Omit<HandMove, "id"> | null {
  const m: Omit<HandMove, "id"> = {};
  if (typeof a.beside === "string" && ID.test(a.beside)) m.beside = a.beside;
  else if (typeof a.under === "string" && ID.test(a.under)) m.under = a.under;
  else if (a.foot === true) m.foot = true;
  if (typeof a.width === "string" && WIDTHS.has(a.width)) m.width = a.width as HandMove["width"];
  if (typeof a.large === "boolean") m.large = a.large;
  if (typeof a.chat === "string" && CHATS.has(a.chat)) m.chat = a.chat as HandMove["chat"];
  const go = word(a.go, 80); if (go) { m.go = go; const say = word(a.say, 120); if (say) m.say = say; }
  return Object.keys(m).length ? m : null;
}

let bus: ((m: object) => void) | null = null;
/** who hears a move: wire.ts gives every face */
export const setHandBus = (f: ((m: object) => void) | null) => { bus = f; };
const count = new Map<string, number>();
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** the move sent to Marco's window, or the words for why not (the window decides what it can) */
export function ask(sid: string, m: HandMove, title: (id: string) => string, kind = ""): string | null {
  const res = askOf(sid, m, title);
  const verb = m.beside ? "beside" : m.under ? "under" : m.foot ? "foot" : m.width ? "width" : m.large !== undefined ? "large" : m.chat ? `chat-${m.chat}` : m.go ? "go" : "none";
  eyes.counted(sid, "stage.asked", { verb, result: res.why, ...(res.n ? { n: res.n } : {}), ...(kind ? { kind } : {}), ...(m.width ? { width: m.width } : {}), ...(m.go ? { go: true } : {}), ...(m.say ? { say: true } : {}), ...(m.large !== undefined ? { large: m.large } : {}), ...(m.chat ? { chat: m.chat } : {}) });
  return res.line;
}
function askOf(sid: string, m: HandMove, title: (id: string) => string): { why: string; line: string | null; n?: number } {
  const r = eyes.reportOf(sid);
  if (!r) return { why: "noreport", line: "not moved: Marco's window does not report this session's stage (Build settings › switches: the one space, then \"the agent sees the stage\" and \"the agent arranges the stage\")" };
  if (!r.hands) return { why: "off", line: "not moved: Marco keeps the arranging (\"the agent arranges the stage\" is off in Build settings › switches)" };
  const p = r.pieces.find((x) => x.id === m.id);
  if (p?.held) { const t = eyes.heldSince(sid, m.id); return { why: "held", line: `not moved: "${title(m.id)}" is held by Marco${t ? ` since ${hhmm(t)}` : ""}; it stays where he put it (he lets go by pressing its grip)` }; }
  for (const o of [m.beside, m.under]) if (o && !r.pieces.some((x) => x.id === o)) return { why: "notopen", line: `not moved: "${title(o)}" is not open on Marco's stage` };
  if (!p && m.id !== TALK && !r.away.includes(m.id)) return { why: "absent", line: `not moved: "${title(m.id)}" is not on this session's stage` };
  const n = (count.get(sid) ?? 0) + 1; count.set(sid, n);
  try { bus?.({ type: "work.stage.hand", sessionId: sid, move: { ...m, n } }); } catch { /* a face's trouble is never the tool's */ }
  if (m.go) eyes.went(sid, m.id, m.go);
  return { why: "sent", line: null, n };
}

/** what was asked, in a person's words, for the tool's answer (pure) */
export function words(m: HandMove, title: (id: string) => string): string {
  const t = (id: string) => (id === TALK ? "the chat" : `"${title(id)}"`), bits: string[] = [];
  if (m.beside) bits.push(`beside ${t(m.beside)}`); else if (m.under) bits.push(`under ${t(m.under)}`); else if (m.foot) bits.push("across the bottom");
  if (m.width) bits.push(`${m.width} width`);
  if (m.large !== undefined) bits.push(m.large ? "taken large" : "back among the others");
  if (m.chat) bits.push(m.chat === "col" ? "the chat as a column" : m.chat === "lines" ? "the chat as its last lines" : "the chat as one line");
  if (m.go) bits.push(`taken to ${m.go}${m.say ? ` ("${m.say}")` : ""}`);
  return `moved ${t(m.id)}: ${bits.join(", ")}`;
}

export function reset(): void { count.clear(); }
