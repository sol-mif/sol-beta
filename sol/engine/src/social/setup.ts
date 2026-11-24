// Share a setup (BR1 meta part 5, scene 8, #1615): how a person works, as a card a friend can take, all or in parts.
// The card is drawn from this Sol: each Home folder by its name with its open stickies by their titles, and each take
// the person set on a fit everywhere ("~", next/fits.ts). Never a sticky's words or notes, never a session, never what
// Sol knows about the person (next.you, a folder's facts): those are not read here at all. The person picks what goes.
// It travels the way friends do (social/friends.ts): the card is one file in the friend room of the two, under
// `.sol/setup/<login>.json`, through the cloud's own files route (sol/cloud rooms.ts), so no new room and no new server.
// The friend's Sol reads the cards in its friend rooms; taking one is a workspace change (next/workspace.ts) proposed
// with the source "from <name>" and kept at once (the card was the preview), plus each fit set by the person with the
// same source; Back is that change's undo and each fit's Back. Pure over its deps, so the tests walk it with invented
// people and a stand-in cloud. Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as St from "../agent/stickies.js";
import { back as fitBack, fitsAt, personSet } from "../next/fits.js";
import { discard, keep, propose, undo } from "../next/workspace.js";
import { api, readFriends, said, SIGN_IN, type FriendsDeps } from "./friends.js";

/** one part of a card: a Home folder and its open stickies' titles, or a take on a fit everywhere */
export type Part =
  | { id: string; kind: "place"; name: string; pieces: string[] }
  | { id: string; kind: "fit"; knob: string; take: string };
export type Card = { v: 1; from: string; at: number; parts: Part[] };
/** a card in a friend room as this Sol reads it: the room, the file's version (what Take takes) and who it is from */
export type Got = Card & { code: string; sha: string };

export const DIR = ".sol/setup/";
/** a card is small: 64 KB at most, as the cloud's goal files are */
export const MAX = 64 * 1024;
const PLACES = 40, PIECES = 60;
const NOT_HOME = new Set(["next", "node_modules"]);
const clean = (v: unknown, max = 160) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const fileOf = (login: string) => `${DIR}${login.toLowerCase()}.json`;

/** the card this Sol could give, every part (pure over the disk; nothing written) */
export function draft(home: string, from = "", now = Date.now()): Card {
  const parts: Part[] = [];
  let dirs: string[] = [];
  try { dirs = readdirSync(home, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".") && !NOT_HOME.has(e.name)).map((e) => e.name).sort(); } catch { /* no home: no places */ }
  for (const name of dirs) {
    if (!existsSync(join(home, name, St.FILE))) continue;
    // titles only: a sticky's words (s) and its notes (what its agent did, its due) never leave
    const pieces = St.read(join(home, name)).items.filter((m) => !m.done).map((m) => clean(St.keyOf(m.t))).filter(Boolean).slice(0, PIECES);
    parts.push({ id: `p:${name}`, kind: "place", name: clean(name, 80), pieces });
    if (parts.length >= PLACES) break;
  }
  for (const f of fitsAt(home)) if (f.scope === "~" && f.author === "person" && f.take) parts.push({ id: `f:${f.knob}`, kind: "fit", knob: f.knob, take: clean(f.take) });
  return { v: 1, from, at: now, parts };
}

/** a card as read from a friend room: only the shapes above, every string cut to size; null when it is not one */
export function cardOf(v: any): Card | null {
  if (!v || v.v !== 1 || !Array.isArray(v.parts)) return null;
  const parts: Part[] = [];
  for (const p of v.parts.slice(0, PLACES + 40)) {
    if (p?.kind === "place" && clean(p.name, 80)) parts.push({ id: `p:${clean(p.name, 80)}`, kind: "place", name: clean(p.name, 80), pieces: (Array.isArray(p.pieces) ? p.pieces : []).map((x: unknown) => clean(x)).filter(Boolean).slice(0, PIECES) });
    else if (p?.kind === "fit" && /^[a-z][a-z0-9._-]{0,79}$/i.test(String(p.knob ?? "")) && clean(p.take)) parts.push({ id: `f:${p.knob}`, kind: "fit", knob: p.knob, take: clean(p.take) });
  }
  return { v: 1, from: clean(v.from, 60), at: Number(v.at) || 0, parts };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: unknown) => { try { return JSON.parse(Buffer.from(String(s), "base64").toString("utf8")); } catch { return null; } };

/** the card's picked parts written into the friend room of `code`, over the one this person put there before */
export async function send(d: FriendsDeps, home: string, code: unknown, picks: unknown): Promise<{ ok: true; sent: number; to: string } | { ok: false; why: string }> {
  const hub = d.hub(), me = hub ? d.login(hub) : null;
  if (!hub || !me) return { ok: false, why: SIGN_IN };
  const f = readFriends(d.file).find((x) => x.code === String(code ?? "").toUpperCase());
  if (!f) return { ok: false, why: "not a friend here" };
  const want = new Set(Array.isArray(picks) ? picks.map(String) : []);
  const card = draft(home, me, d.now());
  card.parts = card.parts.filter((p) => want.has(p.id));
  if (!card.parts.length) return { ok: false, why: "pick at least one part to give" };
  const body = JSON.stringify(card);
  if (Buffer.byteLength(body) > MAX) return { ok: false, why: "that card is too big to give: pick fewer parts" };
  const path = fileOf(me);
  const list = await api(d, f.hub, "GET", `/rooms/${f.code}/files`);
  if (!list || list.status !== 200) return { ok: false, why: said(list) };
  const had = (Array.isArray(list.v?.files) ? list.v.files : []).find((x: any) => x?.path === path)?.sha;
  const r = await api(d, f.hub, "PUT", `/rooms/${f.code}/files?path=${encodeURIComponent(path)}`, { content: b64(body), ...(had ? { sha: had } : {}) });
  if (!r || r.status !== 200) return { ok: false, why: said(r) };
  const to = /^Friend · (.+?) · /.exec(f.name)?.[1];
  return { ok: true, sent: card.parts.length, to: f.mine ? "your friend" : (to ?? "your friend") };
}

/** every card a friend put in a friend room of ours (never my own) */
export async function cards(d: FriendsDeps): Promise<{ ok: true; cards: Got[] } | { ok: false; why: string }> {
  const hub = d.hub(), me = hub ? d.login(hub) : null;
  if (!hub || !me) return { ok: false, why: SIGN_IN };
  const mine = fileOf(me), out: Got[] = [];
  for (const f of readFriends(d.file)) {
    const list = await api(d, f.hub, "GET", `/rooms/${f.code}/files`);
    if (!list || list.status !== 200) continue;
    for (const x of Array.isArray(list.v?.files) ? list.v.files : []) {
      if (typeof x?.path !== "string" || !x.path.startsWith(DIR) || !x.path.endsWith(".json") || x.path === mine || Number(x.size) > MAX) continue;
      const r = await api(d, f.hub, "GET", `/rooms/${f.code}/files?path=${encodeURIComponent(x.path)}`);
      const c = r?.status === 200 ? cardOf(unb64(r.v?.file?.content)) : null;
      // a card says whose it is only by the file it sits in: the login of the person who wrote it, never what it claims
      if (c) out.push({ ...c, from: clean(r!.v.file.by, 60) || c.from, code: f.code, sha: String(r!.v.file.sha ?? x.sha ?? "") });
    }
  }
  return { ok: true, cards: out };
}

/** what a take did, for Back: the workspace change it kept and the fits it set */
export type Took = { plan?: string; fits: string[]; made: number; from: string };

/** the parts picked of a card, as one workspace change (Home folders and their stickies) and the fits (pure over home) */
export function specOf(home: string, card: Card, picks: ReadonlySet<string>): { spec: any | null; fits: Extract<Part, { kind: "fit" }>[] } {
  const ops: any[] = [];
  const why = `from ${card.from}'s setup`;
  card.parts.filter((p) => picks.has(p.id)).forEach((p, i) => {
    // a friend's card names a folder in this home: one plain name, never a path, a hidden folder or the engine's own
    if (p.kind !== "place" || /[\\/›]/.test(p.name) || p.name.startsWith(".") || NOT_HOME.has(p.name)) return;
    const there = St.dirIn(home, p.name);
    const has = new Set(there ? St.read(there).items.map((m) => St.keyOf(m.t)) : []);
    // made beside, never over: a title the folder has already stays the person's own
    const items = p.pieces.filter((t) => !has.has(t));
    if (!there) ops.push({ key: `f${i}`, op: "create_folder", type: "home", name: p.name, reason: why });
    if (items.length) ops.push({ key: `p${i}`, op: "create_piece", kind: "checklist", name: p.name, region: there ? p.name : `$f${i}`, items, reason: why });
  });
  const fits = card.parts.filter((p): p is Extract<Part, { kind: "fit" }> => p.kind === "fit" && picks.has(p.id));
  return { spec: ops.length ? { title: `How ${card.from} works`, reason: `${card.from} gave you how they work; you took ${ops.length === 1 ? "this" : "these"}.`, operations: ops } : null, fits };
}

/** take a card, all of it or the picked parts: the folders and stickies as one kept workspace change "from <name>",
 *  each fit set as the person's own with the same source. All or none for the change; a fit refused is left out */
export async function take(d: FriendsDeps, home: string, code: unknown, sha: unknown, picks: unknown, now = Date.now()): Promise<({ ok: true } & Took) | { ok: false; why: string }> {
  const got = await cards(d);
  if (!got.ok) return got;
  const card = got.cards.find((c) => c.code === String(code ?? "").toUpperCase() && (!sha || c.sha === sha));
  if (!card) return { ok: false, why: "that card changed or is gone: open it again" };
  const want = new Set(Array.isArray(picks) && picks.length ? picks.map(String) : card.parts.map((p) => p.id));
  const { spec, fits } = specOf(home, card, want);
  if (!spec && !fits.length) return { ok: false, why: "you have all of that already" };
  const source = `from ${card.from}`;
  let plan: string | undefined, made = 0;
  if (spec) {
    const p = propose(home, spec, source, now);
    if (!p.ok) return p;
    const k = keep(home, p.plan.id, { revision: p.plan.revision }, now);
    if (!k.ok) { discard(home, p.plan.id, now); return k; }
    plan = k.plan.id;
    made = (k.plan.applied?.made ?? []).filter((m) => m.kind === "sticky").length;
  }
  const set: string[] = [];
  for (const f of fits) if (personSet(home, { knob: f.knob, scope: "~", take: f.take, source }, now).ok) set.push(f.knob);
  return { ok: true, plan, fits: set, made: made + set.length, from: card.from };
}

/** Back on a take: its workspace change undone and each fit it set taken back (a fit's Back holds it, as any Back does) */
export function backTake(home: string, plan: unknown, fits: unknown, now = Date.now()): { ok: true } | { ok: false; why: string } {
  if (typeof plan === "string" && plan) { const u = undo(home, plan, now); if (!u.ok) return u; }
  for (const knob of Array.isArray(fits) ? fits.map(String) : []) fitBack(home, { knob, scope: "~" }, now);
  return { ok: true };
}
