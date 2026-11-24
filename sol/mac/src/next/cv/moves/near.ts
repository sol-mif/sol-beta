// owned by slice 3 (Near), docs/port/slices.md
// Near's moves (#1615; the mockup's merge/runs.js and views/near.js, as they are): start (#11: the starter card, then
// one press starts it in place), split_run (#12), split (#9), redirect (#14), check (#16), talk, and the open and close
// of a split job's part. Beside (#24) is the shared M.beside (core.ts); Near draws it. Each answers Done, and its undo
// is the data as it was (runs.js move()).
// Live (a real Sol) the moves send today's messages: start → work.say { fresh }, talk and redirect → work.say, check →
// work.review. split is "no" (core.ts NOT_YET), split_run "partly" (map.md: parts are not under one parent piece), so
// both answer not yet live; the cost guess and reach of a start are "no", so live a starter shows none.
// The keys Near takes are set here at import (hooks.keys): ⌘N and the open starter's words, a split job's part choice,
// and every plain key at Near to its pane (never stolen: the count 3's rule).
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { D, S, M, MODE, done, placePath, folderDiary, folderDiaryId, hooks, lineAsk, notYet, regionOf, render, sessions, type Done, type Moves, type Piece } from "../core.ts";
import { route, typeInto, typeIntoPage, type FakeTerm, type KeyLike } from "../../near/keys.ts";
import {
  aiNamed, current, cycleAI, find, focused, guess, here, nextId, openPartOf, partCols, partOf, raise, sessionOf, setFocus, setOf, usualAI,
} from "../../near/runs.ts";
import { cwdOf, engine } from "../wire/near.ts";
import { link as planeLink } from "../wire/plane.ts";
import { keptPlace } from "../../plane/layout.ts";
import { swapTab } from "./tabs.ts";

const now = () => performance.now() / 1000;
/** the data before a move is its undo (runs.js restore): D keeps its object, its insides go back */
function restore(js: string): void {
  const o = JSON.parse(js) as Record<string, unknown>, d = D as Record<string, unknown>;
  for (const k of Object.keys(d)) delete d[k];
  Object.assign(d, o);
  if (!focused()) setFocus(null);
  render();
}
/** a new piece at its spot by the plane's rule, marked whose it is (runs.js place; added at the join, #1615: an AI's start
 *  stands as the AI's, count 18). Nothing when the plane is not there */
function placeOn(id: string, region: string, by: "ai" | "person", near?: string): void {
  const P = (hooks as { plane?: { spotFor?: (r: string, o?: unknown) => unknown; put?: (id: string, s: unknown, by: string) => unknown } }).plane;
  if (P?.spotFor && P.put) P.put(id, P.spotFor(region, near ? { near } : undefined), by);
}
type Out = { ok?: boolean; id?: string; why?: string; [more: string]: unknown } | null | undefined;
/** one move: the data before it kept, its answer as Done (runs.js move()) */
function move(fn: (...a: any[]) => Out): (...a: any[]) => Done {
  return (...a) => {
    const before = JSON.stringify(D);
    const r = fn(...a);
    if (!r || r.ok === false) return { ...done(false), ...(r || {}), ok: false, undo: () => {} };
    render();
    return { ...r, ok: true, id: r.id, undo: () => restore(before) } as Done;
  };
}
const live = () => MODE === "live";
const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const sessionIdOf = (p: Piece) => String(p.sessionId ?? p.id);
const cwdFor = (p: Piece) => (p.cwd as string | undefined) ?? cwdOf(sessionIdOf(p)) ?? (regionOf(p.region)?.path as string | undefined);

// ---------------------------------------------------------------- S1–S3 · start: a starter card, then one press in place
/** the person asked for it: Middle on its folder, the card chosen (runs.js show) */
function show(id: string, region: string): void {
  if (S.dist !== "middle" || S.region !== region) M.goto(region);
  // a full folder puts it in a new row at its foot, under the bar: the camera follows it there, at the same zoom (BR1 F9)
  const c = (hooks as { plane?: { camToShow?: (id: string) => typeof S.cam | null } }).plane?.camToShow?.(id);
  if (c) { S.cam = c; S.camSet = true; }
  const i =Object.values(D.pieces).filter((p) => p.region === region && !p.parent).findIndex((p) => p.id === id);
  if (i >= 0) S.sel = i;
}
function startCard(id: string, o: { force?: boolean }): Out {
  const c = D.pieces[id];
  if (!c || c.kind !== "starter") return { ok: false };
  const given = (c.given as string[]) || [];
  if (!String(c.words || "").trim() && !given.length) return { ok: false, why: "nothing to do yet" };
  const words = c.words || `look at ${given.map((x) => D.pieces[x]?.name ?? x).join(", ")}`;
  if (live()) {
    // today's start: a fresh session in the folder, its first words said (map.md #11, work.say { fresh })
    const e = engine(), sid = uuid(), cwd = (c.cwd as string | undefined) || (regionOf(c.region)?.path as string | undefined);   // c.cwd: the folder the new session view's box picked (session/Port.tsx)
    // the picks the new session view's box made (session/Port.tsx: model, effort, mode, fast, a side copy) go with it
    const picks = { ...(c.model ? { model: c.model } : {}), ...(c.effort ? { effort: c.effort } : {}), ...(c.mode ? { mode: c.mode } : {}), ...(c.fast != null ? { fast: !!c.fast } : {}), ...(c.copyOf ? { worktree: true } : {}) };
    if (!e || !e.send({ type: "work.say", sessionId: sid, fresh: true, opening: true, cwd, ...(placePath(c.region) ? { place: placePath(c.region) } : {}), ...(c.purpose ? { purpose: c.purpose } : {}), ...picks, text: words })) return { ok: false, why: "the engine is away" };
    const mine = c.by !== "ai" && c.purpose !== "automation";
    sessionOf(c, c.ai || "", words, c.region);
    c.sessionId = sid;
    delete c.reach; delete c.by; delete c.copyOf; c.given = given;
    if (focused()?.id === id) setFocus(null);
    // the piece is the session's own from here, under its id, so the engine's list (cv/wire/plane.ts) lands on it and
    // never beside it; a start the person made opens its tab, the one it was made in or a new one in front (BR1 gate 1)
    rekey(id, sid);
    if (mine) landIn(id, sid);
    return { id: sid };
  }
  const g = guess(c);
  if (g.over && !o.force) {
    const ask = raise(id, `${c.ai} would pass its $${g.limit} limit (${g.cost}). Start anyway?`, `${c.ai} · limit`, { act: { move: "start", args: [id, { force: true }] } });
    return { id, ask };
  }
  sessionOf(c, c.ai || "", words, c.region);
  delete c.reach; delete c.by; c.given = given;
  if (c.purpose) hooks.born?.(c);
  if (!D.ais.some((x) => x.name === c.ai)) D.ais.push({ name: c.ai || "", piece: id });
  if (focused()?.id === id) setFocus(null);
  return { id };
}
/** a piece under a new id (pure on the store): its place goes with it */
function rekey(was: string, now: string): void {
  const p = D.pieces[was];
  if (!p || was === now) return;
  delete D.pieces[was]; p.id = now; D.pieces[now] = p;
  if (D.pos?.[was]) { D.pos[now] = D.pos[was]; delete D.pos[was]; }
}
/** a session the person started, in front in its tab: the tab its start was made in (was), else a new one */
function landIn(was: string, sid: string): void {
  if (!swapTab(was, sid)) M.tabOpen(sid, true);
}
/** a session the engine started for this face (a folder's ＋ New session, next.folder.start): its piece made now, so
 *  its tab opens at once with the first words in its talk, and the engine's list lands on it (cv/wire/notes.ts) */
export function landStarted(sid: string, region: string, words: string): void {
  if (!D.pieces[sid]) {
    D.pieces[sid] = { id: sid, sessionId: sid, region, kind: "session", name: words.slice(0, 60) || "new session", ai: "Claude", state: "working", talk: [`you: ${words}`], term: { lines: [], waiting: null, stateWord: "working" } } as Piece;
    placeOn(sid, region, "person");
  }
  M.tabOpen(sid, true);
}
/** purpose: what the session is for, said to the engine with its first words ("automation": Add's tile, birth.html row 5) */
/** tab: the tab row's ＋, a new tab in front with the start screen; the canvas stays where it was, no folder opens (Look 1 A3) */
type StartOpts = { ai?: string; words?: string; given?: string[]; reach?: string; region?: string; by?: string; now?: boolean; purpose?: "automation"; tab?: boolean };
function start(a?: string | StartOpts, b?: unknown, c?: string): Out {
  if (typeof a === "string" && D.pieces[a]?.kind === "starter") return startCard(a, (b as { force?: boolean }) || {});
  const o: StartOpts = a && typeof a === "object" ? a
    : { ai: a, words: typeof b === "string" && !D.pieces[b] ? b : undefined, given: typeof b === "string" && D.pieces[b] ? [b] : undefined, reach: c };
  const ai0 = o.ai && D.ais.find((x) => x.name === o.ai);
  // the folder in view first (BR1 gate 1: the sidebar's New session from a folder's page started in another): the folder
  // page open, else the session in front, else where the canvas stands
  const inView = S.page === "folder" && S.folder && regionOf(String(S.folder)) ? String(S.folder)
    : S.dist === "near" && S.piece && D.pieces[S.piece] ? D.pieces[S.piece].region : null;
  let region = (o.region && regionOf(o.region) ? o.region : null) || (o.given?.[0] && D.pieces[o.given[0]] ? D.pieces[o.given[0]].region : null) || inView || here()
    || (ai0 ? D.pieces[ai0.piece]?.region : null) || D.regions[0]?.id;
  // with no folder yet a session still starts (BR1 #1615, the control sweep): one is made for it, named by what it holds
  // (place.ts); it has no path of its own, so the engine starts the session where new ones start (prefs.newIn, else home)
  if (!region) { const f = M.newFolder(undefined, "build"); if (f?.ok && f.id) region = f.id; }
  if (!region) return { ok: false, why: "no folder" };
  const ai = aiNamed(o.ai) || o.ai || usualAI(region);
  const id = nextId("st-");
  D.pieces[id] = { id, region, kind: "starter", name: o.purpose === "automation" ? "new automation" : "new session", ai, words: o.words || "", given: o.given || [], reach: o.reach || setOf(ai).reach, by: o.by || "person", ...(o.purpose ? { purpose: o.purpose } : {}) };
  placeOn(id, region, o.by === "ai" ? "ai" : "person");
  if (o.tab) { setFocus(id); M.tabOpen(id, true); }
  else if (o.by !== "ai") { setFocus(id); show(id, region); }
  // goes ahead, and there is something to do: it starts at once (an AI that asks first waits for the press)
  if (!live() && o.words && D.pieces[id].reach === "goes ahead" && o.now !== false && !guess(D.pieces[id]).over) startCard(id, {});
  return { id };
}
/** close the open starter (Escape on an empty card, "never mind") */
export function closeStarter(id?: string): Done {
  const c = id ? D.pieces[id] : focused();
  if (!c || c.kind !== "starter") return done(false);
  const before = JSON.stringify(D);
  delete D.pieces[c.id]; if (D.pos) delete D.pos[c.id];
  if (focused()?.id === c.id || !focused()) setFocus(null);
  render();
  return done(true, c.id, () => restore(before));
}

// ---------------------------------------------------------------- S6 · one AI splits a job; a part opens at Near
function splitRun(parent?: string, parts?: ({ ai?: string; words?: string } | string)[]): Out {
  const f = find(parent || current());
  if (!f || f.p.kind !== "session" || !Array.isArray(parts) || !parts.length) return { ok: false };
  const p = f.p; p.parts = p.parts || [];
  const ids: string[] = [];
  for (const x of parts) {
    const w = typeof x === "string" ? x : x.words || "", who = typeof x === "string" ? p.ai || "" : aiNamed(x.ai) || x.ai || p.ai || "";
    const q = partOf(p, p.parts.length, who, w); p.parts.push(q); ids.push(q.id);
  }
  p.splitBy = p.ai; (p.talk = p.talk || []).push(`${p.ai}: split this into ${p.parts.length} parts.`);
  return { id: p.id, parts: ids };
}
function split(piece?: string, parts?: ({ words?: string } | string)[]): Out {
  const f = find(piece || current());
  if (!f || !Array.isArray(parts) || !parts.length) return { ok: false };
  if (f.p.kind === "session") { const r = splitRun(f.p.id, parts.map((w) => (typeof w === "string" ? { ai: f.p.ai, words: w } : w))); return r && r.ok !== false ? { id: f.p.id, parts: r.parts } : { ok: false }; }
  const had = (f.p.parts || []).length;
  f.p.parts = (f.p.parts || []).concat(parts.map((w, i) => ({ id: `${f.p.id}.p${had + i + 1}`, name: String(typeof w === "string" ? w : w.words), state: "waits" } as Piece)));
  return { id: f.p.id };
}
export function openPart(id: string): Done {
  const f = find(id);
  if (!f || !f.parent) return done(false);
  const was = { part: S.part, partSel: S.partSel, pane: S.pane };
  if (S.dist !== "near" || S.piece !== f.parent.id) M.dive(f.parent.id, false);
  S.part = id; S.partSel = (f.parent.parts || []).indexOf(f.p); S.pane = "talk"; render();
  return done(true, id, () => { Object.assign(S, was); render(); });
}
export function closePart(): Done {
  if (!S.part) return done(false);
  const was = S.part; S.part = null; render();
  return done(true, was, () => { S.part = was; render(); });
}

// ---------------------------------------------------------------- redirect, check, talk
const run = (id?: string) => { const f = find(id || current()); return f && f.p.kind === "session" ? f : null; };
function redirect(id?: string, words?: string): Out {
  const f = run(id);
  if (!f || !String(words || "").trim()) return { ok: false };
  const p = f.p, w = String(words).trim();
  if (live()) { const e = engine(); if (!e || !e.send({ type: "work.say", sessionId: sessionIdOf(p), text: w })) return { ok: false, why: "the engine is away" }; }
  p.words = w; (p.talk = p.talk || []).push("you: " + w, `${p.ai}: changing course: ${w}.`);
  return { id: p.id };
}
const NOTES = { code: ["session.ts: the token stays after logout", "login.test.ts: one case is still skipped", "flags.ts: --out is never read"], life: ["one date does not match the calendar", "the total is off by $4"] };
function check(id?: string, checker?: string): Out {
  const f = run(id);
  if (!f) return { ok: false };
  const p = f.p;
  if (live()) {
    // the review seat reads the diff (map.md #16); a folder that says "always check" is not yet
    const e = engine(), cwd = cwdFor(p);
    if (!e || !cwd || !e.send({ type: "work.review", rid: uuid(), sessionId: sessionIdOf(p), cwd, scope: "all" })) return { ok: false, why: "the engine is away" };
    return { id: p.id };
  }
  const by = aiNamed(checker) || checker || [...new Set(D.ais.map((a) => a.name))].find((n) => n !== p.ai) || "Rex";
  if (by === p.ai) return { ok: false };
  const r = regionOf(p.region), pool = NOTES[r && r.kind === "life" ? "life" : "code"];
  const n = 1 + ((p.files || String(p.copy || "").length) % 2);
  p.checked = { by, notes: pool.slice(0, n) }; (p.talk = p.talk || []).push(`${by}: checked it. ${n} note${n === 1 ? "" : "s"}.`);
  return { id: p.id };
}
/** words to a session's AI, into its thread (views/near.js: anything said at Near that is not a move); a part's lives in the part */
function talk(pid?: string, words?: string): Out {
  const f = find(pid || current()), w = String(words || "").trim();
  if (!f || !w) return { ok: false };
  if (live() && f.p.kind === "session" && !f.parent) { const e = engine(); if (!e || !e.send({ type: "work.say", sessionId: sessionIdOf(f.p), text: w })) return { ok: false, why: "the engine is away" }; }
  (f.p.talk = f.p.talk || []).push("you: " + w);
  return { id: f.p.id };
}

/** a piece made by hand, or an AI's waiting in arrivals until the person takes it (runs.js make; ported at the join, #1615:
 *  count 13 needs the function's move). A row that runs is one kind. Placed by the plane's rule when the plane is there */
function make(kind?: string, title?: string, region?: string, o: { by?: string; ai?: string; text?: string; steps?: unknown[]; kept?: boolean; when?: unknown; near?: string } = {}): Out {
  if (kind === "diary") return makeDiary(region);
  if (live()) return { ok: false, why: "not yet" };
  const rid = region && regionOf(region) ? region : here() || D.regions[0]?.id;
  if (!rid) return { ok: false };
  if (o.by === "ai") {
    const arr = Object.values(D.pieces).find((p) => p.region === rid && p.kind === "arrivals");
    const item = { day: 7, ai: o.ai || usualAI(rid), what: String(title || ""), accepted: false, make: { kind, title } };
    if (arr) (arr.items = arr.items || []).push(item); else ((D as Record<string, unknown>).drafts = ((D as Record<string, unknown>).drafts as unknown[] || [])).push({ region: rid, ...item });
    return { draft: true };
  }
  const id = nextId(kind === "row" ? "row-" : "pc-");
  const p: Piece = { id, region: rid, kind: kind === "row" ? "row" : kind || "doc", name: title || "untitled", text: o.text || "", isNew: true };
  if (kind === "row") Object.assign(p, { steps: (o.steps || []).map((w) => ({ what: String(w), st: "waits" })), kept: !!o.kept, when: o.when || null });
  D.pieces[id] = p;
  placeOn(id, rid, "person", o.near);
  return { id };
}

/** a folder's own Diary (BR1 slots): one per folder, the one there if it has one; at the top of the canvas there is no
 *  folder to scope it, so nothing (Add opens the canvas's). Live it is kept by its place (next.pos.set, the person's),
 *  and made again from that place on a reload (plane/layout.ts relayoutPlane) */
function makeDiary(region?: string): Out {
  if (!region || !regionOf(region)) return { ok: false, why: "a folder's Diary needs its folder" };
  const id = folderDiaryId(region);
  if (D.pieces[id]) return { id };
  D.pieces[id] = { ...folderDiary(region), isNew: true };
  // placed by its folder's rule (with the life things, so a life folder's board starts at the right row), then kept as
  // the person's: it was made by hand
  hooks.layout?.();
  const q = D.pos?.[id];
  if (q) q.by = "person"; else placeOn(id, region, "person");
  if (live() && q && planeLink.e) {
    keptPlace(id, q);
    planeLink.e.send({ type: "next.pos.set", id, x: q.x, y: q.y, w: q.w, h: q.h, by: "person", touched: false, folded: false });
  }
  return { id };
}

const moves: Moves = {
  start: move(start), tabNew: () => move(start)({ tab: true }), split_run: (...a) => (live() ? notYet() : move(splitRun)(...a)), split: move(split),
  redirect: move(redirect), check: move(check), talk: move(talk), make: move(make),
  openPart: (id: string) => openPart(id), closePart: () => closePart(), closeStarter: (id?: string) => closeStarter(id),
};
export default moves;

// ---------------------------------------------------------------- the keys Near takes (hooks.keys, asked before the shell's)
const isField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.matches?.("input,textarea,select,[contenteditable]");
const fakeTerm = (pid: string, p: Piece): FakeTerm => (S.term[pid] as FakeTerm | undefined) ?? (S.term[pid] = { lines: [...(p.term?.lines ?? [])], vim: false, buf: "" }) as FakeTerm;
/** a key that reached the pane at Near (engine.js paneKey): counted, and on the fixture typed into its terminal or page */
function paneKey(e: KeyLike): void {
  const pid = S.keysSide === "beside" && S.beside ? S.beside : S.part || S.piece;
  const f = find(pid);
  S.c.recv++; S.sig.lastKey = now();
  if (!f || live()) return;   // live, the pane's own (xterm, the page) has the key
  const p = f.p;
  if (p.kind !== "session") { const t = S.doc[p.id] ?? String(p.text ?? ""); S.doc[p.id] = typeIntoPage(t, e); render(); return; }
  if (S.pane !== "terminal") { if (S.pane === "change" && (e.code === "Space" || e.code === "KeyJ")) S.sig.lastScroll = now(); return; }
  const r = typeInto(fakeTerm(p.id, p), e);
  S.term[p.id] = r.term;
  if (r.started) S.sig.lastCmdStart = now();
  if (r.saved) S.sig.lastSave = now();
  render();
}
function nearKeys(ev: KeyboardEvent): boolean {
  // ⌘N: a new session, from anywhere (a session's box and its terminal too); it lands in the same view as the tab
  // row's ＋ and the sidebar's New session (BR1 gate 1)
  if (ev.metaKey && ev.code === "KeyN" && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !(ev.target as HTMLElement | null)?.closest?.("#v-settings")) { M.tabNew(); return true; }
  if (isField(ev.target) || (ev.target as HTMLElement | null)?.closest?.("#v-settings")) return false;
  const job = S.piece ? D.pieces[S.piece] : undefined, hasParts = !!(S.dist === "near" && job?.parts?.length);
  const at = { dist: S.dist, starter: !!focused(), parts: (!hasParts ? "none" : openPartOf() ? "open" : "choosing") as "none" | "open" | "choosing", ans: !!(lineAsk() || S.askHere), beside: !!S.beside };
  const r = route(ev, at);
  if (r === "starter") {
    const c = focused()!;
    if (ev.metaKey && ev.code === "Enter") { M.start(c.id); return true; }
    if (ev.code === "Escape") { if (c.words) { setFocus(null); render(); } else closeStarter(c.id); return true; }
    if (ev.code === "Tab") { if (ev.shiftKey) c.reach = c.reach === "asks first" ? "goes ahead" : "asks first"; else cycleAI(c); render(); return true; }
    if (ev.code === "Backspace") { c.words = String(c.words || "").slice(0, -1); render(); return true; }
    if (ev.key && ev.key.length === 1 && !ev.altKey) { c.words = String(c.words || "") + ev.key; render(); return true; }
    return ev.code === "Enter";   // plain return does nothing here: ⌘↩ starts
  }
  if (r === "parts" && job?.parts) {
    if (openPartOf()) { closePart(); return true; }
    const n = job.parts.length, cols = partCols(typeof innerWidth === "number" ? innerWidth : 1440), sel = (Number(S.partSel) || 0) % n;
    const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[ev.code];
    if (step && !ev.metaKey) { S.partSel = Math.max(0, Math.min(n - 1, sel + step)); render(); return true; }
    openPart(job.parts[sel].id); return true;
  }
  if (r === "pane") paneKey(ev);
  return false;   // a key for the pane is never taken from it: the shell lets it through
}
if (!hooks.keys.includes(nearKeys)) hooks.keys.push(nearKeys);

/** the sessions a phrase names: the AI's session here, else any of its (runs.js target) */
export function sessionOfAI(w: string): string | undefined {
  const a = aiNamed(w);
  if (!a) return undefined;
  const ss = sessions();
  return (ss.find((p) => p.ai === a && p.region === here()) || ss.find((p) => p.ai === a))?.id;
}
