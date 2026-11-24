// The move-in's sort, kept after it (BR1, #1615; mine/look/br1/migration.html D, Marco 16:30: "As you add more, I'll offer
// to sort it the same way. You can also ask me any time: 'tidy my folders'"). Folders that arrive after the move-in are
// judged by the move-in's own judge (movein-place.ts judge) and offered the same three moves, each said once for all its
// folders: group (two or more read one rules file above them), inside (it sits inside another on disk), the Archive (used
// on one day only, tied to nothing; the kind is "shelf" inside, never a word on the face, Marco 14:51). Nothing here
// judges a folder itself, by a name, a kind or a list.
//   offersOf(w, judged, kept, {all?})   read only: the moves to offer, of two kinds of folder, neither placed, moved or
//                                       answered by the person, nor removed: one new to Sol (in the read, not kept: the
//                                       canvas does not draw it yet), offered only into a folder the person keeps, its
//                                       yes keeping it; and one kept whose judgment is not the one the move-in already
//                                       weighed (considered: a folder used on one day only has had its week since). An
//                                       offer answered no or undone is not offered again (all: the person asked, so it
//                                       is). The offer carries its because: what Sol saw, and the keys of the move-in's
//                                       placements of the same reading and of a yes before
//   considered(home, judged, keep)      what each kept folder was judged when the move-in placed (next.movein.keep), so a
//                                       move the person changed back there is never offered again for the same reason
//   needOf(o, i)                        an offer as one need on next.needs (needs.ts Need), tier other: the folder's
//                                       one raise carries it, judged like any other raise (builder J's care)
//   runOffer(w, judged, o, by)          yes: the move made, its placements under one batch (movein-place.ts keepPlaces),
//                                       one answer line ("Sort them"); declineOffer(w, o) no: one answer line ("Leave
//                                       them"); undoOffer(w, {id, batch?}) Undo: the batch's placements out (the offer's
//                                       last yes when no batch is said), one undo line
// Each yes, no and Undo is one scoped line in what Sol knows (you-known.ts noteFix, with the batch the Undo needs): how
// "answer" (now SORT or LEAVE, as builder J's meter reads every raise) or "undo", its place the folder the raise sits on,
// its reason "ask:<offer id>", what the next offer reads. The raise's own later and pass lines are not the sort's.
// Signed: marcocyl04-ux's agent (builder T), BR1 (#1615).
import { join } from "node:path";
import { nextDir, readJson, writeJson } from "./file.js";
import { keepPlaces, type Judged } from "./movein-place.js";
import { keepMoveIn, type MoveInKept } from "./movein.js";
import { noteFix, readStore, samePlace, unplace, type FixLine, type Placed } from "./you-known.js";
import type { Where } from "./you.js";

export type Kind = "group" | "inside" | "shelf";
export type Fold = { folder: string; name: string };
/** one move to offer: its id ("o:<kind>:<to>"), the folders it takes, where they go ("shelf" for the Archive), the folder
 *  whose raise carries it (piece), the question, what Sol saw and why (one sentence), and the keys it rests on */
export type Offer = { id: string; kind: Kind; to: string; toName: string; folders: Fold[]; piece: string; words: string; done: string; why: string; because: string[] };

const READING: Record<string, Kind> = { rules: "group", inside: "inside", "one-day": "shelf" };
/** the two answers, as the raise's buttons say them (needOf yes and no) */
export const SORT = "Sort them", LEAVE = "Leave them", ASKED = "you asked: tidy my folders";
/** a line of the sort's own: a yes (answer, not LEAVE), or a no (answer LEAVE, or an Undo) */
const isYes = (f: FixLine) => f.how === "answer" && f.now !== LEAVE;
const isNo = (f: FixLine) => (f.how === "answer" && f.now === LEAVE) || f.how === "undo";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** a few names said whole ("api, web and cli"), more as a count */
export const namesOf = (fs: readonly Fold[]) => (fs.length <= 3 ? fs.map((f) => f.name).join(", ").replace(/, ([^,]*)$/, " and $1") : plural(fs.length, "new folder"));
/** where a move puts its folders, in the person's words */
const whereOf = (o: Pick<Offer, "kind" | "toName">) => (o.kind === "shelf" ? "archived" : o.kind === "group" ? `grouped in ${o.toName}` : `inside ${o.toName}`);
/** the line's `what`: the folders and where the move puts them ("api and web inside acme") */
export const whatOf = (o: Pick<Offer, "kind" | "toName" | "folders">) => `${namesOf(o.folders)} ${whereOf(o)}`;

const tidyFile = (home: string) => join(nextDir(home), "tidy.json");
/** what the move-in weighed: each kept folder's reading when it was placed (null: none then) */
export function weighed(home: string): Record<string, string | null> | null {
  const { data } = readJson(tidyFile(home));
  return data.seen && typeof data.seen === "object" && !Array.isArray(data.seen) ? (data.seen as Record<string, string | null>) : null;
}
/** next.movein.keep weighed these: every kept folder's reading now, written whole (a move-in read again weighs again) */
export function considered(home: string, judged: readonly Judged[], keep: readonly string[], now = Date.now()): void {
  const by = new Map(judged.map((j) => [j.folder, j.reading])), seen: Record<string, string | null> = {};
  for (const f of keep) if (/^[wh]:./.test(f)) seen[f] = by.get(f) ?? null;
  writeJson(tidyFile(home), { v: 1, at: now, seen });
}

/** the moves to offer now (read only) */
export function offersOf(w: Where, judged: readonly Judged[], kept: MoveInKept | null, o: { all?: boolean } = {}): Offer[] {
  if (!kept) return [];   // not moved in yet: the move-in sorts everything first
  const s = readStore(w.sol), keep = new Set(kept.keep), out = new Set(kept.drop), placed = new Set(s.placed.map((p) => p.folder));
  // a home moved in before this was kept: what it keeps now is what its move-in weighed
  const seen = weighed(w.sol) ?? Object.fromEntries(kept.keep.map((f) => [f, judged.find((j) => j.folder === f)?.reading ?? null]));
  // the person moved it, or answered something about it: theirs, never Sol's to offer (the offers' own lines aside)
  const touched = (f: string) => s.fixes.some((x) => x.place && !x.reason?.startsWith("ask:o:") && samePlace(x.place, f));
  const fresh = judged.filter((j) => {
    if (!j.reading || !j.why || !READING[j.reading] || out.has(j.folder) || placed.has(j.folder) || touched(j.folder)) return false;
    if (j.parent && (out.has(j.parent.folder) || s.placed.some((p) => p.folder === j.parent!.folder && p.to === "shelf"))) return false;
    if (keep.has(j.folder)) return seen[j.folder] !== j.reading;
    return READING[j.reading] !== "shelf" && !!j.parent && keep.has(j.parent.folder);   // new: only into a folder on the canvas
  });
  const byKey = new Map<string, Judged[]>();
  for (const j of fresh) {
    const k = READING[j.reading!], key = `o:${k}:${k === "shelf" ? "shelf" : j.parent!.folder}`;
    byKey.set(key, [...(byKey.get(key) ?? []), j]);
  }
  const offers: Offer[] = [];
  for (const [id, js] of byKey) {
    const kind = READING[js[0].reading!], to = kind === "shelf" ? "shelf" : js[0].parent!.folder, toName = kind === "shelf" ? "the Archive" : js[0].parent!.name;
    // the sort's own lines only: the raise's later and pass lines for the same ask never answer the move
    const lines = s.fixes.filter((f) => f.reason === `ask:${id}` && (isYes(f) || isNo(f))), last = lines[lines.length - 1];
    if (!o.all && last && isNo(last)) continue;   // said no, or undid it: not offered again
    const folders = js.map((j) => ({ folder: j.folder, name: j.name }));
    const before = s.placed.filter((p) => p.to === to && READING[p.reading] === kind && p.by !== "person");
    const yes = s.fixes.filter((f) => isYes(f) && f.reason?.startsWith(`ask:o:${kind}:`));
    offers.push({
      id, kind, to, toName, folders,
      piece: kind !== "shelf" && keep.has(to) ? to : folders[0].folder,
      words: questionOf(kind, folders, toName), done: doneOf(kind, folders, toName),
      why: whyOf(kind, js, toName, before, yes),
      because: [...before.map((p) => `placed:${p.folder}`), ...yes.slice(-3).map((f) => `fix:${f.id}`)],
    });
  }
  return offers;
}

function questionOf(kind: Kind, fs: Fold[], toName: string): string {
  const n = namesOf(fs);
  return kind === "group" ? `Group ${n} into ${toName}, the way your move-in sorted?`
    : kind === "inside" ? `Put ${n} inside ${toName}, the way your move-in sorted?`
      : `Archive ${n}, the way your move-in sorted? Nothing is deleted.`;
}
/** what the yes did, for its line with Undo */
function doneOf(kind: Kind, fs: Fold[], toName: string): string {
  const n = namesOf(fs), one = fs.length === 1;
  return kind === "group" ? `I grouped ${n} into ${toName}.` : kind === "inside" ? `${n[0].toUpperCase()}${n.slice(1)} ${one ? "is" : "are"} inside ${toName} now.` : `I archived ${n}. Nothing is deleted.`;
}
/** the because in one sentence: what Sol saw, and what it rests on (the move-in did the same; a yes before) */
function whyOf(kind: Kind, js: Judged[], toName: string, before: Placed[], yes: FixLine[]): string {
  const one = js.length === 1;
  const saw = kind === "group" ? `${one ? "it follows" : "they follow"} the ${js[0].parent?.file ?? "rules file"} in ${toName}`
    : kind === "inside" ? `on your disk ${one ? "it already sits" : "they already sit"} inside ${toName}`
      : one ? js[0].why! : "each was changed on one day only, and three in four of your folders were used more";
  const rest = [before.length ? `I put ${namesOf(before.map((p) => ({ folder: p.folder, name: p.name })))} ${kind === "shelf" ? "away" : `in ${toName}`} the same way before` : "",
    yes.length ? "you said yes to this sort before" : ""].filter(Boolean);
  return `${saw[0].toUpperCase()}${saw.slice(1)}${rest.length ? `, and ${rest.join("; ")}` : ""}.`;
}

/** an offer as one need on next.needs, tier other (needs.ts TIER.other), after the `after`th of that tier */
export function needOf(o: Offer, after = 0) {
  return { id: o.id, piece: o.piece, words: o.words, kind: "code" as const, yes: SORT, no: LEAVE, serious: false, due: null,
    rank: Math.round((6 + Math.min(after, 99) * 0.01) * 100) / 100, why: o.why, ...(o.because.length ? { because: o.because } : {}),
    offer: { kind: o.kind, to: o.to, folders: o.folders.map((f) => f.folder) } };
}

/** yes (the raise's Sort them, or "tidy my folders" in the bar, by "bar"): the move made, its placements under one batch,
 *  one answer line */
export function runOffer(w: Where, judged: readonly Judged[], o: Offer, by: "raise" | "bar" = "raise", now = Date.now()) {
  const ids = new Set(o.folders.map((f) => f.folder));
  keepMoveIn(w.sol, { keep: [...ids] }, now);   // a folder new to Sol is kept, so the canvas draws it where it went
  const { batch, placed } = keepPlaces(w, judged.filter((j) => ids.has(j.folder)), [...ids], now);
  if (!placed.length) return { ok: false as const, why: "nothing of that sort is left to move" };
  noteFix(w, { how: "answer", what: whatOf(o), place: o.piece, reason: `ask:${o.id}`, now: by === "bar" ? ASKED : SORT, batch }, now);
  return { ok: true as const, id: o.id, batch, placed, done: o.done, what: whatOf(o) };
}
/** no (the raise's Leave them): one answer line; the same offer is not made again */
export function declineOffer(w: Where, o: Offer, now = Date.now()) {
  noteFix(w, { how: "answer", what: whatOf(o), place: o.piece, reason: `ask:${o.id}`, now: LEAVE }, now);
  return { ok: true as const, id: o.id };
}
/** Undo of a yes: that batch's placements out (a sort's, never the move-in's; no batch: the offer's last yes still
 *  placed), one undo line */
export function undoOffer(w: Where, a: { batch?: unknown; id?: unknown }, now = Date.now()) {
  const id = typeof a.id === "string" ? a.id : "", s = readStore(w.sol), placed = new Set(s.placed.map((p) => p.batch));
  const yeses = s.fixes.filter((f) => isYes(f) && f.reason === `ask:${id}` && !!f.batch);
  const yes = typeof a.batch === "string" ? yeses.find((f) => f.batch === a.batch) : yeses.filter((f) => placed.has(f.batch)).at(-1);
  const batch = yes?.batch ?? "";
  if (!id.startsWith("o:") || !yes) return { ok: false as const, why: "no sort of that batch was made" };
  const out = unplace(w, { batch });
  if (!out.length) return { ok: false as const, why: "that sort is undone already" };
  noteFix(w, { how: "undo", what: yes.what, place: yes.place ?? out[0].folder, reason: `ask:${id}`, batch }, now);
  return { ok: true as const, id, batch, undone: out.map((p) => p.folder) };
}
