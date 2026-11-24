// The people's rules (slices 8+9, #1615), merge/people.js ported as it is: which setup each person has (P4), what was
// answered, and the one queue (P3: Needs you = the canvas's asks + the Cowork waits that count + the Social cards, once
// each; ⌘J walks them in one order). Pure on the store and the book; the moves (cv/moves/people.ts) and the views read
// these. Live (a real Sol) the team is the one cv/wire/people.ts reads from team.v3.*, and the circle is the one
// cv/wire/social.ts shapes from Isaac's Social (#1072's model, BR1). Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { D, MODE, SCEN, SCN, above, dataVer, render } from "../cv/core.ts";
import { COWORK, DEFAULTS, FALLBACK, KIND, SOCIAL, type Circle, type Group, type Inbox, type Team, type Wait } from "./data.ts";
import { note, lines as noted } from "./diary.ts";
import { extraAll, type ExtOpen } from "./extra.ts";
import type { social as LiveSocial } from "../cv/wire/social.ts";   // BR1 people: Social's moves, live

// ---------------------------------------------------------------- the pages (P2)

/** the people's pages, each with its argument after a colon ("group:bio", "friend:Maya"), and the view they belong to */
export const PEOPLE: Record<string, "cowork" | "social"> = { cowork: "cowork", group: "cowork", first: "cowork", social: "social", friend: "social", link: "social", asfriend: "social", share: "social", setup: "social" };
export const pk = (page: string | null | undefined) => (page ? String(page).split(":")[0] : null);
export const parg = (page: string | null | undefined) => (page && page.includes(":") ? page.slice(page.indexOf(":") + 1) : "");
/** whether a page is one of the people's (the shell routes these to the people slot) */
export const onPeople = (page: string | null | undefined) => !!PEOPLE[pk(page) ?? ""];

// ---------------------------------------------------------------- the book: per canvas, a load starts clean

export type Book = {
  s: string; f: string; done: Set<string>; later: Map<string, number>; seq: number; focus: string | null;
  face: number; faced: boolean; close: Set<string>; open: Set<string>;
};
const BOOK = new WeakMap<object, Book>();
/** the live team, read from team.v3.* by cv/wire/people.ts (null until it answers); the live circle and Social's moves,
 *  from cv/wire/social.ts (null until it is attached); a group's invite link and a group's link opened, team.v3.join.* */
export const live: { team: Team | null; answer: ((g: Group, w: Wait) => boolean) | null; circle: Circle | null; social: typeof LiveSocial | null;
  invite: ((gid: string) => boolean) | null; join: ((url: string) => boolean) | null } = { team: null, answer: null, circle: null, social: null, invite: null, join: null };
/** a press that has nothing behind it in a real Sol yet says so in its own words, never the pretend line it plays on the dev page */
export const notHere = (words: string) => `Not here yet: ${words.trim() ? `“${words.trim()}”` : "this"} comes in a later Sol`;
const EMPTY: Circle = { label: "live", me: { line: "", level: 0 }, shares: { fb: 0, pr: 0, wo: 0, ar: 0 }, friends: [], inbox: [], fav: { n: 0, from: "nobody", used: 0 } };
const NONE: Team = { label: "live", groups: [], live: true };

export const personName = (): string => (MODE === "fixture" && SCEN[SCN] ? SCEN[SCN].label : "You").split(" · ")[0];
const defaultsOf = (name: string) => DEFAULTS[name] || FALLBACK;
export function st(): Book {
  let b = BOOK.get(D);
  if (!b) { const d = defaultsOf(personName()); b = { s: d.s, f: d.f, done: new Set(), later: new Map(), seq: 0, focus: null, face: 0, faced: false, close: new Set(), open: new Set() }; BOOK.set(D, b); }
  return b;
}
/** switch the setup of the person on screen (the counts, and a friend's "Also in" link) */
export function use(o: { s?: string; f?: string } = {}): Book {
  const b = st();
  if (o.s && COWORK[o.s]) b.s = o.s;
  if (o.f && SOCIAL[o.f]) b.f = o.f;
  b.focus = null;
  return b;
}
export const team = (): Team => (MODE === "fixture" ? COWORK[st().s] : live.team ?? NONE);
export const circle = (): Circle => (MODE === "fixture" ? SOCIAL[st().f] : live.circle ?? EMPTY);
export const me = (t: unknown) => String(t ?? "").replace(/\{me\}/g, personName());

// ---------------------------------------------------------------- the one queue (P3)

export const counts = (w: Wait) => ["ask", "hand", "approve", "back", "join"].includes(w.kind ?? "");
export const viewerRole = (s: Team) => s.viewer?.role || "makes";
export const isMaker = (s: Team) => viewerRole(s) === "makes";
/** the groups in one ranking: the most waits on you first, the quiet ones left out */
export const sortedGroups = (s: Team) => [...s.groups].filter((g) => !g.quiet).sort((a, b) => b.waits.filter(counts).length - a.waits.filter(counts).length);
const seen = (s: Team, w: Wait) => isMaker(s) || w.kind === "approve";

export type WaitItem = { id: string; type: "wait"; g: Group; w: Wait; i: number };
export type Row = Inbox & { i: number; id: string };
export type Card = { id: string; type: "card"; fold: 0 | 1; k: string; xs: Row[]; need: boolean; close: boolean; i?: number; from?: string; h?: string; title?: string; src?: string; size?: string; free?: string; what?: string };
export type Item = WaitItem | Card | ExtOpen;

export function waitsAll(): WaitItem[] {
  const b = st(), s = team(), out: WaitItem[] = [];
  for (const g of sortedGroups(s)) g.waits.forEach((w, i) => { if (!w.more && counts(w) && seen(s, w)) out.push({ id: `w:${s.live ? "live" : b.s}:${g.id}:${i}`, type: "wait", g, w, i }); });
  return out;
}
/** Social's cards: people.html's rankInbox, each card and each row with an id; three of a kind (two requests) fold */
export function cardsAll(): Card[] {
  const b = st(), s = circle();
  // live, a row is named by its request (#1072's id), so an answer never lands on another after the list moves
  const tag = MODE === "live" ? "live" : b.f;
  const items: Row[] = s.inbox.map((x, i) => ({ ...x, i, id: `r:${tag}:${x.rid ?? i}` }));
  const kinds: Record<string, Row[]> = {};
  items.forEach((x) => (kinds[x.k] = kinds[x.k] || []).push(x));
  const cards: Card[] = [];
  for (const k in kinds) {
    const xs = kinds[k].sort((a, c) => (c.need ? 2 : 0) + (c.close ? 1 : 0) - ((a.need ? 2 : 0) + (a.close ? 1 : 0)));
    if (xs.length >= 3 || (k === "request" && xs.length >= 2)) cards.push({ fold: 1, k, xs, need: xs.some((x) => !!x.need), close: xs.some((x) => !!x.close), id: `c:${tag}:${k}`, type: "card" });
    else xs.forEach((x) => cards.push({ ...x, need: !!x.need, close: !!x.close, fold: 0, xs: [x], id: `c:${tag}:${x.rid ?? x.i}`, type: "card" }));
  }
  const score = (c: Card) => (c.need ? 100 : 0) + (c.close ? 10 : 0) + (c.k === "request" ? -50 : 0) - (c.i || 0) / 100;
  return cards.sort((a, c) => score(c) - score(a));
}
export const cardOpen = (c: Card) => !st().done.has(c.id) && c.xs.some((x) => !st().done.has(x.id));
/** the open ones, in the walk's order: the extra askers' (round 6, people/extra.ts), Cowork's waits, then Social's cards;
 *  a "later" goes to the end */
export function items(): Item[] {
  const b = st();
  const o: Item[] = [...extraAll().filter((x) => !b.done.has(x.id)), ...waitsAll().filter((x) => !b.done.has(x.id)), ...cardsAll().filter(cardOpen)];
  return o.map((x, n) => ({ x, n, l: b.later.get(x.id) || 0 })).sort((p, q) => p.l - q.l || p.n - q.n).map((p) => p.x);
}
export const count = () => items().length;
/** the sidebar's Needs you: the one count above "From people" (cv/core.ts above(): the canvas's asks and the extra
 *  askers') and the people's, each once (round 6 · F1) */
export const needsCount = () => above() + items().filter((x) => x.type !== "ext").length;
/** the badge kept per version of the data (the join, #1615): a pan or a zoom draws the plane, whose need words read the
 *  badge, every frame (S32); the queue is made again only when the data changed (render() and every move say so) */
let keptAt = -1, kept = 0;
export const needsCountKept = (): number => { const v = dataVer(); if (v !== keptAt) { kept = needsCount(); keptAt = v; } return kept; };
export const find = (id: string): Item | null => extraAll().find((x) => x.id === id) || waitsAll().find((x) => x.id === id) || cardsAll().find((x) => x.id === id) || null;
export const cardOfRow = (id: string) => cardsAll().find((c) => c.xs.some((x) => x.id === id)) || null;

// ---------------------------------------------------------------- one answer

/** the buttons that only go somewhere: they answer nothing */
export const NAV = /^(open|look|open the group|open it first|look one by one)$/i;
const short = (t: unknown) => String(t || "").replace(/\?$/, "").trim();
/** the diary line an answer writes, in the person's words */
export function line(id: string, said: string): { what: string; why: string | null } | null {
  const t = find(id), r = t ? null : cardOfRow(id), x = r && r.xs.find((y) => y.id === id);
  if (t && t.type === "ext") return t.ext.line(t, said);
  if (t && t.type === "wait") return { what: `You said “${said}”: ${short(me(t.w.text))}, in ${t.g.name}.`, why: t.w.from === "Your AI" ? null : `${t.w.from} asked` };
  const one = t && t.type === "card" && !t.fold ? t.xs[0] : x;
  if (one) { const k = KIND[one.k][0]; return { what: `You said “${said}” to ${one.from}: ${short(one.title || k)}.`, why: `${one.from} asked` }; }
  if (t && t.type === "card" && t.fold) return { what: `You said “${said}”: ${t.xs.filter((y) => !st().done.has(y.id)).length} ${KIND[t.k][1]}.`, why: "Social" };
  return null;
}
/** one answer: marks it, writes one diary line, and draws again (the count falls by one everywhere). "Later" sends it to
 *  the end of the walk, still counted */
export function answer(id: string, said = "Yes"): boolean {
  const b = st();
  if (b.done.has(id)) return false;
  const t = find(id) || cardOfRow(id);
  if (!t) return false;
  if (/^(later|keep waiting later)$/i.test(said)) { b.later.set(id, ++b.seq); if (b.focus === id) b.focus = null; render(); return true; }
  if (MODE === "live" && !(t.type === "ext") && t.type === "wait" && !(live.answer?.(t.g, t.w))) return false;
  // live, a Social card or row answers #1072's requests: the row's own, or each open row of a card answered whole
  if (MODE === "live" && t.type === "card") {
    const rows = t.id === id ? t.xs.filter((x) => !b.done.has(x.id)) : t.xs.filter((x) => x.id === id);
    if (!live.social?.answer(rows.map((x) => x.rid).filter((r): r is string => !!r), said)) return false;
  }
  const l = line(id, said);
  b.done.add(id);
  if (!(t.type === "ext") && t.type === "card" && t.id === id) t.xs.forEach((x) => b.done.add(x.id));   // a card answered whole answers its rows
  if (b.focus === id) b.focus = null;
  if (t.type === "ext") t.ext.done?.(t, said);
  if (l) note({ who: "person", kind: "decided", key: "people:" + id, what: l.what, why: l.why });
  render();
  return true;
}
/** a folded card opened or closed (the view's own state, kept in the book so ⌘J can open it) */
export function toggleOpen(id: string): void { const b = st(); if (b.open.has(id)) b.open.delete(id); else b.open.add(id); render(); }

// ---------------------------------------------------------------- the moves ↔ functions (P5)

export const FN: Record<string, string> = {
  see_groups: "C3", open_group: "C3 · C14", answer_wait: "C4 · C14 · C20", first_time: "C5", leave_group: "C26",
  see_social: "S2 · S5 · S11", open_friend: "FX6 · S7", see_as_friend: "N7", make_link: "FX5", pick_face: "S1",
  answer_card: "S11 · S13 · S10 · S9 · S4", make_close: "S6", next_wait: "S11 · C4",
};
/** the moves that touch Social: live they answer "not yet" until Social's wire is attached (cv/wire/social.ts) */
export const SOCIAL_MOVES = new Set(["see_social", "open_friend", "see_as_friend", "make_link", "pick_face", "answer_card", "make_close"]);

/** the pages a setup has: Cowork, each group and its first time, Social, each close friend and the first friend, the link,
 *  as a friend (counts 24 and 26) */
export function pagesOf(): string[] {
  const s = team(), so = circle(), out = ["cowork"];
  for (const g of s.groups) out.push("group:" + g.id);
  if (s.groups[0]) out.push("first:" + s.groups[0].id);
  out.push("social");
  const fr = so.friends.filter((f) => !f.waiting);
  const fs = [...fr.filter((f) => f.close).slice(0, 5), ...fr.filter((f) => !f.close).slice(0, 1)];
  for (const f of fs) out.push("friend:" + f.n);
  out.push("link", "asfriend");
  return out;
}
/** the diary lines the people wrote on this canvas (count 25 reads it through the stub until the diary's own book) */
export const diaryLines = () => noted();

/** the crumb on a people page (merge/shell.js top): "Cowork / Bio lab report", "Social / Maya / As a friend sees you" */
export function crumbOf(page: string | null | undefined): { id: string; label: string; act?: string }[] {
  const k = pk(page), a = parg(page), v = PEOPLE[k ?? ""];
  if (!v) return [];
  const seg: { id: string; label: string; act?: string }[] = [{ id: "page", label: v === "cowork" ? "Cowork" : "Social", act: `page:${v}` }];
  if (k === "group" || k === "first") {
    const s = team(), g = s.groups.find((x) => x.id === a) || sortedGroups(s)[0];
    if (g) seg.push({ id: "group", label: g.name, act: `page:group:${g.id}` });
    if (k === "first") seg.push({ id: "first", label: "First time" });
  }
  if (k === "friend" || k === "share" || (k === "asfriend" && a)) seg.push({ id: "friend", label: a, act: `page:friend:${a}` });
  if (k === "asfriend") seg.push({ id: "asfriend", label: "As a friend sees you" });
  if (k === "share") seg.push({ id: "share", label: "How you work" });
  if (k === "setup") seg.push({ id: "setup", label: "How a friend works" });
  if (k === "link") seg.push({ id: "link", label: "Make a link" });
  return seg;
}
