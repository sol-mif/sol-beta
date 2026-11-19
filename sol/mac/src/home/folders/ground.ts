// A folder's ground (#957, #1227): what the folder stands on, kept in the folder as ground.json. Since #1227 it is
// written two ways only: the one onboarding lands it from the person's record (onboard/record.ts groundOf), and Home
// answers it in place after (onboard/OneHome.tsx): a touch on one thing ("keep", "not here") or on a ringed piece's
// answer. The six-step setup, its walk and Quick (Setup.tsx, Walk.tsx, Start.tsx) went with #1223; their briefs and
// close went here with #1227.
// Facts each carry their kind: "read" (where it was read), "said" (the person's own words), "confirmed" (kept by them,
// in Home), "open" (left open on purpose) or "question" (not given: never filled in). Every answer carries its own
// source (`ans`: what was said, by whom, when) beside where the thing was read (`src`), so the file shows both.
// A thing struck ("not here") leaves the facts and pieces (the engine reads facts as the folder's knowledge) and is kept
// in `struck` with what it was, so the answer stays on disk and undo can put it back.
// How much the folder's agent may do is not here: it is one level per folder in the record's consent (#1216,
// onboard/consent.ts), read by the engine at each turn. `may` keeps only what the person said about it, in their words.

export type St = "read" | "said" | "confirmed" | "open" | "question";
/** an answer given in Home: kept or struck, by whom (where it was given), when */
export type Ans = { said: "keep" | "no"; by: string; at: string };
export type Fact = { id: string; step: number; k: string; v: string; st: St; src?: string; ask?: string; choices?: string[]; left?: boolean; later?: boolean; at?: string; ans?: Ans };
/** a place the folder reads (a connector, a tool's session list), named once */
export type Conn = { id: string; nm: string; site?: string | null; why?: string; skip?: boolean };
export type Piece = { id: string; t: string; s: string; st: "said" | "proposed"; src?: string; needs?: string; when?: string; whenAsk?: string; keep?: boolean | null; left?: boolean; ans?: Ans };
/** what the person said about what this folder's agents may do, in their words; the level itself is the consent's */
export type May = { said?: string; src?: string };
/** a thing the person said "not here" to: what it was (the fact and its piece), and the answer */
export type Struck = { id: string; v: string; src?: string; ans: Ans; fact?: Fact; piece?: Piece };
export type Ground = {
  v: 1; folder: string; name: string;
  facts: Fact[]; connectors: Conn[]; pieces: Piece[]; may: May; struck?: Struck[];
  ledger: { at: string; by: string; what: string }[];
};
type Ask = <T>(o: object, ms: number) => Promise<T | null>;

export const FILE = "ground.json";
/** who answers in Home, as the file names it */
export const IN_HOME = "you, in Home";

export const empty = (rel: string, name: string): Ground => ({ v: 1, folder: rel, name, facts: [], connectors: [], pieces: [], may: {}, struck: [], ledger: [] });
/** a file that is there but written by hand, by an agent or by the old setup: what can be kept is kept */
function sane(g: Partial<Ground>, rel: string, name: string): Ground {
  const e = empty(rel, name);
  return { ...e, ...g, facts: g.facts ?? [], connectors: g.connectors ?? [], pieces: g.pieces ?? [], may: g.may ?? {}, struck: g.struck ?? [], ledger: g.ledger ?? [] };
}

/** ground.json as it is now: null when the folder has none yet, undefined when the engine did not answer or it is torn */
export async function readGround(ask: Ask, cwd: string, rel: string, name: string): Promise<{ g: Ground; hash?: string } | null | undefined> {
  const r = await ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd, path: FILE }, 8000);
  if (!r) return undefined;
  if (r.error) return /ENOENT|no such file/i.test(r.error) ? null : undefined;
  try { return { g: sane(JSON.parse(r.text ?? ""), rel, name), hash: r.hash }; } catch { return undefined; }
}

/** a change to the file as it is now (read, the change, written with the hash read; again if it moved under it) */
export async function changeGround(ask: Ask, cwd: string, rel: string, name: string, op: (g: Ground) => Ground | void, by = "you", what = ""): Promise<Ground | null> {
  for (let i = 0; i < 3; i++) {
    const f = await readGround(ask, cwd, rel, name);
    if (f === undefined) return null;
    const base = f?.g ?? empty(rel, name);
    const c = structuredClone(base);
    const next = op(c) ?? c;
    if (what) next.ledger = [...next.ledger, { at: new Date().toISOString(), by, what }];
    const w = await ask<{ ok?: boolean; changed?: boolean }>({ type: "work.write", cwd, path: FILE, text: JSON.stringify(next, null, 2) + "\n", ...(f?.hash ? { hash: f.hash } : {}) }, 8000);
    if (w?.ok) return next;
    if (!w?.changed) return null;
  }
  return null;
}

// ---- one thing, answered in place (#1227) ----
/** a thing the reader found, as the record holds it (onboard/record.ts Fact): enough to land it as a fact and a piece */
export type Thing = { id: string; k: string; v: string; src?: string; via?: string; when?: string };
/** a found thing as a piece of the folder: what it is, where it was read and through what (its proof) */
export const pieceFrom = (t: Thing, keep: boolean | null): Piece => ({ id: `p-${t.id}`, t: t.v, s: `read in ${t.src ?? "this computer"}${t.via && t.via !== t.src ? `, through ${t.via}` : ""}`,
  st: "proposed", ...(t.src ? { src: t.src } : {}), ...(t.when ? { when: t.when } : {}), keep });
const factFrom = (t: Thing, at: string): Fact => ({ id: t.id, step: 0, k: t.k, v: t.when ? `${t.v}, ${t.when}` : t.v, st: "read", ...(t.src ? { src: t.src } : {}), at });

/** what one thing is in a ground now: its fact, its piece, its strike (pure) */
export const thingIn = (g: Ground, id: string) => ({ fact: g.facts.find((f) => f.id === id), piece: g.pieces.find((p) => p.id === `p-${id}`), struck: (g.struck ?? []).find((s) => s.id === id) });

/** a touch on one thing (pure): "keep" confirms its fact and keeps its piece (both made when the ground has neither);
 *  "no" takes both out and keeps the strike with what they were. Each carries the answer (`ans`); the ledger says it. */
export function answerIn(g: Ground, t: Thing, said: "keep" | "no", at: string, by = IN_HOME): Ground {
  const ans: Ans = { said, by, at };
  const was = thingIn(g, t.id);
  const facts = g.facts.filter((f) => f.id !== t.id), pieces = g.pieces.filter((p) => p.id !== `p-${t.id}`), struck = (g.struck ?? []).filter((s) => s.id !== t.id);
  const ledger = [...g.ledger, { at, by, what: said === "keep" ? `kept "${t.v}" (read in ${t.src ?? "this computer"})` : `not here: "${t.v}"` }];
  if (said === "no") {
    const fact = was.fact ?? was.struck?.fact, piece = was.piece ?? was.struck?.piece;
    return { ...g, facts, pieces, struck: [...struck, { id: t.id, v: t.v, ...(t.src ? { src: t.src } : {}), ans, ...(fact ? { fact } : {}), ...(piece ? { piece } : {}) }], ledger };
  }
  const fact0 = was.fact ?? was.struck?.fact ?? factFrom(t, at), piece0 = was.piece ?? was.struck?.piece ?? pieceFrom(t, null);
  // in place: a fact or piece already there keeps its position, so the board does not jump under the person's finger
  const fact: Fact = { ...fact0, st: "confirmed", ans }, piece: Piece = { ...piece0, keep: true, ans };
  const put = <X extends { id: string }>(xs: X[], all: X[], x: X) => { const i = all.findIndex((y) => y.id === x.id); if (i < 0) return [...xs, x]; const out = [...xs]; out.splice(Math.min(i, out.length), 0, x); return out; };
  return { ...g, facts: put(facts, g.facts, fact), pieces: put(pieces, g.pieces, piece), struck, ledger };
}

/** undo (pure): the thing put back exactly as it was before the touch (`before`, from thingIn); the ledger says so */
export function restoreIn(g: Ground, id: string, before: ReturnType<typeof thingIn>, v: string, at: string, by = IN_HOME): Ground {
  const now = thingIn(g, id);
  const put = <X extends { id: string }>(xs: X[], x: X | undefined, at0: number) => { if (!x) return xs; const out = [...xs]; out.splice(at0 < 0 ? out.length : Math.min(at0, out.length), 0, x); return out; };
  const fi = g.facts.findIndex((f) => f.id === id), pi = g.pieces.findIndex((p) => p.id === `p-${id}`);
  const facts = put(g.facts.filter((f) => f !== now.fact), before.fact, fi), pieces = put(g.pieces.filter((p) => p !== now.piece), before.piece, pi);
  const struck = [...(g.struck ?? []).filter((s) => s.id !== id), ...(before.struck ? [before.struck] : [])];
  return { ...g, facts, pieces, struck, ledger: [...g.ledger, { at, by, what: `undid the answer on "${v}"` }] };
}
