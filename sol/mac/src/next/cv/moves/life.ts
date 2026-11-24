// owned by slice 4 (Life and Diary), docs/port/slices.md
// Life's and the diary's moves (#1604; the mockup's merge/life.js and merge/diary.js, ported as they are), merged into M
// by moves/index.ts. Each answers Done ({ ok, id, undo }).
//   life:  sticky(region, words) · run_sticky(id) · finish(id) · drop(id) · due(id, when)        (K4, functions 27–31)
//   diary: write(words) · remove_line(id) · pause_diary() · flip(±1) · to_sticky(lineId)          (D1–D8, functions 25, 26)
// Live (a real Sol) the life moves go to the engine through wire/life.ts (agent.sticky, agent.press); the diary's are
// "not yet" there (map.md rows 25, 26: core's NOT_YET for write and remove_line; flip, pause and to_sticky with them,
// since the page itself is "no"). Also here, as the mockup kept them beside the moves: the board's chosen sticky and
// its composer, the keys (hooks.keys, asked first), the seeds (hooks.onLoad), the diary's sweep on every change, and the
// 9 s hold of whatever is let go. The book stays outside D (diary/book.ts, a WeakMap keyed by D).
// Signed: marcocyl04-ux's agent, slice 4 (#1615).
import { D, M, MODE, S, done, hooks, isReady, lineAsk, notYet, piecesShown, regionOf, render, subscribe, type Ask, type Data, type Done, type Moves } from "../core.ts";
import * as L from "../../life/rules.ts";
import type { Made, Sticky } from "../../life/rules.ts";
import * as B from "../../diary/book.ts";
import { live as wire } from "../wire/life.ts";

const { aiOf, all, asksOf, cap, isLife, kindOfRegion, lifeRegions, live, nowMin, order, parseWhen, reach, splitDue, whenLabel } = L;

// ---------------------------------------------------------------- the diary hears every life move

function note(who: string, what: string, p: Sticky | null, why: string, embed?: B.Embed): string | null {
  try { return B.note({ who, what, region: p?.region, embed: embed || (p ? { kind: "sticky", id: p.id } : null), why }); } catch { return null; }
}

// ---------------------------------------------------------------- a move: its undo puts back only the stickies and asks it changed

type Snap = { st: Record<string, string>; as: Record<string, string> };
function snapLife(): Snap {
  const st: Record<string, string> = {}, as: Record<string, string> = {};
  for (const p of Object.values(D.pieces)) if (p.kind === "sticky") st[p.id] = JSON.stringify(p);
  for (const a of Object.values(D.asks)) as[a.id] = JSON.stringify(a);
  return { st, as };
}
function changes(b: Snap, a: Snap) {
  const diff = (x: Record<string, string>, y: Record<string, string>) => [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => x[k] !== y[k]).map((k): [string, string | undefined] => [k, x[k]]);
  return { st: diff(b.st, a.st), as: diff(b.as, a.as) };
}
type Out = Done & { noted?: string | null; [more: string]: unknown };
let undos: Out[] = [], owner: Data | null = null;
const stack = () => { if (owner !== D) { undos = []; owner = D; } return undos; };
type Res = { ok?: boolean; why?: string; id?: string; noted?: string | null; [more: string]: unknown } | null;
/** a life move on the fixture: what it changed is kept, so its undo puts back exactly that (life.js move) */
function lifeMove(fn: (...args: any[]) => Res) {
  return (...args: any[]): Done => {
    const d = D, b = snapLife(), r = fn(...args);
    if (!r || r.ok === false) return { ok: false, why: r?.why, undo: () => {} };
    const ch = changes(b, snapLife());
    let gone = false;
    const out: Out = { ...r, ok: true, id: r.id, undo: () => {
      if (gone || D !== d) return;
      gone = true;
      for (const [k, js] of ch.st) { if (js == null) { delete d.pieces[k]; if (d.pos) delete d.pos[k]; } else d.pieces[k] = JSON.parse(js); }
      for (const [k, js] of ch.as) { if (js == null) delete d.asks[k]; else d.asks[k] = JSON.parse(js); }
      B.forget(out.noted);
      const s = stack(), i = s.indexOf(out);
      if (i >= 0) s.splice(i, 1);
      if (r.id && d.pieces[r.id]) choose(r.id);
      render();
    } };
    stack().push(out);
    render();
    return out;
  };
}
/** the last life move, undone (⌘Z, "undo") */
export function undoLast(): boolean { const s = stack(), m = s[s.length - 1]; if (!m) return false; m.undo(); return true; }
export const undoCount = () => stack().length;

// ---------------------------------------------------------------- the chosen sticky (the keys act on it) and the composer

let pick: { D: Data | null; id: string | null } = { D: null, id: null };
export function here(): string | null { if (!S) return null; if (S.region) return S.region; const p = S.piece ? D.pieces[S.piece] : undefined; return p ? p.region : null; }
export function chosen(rid?: string | null): Sticky | null {
  rid = rid || here();
  const o = order(rid);
  if (pick.D === D && pick.id && o.some((p) => p.id === pick.id)) return D.pieces[pick.id] as Sticky;
  return o[0] || null;
}
/** the chosen sticky only when the person chose it (a press, the keys): the first one is chosen for the keys alone, and
 *  draws no presses at rest (a calm board, BR1 #1615) */
export function picked(rid?: string | null): Sticky | null { const c = chosen(rid); return c && pick.D === D && pick.id === c.id ? c : null; }
export function choose(id: string): void {
  pick = { D, id };
  const p = D.pieces[id];
  if (!p) return;
  const i = piecesShown().findIndex((x) => x.id === id);
  if (i >= 0 && S.region === p.region) S.sel = i;   // Enter then opens the same one
}
let comp: { region: string; words: string; D: Data } | null = null;
export const composing = (rid?: string | null) => (comp && comp.D === D && (!rid || comp.region === rid) ? comp : null);
export function compose(rid?: string | null): boolean { rid = rid || here(); if (!rid || !isLife(rid)) return false; comp = { region: rid, words: "", D }; render(); return true; }
export function closeComposer(): void { comp = null; render(); }
export function commit(): Done | null {
  const c = composing();
  if (!c) return null;
  const w = c.words.trim();
  comp = null;
  if (!w) { render(); return null; }
  return M.sticky(c.region, w);
}
export const lifeHere = () => (S && S.dist === "middle" && isLife(S.region) ? S.region : null);

// ---------------------------------------------------------------- ids, asks

const nextId = (pre: string) => { let i = 1; while (D.pieces[pre + i] || D.asks[pre + i]) i++; return pre + i; };
let mseq = 0;
const madeId = () => "mk" + ++mseq + Date.now().toString(36).slice(-3);
function nextRank(): number { const r = Object.values(D.asks).map((a) => a.rank).filter((x) => x < 100); return (r.length ? Math.max(...r) : 0) + 1; }
function raise(p: Sticky, text: string, x: Partial<Ask>): string {
  const id = nextId("lk");
  D.asks[id] = { id, rank: nextRank(), piece: p.id, kind: "life", source: `${aiOf(p.region)} · ${p.name}`, text, how: "inplace", answered: false, ...x };
  return id;
}
function withdraw(p: Sticky): void { for (const a of asksOf(p)) { a.answered = true; a.withdrawn = true; } }
const sticky = (id?: string | null) => { const p = D.pieces[id || chosen()?.id || ""]; return p && p.kind === "sticky" ? (p as Sticky) : null; };

// ---------------------------------------------------------------- K4's moves, on the fixture (life.js)

const fixture = {
  sticky(region: string | null, words?: string, o: { due?: string | number; by?: string; asked?: boolean } = {}): Res {
    if (typeof region === "string" && !regionOf(region) && words == null) { words = region; region = null; }
    region = region && regionOf(region) ? region : isLife(here()) ? here() : lifeRegions()[0]?.id ?? null;
    if (!region || !String(words || "").trim()) return { ok: false, why: "nothing to write" };
    const x = splitDue(String(words).trim()), due = o.due != null ? parseWhen(o.due) : x.due, by = o.by || "person";
    if (by !== "person" && !o.asked) return { ok: false, why: "an AI puts nothing in Life unless asked (P13)" };
    const id = nextId("sk-");
    D.pieces[id] = { id, region, kind: "sticky", name: cap(x.words), words: x.words, by, state: "open", at: nowMin(), due: due ? due.at : null, allDay: due ? due.allDay : false, made: [], isNew: true } as Sticky;
    if (by === "person") choose(id);
    return { id, region, noted: note(by === "person" ? "you" : by, `wrote a sticky: “${cap(x.words)}”`, D.pieces[id] as Sticky, "your own words") };
  },
  /** run: the folder's AI on the sticky, through the gate */
  run_sticky(id?: string): Res {
    const p = sticky(id);
    if (!p || !live(p)) return { ok: false };
    if (asksOf(p).length) return { ok: false, why: "it already asks you" };
    const ai = aiOf(p.region), g = reach(p.words);
    p.ran = (p.ran || 0) + 1; p.ai = ai; delete p.isNew;
    if (g === "stays" || g === "leaves") {
      const m: Made = { id: madeId(), at: nowMin(), by: ai, state: g === "stays" ? "kept" : "waits", isNew: true, ...(g === "stays" ? L.madeFrom(p.words) : L.draftFrom(p.words)) };
      (p.made = p.made || []).forEach((x) => delete x.isNew);
      p.made.unshift(m);
      return g === "stays"
        ? { id: p.id, made: m.id, gate: "do", noted: note(ai, `made “${m.title}” for your sticky “${p.name}”`, p, "you pressed run", { kind: "made", id: m.id, sticky: p.id }) }
        : { id: p.id, made: m.id, gate: "draft", noted: note(ai, `drafted “${m.title}”; it waits for your Send`, p, "it would leave this Mac", { kind: "made", id: m.id, sticky: p.id }) };
    }
    const cost = L.price(p.words);
    const text = g === "costs" ? `“${p.name}” costs about $${cost}. Go ahead?` : `“${p.name}” deletes something for good. Go ahead?`;
    const ask = raise(p, text, { reaches: g === "costs" ? "money" : "deletes", yes: g === "costs" ? `Go ahead, $${cost}` : "Delete it", act: { move: "life_go", args: [p.id] } });
    return { id: p.id, ask, gate: "ask", noted: note(ai, `asked before “${p.name}”: ${g === "costs" ? `it costs about $${cost}` : "it deletes"}`, p, "the trust gate") };
  },
  finish(id?: string): Res {
    const p = sticky(id);
    if (!p || !live(p)) return { ok: false };
    p.state = "done"; p.ended = nowMin(); delete p.isNew; withdraw(p);
    return { id: p.id, noted: note("you", `finished “${p.name}”`, p, "kept a day") };
  },
  drop(id?: string): Res {
    const p = sticky(id);
    if (!p || !live(p)) return { ok: false };
    p.state = "dropped"; p.ended = nowMin(); delete p.isNew; withdraw(p);
    return { id: p.id, noted: note("you", `dropped “${p.name}”`, p, "kept a day") };
  },
  due(id?: string, when?: string | number | null): Res {
    const p = sticky(id);
    if (!p) return { ok: false };
    if (when == null || when === "" || /^(none|never|no time)$/i.test(String(when))) {
      if (p.due == null) return { ok: false };
      p.due = null; p.allDay = false;
      return { id: p.id, noted: note("you", `took the due time off “${p.name}”`, p, "") };
    }
    const t = parseWhen(when);
    if (!t) return { ok: false, why: "no time in those words" };
    p.due = t.at; p.allDay = t.allDay;
    return { id: p.id, due: p.due, noted: note("you", `made “${p.name}” due ${whenLabel(t.at, t.allDay).toLowerCase()}`, p, "") };
  },
};

// ---------------------------------------------------------------- let go: Send on a draft, yes on an ask; held 9 s with undo

export const HOLD = 9;
const toast = (t: string) => hooks.flash?.(t);
function hold(_p: Sticky, m: Made, what: string): Made { m.state = "held"; m.until = Date.now() + HOLD * 1000; m.goes = what; return m; }
/** the hold ran out (the view's hold animation ended): what was held goes */
export function letGo(sid: string, mid: string): boolean {
  const q = D.pieces[sid] as Sticky | undefined, x = q && (q.made || []).find((y) => y.id === mid);
  if (!q || !x || x.state !== "held") return false;
  const what = x.goes || "done";
  x.state = what as Made["state"]; delete x.until;
  note(x.by, `${what === "sent" ? "sent" : what === "paid" ? "paid for" : "did"} “${x.title}”`, q, "you let it go");
  render();
  return true;
}
export function send(sid: string, mid: string): Done {
  const p = D.pieces[sid] as Sticky | undefined, m = p && (p.made || []).find((x) => x.id === mid);
  if (!p || !m || m.state !== "waits") return done(false);
  hold(p, m, "sent"); render(); toast(`Sending in ${HOLD} s`);
  return done(true, mid, () => { holdBack(sid, mid); });
}
export function holdBack(sid: string, mid: string): boolean {
  const p = D.pieces[sid] as Sticky | undefined, m = p && (p.made || []).find((x) => x.id === mid);
  if (!m || m.state !== "held") return false;
  m.state = m.kind === "draft" ? "waits" : "held back"; delete m.until; render();
  return true;
}
/** yes on a sticky's ask (the gate's "costs" or "deletes"): what it does is made and held (life.js LACT.life_go) */
function lifeGo(sid: string): void {
  const p = D.pieces[sid] as Sticky | undefined;
  if (!p) return;
  const g = reach(p.words), ai = aiOf(p.region);
  const m: Made = { id: madeId(), at: nowMin(), by: ai, kind: "done", isNew: true, state: "kept", title: g === "costs" ? `${p.name} · receipt` : `${p.name} · what was removed`,
    text: g === "costs" ? `About $${L.price(p.words)}, from your card on file.` : "Kept for 30 days in case you want it back." };
  (p.made = p.made || []).forEach((x) => delete x.isNew);
  p.made.unshift(m);
  hold(p, m, g === "costs" ? "paid" : "done");
  toast(`Goes in ${HOLD} s`);
}
/** a finished or dropped sticky brought back (the "Undo" in the gone list) */
export function bringBack(id: string): void {
  const p = D.pieces[id] as Sticky | undefined;
  if (!p || live(p)) return;
  const d = D, was = JSON.stringify(p);
  p.state = "open"; delete p.ended;
  stack().push({ ok: true, id, undo: () => { d.pieces[id] = JSON.parse(was); render(); } });
  choose(id); render();
}
/** pressing a sticky: chosen; pressed again (never run) runs it */
export function pressSticky(id: string): void {
  const p = D.pieces[id] as Sticky | undefined;
  if (!p) return;
  const was = chosen(p.region) === p && pick.id === id;
  choose(id);
  if (was && !p.ran && live(p)) M.run_sticky(id); else render();
}
export function nextSticky(rid: string): void { const o = order(rid), p = chosen(rid), i = p ? o.indexOf(p) : -1; if (o[i + 1]) choose(o[i + 1].id); render(); }

// ---------------------------------------------------------------- the diary's moves (diary.js)

const ok = (id: string, undo: () => void, x: Record<string, unknown> = {}): Done => ({ ok: true, id, undo: () => { undo(); render(); }, ...x });
const diary = {
  write(words?: string, o: { region?: string | null } = {}): Done {
    const w = String(words || "").trim();
    if (!w) return { ok: false, why: "Nothing to write.", undo: () => {} };
    const id = B.note({ who: "person", what: w, region: o.region || null, kind: "mine" })!;
    render();
    return ok(id, () => { const l = B.byId(id); if (l) { l.removed = true; B.out.remove?.(l, false); } });
  },
  remove_line(id?: string): Done {
    const l = id ? B.byId(id) : null;
    if (!l || l.removed) return { ok: false, why: "No such line.", undo: () => {} };
    l.removed = true; B.out.remove?.(l, false); render(); toast("Line removed");
    return ok(l.id, () => { l.removed = false; B.out.remove?.(l, true); });
  },
  pause_diary(): Done {
    const b = B.book();
    if (b.paused) {
      const p = b.paused; b.paused = null; p.to = B.now(b);
      if (p.skipped) B.note({ who: B.VOICE, force: true, kind: "gap", small: false, what: `Wrote nothing from ${B.hm(p.from)} to ${B.hm(p.to)}, as you asked; ${p.skipped === 1 ? "one thing" : p.skipped + " things"} went unwritten.` });
      render();
      return ok("resume", () => { b.paused = p; delete p.to; }, { paused: false });
    }
    const p: B.Pause = { from: B.now(b), skipped: 0 };
    b.paused = p; b.pauses.push(p); render();
    return ok("pause", () => { b.paused = null; b.pauses.splice(b.pauses.indexOf(p), 1); }, { paused: true });
  },
  flip(by: number | string = -1): Done {
    const b = B.book(), ks = Object.keys(b.pages).map(Number).concat(0), lo = Math.min(...ks), from = b.showing;
    const to = Math.max(lo, Math.min(0, from + (+by < 0 ? -1 : 1)));
    if (to === from) return { ok: false, why: to === 0 ? "This is today." : "Nothing earlier is written.", undo: () => {} };
    b.showing = to; render();
    return ok(String(to), () => { b.showing = from; }, { day: to });
  },
  to_sticky(lineId?: string): Done {
    const l = lineId ? B.byId(lineId) : null;
    if (!l || !l.mine) return { ok: false, why: "Only a line of yours becomes a sticky.", undo: () => {} };
    if (l.sticky) return { ok: false, why: "It is a sticky already.", undo: () => {} };
    const lifes = D.regions.filter((r) => kindOfRegion(r.id) !== "build");
    const region = l.region && regionOf(l.region) ? l.region : (lifes[0] || D.regions[0]).id;
    const r = M.sticky(region, l.what);
    if (!r || r.ok === false) return r || done(false);
    l.sticky = r.id!; l.embed = { id: r.id }; render();
    return ok(r.id!, () => { l.sticky = null; l.embed = null; r.undo?.(); });
  },
};
/** a take set (how it writes), said or pressed */
export function setTake(k: keyof B.Take, v: string, said?: string): Done {
  const b = B.book(), was = b.take[k];
  (b.take as Record<string, unknown>)[k] = v;
  if (said) b.said.push(said);
  render();
  return ok("take:" + k, () => { (b.take as Record<string, unknown>)[k] = was; });
}
export function answerOffer(yes: boolean): void { const b = B.book(), o = B.offerOf(); if (!o) return; b.offered[B.dayNow()] = "done"; if (yes) setTake(o.k, o.v); else render(); }
export function ask(words: string): void { const b = B.book(); b.asked = B.query(words); b.showing = 0; render(); }
export function clearAsk(): void { B.book().asked = null; render(); }
export function fold(read: boolean): void { B.book().read = read; render(); }
export function focusDiary(on: boolean): void { const b = B.book(); if (b.focus !== on) { b.focus = on; render(); } }
export function toToday(): void { B.book().showing = 0; render(); }

// ---------------------------------------------------------------- live: the life moves through the engine (wire/life.ts)

const LIVE_LIFE = new Set(["sticky", "run_sticky", "finish", "drop", "due"]);
const liveOrFixture = (name: keyof typeof fixture) => (...args: any[]): Done => {
  if (MODE === "live") { const w = wire(); return w ? w[name](...args) : notYet(); }
  return lifeMove((fixture[name] as (...a: any[]) => Res))(...args);
};
const diaryMove = (f: (...a: any[]) => Done) => (...args: any[]): Done => (MODE === "live" && !isReady("write") ? notYet() : f(...args));

const moves: Moves = {
  ...Object.fromEntries([...LIVE_LIFE].map((n) => [n, liveOrFixture(n as keyof typeof fixture)])),
  write: diaryMove(diary.write), remove_line: diaryMove(diary.remove_line), pause_diary: diaryMove(diary.pause_diary),
  flip: diaryMove(diary.flip), to_sticky: diaryMove(diary.to_sticky),
};
export default moves;

// ---------------------------------------------------------------- every change: the diary's sweep, a yes on a sticky's ask

subscribe(() => {
  if (!D || !S || MODE !== "fixture" && !isReady("write")) return;
  B.sweep();
  if (S.dist === "near") B.book().focus = false;
  for (const a of Object.values(D.asks)) {
    const act = a.act as { move?: string; args?: string[] } | undefined;
    if (act?.move === "life_go" && a.answered && !a.withdrawn && !a.acted) { a.acted = true; lifeGo(act.args?.[0] ?? ""); }
  }
});

// ---------------------------------------------------------------- the keys: asked before the shell's (hooks.keys, first)

const cols = () => {
  const b = typeof document !== "undefined" ? document.querySelector(".lf-board") : null;
  if (!b) return 3;
  const t = getComputedStyle(b).gridTemplateColumns;
  return t && t !== "none" ? t.split(" ").length : 3;
};
function lifeKeys(e: KeyboardEvent): boolean {
  if (!S || MODE !== "fixture" && !wire()) return false;
  const t = e.target as HTMLElement | null;
  if (t?.matches?.("input,textarea,select,[contenteditable]") || S.page === "settings") return false;
  const c = composing();
  if (c) {
    if (e.metaKey && e.code !== "Enter") return false;
    if (e.code === "Enter") { const r = commit(); if (r?.ok && e.metaKey) M.run_sticky(r.id); return true; }
    if (e.code === "Escape") { closeComposer(); return true; }
    if (e.code === "Backspace") { c.words = c.words.slice(0, -1); render(); return true; }
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey) { c.words += e.key; render(); return true; }
    return false;
  }
  // ⌘N in a life folder at Middle: the composer (the starter, ⌘N elsewhere, is slice 3's)
  if (e.metaKey && !e.shiftKey && e.code === "KeyN" && S.dist === "middle" && kindOfRegion(here()) === "life") return compose(here());
  const rid = lifeHere();
  if (!rid) return false;
  const ans = lineAsk() || S.askHere;   // ⌘↩ and ⌘⌫ answer an ask on the line first (the shell's)
  const p = chosen(rid);
  if (e.metaKey && e.code === "KeyZ" && !e.shiftKey) return stack().length ? undoLast() : false;
  if (!p) return false;
  if (e.metaKey && e.code === "Enter" && !ans) { const w = (p.made || []).find((m) => m.state === "waits"); if (w && !e.shiftKey) send(p.id, w.id); else M.run_sticky(p.id); return true; }
  if (e.metaKey && e.code === "KeyD" && !e.shiftKey) { M.finish(p.id); return true; }
  if (e.metaKey && e.code === "Backspace" && !ans) { M.drop(p.id); return true; }
  if (!e.metaKey && !e.altKey && /^Arrow(Left|Right|Up|Down)$/.test(e.code)) {
    const o = order(rid), i = Math.max(0, o.indexOf(p)), n = cols();
    const j = ({ ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - n, ArrowDown: i + n } as Record<string, number>)[e.code];
    if (j < 0 || j >= o.length) return false;
    choose(o[j].id); render(); return true;
  }
  return false;
}
/** the diary has the keys after a press inside it: ⌘[ and ⌘] flip a day; a letter typed goes to the line being written */
function diaryKeys(e: KeyboardEvent): boolean {
  if (!S || !D || MODE !== "fixture" && !isReady("write")) return false;
  const b = B.book();
  if (!b.focus || S.dist === "near") return false;
  const t = e.target as HTMLElement | null, field = !!t?.matches?.("input,textarea,select,[contenteditable]");
  if (e.metaKey && !e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) { M.flip(e.code === "BracketLeft" ? -1 : 1); return true; }
  if (e.key === "Escape" && !field) { b.focus = false; return false; }
  if (!field && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && /\S/.test(e.key)) {
    const inp = document.querySelector<HTMLInputElement>(".dy .dy-write input");
    if (inp) {   // through the native setter, so the view's own state hears it
      inp.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(inp, inp.value + e.key);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  }
  return false;
}
hooks.keys.unshift(lifeKeys, diaryKeys);

// ---------------------------------------------------------------- seeds: the panel's people's life folders (hooks.onLoad)

const H = (d: number, h: number, m = 0) => d * 1440 + h * 60 + m;
type Seed = Partial<Omit<Sticky, "made">> & { words: string; made?: Partial<Made>[] };
function seed(d: Data, rid: string, list: Seed[]): void {
  if (!d.regions.some((r) => r.id === rid)) return;
  let n = 0;
  for (const s of list) {
    const id = `sk-${rid}-${++n}`;
    d.pieces[id] = { id, region: rid, kind: "sticky", name: s.words, by: "person", state: "open", at: s.at ?? -1440 + n * 30, due: null, allDay: false, ...s,
      made: (s.made || []).map((m, i) => ({ id: `${id}.m${i + 1}`, by: s.ai || L.VOICE, state: "kept", ...m })) } as Sticky;
  }
}
const SEEDS: Record<string, (d: Data) => void> = {
  jayden(d) {
    const r = d.regions.find((x) => x.id === "reading");
    if (r) r.name = "school";
    for (const a of Object.values(d.asks)) if (a.source === "reading") a.source = "school";   // the ask names the folder as it is now called
    seed(d, "reading", [
      { words: "Hand in the lab report", due: H(0, 17), at: H(-2, 16), note: "Chemistry · Ms. Lee" },
      { words: "Read chapter 4 for Biology", due: H(1, 9), at: H(-1, 18), ran: 1, made: [{ kind: "doc", title: "Biology chapter 4 · one-page summary", text: "The cell cycle in five steps, the two terms to learn, and three questions to check yourself.", at: H(-1, 19, 10) }] },
      { words: "Email the group about the slides", at: H(0, 20, 15), ran: 1, made: [{ kind: "draft", title: "Email to the group · the slides", text: "Hi all, I can take slides 4 to 7. Can someone send me the chart by Thursday?", at: H(0, 20, 16), state: "waits" }] },
      { words: "Sign up for the chem lab slot", due: H(2, 8), allDay: false, at: H(-1, 9), note: "Opens Friday 8:00" },
      { words: "Print the field trip form", due: H(7, 0), allDay: true, at: H(-3, 12) },
      { words: "Study for the Spanish quiz", due: H(5, 10), at: H(0, 16, 40) },
      { words: "Return the library book", state: "done", at: H(-4, 10), ended: H(0, 15, 30) }]);
    seed(d, "essay", [
      { words: "History essay: write the conclusion", due: H(1, 0), allDay: true, at: H(-1, 21), note: "Extension asked", ran: 1,
        made: [{ kind: "doc", title: "Essay outline · History", text: "From your notes and the brief: the claim, three causes, the treaty as the turn.", at: H(0, 22, 50), isNew: true },
          { kind: "list", title: "Sources · five, with page numbers", text: "Two from the reading list, three from the library.", at: H(-1, 21, 30) }] }]);
    seed(d, "life", [{ words: "Renew the phone plan", due: H(2, 0), allDay: true, at: H(-2, 18) }, { words: "Buy a card for mum’s birthday", due: H(4, 0), allDay: true, at: H(0, 19) }]);
  },
  dev(d) {
    seed(d, "home", [{ words: "Reply to the landlord about the renewal", due: H(0, 23, 59), at: H(-1, 20), ran: 1, made: [{ kind: "draft", title: "Email to the landlord · the renewal", text: "Thanks for the terms. We would like to renew for twelve months; could the start move to the 1st?", at: H(0, 6, 40), state: "waits", isNew: true }] },
      { words: "Pick up the parcel", due: H(0, 18), at: H(-1, 9) }, { words: "Call the bank about the card", at: H(-1, 12) }]);
    seed(d, "money", [{ words: "Pay the electricity bill", due: H(2, 0), allDay: true, at: H(-3, 10) },
      { words: "Sort November’s receipts", at: H(-2, 20), ran: 1, made: [{ kind: "table", title: "November receipts · a table", text: "31 receipts, by shop and by week; four have no total.", at: H(-1, 7) }] }]);
    seed(d, "health", [{ words: "Renew the prescription", due: H(-1, 17), at: H(-4, 9) }, { words: "Plan three runs this week", at: H(-1, 21) }]);
    seed(d, "school", [{ words: "Check the citations in section 3", due: H(1, 9), at: H(0, 21), ran: 1, made: [{ kind: "doc", title: "Citations in section 3 · what to fix", text: "Two quotes have no page number; one source is cited twice.", at: H(0, 22, 30) }] }]);
  },
  denise(d) {
    seed(d, "house", [{ words: "Groceries for the week", at: H(-1, 19), ai: "June", ran: 1, made: [{ kind: "list", title: "Groceries for the week · a list", text: "23 things, by aisle. Milk and bread are on it twice a week.", at: H(0, 7, 30), isNew: true }] },
      { words: "Bins out", due: H(1, 20), at: H(-6, 20) }, { words: "Call mum", at: H(-1, 18) }]);
    seed(d, "kids", [{ words: "Sign Mia’s school form", due: H(1, 8), at: H(0, 15) }, { words: "Pack Mia’s swim bag", due: H(2, 7), at: H(-1, 19) }, { words: "Book Mia’s dentist follow-up", at: H(0, 7, 50) }]);
    seed(d, "work", [{ words: "Send the report to Ruth", due: H(2, 12), at: H(-1, 16), ran: 1, made: [{ kind: "draft", title: "Email to Ruth · the Q3 report", text: "Hi Ruth, the second draft is attached. The summary is shorter; the numbers are unchanged.", at: H(0, 7, 55), state: "waits" }] }]);
  },
  minji(d) {
    seed(d, "life", [{ words: "Invoice Bloom for October", due: H(2, 0), allDay: true, at: H(-1, 11) }, { words: "Plan the studio week", at: H(0, 9) }]);
    seed(d, "studio", [{ words: "Collect the client’s comments into one list", at: H(-1, 18), ran: 1, made: [{ kind: "list", title: "Bloom’s comments · one list", text: "Nine comments, three on the headline.", at: H(0, 8, 30) }] }]);
  },
};
hooks.onLoad.push((d, name) => {
  const s = name === "jayden" ? SEEDS.jayden : /^denise/.test(name) ? SEEDS.denise : name === "minji" ? SEEDS.minji
    : d.regions.some((r) => r.id === "home") && d.regions.some((r) => r.id === "money") ? SEEDS.dev : null;
  if (s) s(d);
  comp = null; pick = { D: null, id: null };
});
// the diary's book after life's seeds (diary.js loaded after life.js)
hooks.onLoad.push((d, name) => B.seed(d, name));

// ---------------------------------------------------------------- the handles the counts and the agent read (mockup CV.life, CV.diary)

/** CV.life: the board's own reads and presses, as the mockup named them */
export const life = {
  order, gone: L.gone, all, chosen, choose, composing, compose, closeComposer, commit, reach, aiOf, isLife, isLate: L.isLate, lateBy: L.lateBy, asksOf, whenLabel,
  agoLabel: L.agoLabel, parseWhen, nowMin, send, holdBack, letGo, undoLast, HOLD, get undos() { return stack().length; },
};
/** CV.diary: the book's reads, its seam with the agent (claim, fromRow), its takes */
export const diaryApi = {
  note: B.note, fromRow: B.fromRow, claim: B.claim, forget: B.forget, lines: B.lines, since: B.since, headline: B.headline, query: B.query, book: () => B.book(),
  page: (k: number) => B.page(k), byId: B.byId, now: () => B.now(), hm: B.hm, dayName: B.dayName, dateWords: B.dateWords, pageOf: B.pageOf, takes: B.TAKES, setTake,
  offerOf: B.offerOf, answerOffer, personName: B.personName, nameOf: B.nameOf, regionOfThing: B.regionOfThing, blockOf: B.blockOf, rowOf: B.rowOf, TODAY0: B.TODAY0,
  get showing() { return B.book().showing; }, get paused() { return !!B.book().paused; },
  focus(on = true) { B.book().focus = on; }, ask(words: string) { ask(words); return B.book().asked; }, clearAsk, all: () => B.allLines(),
};
// slots.ts and cv/index.ts are not this slice's: the handles ride on hooks until the join names them CV.life and CV.diary
// (docs/port/requests/life.md)
Object.assign(hooks as object, { life, diary: diaryApi });
