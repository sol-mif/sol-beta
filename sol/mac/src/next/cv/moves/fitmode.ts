// Fit mode's moves (BR1 people item 1, #1615; the rules fitmode/model.ts, the card fitmode/FitMode.tsx in the bar's Fit
// Sol): point at a thing in the window (fmPoint, fmAt), say what you want (fmSay) or pick (fmKnob, fmTry); the take is
// drawn on that thing at once; Keep (fmKeep) keeps it for the place chosen (fmReach), Back (fmBack) leaves it as it was,
// and a kept take is taken back by fmUndo. Live, a try is the engine's preview (next.fit.try { knob, scope, take, by } →
// { preview: { changes, token } }), Keep and Back send that token ({ token, keep | back }), the same shape as
// next.you.fact.fix; a keep is the person's fit there and sessions in that folder hear it (next.session.since). The
// answers land through cv/wire/fitmode.ts. In the fixture the fits are kept in Settings' world (D.prefs), nothing sent.
// The state is S.fm. Named fm* so none meets a shared move. Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { D, MODE, S, done, hooks, render, type Done, type Moves } from "../core.ts";
import type { Engine } from "../wire/types.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { W, U } from "./settings.ts";
import { K, applyFits, fitKnob, parseAsk, type Fit } from "../../settings/model.ts";
import { titleOf } from "../../plane/layout.ts";
import { allTarget, canFit, choicesOf, colourIn, customizable, folderTarget, knobName, knobOf, namedIn, startTarget, takeName, targetOf, takesOf, triesOf, type Target } from "../../fitmode/model.ts";

/** how a take was asked: pointed at, said, picked, or one of Sol's tries (✦) pressed */
export type By = "point" | "say" | "pick" | "try";
/** a take tried on the target: live, `token` and `from` are the engine's preview once it answers */
export type Trying = { knob: string; take: string; scope: string; by: By; token: string | null; from: string | null; keeping?: boolean; why?: string };
export type Kept = { knob: string; take: string; scope: string; token: string; where: string };
export type FM = {
  pointing: boolean; hov: string | null; target: Target; scope: string; knob: string;
  trying: Trying | null; kept: Kept | null; miss: string | null;
  /** how the target was chosen: pointed at, or the folder open now and All of Sol (a pick) */
  via: "point" | "pick";
  /** the card is open, or Customize is on (the ring and a try are drawn only then; a kept take always) */
  open: boolean;
  /** Customize (customize.html): on, the window's changeable things are outlined; bar: the small bar of the target's
   *  choices is open beside it; at: where the press landed, the bar's anchor for the whole window */
  cu: boolean; bar: boolean; at: { x: number; y: number } | null;
};

/** the engine the moves send to: set by the wire in a real Sol, null on the dev page and in tests */
export const fmLink: { e: Engine | null } = { e: null };
const live = () => MODE === "live";
const send = (o: object) => (fmLink.e ? fmLink.e.send(o) : false);
let n = 0;

/** the state, made when first read: the folder open now, else All of Sol */
export function FMs(): FM {
  if (!S.fm) S.fm = fresh();
  return S.fm as FM;
}
function fresh(): FM {
  const t = startTarget(S.dist !== "far" ? S.region : null, D.regions);
  return { pointing: false, hov: null, target: t, scope: t.reach[0].scope, knob: t.knobs[0] ?? "look", trying: null, kept: null, miss: null, via: "pick", open: false, cu: false, bar: false, at: null };
}
/** the place a scope names, in words */
export const reachName = (f: FM, scope: string) => f.target.reach.find((r) => r.scope === scope)?.name ?? (scope === "~" ? "All of Sol" : scope.split("/").pop() || scope);

/** the take that decides a knob at a scope now, as the face knows it (the engine's preview says it for sure): the
 *  nearest fit with a take on the way up, else what all of Sol has */
export function nowAt(f: FM, knob: string, scope: string): string {
  const w = W(), up = f.target.reach.map((r) => r.scope), from = Math.max(0, up.indexOf(scope));
  for (const s of up.slice(from)) { const x = w.fits?.find((y) => y.knob === knob && y.scope === s); if (x?.take) return x.take; }
  return w.prefs.kept[knob] ?? knobOf(knob)?.def ?? "";
}

/** leave a try: live, its preview is dropped at the engine too */
function drop(f: FM) {
  if (f.trying?.token && live()) send({ type: "next.fit.try", token: f.trying.token, back: true });
  f.trying = null;
}
function aim(t: Target, via: FM["via"]): Done {
  const f = FMs(), was = { target: f.target, scope: f.scope, knob: f.knob, via: f.via };
  drop(f);
  f.target = t; f.via = via; f.scope = t.reach[0].scope; f.knob = t.knobs.includes(f.knob) ? f.knob : t.knobs[0] ?? f.knob;
  f.pointing = false; f.hov = null; f.miss = null;
  render();
  return done(true, t.name, () => { const g = FMs(); Object.assign(g, was); render(); });
}

/** try a take on the target, for the place chosen */
function tryIt(knob: string, take: string, by: By): Done {
  const f = FMs(), k = knobOf(knob);
  if (!k || !canFit(knob) || !k.takes.some((t) => t.id === take)) return done(false);
  if (f.trying && f.trying.knob === knob && f.trying.take === take && f.trying.scope === f.scope) return done(true, `${knob}:${take}`);
  drop(f);
  f.knob = knob; f.miss = null;
  if (take === nowAt(f, knob, f.scope)) { render(); return done(false, knob); }   // what stands there already: nothing to try
  f.trying = { knob, take, scope: f.scope, by, token: live() ? null : `here-${++n}`, from: live() ? null : nowAt(f, knob, f.scope) };
  if (live()) send({ type: "next.fit.try", knob, scope: f.scope, take, by });
  render();
  return done(true, `${knob}:${take}`, () => { drop(FMs()); render(); });
}

/** the fixture's keep: the person's fit in Settings' world, as the engine's next.fits would give it */
function keepHere(t: Trying): void {
  const w = W(), now = Date.now();
  const fit: Fit = { knob: t.knob, scope: t.scope, take: t.take, author: "person", reason: null, count: null, source: `fit mode: ${t.by}`, change: t.token, held: false,
    history: [{ id: t.token!, at: now, act: "set", take: t.take, author: "person", source: `fit mode: ${t.by}` }] };
  w.fits = [...(w.fits ?? []).filter((x) => !(x.knob === t.knob && x.scope === t.scope)), fit];
  if (t.scope === "~") w.prefs.kept[t.knob] = t.take;
  applyFits(w);
}
function backHere(k: Kept): void {
  const w = W();
  w.fits = (w.fits ?? []).map((x) => (x.knob === k.knob && x.scope === k.scope ? { ...x, take: null, held: true } : x));
  if (k.scope === "~") w.prefs.kept[k.knob] = knobOf(k.knob)?.def ?? w.prefs.kept[k.knob];
  applyFits(w);
}

/** the wire's half: the engine's answer to a try, a keep or a back (cv/wire/fitmode.ts) */
export function heard(m: { ok?: boolean; why?: string; preview?: { token: string; changes: { knob?: string; scope?: string; from: string; to: string }[] }; kept?: boolean; again?: boolean; back?: boolean; token?: string }): void {
  const f = FMs(), t = f.trying;
  if (m.ok === false) {
    if (t && (t.keeping || !t.token)) { t.why = m.why ?? "That didn’t take."; t.keeping = false; render(); }
    return;
  }
  if (m.preview && t && !t.token) {
    const c = m.preview.changes?.[0];
    if (!c || (c.knob === t.knob && c.scope === t.scope && c.to === t.take)) { t.token = m.preview.token; t.from = c?.from ?? null; render(); }
    else send({ type: "next.fit.try", token: m.preview.token, back: true });   // an answer to a try already left
    return;
  }
  if (m.kept && t && m.token === t.token) {
    f.kept = { knob: t.knob, take: t.take, scope: t.scope, token: t.token, where: reachName(f, t.scope) };
    f.trying = null; f.bar = false;
    send({ type: "next.fits" });
    hooks.flash?.(`Kept: ${takeName(W(), t.knob, t.take)}, for ${reachName(f, t.scope)}`);
    render();
    return;
  }
  if (m.back && m.token && f.kept?.token === m.token) {
    f.kept = null;
    send({ type: "next.fits" });
    render();
  }
}

const moves: Moves = {
  /** the card opened: start from the folder open now (or All of Sol), nothing tried */
  fmOpen(): Done { const f = FMs(); drop(f); Object.assign(f, fresh(), { kept: f.kept, open: true }); render(); return done(true, f.target.name); },
  /** the card closed: a take only tried is left as it was */
  fmClose(): Done { const f = FMs(), was = !!f.trying; drop(f); f.pointing = false; f.hov = null; f.open = false; render(); return done(was); },
  /** point at it: on, off, or at one thing (an element or a selector) */
  fmPoint(target?: string | Element | null | boolean): Done {
    const f = FMs();
    if (target == null || typeof target === "boolean") {
      f.pointing = typeof target === "boolean" ? target : !f.pointing; f.hov = null;
      if (f.pointing) drop(f);
      render(); return done(true, f.pointing ? "pointing" : "stopped");
    }
    const el = typeof target === "string" ? document.querySelector(target) : target;
    const t = targetOf(el, W(), D.regions, D.pieces, titleOf);
    if (!t) { f.pointing = false; f.hov = null; render(); return done(false); }
    return aim(t, "point");
  },
  /** while pointing: what is under the pointer, drawn with a ring (null: nothing fit mode can change) */
  fmHover(el: Element | null): Done {
    const f = FMs(), t = targetOf(el, W(), D.regions, D.pieces, titleOf), sel = t?.sel ?? null;
    if (sel !== f.hov) { f.hov = sel; render(); }
    return done(!!t, t?.name);
  },
  /** all of Sol, not one thing */
  fmAll(): Done { return aim(allTarget(), "pick"); },
  /** where a take is kept: one of the target's places, nearest first */
  fmReach(scope: string): Done {
    const f = FMs(); if (!f.target.reach.some((r) => r.scope === scope)) return done(false);
    const was = f.scope, t = f.trying; drop(f); f.scope = scope;
    if (t) return tryIt(t.knob, t.take, t.by);
    render(); return done(true, scope, () => { FMs().scope = was; render(); });
  },
  /** which setting the takes are shown for */
  fmKnob(knob: string): Done {
    const f = FMs(); if (!fitKnob(K[knob])) return done(false);
    const was = f.knob; if (f.trying && f.trying.knob !== knob) drop(f);
    f.knob = knob; f.miss = null; render();
    return done(true, knob, () => { FMs().knob = was; render(); });
  },
  /** pick a take: tried on the thing at once, nothing kept */
  fmTry(knob: string, take: string): Done { return tryIt(knob, take, FMs().via); },
  /** say what you want ("night here", "bigger text"): turned into one take and tried */
  fmSay(words: string): Done {
    const q = String(words ?? "").trim(); if (!q) return done(false);
    const f = FMs(), p = parseAsk(W(), U(), q);
    if (!p || !fitKnob(K[p.k])) { f.miss = `I couldn’t turn that into a choice for ${f.target.name}. Try “night”, “bigger text” or “quieter”.`; render(); return done(false); }
    return tryIt(p.k, p.t, "say");
  },
  /** keep what is tried, for the place chosen */
  fmKeep(): Done {
    const f = FMs(), t = f.trying;
    if (!t || !t.token || t.keeping) return done(false);
    if (live()) { t.keeping = true; t.why = undefined; send({ type: "next.fit.try", token: t.token, keep: true }); render(); return done(true, t.knob); }
    keepHere(t);
    f.kept = { knob: t.knob, take: t.take, scope: t.scope, token: t.token, where: reachName(f, t.scope) };
    f.trying = null; f.bar = false;
    hooks.flash?.(`Kept: ${takeName(W(), t.knob, t.take)}, for ${f.kept.where}`);
    render();
    return done(true, t.knob, () => { moves.fmUndo(); });
  },
  /** Back: leave it as it was */
  fmBack(): Done { const f = FMs(), was = !!f.trying; drop(f); f.miss = null; render(); return done(was); },
  /** take back the take just kept: the engine holds the setting there, so Sol leaves it alone */
  fmUndo(): Done {
    const f = FMs(), k = f.kept; if (!k) return done(false);
    if (live()) { send({ type: "next.fit.try", token: k.token, back: true }); return done(true, k.knob); }
    backHere(k); f.kept = null; render();
    return done(true, k.knob);
  },

  // ---------------------------------------------------------------- Customize (mine/look/br1/customize.html)
  /** Customize on: everything changeable is outlined, one line says what to do, nothing is aimed at yet */
  cuOn(): Done {
    const f = FMs(); if (f.cu) return done(true, "on");
    drop(f); Object.assign(f, fresh(), { kept: f.kept, open: true, cu: true });
    render(); return done(true, "on", () => { moves.cuOff(); });
  },
  /** Customize off: a take only tried is left as it was */
  cuOff(): Done { const f = FMs(), was = f.cu; drop(f); Object.assign(f, { cu: false, bar: false, at: null, open: false, miss: null }); render(); return done(was, "off"); },
  /** the brush: on or off */
  cuToggle(): Done { return FMs().cu ? moves.cuOff() : moves.cuOn(); },
  /** a press in Customize: a folder, a piece or a session opens the bar of its own choices beside it; anything else
   *  (the empty canvas, the sidebar) the bar of the whole window, beside where the press landed */
  cuPress(target?: string | Element | null, at?: { x: number; y: number } | null): Done {
    const f = FMs(); if (!f.cu) return done(false);
    const el = typeof target === "string" ? document.querySelector(target) : target ?? null;
    const t = customizable(el ? targetOf(el, W(), D.regions, D.pieces, titleOf) : null);
    const r = aim(t, "point");
    f.bar = true; f.at = at ?? null; render();
    return r;
  },
  /** the bar closed (Esc, a press outside it on nothing): a take only tried is left as it was; Customize stays on */
  cuShut(): Done { const f = FMs(), was = f.bar; drop(f); f.bar = false; f.at = null; f.miss = null; render(); return done(was); },
  /** one of Sol's tries for the thing (✦): tried at once like any choice, Back undoes it */
  cuTry(i: number): Done {
    const f = FMs(), x = tries(f)[i]; if (!f.cu || !x) return done(false);
    return tryIt(x.knob, x.take, "try");
  },
  /** say it ("make money green", "bigger text"): finds the thing the words name (else the thing whose bar is open, else
   *  the whole window), opens its bar and tries the change at once; Customize turns on if it was off */
  cuSay(words: string): Done {
    const q = String(words ?? "").trim(); if (!q) return done(false);
    const f = FMs(), named = namedIn(q, D.regions);
    const t = named === "all" ? allTarget() : named ? folderTarget(named, D.regions) : f.cu && f.bar ? f.target : allTarget();
    const colour = t.kind === "folder" ? colourIn(q) : null, p = colour ? null : parseAsk(W(), U(), q);
    const choice = colour ? { knob: "colour", take: colour } : p && canFit(p.k) && choicesOf(t).some((r) => r.knob === p.k) ? { knob: p.k, take: p.t } : null;
    if (!choice) { if (f.cu) { f.miss = `I couldn’t turn that into a change for ${t.name}. Try “green”, “bigger” or “night”.`; render(); } return done(false); }
    if (!f.cu) moves.cuOn();
    if (f.target.kind !== t.kind || f.target.id !== t.id || !f.bar) { aim(t, "pick"); f.bar = true; f.at = null; }
    return tryIt(choice.knob, choice.take, "say");
  },
};
export default moves;

/** Sol's tries for the thing whose bar is open (Customize.tsx and a test read the same list) */
export const tries = (f: FM) => triesOf(W(), f.target, (knob) => nowAt(f, knob, f.target.reach[0].scope));

// the AI's side (count 13): each move meets a function; looking and trying are the AI's to offer, keeping a fit is the person's
Object.assign(MOVE_FN, { fmOpen: "look", fmClose: "look", fmPoint: "point", fmHover: "point", fmAll: "look", fmReach: "offer", fmKnob: "look", fmTry: "offer", fmSay: "offer",
  fmKeep: "offer", fmBack: "offer", fmUndo: "take_back",
  cuOn: "look", cuOff: "look", cuToggle: "look", cuPress: "point", cuShut: "look", cuTry: "offer", cuSay: "offer" });
for (const m of ["fmKeep", "fmUndo"]) PERSON_ONLY[m] = "setting";

/** the takes the card offers for the knob shown (a test and the card read the same list) */
export const offered = (f: FM) => takesOf(f.knob).map((t) => ({ id: t.id, n: t.n, now: t.id === nowAt(f, f.knob, f.scope), on: f.trying?.knob === f.knob && f.trying.take === t.id }));
export { knobName };
