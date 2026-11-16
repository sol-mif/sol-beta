// Cowork v3, slice 7 (fr-30, #560): one search. One field at the top of the front and of every room finds, in one
// project or in all of mine: items, loose things, artifacts (their titles and every word in them), Talk messages, trail
// events (who did what) and place titles. Everything is folded from the record and the trail, never kept on its own;
// the words of each thing are made once per change of the trail (cached by its last event) so a question on a thousand
// things answers in well under 50 ms. Ranking is simple and said here: every word asked must be found (the last one as
// the start of a word, as it is still being typed); a word in the title counts more than one in the body, a whole word
// more than its start, the whole question in the title most; then the kind (an item or an artifact before a trail line),
// then the newest.
import { foldArtifacts, textOf } from "./artifacts.js";
import type { By, Ev, Port, Rec } from "./trailport.js";

export type HitKind = "item" | "loose" | "artifact" | "talk" | "trail" | "place";
export const HIT_KINDS: HitKind[] = ["item", "artifact", "loose", "talk", "place", "trail"];
/** what one press opens: the room and the thing in it */
export type Open = { room: "plan" | "space" | "artifacts" | "talk" | "places" | "trail"; id?: string };
export type Doc = { kind: HitKind; id: string; project: string; title: string; body: string; whose: string; place: string; at: number; open: Open; by?: By; agent?: boolean };
export type Hit = Omit<Doc, "body"> & { score: number; line?: string };
export type Groups = { q: string; total: number; ms: number; groups: { kind: HitKind; hits: Hit[] }[] };

const WEIGHT: Record<HitKind, number> = { item: 1, artifact: 1, loose: 0.9, place: 0.9, talk: 0.8, trail: 0.5 };
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** the words of a text: lower case, accents off, split on anything not a letter or digit (pure) */
export const words = (s: string): string[] => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** a Talk message on the trail: Talk's own kinds (slice 5 writes "talk", "talk.message" or "message"), with its words */
export const isTalk = (e: Ev): boolean => (e.kind === "talk" || e.kind === "message" || e.kind.startsWith("talk.")) && !!talkText(e);
const talkText = (e: Ev): string => { const v = e.value as Record<string, unknown> | undefined; return v && typeof v === "object" ? str(v.text) || str(v.body) : typeof e.value === "string" ? e.value : ""; };

/** one trail event in words, as the trail's line says it: "marco changed title of Pricing" (pure) */
export function trailLine(e: Ev, titleOf: (id: string) => string): string {
  const who = e.by.agent ? `${e.by.person}'s agent` : e.by.person;
  const what = e.item ? titleOf(e.item) || e.item : "";
  if (e.kind === "artifact") { const v = e.value as Record<string, unknown> | undefined; return `${who} ${v?.note ? `brought ${v.note.toString().replace(/ again$/, "")} back of` : "wrote a version of"} ${what}`; }
  if (e.kind === "erase") return `${who} erased something`;
  if (isTalk(e)) return `${who} said in Talk`;
  const verb = e.field ? `changed ${e.field} of` : e.kind === "item" ? "wrote" : `wrote a ${e.kind}`;
  return `${who} ${verb} ${what}`.trim();
}

/** every searchable thing of one project, from its record and its trail (pure) */
export function docsOf(project: string, rec: Rec, events: Ev[]): Doc[] {
  const out: Doc[] = [];
  const titles = new Map<string, string>();
  const f = (o: { fields: Record<string, unknown> }, k: string) => str(o.fields[k]);
  for (const it of Object.values(rec.items)) {
    const title = f(it, "title") || it.id; titles.set(it.id, title);
    out.push({ kind: "item", id: it.id, project, title, body: [f(it, "state"), f(it, "date"), f(it, "note"), f(it, "whose")].join(" "),
      whose: f(it, "whose") || it.by.person, place: f(it, "place") || "record", at: it.updated, open: { room: "plan", id: it.id } });
  }
  for (const l of Object.values(rec.loose)) {
    const title = f(l, "title") || l.id; titles.set(l.id, title);
    out.push({ kind: "loose", id: l.id, project, title, body: [f(l, "kind"), f(l, "meta"), f(l, "text")].join(" "),
      whose: f(l, "whose") || l.by.person, place: f(l, "place") || "record", at: l.updated, open: { room: "space", id: l.id } });
  }
  for (const pl of Object.values(rec.places)) {
    const title = f(pl, "title") || f(pl, "label") || f(pl, "name") || pl.id; titles.set(pl.id, title);
    out.push({ kind: "place", id: pl.id, project, title, body: [f(pl, "kind"), f(pl, "url")].join(" "),
      whose: f(pl, "by") || pl.by.person, place: f(pl, "kind") || pl.id, at: pl.updated, open: { room: "places", id: pl.id } });
  }
  for (const { art, versions } of foldArtifacts(project, events).values()) {
    titles.set(art.id, art.title);
    const last = versions[versions.length - 1];
    out.push({ kind: "artifact", id: art.id, project, title: art.title, body: `${art.kind} ${textOf(art.kind, last.content)}`,
      whose: art.whose, place: art.place, at: art.updated, open: { room: "artifacts", id: art.id } });
  }
  for (const e of events) {
    if (isTalk(e)) {
      const v = (e.value ?? {}) as Record<string, unknown>;
      out.push({ kind: "talk", id: e.id, project, title: talkText(e).slice(0, 400), body: str(v.thread), whose: e.by.person, place: "talk", at: e.at,
        open: { room: "talk", id: str(v.thread) || e.item || e.id }, by: e.by, ...(e.by.agent ? { agent: true } : {}) });
    }
  }
  for (const e of events) {
    if (isTalk(e) || e.kind === "erase") continue;
    out.push({ kind: "trail", id: e.id, project, title: trailLine(e, (id) => titles.get(id) ?? ""), body: "", whose: e.by.person, place: "record", at: e.at,
      open: { room: "trail", id: e.item ?? e.id }, by: e.by, ...(e.by.agent ? { agent: true } : {}) });
  }
  return out;
}

type Indexed = { d: Doc; tw: string[]; bw: Set<string>; tl: string; bl: string };
const index = (docs: Doc[]): Indexed[] => docs.map((d) => {
  const tw = words(d.title), bw = words(`${d.body} ${d.whose}`);
  return { d, tw, bw: new Set(bw), tl: tw.join(" "), bl: bw.join(" ") };
});

/** a thing's score for the question's words, 0 when one word is not in it (pure) */
function scoreOf(x: Indexed, qw: string[], phrase: string): number {
  let s = 0;
  for (let i = 0; i < qw.length; i++) {
    const w = qw[i], last = i === qw.length - 1;
    if (x.tw.includes(w)) { s += 4; continue; }
    if (x.bw.has(w)) { s += 1.5; continue; }
    if (last || w.length > 2) {
      if (x.tw.some((t) => t.startsWith(w))) { s += 3; continue; }
      if (x.bl.includes(w)) { s += 1; continue; }
      if (x.tl.includes(w)) { s += 2; continue; }
    }
    return 0;
  }
  if (qw.length > 1 && x.tl.includes(phrase)) s += 3;
  if (x.tl === phrase) s += 2;
  return s * WEIGHT[x.d.kind];
}

/** the hits for a question, grouped by kind, a few of each (pure on the docs) */
export function query(docs: Indexed[] | Doc[], q: string, o: { per?: number; now?: () => number } = {}): Groups {
  const now = o.now ?? (() => performance.now()), t0 = now();
  const ix: Indexed[] = docs.length && "tw" in (docs[0] as object) ? docs as Indexed[] : index(docs as Doc[]);
  const qw = words(q).slice(0, 8), phrase = qw.join(" ");
  const per = o.per ?? 6;
  const by = new Map<HitKind, Hit[]>();
  let total = 0;
  if (qw.length && phrase.length >= 2) {
    for (const x of ix) {
      const score = scoreOf(x, qw, phrase);
      if (!score) continue;
      total++;
      const l = by.get(x.d.kind) ?? [];
      const { body: _b, ...rest } = x.d;
      l.push({ ...rest, score });
      by.set(x.d.kind, l);
    }
  }
  const groups = HIT_KINDS.filter((k) => by.has(k)).map((kind) => ({ kind, hits: by.get(kind)!.sort((a, b) => b.score - a.score || b.at - a.at).slice(0, per) }))
    .sort((a, b) => b.hits[0].score - a.hits[0].score || HIT_KINDS.indexOf(a.kind) - HIT_KINDS.indexOf(b.kind));
  return { q, total, ms: Math.round((now() - t0) * 100) / 100, groups };
}

// the words of each project, made once per change of its trail
const cache = new Map<string, { key: string; ix: Indexed[] }>();
/** one search in a project, or in every project on this Sol (project omitted) */
export function search(p: Port, q: string, o: { project?: string; projects?: string[]; per?: number } = {}): Groups {
  const t0 = performance.now();
  const projects = o.project ? [o.project] : o.projects ?? p.projects();
  const ix: Indexed[] = [];
  for (const project of projects) {
    const events = p.events(project);
    const key = `${events.length}:${events[events.length - 1]?.id ?? ""}`;
    let c = cache.get(project);
    if (!c || c.key !== key) { c = { key, ix: index(docsOf(project, p.record(project), events)) }; cache.set(project, c); }
    ix.push(...c.ix);
  }
  const r = query(ix, q, { per: o.per });
  return { ...r, ms: Math.round((performance.now() - t0) * 100) / 100 };
}
export const forgetSearch = () => cache.clear();
