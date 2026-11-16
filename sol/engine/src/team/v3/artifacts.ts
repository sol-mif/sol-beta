// Cowork v3, slice 7 (fr-30, #560): artifacts. What a person or their agent made that stays: a document, a page, a
// table, a canvas or a flow. Each is one thing on the trail (kind "artifact", item = its id) and each version is one
// event holding the whole of that version (its kind, title, where it lives and its content), so an edit is one event,
// the versions are the artifact's events in the trail's order, and nothing is ever overwritten: "back" (one gesture)
// writes the version before as a new version, and every dot is still there. Two Sols editing offline make two versions,
// both kept, in the trail's order. Opened on the stage from the room or from Home; exported in its own format.
import { randomUUID } from "node:crypto";
import { canonical, type By, type Ev, type Port } from "./trailport.js";

export const ART_KINDS = ["document", "page", "table", "canvas", "flow"] as const;
export type ArtKind = (typeof ART_KINDS)[number];
export const ART = "artifact";

export type Section = { h: string; p: string };
export type Shape = { k: "pill" | "sw" | "ring" | "note" | "mark"; x: number; y: number; w?: number; h?: number; s?: number; tone?: number; t?: string };
export type Content =
  | { sections: Section[] }                          // document
  | { hero: string; p: string; cards: string[] }     // page
  | { cols: string[]; rows: string[][] }             // table
  | { shapes: Shape[] }                              // canvas
  | { words: string; parts: string[] };              // flow: its words and the parts drawn

/** one version as the strip shows it */
export type ArtVersion = { v: number; event: string; by: By; at: number; title: string; note?: string; content: Content; waiting?: boolean };
/** an artifact as the shelf shows it: the two marks (whose, where), its kind and its last version */
export type Artifact = { id: string; project: string; kind: ArtKind; title: string; whose: string; place: string; version: number; by: By; at: number; updated: number };

type Value = { kind: ArtKind; title: string; place: string; content: Content; note?: string; from?: number };
const ID = /^a-[\w-]{1,60}$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v : "").slice(0, n);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isArtKind = (k: unknown): k is ArtKind => (ART_KINDS as readonly string[]).includes(String(k));

/** a content made whole for its kind: anything missing is empty, nothing unknown is kept (pure) */
export function cleanContent(kind: ArtKind, c: unknown): Content {
  const o = isObj(c) ? c : {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  switch (kind) {
    case "document": return { sections: list(o.sections).slice(0, 200).map((s) => ({ h: str(isObj(s) ? s.h : "", 200), p: str(isObj(s) ? s.p : "", 8000) })) };
    case "page": return { hero: str(o.hero, 300), p: str(o.p, 4000), cards: list(o.cards).slice(0, 24).map((x) => str(x, 300)) };
    case "table": {
      const cols = list(o.cols).slice(0, 40).map((x) => str(x, 200));
      return { cols, rows: list(o.rows).slice(0, 2000).map((r) => cols.map((_, i) => str(list(r)[i], 1000))) };
    }
    case "canvas": return { shapes: list(o.shapes).slice(0, 300).filter(isObj).map((s) => ({
      k: (["pill", "sw", "ring", "note", "mark"].includes(String(s.k)) ? s.k : "note") as Shape["k"],
      x: Math.max(0, Math.min(100, Number(s.x) || 0)), y: Math.max(0, Math.min(100, Number(s.y) || 0)),
      ...(typeof s.w === "number" ? { w: s.w } : {}), ...(typeof s.h === "number" ? { h: s.h } : {}), ...(typeof s.s === "number" ? { s: s.s } : {}),
      ...(typeof s.tone === "number" ? { tone: s.tone } : {}), ...(typeof s.t === "string" ? { t: s.t.slice(0, 300) } : {}) })) };
    case "flow": return { words: str(o.words, 2000), parts: list(o.parts).slice(0, 40).map((x) => str(x, 120)) };
  }
}

/** what a new artifact of a kind starts as (pure) */
export function blank(kind: ArtKind, title: string): Content {
  switch (kind) {
    case "document": return { sections: [{ h: "What it is", p: title }] };
    case "page": return { hero: title, p: "", cards: [] };
    case "table": return { cols: ["Thing", "Who", "When"], rows: [["", "", ""]] };
    case "canvas": return { shapes: [{ k: "note", x: 10, y: 12, t: title }] };
    case "flow": return { words: title, parts: [] };
  }
}

/** an artifact's words, for search: its title and every word in it (pure) */
export function textOf(kind: ArtKind, c: Content): string {
  const x = c as Record<string, unknown>;
  switch (kind) {
    case "document": return ((x.sections as Section[]) ?? []).map((s) => `${s.h} ${s.p}`).join(" ");
    case "page": return [x.hero, x.p, ...((x.cards as string[]) ?? [])].join(" ");
    case "table": return [...((x.cols as string[]) ?? []), ...((x.rows as string[][]) ?? []).flat()].join(" ");
    case "canvas": return ((x.shapes as Shape[]) ?? []).map((s) => s.t ?? "").join(" ");
    case "flow": return [x.words, ...((x.parts as string[]) ?? [])].join(" ");
  }
}

const valueOf = (e: Ev): Value | null => {
  const v = e.value;
  if (!isObj(v) || !isArtKind(v.kind)) return null;
  return { kind: v.kind, title: str(v.title, 200) || "untitled", place: str(v.place, 40) || "record", content: cleanContent(v.kind, v.content),
    ...(typeof v.note === "string" ? { note: v.note.slice(0, 120) } : {}), ...(typeof v.from === "number" ? { from: v.from } : {}) };
};

/** every artifact of a project with its versions, folded from the trail's artifact events (pure on the events) */
export function foldArtifacts(project: string, events: Ev[], waiting: (id: string) => boolean = () => false): Map<string, { art: Artifact; versions: ArtVersion[] }> {
  const out = new Map<string, { art: Artifact; versions: ArtVersion[] }>();
  for (const e of events) {
    if (e.kind !== ART || !e.item || e.project !== project) continue;
    const v = valueOf(e);
    if (!v) continue;   // an erased version: its content is gone, its place in the chain is not a version to show
    let a = out.get(e.item);
    if (!a) {
      a = { art: { id: e.item, project, kind: v.kind, title: v.title, whose: e.by.person, place: v.place, version: 0, by: e.by, at: e.at, updated: e.at }, versions: [] };
      out.set(e.item, a);
    }
    a.versions.push({ v: a.versions.length + 1, event: e.id, by: e.by, at: e.at, title: v.title, content: v.content, ...(v.note ? { note: v.note } : {}), ...(waiting(e.id) ? { waiting: true } : {}) });
    Object.assign(a.art, { title: v.title, place: v.place, version: a.versions.length, by: e.by, updated: e.at });
  }
  return out;
}

const ORDER: ArtKind[] = ["document", "page", "table", "canvas", "flow"];
const waitingOf = (p: Port, project: string) => { const ids = new Set(p.waiting(project).map((e) => e.id)); return (id: string) => ids.has(id); };

/** the shelf: a project's artifacts, by kind then latest first */
export function list(p: Port, project: string): (Artifact & { waiting?: boolean })[] {
  const w = waitingOf(p, project);
  return [...foldArtifacts(project, p.events(project), w).values()].map(({ art, versions }) => ({ ...art, ...(versions.some((x) => x.waiting) ? { waiting: true } : {}) }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.updated - a.updated);
}

/** one artifact and every version of it, or null */
export function get(p: Port, project: string, id: string): { art: Artifact; versions: ArtVersion[] } | null {
  return foldArtifacts(project, p.events(project), waitingOf(p, project)).get(id) ?? null;
}

/** a new artifact: version 1, one event */
export function make(p: Port, o: { project: string; by: By; kind: unknown; title: unknown; content?: unknown; place?: unknown }): { art: Artifact; versions: ArtVersion[]; event: Ev } {
  if (!isArtKind(o.kind)) throw new Error(`an artifact is a ${ART_KINDS.join(", ")}`);
  const title = str(o.title, 200).trim() || `a new ${o.kind}`;
  const content = o.content === undefined ? blank(o.kind, title) : cleanContent(o.kind, o.content);
  const id = `a-${randomUUID().slice(0, 12)}`;
  const event = p.append({ project: o.project, by: o.by, kind: ART, item: id, value: { kind: o.kind, title, place: str(o.place, 40) || "record", content } satisfies Value });
  return { ...get(p, o.project, id)!, event };
}

/** an edit: the content and/or the title changed is one new version (one event); an edit that changes nothing writes nothing */
export function edit(p: Port, o: { project: string; id: string; by: By; content?: unknown; title?: unknown; note?: string }): { art: Artifact; versions: ArtVersion[]; event: Ev | null } {
  const had = needed(p, o.project, o.id);
  const last = had.versions[had.versions.length - 1];
  const content = o.content === undefined ? last.content : cleanContent(had.art.kind, o.content);
  const title = o.title === undefined ? last.title : str(o.title, 200).trim() || last.title;
  if (canonical(content) === canonical(last.content) && title === last.title) return { ...had, event: null };
  const event = p.append({ project: o.project, by: o.by, kind: ART, item: o.id,
    value: { kind: had.art.kind, title, place: had.art.place, content, ...(o.note ? { note: o.note.slice(0, 120) } : {}) } satisfies Value });
  return { ...get(p, o.project, o.id)!, event };
}

/** one gesture back: the version before the last (or the one named) written again as a new version; nothing deleted */
export function back(p: Port, o: { project: string; id: string; by: By; to?: number }): { art: Artifact; versions: ArtVersion[]; event: Ev } {
  const had = needed(p, o.project, o.id);
  const n = had.versions.length;
  const to = o.to === undefined ? n - 1 : Math.floor(Number(o.to));
  if (n < 2 && o.to === undefined) throw new Error("there is no version before this one");
  if (!(to >= 1 && to <= n)) throw new Error(`no version ${o.to}: it has ${n}`);
  if (to === n) throw new Error("that is the version it is at");
  const from = had.versions[to - 1];
  const event = p.append({ project: o.project, by: o.by, kind: ART, item: o.id,
    value: { kind: had.art.kind, title: from.title, place: had.art.place, content: from.content, note: `v${to} again`, from: to } satisfies Value });
  return { ...get(p, o.project, o.id)!, event };
}

function needed(p: Port, project: string, id: string) {
  if (!ID.test(String(id))) throw new Error("which artifact?");
  const a = get(p, project, id);
  if (!a) throw new Error("no such artifact in this project");
  return a;
}

const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fileName = (t: string) => t.replace(/[^\w .-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "artifact";
/** an artifact in its own format: a document as Markdown, a page as HTML, a table as CSV, a canvas as JSON, a flow as its words (pure) */
export function exportOf(art: Pick<Artifact, "kind" | "title">, c: Content): { name: string; mime: string; text: string } {
  const x = c as Record<string, unknown>, n = fileName(art.title);
  switch (art.kind) {
    case "document": return { name: `${n}.md`, mime: "text/markdown", text: `# ${art.title}\n\n${((x.sections as Section[]) ?? []).map((s) => `## ${s.h}\n\n${s.p}\n`).join("\n")}` };
    case "page": return { name: `${n}.html`, mime: "text/html", text: `<!doctype html><meta charset="utf-8"><title>${esc(art.title)}</title><h1>${esc(String(x.hero ?? ""))}</h1><p>${esc(String(x.p ?? ""))}</p>${((x.cards as string[]) ?? []).map((k) => `<section>${esc(k)}</section>`).join("")}\n` };
    case "table": return { name: `${n}.csv`, mime: "text/csv", text: [x.cols as string[], ...((x.rows as string[][]) ?? [])].map((r) => (r ?? []).map(csv).join(",")).join("\n") + "\n" };
    case "canvas": return { name: `${n}.json`, mime: "application/json", text: JSON.stringify({ title: art.title, shapes: x.shapes }, null, 2) + "\n" };
    case "flow": return { name: `${n}.txt`, mime: "text/plain", text: `${x.words}\n\n${((x.parts as string[]) ?? []).join(" → ")}\n` };
  }
}
