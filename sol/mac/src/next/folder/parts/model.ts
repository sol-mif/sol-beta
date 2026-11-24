// A folder's parts (BR1 override 4, picked drawing mine/look/br1/folder.html): a folder's look is built from what Sol saw
// in it, never from a named kind. Each part is there because of one fact (dates in its files, a history of changes, a
// session open in it, names that recur, files opened once, a share of pictures), and says that fact in its corner. Files
// is the one part every folder has; at most four show, in the engine's order (P: how often the person would use each
// there, learned from their presses). A folder with no fact is plain. A part the person hid is gone, and in its place
// one line says why, their own fix, and a press brings it back. The engine half is P's (next.folder.look, to come); until
// it answers, a real Sol draws no parts and the dev page and tests read fixture.ts. Signed: marcocyl04-ux's agent
// (builder F), BR1 (#1615).
import type { Known } from "../../known.ts";

/** the parts a folder can have, in the drawing's words */
export type PartId = "files" | "coming" | "changed" | "working" | "with" | "read" | "photos";
export const PART_W: Record<PartId, string> = {
  files: "Files", coming: "Coming up", changed: "What changed", working: "Working now", with: "With", read: "To read", photos: "Photos",
};
/** one thing a part lists: what, and the small word beside it (a day, a length, when it changed) */
export type Item = { what: string; at?: string; piece?: string };
/** a fact Sol saw in a folder and the part it gives: its key (the because's), the sentence, its 2-6 grey words */
export type Seen = { part: Exclude<PartId, "files">; k: string; fact: string; words: string; items: Item[] };
/** how far a hide reaches: this folder, the folders shown the part for the same reason, every folder */
export type Reach = "here" | "these" | "everywhere";
/** a part the person hid, and how far */
export type Hid = { part: PartId; reach: Reach };
/** what the engine says of one folder's look */
export type Look = { order: PartId[]; seen: Seen[]; files: Item[]; hid?: Hid[] };

/** at most this many parts show */
export const MOST = 4;

/** what a folder shows: the parts in the engine's order, files always among them, at most MOST; the ones hidden by the
 *  person's own fix as absences; coming up always among them; plain when no fact gives a part */
export type Shown = { parts: Exclude<PartId, "files">[]; files: true; gone: Hid[]; plain: boolean };
export function shownOf(look: Look, hid: readonly Hid[] = look.hid ?? []): Shown {
  const off = new Map(hid.map((h) => [h.part, h] as const));
  const has = new Set(look.seen.map((s) => s.part));
  const rank = (p: PartId) => { const i = look.order.indexOf(p); return i < 0 ? look.order.length : i; };
  // coming up is always among them unless the person hid it (BR1 hold, #1615): the rest share what's left
  const on = [...has].filter((p) => !off.has(p)).sort((a, b) => rank(a) - rank(b));
  const keep = on.includes("coming") ? ["coming", ...on.filter((p) => p !== "coming").slice(0, MOST - 2)] : on.slice(0, MOST - 1);
  const parts = on.filter((p) => keep.includes(p));
  const gone = [...has].filter((p) => off.has(p)).sort((a, b) => rank(a) - rank(b)).map((p) => off.get(p)!);
  // plain: no fact gives a part, only a coming up with nothing dated
  const empty = (p: PartId) => p === "coming" && !look.seen.find((s) => s.part === p)?.items.length;
  return { parts, files: true, gone, plain: parts.every(empty) && gone.length === 0 };
}

/** where files sits among the shown parts: the engine's place for it, else last */
export function inOrder(look: Look, s: Shown): PartId[] {
  const all: PartId[] = [...s.parts, "files"];
  const i = look.order.indexOf("files");
  if (i < 0) return all;
  const before = s.parts.filter((p) => look.order.indexOf(p) < i && look.order.indexOf(p) >= 0);
  return [...before, "files", ...s.parts.filter((p) => !before.includes(p))];
}

/** a folder card's second line and its badge (BR1 conform #21, bar-folder.html #rest): the first part the folder shows
 *  that lists something, said as its first thing and its day ("Release · Fri", "login: check the token once · 2 h"), or
 *  in its own words where a thing alone says less ("2 AI chats open now"); a part with nothing listed says nothing here.
 *  due: a thing coming up today, while coming up is not hidden. No look: no line, no badge */
export function cardOf(look: Look | null | undefined): { line: string; due: boolean } {
  if (!look) return { line: "", due: false };
  const s = shownOf(look), seen = (p: PartId) => look.seen.find((x) => x.part === p);
  const due = s.parts.includes("coming") && !!seen("coming")?.items.some((i) => i.at === "today");
  for (const p of s.parts) {
    const x = seen(p);
    if (!x?.items.length) continue;
    if (p !== "coming" && p !== "changed") return { line: x.words, due };
    const i = x.items[0];
    return { line: i.at && i.at !== "now" ? `${i.what} · ${i.at}` : i.what, due };
  }
  return { line: "", due };
}

/** a part's fact as what Sol knows, so the because reads it like every other fact */
export const knownOf = (rid: string, s: Seen): Known => ({ k: s.k, fact: s.fact, source: "what Sol read here", by: "read", place: rid });

/** the absence's grey words: the person's own fix, said by how far it reached (plain words; the press beside them is
 *  "Show it again", BR1 card check) */
export const goneW = (h: Hid) => (h.reach === "here" ? "You hid it here." : h.reach === "these" ? "You hid it on folders like this." : "You hid it everywhere.");

/** the other folders shown this part for the same reason: the "these" of a hide */
export const sameAs = (looks: Readonly<Record<string, Look>>, rid: string, part: PartId) =>
  Object.keys(looks).filter((o) => o !== rid && looks[o].seen.some((s) => s.part === part));

/** a hide as kept: made in rid, reaching the folders in to ("these") or every folder; but: the folders it was brought
 *  back in, one press each, so bringing a part back in one folder leaves the others as the person hid them */
export type Hide = { rid: string; part: PartId; reach: Reach; to: string[]; but?: string[] };
/** the hides in effect for one folder: those made there, and those that reach it from "these" or "everywhere" */
export function hidIn(rid: string, hides: readonly Hide[]): Hid[] {
  const out = new Map<PartId, Hid>();
  for (const h of hides) if ((h.rid === rid || h.reach === "everywhere" || h.to.includes(rid)) && !h.but?.includes(rid)) out.set(h.part, { part: h.part, reach: h.reach });
  return [...out.values()];
}
/** a part brought back in one folder: the hide that took it there is lifted there only */
export const backIn = (rid: string, part: PartId, hides: readonly Hide[]): Hide[] =>
  hides.map((h) => (h.part === part && (h.rid === rid || h.reach === "everywhere" || h.to.includes(rid)) ? { ...h, but: [...(h.but ?? []), rid] } : h));
/** the hides a look arrives with (the engine's, or the fixture's), as kept ones */
export const hidesOf = (looks: Readonly<Record<string, Look>>): Hide[] =>
  Object.entries(looks).flatMap(([rid, l]) => (l.hid ?? []).map((h) => ({ rid, part: h.part, reach: h.reach, to: h.reach === "these" ? sameAs(looks, rid, h.part) : [] })));
