// Home 4 (#828; face #796; design §7.7, §7.10): the sources and the policy paragraph, behind home.whole. One message
// answers every ask, `home.sources { sources, policy, folders, learned, done }` (contract/home/policy.ts), computed from
// the log and the stores on every ask, never stored (R8).
//   a source     a door (SourceDoor) registered for a Home: its id, health, scope, and what it reads. Its rung IS the
//                `to` of its last rung.ceiling on the log, else read. Tonight the only real one is files
//                (source-files.ts); tests register fakes named as the face's five. A door whose kind is on the
//                refuse-before-load list (bank, broker, payment, health, Apple and Google account pages, password
//                managers) is never registered: one rung.refused { why: "never" }
//   the policy   the person's paragraph (policy.ts), read by the rung reader (rung-reader.ts) into sentences
//   folders      the folders a Home knows (registerFolder) and those a sentence names with a rung (asked = that rung,
//                its source the known one, else files); a folder's rung is never above its source's (folderRung)
//   learned      from policy.learned: one line an id seen and not kept or dropped, `seen` its count
// The lock (design §7.10): a reading wider than now is never applied by a write. home.policy.write applies a narrower or
// equal rung at once (one rung.ceiling a source that changed) and makes a wider one a proposal: one Today Thing, one
// rung up from where the source is, that the person presses ("Allow" raises it one rung and writes one rung.ceiling;
// then the next rung is proposed if the paragraph still asks more). home.source.set is the person's own press on the
// ladder and sets what was pressed. A proposal no longer asked for (the paragraph changed, the source moved) is gone.
// Every act writes its action event first (its id is the receipt's ledgerId), then the changes with `cause` that id:
//   home.source.set     source.set → policy.write (its sentence rewritten in place) → rung.ceiling
//   home.policy.write   policy.write → rung.ceiling × each source narrowed → proposals
//   home.learned.keep   policy.learned { what: "keep" } → policy.write (the line's sentence at the end) → as a write
//   home.learned.drop   policy.learned { what: "drop" }
//   home.source.repair  source.health { state }
// Undo (home.sources.undo, and home.undo routed here by kind) is new reverse events with `cause` the act and
// `undo: true`: the source.set or policy.learned reversed, the paragraph back to the text before, each rung.ceiling back.
// It is refused, nothing written, when the paragraph or a rung changed since the act. A repair has no undo. An undo
// also brings down any rung left above the paragraph it puts back (one an "Allow" raised since).
// At start (mend): an act a stop cut short is finished, so a rung is never left above what the logged paragraph says.
// Answers: on a change, home.sources (done null) to every window, then the asker's own with the receipt (the face keeps
// the last home.sources it gets, so the receipt must come last), and home.today to every window when a proposal moved.
// Exports for Home 6: setRung (the ladder's press, "let it"), rungOf, sourcesMsg, pushSources, undoSources.
import { hashOf } from "../canonical.js";
import type { Face } from "../browser.js";
import {
  LearnedDropAsk, LearnedKeepAsk, PolicyWriteAsk, RepairAsk, RUNGS, SOURCE_IDS, SourceSetAsk, SourcesUndoAsk,
  type Folder, type Health, type LearnedLine, type Rung, type Scope, type Source, type SourceId, type SourcesDone, type SourcesMsg,
} from "../contract/home/policy.js";
import type { By } from "../file-trail.js";
import { onAnswer, type AnswerHook } from "./hooks.js";
import { changeThing, newThing, type Thing } from "./items.js";
import { ENGINE, YOU, type HomeEv } from "./log.js";
import { policyText, policyVer, policyVersion, putPolicy, reconcilePolicy } from "./policy.js";
import { above, askedOf, folderRung, parse, rewrite, ruleReader, rungAt, type Reader } from "./rung-reader.js";
import { filesSource } from "./source-files.js";
import { isUndone } from "./undo.js";
import type { Ctx, Handler, Reverser, Unit } from "./unit.js";

/** a source's door (design §7.7): health, read, and the three that go through the ceiling (Home 5), none tonight */
export interface SourceDoor {
  id: SourceId; name: string; kind: string;
  health(now: number): Health;
  scope(): Scope;
  read(q?: unknown): unknown;
  propose?(x: unknown): unknown;
  draft?(x: unknown): unknown;
  do?(x: unknown): unknown;
  /** sign in again: the health after it */
  repair?(now: number): Health;
}
/** a folder a Home knows, with its source and the rung it asks */
export type KnownFolder = { name: string; source: SourceId; asked: Rung };

// ── the names that are the engine's pick, not Marco's: in one place, so one edit renames them ──────────────────────
/** a proposal's Thing: one a source and rung, so asking twice never makes two */
const proposalId = (id: SourceId, to: Rung): string => `rung-${id}-${to}`;
const PROPOSAL = /^rung-(calendar|mail|files|github|canvas)-(propose|draft|act)$/;
const PROPOSAL_FOLDER = "sources";
const PROPOSAL_ANSWERS: [string, string] = ["Allow", "Not now"];   // the warm one raises it
const proposalWords = (name: string, to: Rung): string => `${name}: one rung up, to ${to}?`;
const proposalWhy = (name: string): string => `Your policy reads ${name} wider than it is now. A wider reading waits for your press, one rung at a time.`;
const asksLine = (name: string): string => `${name} asks to go up: press to allow`;
/** the refuse-before-load list (design §7.7), matched on a door's kind and name: inside a word too ("OnlineBanking",
 *  "1Password", "HealthKit"), since a wrong refusal costs a door and a wrong load costs a person's money or health */
export const NEVER = /bank|broker|payment|paypal|venmo|wallet|health|password|keychain|\b(apple|google)\s*(accounts?|id)\b/i;

const READER: Reader = ruleReader;

// ── the doors and folders of a Home ──────────────────────────────────────────────────────────────────────────────
const DOORS = new WeakMap<Ctx, Map<SourceId, SourceDoor>>();
const FOLDERS = new WeakMap<Ctx, KnownFolder[]>();
const doorsOf = (ctx: Ctx): Map<SourceId, SourceDoor> => { let m = DOORS.get(ctx); if (!m) { m = new Map(); DOORS.set(ctx, m); } return m; };
/** the doors, in the face's order of sources */
const doorList = (ctx: Ctx): SourceDoor[] => SOURCE_IDS.flatMap((id) => doorsOf(ctx).get(id) ?? []);
const isSourceId = (x: unknown): x is SourceId => (SOURCE_IDS as readonly unknown[]).includes(x);
const isRung = (x: unknown): x is Rung => (RUNGS as readonly unknown[]).includes(x);

/** a door registered (a second of the same id puts its own in place). A kind on the refuse-before-load list is not
 *  registered and writes one rung.refused { why: "never" }; an id that is not one of the face's five is not either */
export function registerSource(ctx: Ctx, door: SourceDoor): boolean {
  if (NEVER.test(door.kind) || NEVER.test(door.name)) {
    ctx.log.write({ kind: "rung.refused", item: String(door.id).slice(0, 64), value: { act: hashOf({ op: "load", id: String(door.id), kind: door.kind }), why: "never" } });
    return false;
  }
  if (!isSourceId(door.id)) return false;
  doorsOf(ctx).set(door.id, door);
  return true;
}
/** a folder a Home knows (Places, later; tests). A second of the same name puts its own in place */
export function registerFolder(ctx: Ctx, f: KnownFolder): void {
  FOLDERS.set(ctx, [...(FOLDERS.get(ctx) ?? []).filter((x) => x.name !== f.name), f]);
}

// ── reading the log ──────────────────────────────────────────────────────────────────────────────────────────────
const isUndo = (e: HomeEv): boolean => (e.value as { undo?: unknown } | undefined)?.undo === true;
const val = (e: HomeEv): Record<string, unknown> => (e.value && typeof e.value === "object" ? (e.value as Record<string, unknown>) : {});
/** a source's rung: the `to` of its last rung.ceiling, else read */
export function rungOf(ctx: Ctx, id: SourceId): Rung {
  const evs = ctx.log.all();
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.kind === "rung.ceiling" && e.item === id && isRung(val(e).to)) return val(e).to as Rung;
  }
  return "read";
}
const startOfDay = (ms: number): number => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
/** a learned line's words: a string, or { text, sentence? } (its sentence form is Marco's to write: the text until then) */
function wordsOf(w: unknown): { text: string; sentence: string } | null {
  if (typeof w === "string" && w.trim()) return { text: w, sentence: w };
  if (w && typeof w === "object" && typeof (w as { text?: unknown }).text === "string") {
    const o = w as { text: string; sentence?: unknown };
    return { text: o.text, sentence: typeof o.sentence === "string" && o.sentence.trim() ? o.sentence : o.text };
  }
  return null;
}
/** what Sol learned: one line an id seen and not kept or dropped (an undone keep or drop does not count) */
export function learnedOf(ctx: Ctx): LearnedLine[] {
  const evs = ctx.log.all();
  const undone = new Set(evs.filter((e) => e.cause && isUndo(e)).map((e) => e.cause!));
  const lines = new Map<string, { text: string; sentence: string; seen: number; closed: boolean }>();
  for (const e of evs) {
    if (e.kind !== "policy.learned" || !e.item || isUndo(e) || undone.has(e.id)) continue;
    const what = val(e).what;
    if (what === "seen") {
      const l = lines.get(e.item) ?? { text: "", sentence: "", seen: 0, closed: false };
      const w = wordsOf(ctx.log.words(e));
      if (w) { l.text = w.text; l.sentence = w.sentence; }
      l.seen++;
      lines.set(e.item, l);
    } else if (what === "keep" || what === "drop") { const l = lines.get(e.item); if (l) l.closed = true; }
  }
  return [...lines].filter(([, l]) => !l.closed && l.text).map(([id, l]) => ({ id, text: l.text, seen: l.seen, sentence: l.sentence }));
}

/** the whole of Sources now (R8: the same log and stores give the same message) */
export function sourcesMsg(ctx: Ctx, done: SourcesDone | null): SourcesMsg {
  const now = ctx.now(), evs = ctx.log.all(), day0 = startOfDay(now), doors = doorList(ctx);
  const text = policyText(ctx.home), sentences = READER(text, doors.map((d) => d.id));
  const rungs = new Map<SourceId, Rung>(SOURCE_IDS.map((id) => [id, rungOf(ctx, id)]));
  const sources: Source[] = doors.map((d) => {
    const h = d.health(now);
    const s = d.scope();
    const would = evs.filter((e) => e.kind === "rung.would" && val(e).source === d.id && e.at >= day0 && e.at <= now).length;
    return { id: d.id, name: d.name, kind: d.kind, health: { state: h.state, lastRead: h.lastRead, ...(h.why !== undefined ? { why: h.why } : {}) },
      scope: { reads: [...s.reads], never: [...s.never] }, rung: rungs.get(d.id)!, would };
  });
  // the folders: the known ones, then those a sentence names with a rung (the first such sentence sets what it asks)
  const folders = new Map<string, { source: SourceId; asked: Rung; said: boolean }>();
  for (const f of FOLDERS.get(ctx) ?? []) folders.set(f.name, { source: f.source, asked: f.asked, said: false });
  for (const s of sentences) {
    if (!s.folder || !s.rung) continue;
    const k = folders.get(s.folder);
    if (k?.said) continue;
    folders.set(s.folder, { source: k?.source ?? "files", asked: s.rung, said: true });
  }
  const fs: Folder[] = [...folders].map(([name, f]) => ({ name, source: f.source, rung: folderRung(f.asked, rungs.get(f.source) ?? "read"), asked: f.asked }));
  return { type: "home.sources", sources, policy: { text, sentences }, folders: fs, learned: learnedOf(ctx), done };
}

// ── writing ──────────────────────────────────────────────────────────────────────────────────────────────────────
type More = { cause?: string; by?: By; undo?: boolean };
/** one rung.ceiling: every effective change of a source's ceiling, whoever made it (must-write rule 2) */
function ceiling(ctx: Ctx, id: SourceId, from: Rung, to: Rung, more: More): HomeEv {
  return ctx.log.write({ kind: "rung.ceiling", item: id, value: { from, to, policy: policyVer(policyText(ctx.home)), ...(more.undo ? { undo: true } : {}) },
    by: more.by ?? ENGINE, ...(more.cause ? { cause: more.cause } : {}) });
}

/** the Homes whose Today changed (a proposal made, pressed or gone) since Today was last pushed */
const touched = new WeakSet<Ctx>();
const isOpen = (t: Thing): boolean => !t.gone && t.state !== "done" && t.waitsOn === "you";
/** the proposals put right: an open one no longer asked for is gone; with `open`, a source the paragraph asks higher
 *  than it is gets one, one rung up (an old Thing of that id is opened again). The sources it opened one for */
function settle(ctx: Ctx, o: { cause: string; open: boolean }): SourceId[] {
  const doors = doorsOf(ctx), sentences = READER(policyText(ctx.home), [...doors.keys()]);
  const wants = (id: SourceId): Rung | null => { const want = askedOf(sentences, id), cur = rungOf(ctx, id); return doors.has(id) && want && rungAt(want) > rungAt(cur) ? above(cur) : null; };
  for (const t of ctx.items.all()) {
    const m = PROPOSAL.exec(t.id);
    if (!m || !isOpen(t) || wants(m[1] as SourceId) === m[2]) continue;
    if (changeThing(ctx, t.id, { gone: true }, { cause: o.cause, by: ENGINE })) touched.add(ctx);
  }
  if (!o.open) return [];
  const opened: SourceId[] = [];
  for (const d of doorList(ctx)) {
    const to = wants(d.id);
    if (!to) continue;
    const id = proposalId(d.id, to), was = ctx.items.get(id);
    if (was && isOpen(was)) continue;
    const words = proposalWords(d.name, to);
    const t: Thing = {
      id, read: "you", folder: PROPOSAL_FOLDER, words, state: "proposed", waitsOn: "you", at: ctx.now(), links: [`rung:${o.cause}`], made: [],
      card: { source: d.id, title: words, why: proposalWhy(d.name), chips: [], answers: [...PROPOSAL_ANSWERS], touches: [], edge: words },
    };
    const e = was ? changeThing(ctx, id, { ...t, gone: undefined }, { cause: o.cause, by: ENGINE }) : newThing(ctx, t, { cause: o.cause, by: ENGINE });
    if (e) { touched.add(ctx); opened.push(d.id); }
  }
  return opened;
}

/** the rungs held under the paragraph: a source above what the paragraph asks comes down to it, one rung.ceiling each.
 *  Every rung on the log is held, a door registered or not, so a start finds nothing a write would not have done */
function holdDown(ctx: Ctx, more: More & { cause: string }): HomeEv[] {
  const sentences = READER(policyText(ctx.home), SOURCE_IDS);
  return SOURCE_IDS.flatMap((id) => {
    const want = askedOf(sentences, id), cur = rungOf(ctx, id);
    return want && rungAt(want) < rungAt(cur) ? [ceiling(ctx, id, cur, want, more)] : [];
  });
}

/** the paragraph made this text, and what it asks applied: a narrower rung at once, a wider one proposed. The
 *  policy.write is the act when no cause is given. null when the text is the one there */
function applyPolicy(ctx: Ctx, text: string, more: { cause?: string; by: By }): { pw: HomeEv; opened: SourceId[] } | null {
  const p = parse(text);
  const pw = putPolicy(ctx, p.text, more);
  if (!pw) return null;
  const cause = more.cause ?? pw.id;
  holdDown(ctx, { cause, by: more.by });
  return { pw, opened: settle(ctx, { cause, open: true }) };
}

/** a source set to a rung, as the person's press on the ladder (and Home 6's "let it", with `cause` the would-have):
 *  source.set (the act, returned), its sentence rewritten in place (policy.write), one rung.ceiling. null, nothing
 *  written, for a source that is not registered or already at that rung */
export function setRung(ctx: Ctx, id: SourceId, to: Rung, cause?: string, by: By = YOU): HomeEv | null {
  if (!doorsOf(ctx).has(id)) return null;
  const from = rungOf(ctx, id);
  if (from === to) return null;
  const act = ctx.log.write({ kind: "source.set", item: id, value: { from, to }, by, ...(cause ? { cause } : {}) });
  putPolicy(ctx, rewrite(parse(policyText(ctx.home)), id, to).text, { cause: act.id, by });
  ceiling(ctx, id, from, to, { cause: act.id, by });
  settle(ctx, { cause: act.id, open: false });
  return act;
}

/** an act of Sources' own (a ledgerId it gave): a source.set, a policy.learned, or a policy.write that follows from
 *  nothing (home.policy.write's own) */
const isAct = (e: HomeEv): boolean => !isUndo(e) && (e.kind === "source.set" || e.kind === "policy.learned" || (e.kind === "policy.write" && !e.cause));
/** an act undone: its reverse events, or null (nothing written) when it is not one, is undone already, or the paragraph
 *  or a rung it changed has changed since */
export function undoSources(ctx: Ctx, act: HomeEv, by: By = YOU): HomeEv[] | null {
  if (!isAct(act) || isUndone(ctx, act.id)) return null;
  const chain = ctx.log.all().filter((e) => e.cause === act.id && !isUndo(e));
  const pw = act.kind === "policy.write" ? act : chain.find((e) => e.kind === "policy.write");
  const ceilings = chain.filter((e) => e.kind === "rung.ceiling" && isSourceId(e.item) && isRung(val(e).from) && isRung(val(e).to));
  const before = pw ? policyVersion(ctx.home, String(val(pw).from ?? "")) : null;
  if (pw && (before === null || policyVer(policyText(ctx.home)) !== val(pw).ver)) return null;
  if (ceilings.some((c) => rungOf(ctx, c.item as SourceId) !== val(c).to)) return null;
  if (act.kind === "source.set" && (!isSourceId(act.item) || rungOf(ctx, act.item) !== val(act).to)) return null;
  const more = { cause: act.id, by, undo: true };
  const out: HomeEv[] = [];
  if (act.kind === "source.set") out.push(ctx.log.write({ kind: "source.set", item: act.item, value: { from: val(act).to, to: val(act).from, undo: true }, by, cause: act.id }));
  if (act.kind === "policy.learned") out.push(ctx.log.write({ kind: "policy.learned", item: act.item, value: { what: val(act).what, undo: true }, by, cause: act.id }));
  if (pw && before !== null) { const e = putPolicy(ctx, before, more); if (e) out.push(e); }
  for (const c of [...ceilings].reverse()) out.push(ceiling(ctx, c.item as SourceId, val(c).to as Rung, val(c).from as Rung, more));
  // a rung raised since by a press ("Allow") is not the act's, but it is above the paragraph put back: it comes down too
  out.push(...holdDown(ctx, more));
  // the proposals the act opened, gone; then any other no longer asked for
  for (const e of chain) {
    if ((e.kind !== "thing.new" && e.kind !== "thing.state") || !e.item || !PROPOSAL.test(e.item)) continue;
    const t = ctx.items.get(e.item);
    if (t && isOpen(t) && changeThing(ctx, t.id, { gone: true }, { cause: act.id, by: ENGINE })) touched.add(ctx);
  }
  settle(ctx, { cause: act.id, open: false });
  return out;
}

/** at start, after reconcilePolicy: an act a stop cut short is finished, so the rungs are what the log says. A press
 *  on the ladder (the newest source.set) whose rung.ceiling is not on the log, while nothing else moved since, gets its
 *  sentence (if that is missing too) and its rung.ceiling. Then any rung above what the logged paragraph asks comes
 *  down to it (a write, a keep or an undo stopped between its policy.write and its rung.ceilings), `cause` the act
 *  of the newest policy.write, so the act still undoes whole. Nothing is written when nothing was cut short */
function mend(ctx: Ctx): void {
  const evs = ctx.log.all();
  let s: HomeEv | undefined;
  for (let i = evs.length - 1; i >= 0 && !s; i--) if (evs[i].kind === "source.set" && !isUndo(evs[i])) s = evs[i];
  if (s && isSourceId(s.item) && isRung(val(s).from) && isRung(val(s).to) && !isUndone(ctx, s.id) && rungOf(ctx, s.item) === val(s).from) {
    const since = evs.slice(evs.indexOf(s) + 1), id = s.item, from = val(s).from as Rung, to = val(s).to as Rung;
    const moved = since.some((e) => (e.kind === "rung.ceiling" && (e.item === id || e.cause === s.id)) || (e.kind === "policy.write" && e.cause !== s.id));
    if (!moved) {
      if (!since.some((e) => e.kind === "policy.write")) putPolicy(ctx, rewrite(parse(policyText(ctx.home)), id, to).text, { cause: s.id, by: ENGINE });
      ceiling(ctx, id, from, to, { cause: s.id, by: ENGINE });
    }
  }
  const now = ctx.log.all();
  let pw: HomeEv | undefined;
  for (let i = now.length - 1; i >= 0 && !pw; i--) if (now[i].kind === "policy.write") pw = now[i];
  if (pw) holdDown(ctx, { cause: pw.cause ?? pw.id, by: ENGINE, ...(isUndo(pw) ? { undo: true } : {}) });
}

// ── answering ────────────────────────────────────────────────────────────────────────────────────────────────────
/** the plain state to one window: a no-op, a refused ask, an ask that does not parse (R4, R5) */
const plain = (ctx: Ctx, face: Face): void => face.send(sourcesMsg(ctx, null));
/** after a change: home.sources to every window, and Today to every window when a proposal moved */
export function pushSources(ctx: Ctx): void {
  ctx.all(sourcesMsg(ctx, null));
  if (touched.has(ctx)) { touched.delete(ctx); ctx.pushToday(); }
}
/** a change answered: every window's state, then the asker's own with its receipt */
function answered(ctx: Ctx, face: Face, done: SourcesDone): void {
  pushSources(ctx);
  face.send(sourcesMsg(ctx, done));
}

const ask: Handler = (ctx, face) => plain(ctx, face);

const set: Handler = (ctx, face, msg) => {
  const m = SourceSetAsk.safeParse(msg);
  const d = m.success ? doorsOf(ctx).get(m.data.id) : undefined;
  if (!m.success || !d) return plain(ctx, face);
  const act = setRung(ctx, d.id, m.data.rung);
  if (!act) return plain(ctx, face);
  const held = sourcesMsg(ctx, null).folders.filter((f) => f.source === d.id && f.rung !== f.asked).map((f) => f.name);
  answered(ctx, face, { ledgerId: act.id, line: [`${d.name}: ${m.data.rung} now · its sentence rewritten`, ...(held.length ? [`${held.join(", ")} held at ${m.data.rung}`] : [])].join(" · ") });
};

const write: Handler = (ctx, face, msg) => {
  const m = PolicyWriteAsk.safeParse(msg);
  if (!m.success) return plain(ctx, face);
  const r = applyPolicy(ctx, m.data.text, { by: YOU });
  if (!r) return plain(ctx, face);
  const doors = doorsOf(ctx);
  answered(ctx, face, { ledgerId: r.pw.id, line: ["your policy, read again", ...r.opened.map((id) => asksLine(doors.get(id)!.name))].join(" · ") });
};

const repair: Handler = (ctx, face, msg) => {
  const m = RepairAsk.safeParse(msg);
  const d = m.success ? doorsOf(ctx).get(m.data.id) : undefined;
  if (!d || !d.repair || d.health(ctx.now()).state === "ok") return plain(ctx, face);
  const h = d.repair(ctx.now());
  if (h.state !== "ok") return plain(ctx, face);
  const act = ctx.log.write({ kind: "source.health", item: d.id, value: { state: h.state }, by: YOU });
  answered(ctx, face, { ledgerId: act.id, line: `${d.name}: signed in again, reading` });
};

const keep: Handler = (ctx, face, msg) => {
  const m = LearnedKeepAsk.safeParse(msg);
  const l = m.success ? learnedOf(ctx).find((x) => x.id === m.data.id) : undefined;
  if (!l) return plain(ctx, face);
  const act = ctx.log.write({ kind: "policy.learned", item: l.id, value: { what: "keep" }, by: YOU });
  const was = policyText(ctx.home);
  applyPolicy(ctx, was ? `${was} ${l.sentence}` : l.sentence, { cause: act.id, by: YOU });
  answered(ctx, face, { ledgerId: act.id, line: "now a sentence in your policy" });
};

const drop: Handler = (ctx, face, msg) => {
  const m = LearnedDropAsk.safeParse(msg);
  const l = m.success ? learnedOf(ctx).find((x) => x.id === m.data.id) : undefined;
  if (!l) return plain(ctx, face);
  const act = ctx.log.write({ kind: "policy.learned", item: l.id, value: { what: "drop" }, by: YOU });
  answered(ctx, face, { ledgerId: act.id, line: `forgotten: ${l.text}` });
};

/** the undo of one of Sources' acts (home.sources.undo, and home.undo routed here by its kind): the state to every
 *  window, done null; refused or not one of ours, the plain state to the asker */
const reverse: Reverser = (ctx, face, ev) => {
  if (!undoSources(ctx, ev)) return plain(ctx, face);
  pushSources(ctx);
};
const undo: Handler = async (ctx, face, msg) => {
  const m = SourcesUndoAsk.safeParse(msg);
  const ev = m.success ? ctx.log.all().find((e) => e.id === m.data.ledgerId) : undefined;
  if (!ev) return plain(ctx, face);
  await reverse(ctx, face, ev);
};

// ── the press on a proposal (home.answer on its Thing, through hooks.ts) ──────────────────────────────────────────
let other: AnswerHook | null = null;
/** Home 5: an answer on a "rung:" Thing that is not a Sources proposal goes to the hook given here. hooks.ts keeps one
 *  hook a prefix, so a unit that registered "rung:" itself would put this one out */
export function onOtherRung(f: AnswerHook | null): void { other = f; }
/** "Allow" raises the source one rung (one rung.ceiling, cause the answer) if it is still where the proposal found it;
 *  any answer makes the Thing done; the next rung is proposed after a raise if the paragraph asks more */
const press: AnswerHook = async (ctx, t, said, more) => {
  const m = PROPOSAL.exec(t.id);
  if (!m) return other ? other(ctx, t, said, more) : false;
  const id = m[1] as SourceId, to = m[2] as Rung, from = RUNGS[rungAt(to) - 1];
  const evs = ctx.log.all();
  let act: HomeEv | undefined;
  for (let i = evs.length - 1; i >= 0 && !act; i--) if (evs[i].kind === "today.answer" && evs[i].item === t.id) act = evs[i];
  const cause = act?.id ?? `rung:${t.id}`;
  changeThing(ctx, t.id, { state: "done", waitsOn: "none" }, { ...(act ? { cause: act.id } : {}), by: YOU });
  const yes = t.card?.answers[0] === said && doorsOf(ctx).has(id) && rungOf(ctx, id) === from;
  if (yes) ceiling(ctx, id, from, to, { ...(act ? { cause: act.id } : {}), by: YOU });
  settle(ctx, { cause, open: yes });
  touched.delete(ctx);   // Today pushes its own list after the answer
  ctx.all(sourcesMsg(ctx, null));
  return true;
};

export const sources: Unit = {
  name: "sources",
  handlers: {
    "home.sources": ask, "home.source.set": set, "home.policy.write": write, "home.source.repair": repair,
    "home.learned.keep": keep, "home.learned.drop": drop, "home.sources.undo": undo,
  },
  start(ctx) {
    if (!doorsOf(ctx).has("files")) registerSource(ctx, filesSource(ctx.home));
    reconcilePolicy(ctx);
    mend(ctx);
    onAnswer("rung:", press);
  },
  reverse: { "source.set": reverse, "policy.write": reverse, "policy.learned": reverse },
};
