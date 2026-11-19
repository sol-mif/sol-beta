// owned by slice 2 (Needs), docs/port/slices.md
// The Needs moves (#1615), merged into M by moves/index.ts, each answering Done ({ ok, id, undo }). Ported as they were:
// answer (engine.js answer, plus runs.js answerRuns: an ask that acts on yes runs its move), ask and withdraw (agent.js
// newAsk, RUN.withdraw), take_back's ask and group's ask with evidence (runs.js S11, S8), attach (runs.js S5: what an AI
// makes waits in its session's arrivals until pressed), tell (agent.js tell), offer (the learner's one a day), applyFix
// ("too much"'s one fix). M.needs, M.undoFix and M.tooMuch are the store's own (core.ts), the same as engine.js's.
// Live, the store holds back take_back and withdraw (core.ts NOT_YET: the engine cannot do them yet). This file also
// runs the peek tick (needs/pause.ts) while an ask waits for a pause, and keeps the learner's memory.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).
import { D, S, answer as answerAsk, change, done, hooks, now, open, render, subscribe, type Ask, type Done, type Moves, type Piece } from "../core.ts";
import { evidence, fixFor, nextRank, rankFor } from "../../needs/rank.ts";
import { tick, type Sig } from "../../needs/pause.ts";
import { answerOffer, freshLearner, pending } from "../../needs/learn.ts";

// ---------------------------------------------------------------- the learner's memory (engine.js `learner`)

/** the offers waiting, the one shown today, the ones resting, kept and refused: read it with offerNow() */
export const learner = freshLearner();
/** the offer that may show now (engine.js learner.pending) */
export const offerNow = () => pending(learner);

// ---------------------------------------------------------------- what an ask does on yes (runs.js ACT)

type ActOf = { move: string; args: unknown[] };
const acted = new Set<string>();
/** an ask answered yes that carries an act runs it once, whatever answered it (a press, ⌘↩, "yes", the line) */
function runActs(): void {
  for (const a of Object.values(D.asks)) {
    const act = a.act as ActOf | undefined;
    if (!a.answered || a.withdrawn || !act || acted.has(a.id)) continue;
    acted.add(a.id);
    const f = moves[act.move];
    if (f) f(...act.args);
    else if (act.move === "wait") { const p = D.pieces[act.args[0] as string]; if (p && p.state === "working") { p.state = "paused"; p.waits = true; } }
  }
}
subscribe(() => { if (Object.values(D.asks).some((a) => a.answered && a.act && !acted.has(a.id))) queueMicrotask(() => { runActs(); render(); }); });
hooks.onLoad.push(() => { acted.clear(); for (const a of Object.values(D.asks)) if (a.answered) acted.add(a.id); });

// ---------------------------------------------------------------- the peek tick (engine.js's setInterval over eligible)

/** how often the pause is looked at, in ms (engine.js: four times a second) */
const LOOK_EVERY = 250;
let last = 0;
function peekLoop(ts: number): void {
  if (ts - last >= LOOK_EVERY && S.pending?.length) {
    last = ts;
    if (tick(S as unknown as Parameters<typeof tick>[0], now())) render();
  }
  requestAnimationFrame(peekLoop);
}
if (typeof window !== "undefined" && typeof requestAnimationFrame === "function") {
  requestAnimationFrame(peekLoop);
  window.addEventListener("blur", () => { (S.sig as unknown as Sig).away = true; });
  window.addEventListener("focus", () => { const g = S.sig as unknown as Sig; g.away = false; g.lastAct = now(); });
}

// ---------------------------------------------------------------- helpers

const idFor = (pre: string, has: (id: string) => boolean) => { let i = 1; while (has(pre + i)) i++; return pre + i; };
/** an ask a move raises on a piece (runs.js raise): after every open one */
function raise(piece: string, text: string, source: string, x: Partial<Ask> = {}): string {
  const id = idFor("rn", (k) => !!D.asks[k]);
  D.asks[id] = { id, rank: nextRank(D), piece, kind: "code", source, text, how: "inplace", answered: false, ...x };
  return id;
}
const session = (id: string): Piece | undefined => { const p = D.pieces[id]; return p && p.kind === "session" ? p : undefined; };
const clone = <T,>(x: T): T => (x == null ? x : JSON.parse(JSON.stringify(x)));
/** D before a move, put back whole by its undo */
const keep = () => { const was = clone({ asks: D.asks, pieces: D.pieces, told: D.told }); return () => change((d) => { d.asks = was.asks; d.pieces = was.pieces; d.told = was.told; }); };

// ---------------------------------------------------------------- the moves

const moves: Moves = {
  /** answer an ask: yes, or later (it goes after the rest). Only an ask the person can see is answered (core.ts) */
  answer(id: string, how: "yes" | "later" = "yes"): Done {
    const a = D.asks[id];
    if (!a) return done(false);
    const rank = a.rank;
    const ok = answerAsk(id, how);
    if (!ok) return done(false, id);
    return done(true, id, () => change(() => { if (how === "later") a.rank = rank; else { a.answered = false; acted.delete(id); } }));
  },

  /** an AI asks (agent.js newAsk): ranked by what it reaches, never by its own claim; it peeks only at a measured pause */
  ask(ai: string, a: { words: string; piece?: string; kind?: "code" | "life"; source?: string; what?: string; serious?: boolean; reaches?: string; due?: unknown; yes?: string; part?: string }): Done {
    if (!a || !String(a.words ?? "").trim()) return done(false);
    const piece = a.piece && D.pieces[a.piece] ? a.piece : Object.keys(D.pieces)[0];
    if (!piece) return done(false);
    const id = idFor("ai", (k) => !!D.asks[k]);
    D.asks[id] = {
      id, rank: rankFor(D, a), piece, kind: a.kind || (D.pieces[piece]?.kind === "session" ? "code" : "life"),
      source: a.source || `${ai} · ${a.what || "asks"}`, text: String(a.words), how: "inplace", answered: false, by: ai,
      serious: !!a.serious, reaches: a.reaches || null, due: a.due || null, yes: a.yes || null, ...(a.part ? { part: a.part } : {}),
    };
    S.pending.push(id); S.pendAt[id] = now();
    render();
    return done(true, id, () => change((d, s) => { delete d.asks[id]; s.pending = s.pending.filter((x) => x !== id); if (s.peek === id) s.peek = null; if (s.askLine === id) s.askLine = null; }));
  },

  /** an AI takes back its own ask (agent.js RUN.withdraw); another's, or one answered, is not its to take */
  withdraw(ai: string, askId: string): Done {
    const x = D.asks[askId];
    if (!x || x.by !== ai || x.answered) return { ...done(false, askId), why: "That ask is not mine to take back." };
    const undo = keep();
    x.answered = true; x.withdrawn = true;
    tellLine(ai, `I took back my ask: ${x.text}`);
    if (S.peek === askId) S.peek = null;
    if (S.askLine === askId) S.askLine = null;
    S.pending = S.pending.filter((p) => p !== askId);
    render();
    return done(true, askId, undo);
  },

  /** take back all a run's changes: first an ask that shows what will go; its yes takes them back (runs.js S11) */
  take_back(id: string, o: { confirmed?: boolean } = {}): Done {
    const p = session(id);
    if (!p || p.state === "taken back") return done(false);
    const undo = keep();
    const ch = Array.isArray(p.changes) ? (p.changes as { st: string }[]) : null;
    const n = ch ? ch.filter((c) => c.st !== "taken back").length : (p.files ?? 0);
    if (!o.confirmed) {
      const ask = raise(p.id, `Take back all ${n} change${n === 1 ? "" : "s"} ${p.ai} made in ${p.copy}? The files go back to before it started.`, `${p.ai} · take back`, { act: { move: "take_back", args: [p.id, { confirmed: true }] } });
      render();
      return done(true, ask, undo);
    }
    ch?.forEach((c) => { c.st = "taken back"; });
    p.state = "taken back";
    for (const q of (p.parts ?? []) as Piece[]) q.state = "taken back";
    p.talk?.push(`${p.ai}: took back every change.`);
    render();
    return done(true, p.id, undo);
  },

  /** group on evidence only: an ask that shows the evidence, one press, one undo (runs.js S8). The evidence is the
   *  store's to find, never the AI's word; with none, nothing is asked */
  group(ids: string[], ev?: string[] | null, o: { confirmed?: boolean } = {}): Done {
    ids = (ids || []).filter((i) => D.pieces[i] && !D.pieces[i].inside);
    const e = ev && ev.length ? [...ev] : evidence(D, ids);
    if (ids.length < 2 || !e) return { ...done(false), why: "no evidence" };
    const undo = keep();
    const names = ids.map((i) => D.pieces[i].ai || D.pieces[i].name);
    if (!o.confirmed) {
      const ask = raise(ids[0], `Group ${names.join(" and ")}? ${e.join(" · ")}.`, "grouping", { also: ids.slice(1), evidence: e, act: { move: "group", args: [ids, e, { confirmed: true }] } });
      render();
      return done(true, ask, undo);
    }
    const id = idFor("set-", (k) => !!D.pieces[k]), region = D.pieces[ids[0]].region;
    D.pieces[id] = { id, region, kind: "set", name: names.join(" + "), members: ids, evidence: e };
    ids.forEach((i) => { D.pieces[i].inside = id; });
    hooks.layout?.();
    render();
    return done(true, id, undo);
  },

  /** what an AI made for the person to look at waits in its session's arrivals, never placed until pressed (runs.js S5) */
  attach(id: string, block: string | { kind?: string; title?: string; text?: string }): Done {
    const p = session(id);
    if (!p || !block) return done(false);
    const owner = (p.inside && D.pieces[p.inside as string]) || p;
    const b = typeof block === "string" ? { title: block } : block;
    const bid = idFor("blk-", (k) => Object.values(D.pieces).some((q) => Array.isArray(q.arrivals) && (q.arrivals as { id: string }[]).some((x) => x.id === k)));
    const list = (owner.arrivals = Array.isArray(owner.arrivals) ? owner.arrivals : []) as Record<string, unknown>[];
    list.push({ id: bid, kind: ["page", "stills", "diff", "table", "card"].includes(b.kind ?? "") ? b.kind : "page", title: b.title || "a page", text: b.text || "", by: p.ai, placed: false });
    render();
    return done(true, bid, () => change(() => { const i = list.findIndex((x) => x.id === bid); if (i >= 0) list.splice(i, 1); }));
  },

  /** an AI tells the person something (agent.js tell): about a piece (then it shows in that folder) or the whole canvas */
  tell(ai: string, words: string, proof?: unknown, piece?: string): Done {
    if (!String(words ?? "").trim()) return done(false);
    const n = tellLine(ai, String(words), proof, piece);
    render();
    return done(true, String(n), () => change((d) => { (d.told as unknown[]).splice(n - 1, 1); }));
  },

  /** the day's one offer: the person answers it (yes, later, never); any other words are an AI's offer, queued (#22) */
  offer(how: string): Done {
    if (how === "yes" || how === "later" || how === "never") {
      const was = clone(learner);
      const o = answerOffer(learner, how);
      if (!o) return done(false);
      render();
      return done(true, o, () => { Object.assign(learner, was); render(); });
    }
    if (!String(how ?? "").trim()) return done(false);
    learner.queue.push(String(how));
    render();
    return done(true, String(how), () => { learner.queue = learner.queue.filter((q) => q !== how); render(); });
  },

  /** "too much"'s one fix, pressed: fold a run of repeats into one ask, else cap the asks at Near; it calms down */
  applyFix(): Done {
    const was = { fix: S.fix, calm: S.calm };
    S.fix = fixFor(open());
    S.calm = false;
    render();
    return done(true, S.fix ?? undefined, () => { S.fix = was.fix; S.calm = was.calm; render(); });
  },
};

/** one told line (agent.js tell): answers how many there are now */
function tellLine(ai: string, words: string, proof?: unknown, piece?: string): number {
  const p = piece ? D.pieces[piece] : undefined;
  const told = (D.told = Array.isArray(D.told) ? D.told : []) as unknown[];
  told.push({ ai, words, proof: clone(proof) ?? null, piece: p ? p.id : null, region: p ? p.region : null, t: Date.now() });
  return told.length;
}

export default moves;
