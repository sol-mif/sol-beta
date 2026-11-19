// The press (#1298): any block may ask the person something (blocks.ts `asks`), and the press at its foot is the one
// constant. Here a press is routed back to whoever asked, once:
//
//   self, answer   a turn in the session that composed it ("<the press …>"), the path send_message takes
//   hand, offer    reach's reply (team/reach.ts reply), so it travels back to the teammate's agent by the relay
//
// "later" answers nothing: the block stays waiting, marked later, on top of Cowork › Room, and comes back on the person's
// first session of the next day. Also here, pure: where a block that arrives for the person is placed (placeFor), and
// the Room's three layers (roomRead).
import * as stage from "./blocks.js";
import { reply as reachReply } from "../team/reach.js";
import { localDay } from "../day.js";
import { isQuiet } from "../quiet.js";

export type PressDeps = {
  /** a turn in a session, as send_message's; rejects when the session is gone */
  turn: (sessionId: string, text: string) => Promise<void>;
  /** reach's reply to a hand-over or an offer (team/reach.ts) */
  reply?: (id: string, accept: boolean, why?: string) => string;
};
let deps: PressDeps | null = null;
/** wire.ts gives the turn; a test gives its own */
export const setPressDeps = (d: PressDeps | null) => { deps = d; };
/** "not mine" on a wait the morning brought (#1128, ref issue or ask): parts/waits.ts sends it back, or says why not */
export type NotMine = (b: stage.Block, by: string) => Promise<Routed>;
let notMine: NotMine | null = null;
export const setNotMine = (f: NotMine | null) => { notMine = f; };
/** a choice that takes what is handed: yes, or the morning's "on it" (#1128) */
const takes = (choice: string) => choice === "yes" || choice === "on it";

/** the words of a press as the asking agent reads them (pure) */
export function pressText(b: Pick<stage.Block, "id" | "title" | "asks">, choice: string, by: string): string {
  const a = b.asks!;
  const later = choice === "later" ? ` It waits in Cowork › Room and comes back on ${by}'s first session tomorrow; do not ask again meanwhile.` : "";
  return `<the press on artifact ${b.id}>\n${by} pressed ${choice} on "${b.title}" (${a.q}).${later}`;
}

export type Routed = { to: "session" | "relay" | "github" | "nowhere"; said: string };
/** where a press goes, by what asked; a press nobody can hear any more is said so, never dropped silently */
async function route(b: stage.Block, choice: string, by: string): Promise<Routed> {
  const a = b.asks!;
  if (a.ref.kind === "hand" || a.ref.kind === "offer") {
    if (choice === "later") return { to: "nowhere", said: "later: nothing sent; it waits on you" };
    // quiet (#1293, Frank's condition 2 on #1128): no reply goes on the relay; the ledger says what was not sent
    if (isQuiet()) return { to: "nowhere", said: `quiet (SOL_QUIET): settled here; not sent: the reply to ${a.from?.login ? `${a.from.login}'s agent` : "the handing agent"}` };
    const r = (deps?.reply ?? reachReply)(a.ref.id, takes(choice), takes(choice) ? undefined : `${by} said ${choice}`);
    return { to: /^(refused|reach is not)/.test(r) ? "nowhere" : "relay", said: r };
  }
  if (a.ref.kind === "issue" || a.ref.kind === "ask") {   // a wait the morning brought (#1128)
    if (choice === "later") return { to: "nowhere", said: "later: nothing sent; it comes back tomorrow morning" };
    if (choice !== "not mine") return { to: "nowhere", said: `${choice}: kept here, nothing sent` };
    if (!notMine) return { to: "nowhere", said: "not mine: nothing can send it back from this Sol; settled here" };
    return notMine(b, by).catch((e) => ({ to: "nowhere" as const, said: `not mine: not sent (${String((e as Error)?.message ?? e).slice(0, 120)})` }));
  }
  if (!deps) return { to: "nowhere", said: "no session can be told in this Sol" };
  try {
    await deps.turn(a.by, pressText(b, choice, by));
    return { to: "session", said: `a turn in ${a.by}` };
  } catch (e) {
    return { to: "nowhere", said: `the session that asked is gone (${String((e as Error)?.message ?? e).slice(0, 80)}); it stays in Cowork › Room` };
  }
}

/** the person's press (work.stage.press): answered once, keyed by the block. A second press answers with the first and
 *  sends nothing again */
export async function pressed(w: stage.Who, a: { id: string; choice: string }): Promise<{ block: stage.Block; answer?: stage.Pressed; first: boolean; later?: boolean; routed?: Routed }> {
  const r = stage.press(w, a);
  if (!r.first) return r;
  const by = r.answer?.by ?? w.by.split(" · ")[0].replace(/'s agent$/, "");
  const routed = await route(r.block, r.later ? "later" : r.answer!.choice, by);
  if (routed.to === "nowhere") stage.remark(w.project, r.block.id, by, routed.said.slice(0, 200));
  return { ...r, routed };
}

// ---- later comes back (the person's first session of the next day) ----
/** what comes back to a session started on `day` (pure): pressed later on an earlier day, not answered */
export const backToday = (blocks: stage.Block[], day: string) => blocks.filter((b) => !!b.asks?.later && !b.asks.answer && b.state !== "dead" && b.asks.later < day);
/** a session started (runs.ts, never a side session): what was pressed later on an earlier day, in its project, comes back
 *  on top of it, carried (one block, never a copy), and is marked with today, so it comes once a day. The day is kept on
 *  the block, so an engine that renews keeps it */
export function startedSession(sessionId: string, now = Date.now()) {
  const day = localDay(now);
  setTimeout(() => { void stage.whoFor(sessionId).then((w) => {
    for (const b of backToday(stage.allBlocks(w.project), day)) {
      stage.laterBack(w.project, b.id, day);
      stage.place({ ...w, sessionId: b.sessions[0] ?? sessionId }, { id: b.id, carry: sessionId });
    }
  }).catch(() => {}).then(() => { for (const f of starters) { try { f(sessionId, now); } catch { /* one hearer never stops the rest */ } } }); }, 2000).unref?.();
}
/** told each session the person started, after what was pressed later came back (#1128: the morning's waits) */
const starters = new Set<(sessionId: string, now: number) => void>();
export function onSessionStarted(f: (sessionId: string, now: number) => void) { starters.add(f); return () => { starters.delete(f); }; }

// ---- where a block that arrives is placed (E4) ----
export type Seat = { id: string; issue?: number | null; last: number; gone?: boolean };
/** the session a block for the person goes to (pure): the one whose run names the item's issue, else the one with the
 *  latest turn, else none (the Room, and the top of the next session started) */
export function placeFor(issue: number | undefined, seats: Seat[]): string | null {
  const live = seats.filter((s) => !s.gone).sort((x, y) => y.last - x.last);
  if (issue) { const on = live.find((s) => s.issue === issue); if (on) return on.id; }
  return live[0]?.id ?? null;
}

// ---- the Room (E5): the same blocks, seen from Cowork ----
export type RoomBlock = stage.Block & { project: string };
export type RoomRead = {
  /** what waits on me, later ones first, then oldest first */
  waiting: RoomBlock[];
  /** what settled, folded by issue (the issue's newest first; none last) */
  settled: { issue: number | null; blocks: RoomBlock[] }[];
  /** the agents' thread (team/reach.ts), newest last */
  thread: unknown[];
  /** E6: today's presses, read where they are written (each block's answer): asked, answered, the time to answer */
  today: { asked: number; answered: number; ms: number };
  readAt: number;
};
export const SETTLED_MAX = 40;
/** the Room's layers from every block that asks (pure) */
export function roomRead(blocks: RoomBlock[], thread: unknown[], now = Date.now()): RoomRead {
  const asks = blocks.filter((b) => b.asks && b.state !== "dead");
  const waiting = asks.filter((b) => !b.asks!.answer).sort((x, y) => Number(!!y.asks!.later) - Number(!!x.asks!.later) || x.at - y.at);
  const done = asks.filter((b) => b.asks!.answer).sort((x, y) => y.asks!.answer!.at - x.asks!.answer!.at).slice(0, SETTLED_MAX);
  const by = new Map<number | null, RoomBlock[]>();
  for (const b of done) { const k = b.asks!.about ?? null; by.set(k, [...(by.get(k) ?? []), b]); }
  const settled = [...by].map(([issue, bs]) => ({ issue, blocks: bs })).sort((x, y) => (x.issue === null ? 1 : y.issue === null ? -1 : 0));
  const day = localDay(now), on = (t: number) => localDay(t) === day;
  const answered = asks.filter((b) => b.asks!.answer && on(b.asks!.answer.at));
  const today = { asked: asks.filter((b) => on(b.at)).length, answered: answered.length, ms: answered.reduce((k, b) => k + Math.max(0, b.asks!.answer!.at - b.at), 0) };
  return { waiting, settled, thread, today, readAt: now };
}
/** every project's blocks that ask, as the Room reads them */
export function roomBlocks(): RoomBlock[] {
  return stage.projects().flatMap((p) => stage.allBlocks(p).filter((b) => b.asks).map((b) => ({ ...b, project: p })));
}
