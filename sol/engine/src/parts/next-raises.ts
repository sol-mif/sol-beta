// next.raises (BR1 quiet canvas, #1615; mine/look/br1/quiet.html §3): each ask's judged raise, and the floor's meter.
//   asked   { type: "next.raises" }
//   answer  { type: "next.raises", care: { [askId]: { level: 0|1|2|3, why } }, acted: { rate, n, acted, floor, raised } }
// The ask ids are the needs list's (next/needs.ts: "t:<thing>", "p:<session>:<item>", "s:…", "d:…"), the face's own.
// It answers at once with what is kept (an ask not judged yet: a dot if work is stopped on it, else silence), then judges
// the new and changed asks in one turn of the person's own Claude (next/raise.ts) and, when a raise changed, says the new
// list to the window that asked (only Sol's own windows hear a person's raises; another window asks for its own). The moment it reads: what Sol knows at each ask's folder (next.known's lines, the raises'
// outcomes among them), and the week's outcomes for the bar. Behind ui.next; only Sol's own windows are answered.
//   offers  the asks the face does not read elsewhere (builder T's tidy offers, "o:"): { id, piece, words, why, rank, yes?, no?, because?, offer? }, all of them each time
// Signed: marcocyl04-ux's agent (builder J), BR1 (#1615).
import { homedir } from "node:os";
import type { Heard, Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { isQuiet } from "../quiet.js";
import { claudeModels } from "../models.js";
import { needsList, type MoreNeed } from "./next-calls.js";
import { NOT_OWN } from "./next.js";
import { recordHomeOf, youOf, type Where } from "../next/you.js";
import { knownOf, outcomesOf, readStore, storeLines } from "../next/you-known.js";
import { JUDGE_SYSTEM, actedOf, agoWords, candOf, caresOf, judge, outcomeLines, outcomesFrom, readRaises, WEEK_MS, type Cand, type Moment, type Say } from "../next/raise.js";


const whereOf = (sol: string): Where => { const user = process.env.HOME || homedir(); return { sol, user, rec: recordHomeOf(sol, user) }; };

/** what Sol knows at each ask's folder, newest first, as lines the judgment reads; each ask's own outcomes among them */
export function linesAt(sol: string, cands: readonly Cand[], now = Date.now()): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let y: ReturnType<typeof youOf> | null = null;
  try { y = youOf(whereOf(sol), now); } catch { y = null; }
  const s = readStore(sol), own = outcomeLines(outcomesFrom(outcomesOf(sol)), cands, now);
  for (const f of new Set(cands.map((c) => c.folder))) {
    const seen = new Set<string>(), rows: { at: number; line: string }[] = [...(own[f] ?? [])];
    for (const k of [...(y ? knownOf(y, f, s) : []), ...storeLines(s, f)]) {
      if (seen.has(k.k)) continue;
      seen.add(k.k);
      const at = k.at ? Date.parse(k.at) : NaN;
      rows.push({ at: Number.isFinite(at) ? at : 0, line: Number.isFinite(at) ? `${k.fact} (${agoWords(now - at)})` : k.fact });
    }
    out[f] = rows.sort((a, b) => b.at - a.at).map((r) => r.line).slice(0, 12);
  }
  return out;
}

/** the week's outcomes and the bar they set */
export const actedNow = (sol: string, now = Date.now()) => actedOf(outcomesFrom(outcomesOf(sol, now - WEEK_MS)), now);

/** an offer as the face draws it: the asks the face does not read from today's messages ("o:", builder T's tidy offers) */
export type Offer = { id: string; piece: string; words: string; why: string; rank: number; yes?: string; no?: string; because?: string[]; offer?: unknown };
const offerOf = (n: MoreNeed): Offer => ({ id: n.id, piece: n.piece, words: n.words, why: n.why, rank: n.rank, ...(n.yes ? { yes: n.yes } : {}), ...(n.no ? { no: n.no } : {}), ...(n.because?.length ? { because: n.because } : {}), ...(n.offer !== undefined ? { offer: n.offer } : {}) });

/** the answer as it stands, and the asks it judged (pure over the files): offers ride along, every one of them each
 *  time, so the face keeps exactly these */
export async function raisesMsg(sol: string, now = Date.now()): Promise<{ msg: { type: "next.raises"; care: ReturnType<typeof caresOf>; acted: ReturnType<typeof actedOf>; offers: Offer[] }; cands: Cand[] }> {
  const needs = (await needsList(sol)) as MoreNeed[], cands = needs.map(candOf);
  const offers = needs.filter((n) => n.id.startsWith("o:")).map(offerOf);
  return { msg: { type: "next.raises", care: caresOf(readRaises(sol), cands), acted: actedNow(sol, now), offers }, cands };
}

/** the person's own Claude, cheapest family, held to the day's number; none while quiet or under a test */
async function realSay(sol: string): Promise<Say | null> {
  if (isQuiet() || process.env.NODE_TEST_CONTEXT) return null;
  const { seatTurn, cappedSay, cheapest } = await import("../agent/meta/own.js");
  const { OWN_BUDGET_MS } = await import("../agent/meta/numbers.js");
  const turn = seatTurn(JUDGE_SYSTEM);
  return cappedSay((prompt) => turn(cheapest(claudeModels()), prompt, OWN_BUDGET_MS), { home: sol });
}
/** the model a test hands in (none: the real one) */
let given: Say | null | undefined;
export function useSay(s: Say | null | undefined): () => void { const was = given; given = s; return () => { given = was; }; }

/** one judgment at a time per home; a second ask while one runs waits for it and judges once more after */
const running = new Map<string, Promise<void>>();
export function judgeNow(sol: string, cands: Cand[], tell: (msg: object) => void, now = Date.now()): Promise<void> {
  const was = running.get(sol);
  if (was) return was;
  const run = (async () => {
    try {
      const acted = actedNow(sol, now);
      const m: Moment = { now, lines: linesAt(sol, cands, now), bar: acted.raised ? "raised" : "usual" };
      const say = given !== undefined ? given : await realSay(sol);
      if (await judge(sol, cands, m, say)) tell({ type: "next.raises", care: caresOf(readRaises(sol), cands), acted });
    } catch { /* a judgment that fails leaves the kept raises as they are */ } finally { running.delete(sol); }
  })();
  running.set(sol, run);
  return run;
}

export default function (p: Parts) {
  p.on("next.raises", async (_m, h: Heard) => {
    if (!uiNext()) return;
    if (!h.fromSol) return h.send(h.ws, { type: "next.refused", asked: "next.raises", why: NOT_OWN });
    const { msg, cands } = await raisesMsg(h.HOME);
    h.send(h.ws, msg);
    void judgeNow(h.HOME, cands, (m) => h.send(h.ws, { ...m, offers: msg.offers }));
  });
}
