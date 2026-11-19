// owned by slice 2 (Needs), docs/port/slices.md
// The pause rule (#1615; the mockup's merge/engine.js "peeks (condition 13): a pause is measured"), ported as it was and
// kept in the face: an ask that arrives while the person works waits, and peeks onto the line only at a pause the face
// measures (a move, a save, a pane switch, a command started, a paragraph just ended, away, or still for 8 s), never at
// a wrong moment (a result just landed, a scroll, a paragraph being written). Only the canvas's rule, "measured+", is
// kept (round 2). simPeeks runs a scripted timeline through it: count 2's two timelines (TL) and the unit tests.
// Pure: nothing here reads the store or a clock; the caller gives `t` in seconds.
// Signed: marcocyl04-ux's agent, slice 2 of the port (#1615).

/** the signals the face keeps (S.sig): when each last happened, in seconds */
export type Sig = {
  lastResult: number; lastCmdEnd: number; lastScroll: number; lastKey: number; lastType: number; paraStart: number | null; paraEnd: number;
  lastMove: number; away: boolean; hold: boolean; lastSave: number; lastPane: number; lastCmdStart: number; lastAct: number;
};
export const freshSig = (): Sig => ({ lastResult: -99, lastCmdEnd: -99, lastScroll: -99, lastKey: -99, lastType: -99, paraStart: null, paraEnd: -99, lastMove: -99, away: false, hold: false, lastSave: -99, lastPane: -99, lastCmdStart: -99, lastAct: -99 });

/** the canvas's rule (engine.js VARIANTS.canvas.peek after round 2) */
export const RULE = "measured+";
/** an ask that found no pause in this long goes to the Needs list instead (it is "demoted"), in seconds */
export const DEMOTE_AFTER = 90;

/** a wrong moment to interrupt: a result landed under 5 s ago, a scroll under 5 s ago, or a paragraph being written */
export function wrongMoment(sig: Sig, t: number): boolean {
  return (t - sig.lastResult < 5) || (t - sig.lastScroll < 5) || (sig.paraStart != null && t - sig.lastType < 8);
}

/** whether an ask may peek now: more of the person's own pauses, the same wrong moments ruled out */
export function eligible(sig: Sig, t: number): boolean {
  if (sig.hold) return false;
  if (t - sig.lastResult < 5 || t - sig.lastScroll < 8 || sig.paraStart != null) return false;
  if (sig.away) return true;
  const just = (x: number) => t - x >= 0 && t - x <= 2;
  if (just(sig.lastMove) || just(sig.lastSave) || just(sig.lastPane) || just(sig.lastCmdStart)) return true;   // a move, a save, a pane switch, a command started
  if (t - sig.paraEnd >= 1 && t - sig.paraEnd <= 4) return true;
  return t - Math.max(sig.lastKey, sig.lastScroll, sig.lastType, sig.lastMove, sig.lastAct) >= 8;   // still for 8 s
}

/** one step of the peek tick on the store's own fields (engine.js's 250 ms tick): the first waiting ask peeks when the
 *  moment is right; any that waited past DEMOTE_AFTER goes to the list. Answers what changed */
export function tick(s: { pending: string[]; pendAt: Record<string, number>; peek: string | null; sig: Sig; c: { peeks: number; wrong: number; demoted: number } }, t: number): boolean {
  let changed = false;
  if (s.pending.length && !s.peek && eligible(s.sig, t)) {
    s.peek = s.pending.shift()!; s.c.peeks++;
    if (wrongMoment(s.sig, t)) s.c.wrong++;
    changed = true;
  }
  const keep = s.pending.filter((p) => { if (t - (s.pendAt[p] ?? t) > DEMOTE_AFTER) { s.c.demoted++; return false; } return true; });
  if (keep.length !== s.pending.length) { s.pending = keep; changed = true; }
  return changed;
}

// ---------------------------------------------------------------- the two scripted timelines (count 2)

export type Ev = [number, string, string?];
/** Dev at his 40-file diff (scrolling, typing, a command, away, a red check) and Jayden writing his paper */
export const TL: Record<"dev" | "jayden", Ev[]> = {
  dev: [[0, "near"], ...Array.from({ length: 15 }, (_, i): Ev => [i * 3, "scroll"]), [20, "peek", "dentist"], [92, "type"], [93, "type"], [94, "cmdStart"], [110, "away"], [125, "back"], [140, "peek", "red check"], [150, "result"], [155, "scroll"], [160, "scroll"], [176, "type"], [178, "type"], [180, "cmdStart"], [205, "move"]],
  jayden: [...Array.from({ length: 60 }, (_, i): Ev => [i, i % 10 >= 6 ? "none" : "type"]), [15, "peek", "homework due"], [60, "paraEnd"], [61, "none"]],
};
export type Peeked = { x?: string; t?: number; after?: number; wrong?: boolean; demoted?: boolean; never?: boolean };
/** a timeline run through the rule in half seconds (engine.js simPeeks, the canvas's rule) */
export function simPeeks(tl: Ev[], writing = tl === TL.jayden): Peeked[] {
  const sig = freshSig();
  const ev = [...tl].sort((a, b) => a[0] - b[0]);
  const pend: { x?: string; at: number }[] = [], out: Peeked[] = [];
  const end = Math.max(...ev.map((e) => e[0])) + 30;
  for (let t = 0; t <= end; t += 0.5) {
    for (const e of ev.filter((e) => e[0] > t - 0.5 && e[0] <= t)) {
      const [, k, x] = e;
      if (k === "scroll") sig.lastScroll = t;
      if (k === "type") { sig.lastType = t; sig.lastKey = t; if (sig.paraStart == null && writing) sig.paraStart = t; }
      if (k === "cmdStart") { sig.lastKey = t; sig.lastCmdStart = t; }
      if (k === "back") sig.lastAct = t;
      if (k === "save") sig.lastSave = t;
      if (k === "pane") sig.lastPane = t;
      if (k === "result") { sig.lastResult = t; sig.lastCmdEnd = t; }
      if (k === "away") sig.away = true;
      if (k === "back") sig.away = false;
      if (k === "paraEnd") { sig.paraEnd = t; sig.paraStart = null; }
      if (k === "move") sig.lastMove = t;
      if (k === "peek") pend.push({ x, at: t });
    }
    if (pend.length && eligible(sig, t)) { const p = pend.shift()!; out.push({ x: p.x, t, after: t - p.at, wrong: wrongMoment(sig, t) }); }
    for (let i = pend.length - 1; i >= 0; i--) if (t - pend[i].at > DEMOTE_AFTER) { out.push({ x: pend[i].x, t, after: t - pend[i].at, demoted: true }); pend.splice(i, 1); }
  }
  for (const p of pend) out.push({ x: p.x, never: true });
  return out;
}
/** count 2's numbers over both timelines (engine.js count2, the canvas's column) */
export function count2(): { wrong: number; shown: number; demoted: number; never: number; latency: string[]; median: number | null } {
  const a = [...simPeeks(TL.dev), ...simPeeks(TL.jayden)];
  const shown = a.filter((x) => !x.never && !x.demoted);
  const w = shown.map((x) => Math.round(x.after!)).sort((x, y) => x - y);
  return {
    wrong: a.filter((x) => x.wrong).length, shown: shown.length, demoted: a.filter((x) => x.demoted).length, never: a.filter((x) => x.never).length,
    latency: shown.map((x) => Math.round(x.after!) + "s"), median: w.length ? w[Math.floor((w.length - 1) / 2)] : null,
  };
}
