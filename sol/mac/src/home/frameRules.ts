// The frame (#630, freeform #629): the registry of places a thing may render into, in the spirit of a slot registry.
// The face declares a place (pane, card, sheet) and owns everything around a thing there: the edges, the
// padding, the title row, close, pin, the state (loading, broken, stale), the arrival and the exit (Frame.tsx). The thing
// owns only the inside. Declaring a place is claiming it: a thing asking for a place nobody declared is refused at load,
// and so is a second owner. A declaration unwinds when its owner goes. A thing that fails to render shows broken in its
// frame with the error and its line, never blank and never gone. Pure: no React, no css, so the tests read it as it is.
import { FRAME_PLACES, FIXED_COLOURS, type FramePlace, type ThingRecord, type ThingVersion, type FlowId, type Press } from "./meta.ts";

const owners = new Map<FramePlace, string>();
const subs = new Set<() => void>();
const told = () => subs.forEach((f) => f());

export class FrameError extends Error {}

/** the face declares a place it renders; the returned function takes the declaration back (on unmount) */
export function declarePlace(place: string, owner: string): () => void {
  if (!(FRAME_PLACES as readonly string[]).includes(place)) throw new FrameError(`"${place}" is not a place of the frame (${FRAME_PLACES.join(", ")})`);
  const p = place as FramePlace, had = owners.get(p);
  if (had && had !== owner) throw new FrameError(`the ${p} is declared by ${had}; ${owner} cannot declare it too`);
  owners.set(p, owner);
  told();
  return () => { if (owners.get(p) === owner) { owners.delete(p); told(); } };
}
export const declared = (): FramePlace[] => FRAME_PLACES.filter((p) => owners.has(p));
export const onPlaces = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** tests only: forget every declaration */
export const resetPlaces = () => { owners.clear(); told(); };

/** what the engine says of a thing's engine half, with the frame on (#633, engine/src/kernel.ts): loaded, none (a face
 *  only), or broken with its reason; the tools it registered for the seats; its last write, which the frame shows */
export type EngineHalf = { state: "none" | "loaded" | "broken"; why?: string; v?: number; tools: string[]; wrote?: { what: string; at: number } };
/** what the engine hands the face for one thing (GET /things, engine/src/things.ts) */
export type ThingWire = { id: string; record: unknown; ask: string | null; html: string | null; error?: string; engine?: EngineHalf };
/** the after-release card's pass (engine/src/release.ts passWire), on the same GET /things; null when no card is due */
export type ReleaseWire = { contract: number; at: string; moved: { id: string; from: number; renamed: string[] }[]; marked: { id: string; why: string }[] };
export type Loaded = { record: ThingRecord; html: string; engine?: EngineHalf };
export type Refused = { id: string; why: string };

const FLOWS: readonly FlowId[] = ["say", "pickup", "call", "answer", "know", "mine", "show", "team", "meet", "away"];
const strs = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** a record as written in the home, checked (pure): the record, or why it is not one */
export function checkRecord(raw: unknown, id: string, ask: string | null): { ok: true; record: ThingRecord } | { ok: false; why: string } {
  if (!isObj(raw)) return { ok: false, why: "record.json is not an object" };
  const r = raw;
  const no = (k: string, what: string) => ({ ok: false as const, why: `record.json: ${k} ${what}` });
  if (r.id !== undefined && r.id !== id) return no("id", `is "${String(r.id)}" but the folder is "${id}"`);
  if (typeof r.title !== "string" || !r.title.trim()) return no("title", "is missing");
  if (typeof r.place !== "string") return no("place", "is missing");
  if (typeof r.job !== "string" || !r.job.trim()) return no("job", "is missing (the same Meta a part of ours carries)");
  if (!FLOWS.includes(r.flow as FlowId)) return no("flow", `is not one of the ten flows (${FLOWS.join(", ")})`);
  if (!strs(r.states)) return no("states", "is not a list of words");
  if (!Array.isArray(r.keys) || !r.keys.every((k) => isObj(k) && typeof k.press === "string" && typeof k.does === "string")) return no("keys", "is not a list of { press, does }");
  if (!strs(r.listens)) return no("listens", "is not a list of words");
  if (!Number.isInteger(r.contract) || (r.contract as number) < 1) return no("contract", "is not the number it was made under");
  if (!strs(r.reads) || !strs(r.writes)) return no("reads and writes", "are not declared as lists");
  if (!Array.isArray(r.versions) || !r.versions.length || !r.versions.every((v) => isObj(v) && Number.isInteger(v.v) && typeof v.file === "string" && /^v\d+\.html$/.test(v.file) && typeof v.at === "string" && Number.isInteger(v.contract)))
    return no("versions", "is not a list of { v, file: vN.html, at, contract }");
  const current = r.current ?? Math.max(...(r.versions as ThingVersion[]).map((v) => v.v));
  if (!(r.versions as ThingVersion[]).some((v) => v.v === current)) return no("current", `names version ${String(current)}, which is not among its versions`);
  if (ask === null || !ask.trim()) return { ok: false, why: "ask.md is missing: a thing keeps its ask, verbatim" };
  return { ok: true, record: { ...(r as unknown as ThingRecord), id, keys: r.keys as Press[], current: current as number, ask } };
}

/** the things from the home, loaded against the places declared now (pure on its inputs): a thing whose record does
 *  not hold, or whose place is not declared, is refused here, at load, and never reaches a frame */
export function loadThings(wire: ThingWire[], places: readonly FramePlace[]): { loaded: Loaded[]; refused: Refused[] } {
  const loaded: Loaded[] = [], refused: Refused[] = [];
  for (const t of wire) {
    if (t.error) { refused.push({ id: t.id, why: t.error }); continue; }
    const c = checkRecord(t.record, t.id, t.ask);
    if (!c.ok) { refused.push({ id: t.id, why: c.why }); continue; }
    // a thing marked remake whose place the new contract dropped keeps its last version on screen: on Home, as a card
    const asked = c.record.place as string, gone = !!c.record.remake && !places.includes(asked as FramePlace) && places.includes("card");
    const p = gone ? "card" : asked;
    if (!(FRAME_PLACES as readonly string[]).includes(p)) { refused.push({ id: t.id, why: `asks for "${p}", which is not a place of the frame` }); continue; }
    if (!places.includes(p as FramePlace)) { refused.push({ id: t.id, why: `asks for the ${p}, which this face has not declared` }); continue; }
    const set = setsFixed(t.html ?? "");
    if (set.length) { refused.push({ id: t.id, why: `sets ${set.map((s) => `--${s}`).join(", ")}, a functional colour the contract fixes (${FIXED_COLOURS.join(", ")})` }); continue; }
    loaded.push({ record: c.record, html: t.html ?? "", ...(t.engine ? { engine: t.engine } : {}) });
  }
  return { loaded, refused };
}

// The face's mirror of the engine's css reading (engine/src/release.ts cssSpans, mapCode): the engine's file reads the
// disk and cannot be bundled into the face, so the parser is kept twice, and one fixture file (home/sets-fixed.json)
// is read by a test on each side to prove the same verdict (sets-fixed.test.ts here, after-release.test.ts there).
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CSS_RAW = new Set(["script", "style", "textarea", "title", "xmp", "noscript", "template"]);
/** the stretches of a face file that are css: each `<style>` body and each style attribute's value, quoted or not (pure) */
export function cssSpans(html: string): [number, number][] {
  const out: [number, number][] = [];
  const low = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) { const j = html.indexOf("-->", i + 4); i = j < 0 ? html.length : j + 3; continue; }
    const tag = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(i, i + 64));
    if (!tag) { i++; continue; }
    const name = tag[1].toLowerCase();
    let k = i + tag[0].length;
    while (k < html.length && html[k] !== ">") {
      const a = /^[\s/]*([^\s=>/"']+)(\s*=\s*("([^"]*)"|'([^']*)'|[^\s>"']*))?/.exec(html.slice(k));
      if (!a || !a[0].length) { k++; continue; }
      // quoted (style="…", style='…') or unquoted (style=--k:v): the value alone, its quotes left out
      const q = a[4] ?? a[5], v = q ?? a[3];
      if (a[1].toLowerCase() === "style" && v) {
        const at = k + a[0].length - (q !== undefined ? 1 : 0) - v.length;
        out.push([at, at + v.length]);
      }
      k += a[0].length;
    }
    i = Math.min(html.length, k + 1);
    if (CSS_RAW.has(name)) {
      const close = low.indexOf(`</${name}`, i);
      const stop = close < 0 ? html.length : close;
      if (name === "style") out.push([i, stop]);
      i = stop;
    }
  }
  return out;
}
/** a css text's code only, its comments and strings blanked out (pure) */
function cssCode(css: string): string {
  let out = "", i = 0, from = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      out += css.slice(from, i) + " ";
      const j = css.indexOf("*/", i + 2);
      i = from = j < 0 ? css.length : j + 2; continue;
    }
    if (ch === '"' || ch === "'") {
      out += css.slice(from, i) + " ";
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      i = from = Math.min(css.length, j + 1); continue;
    }
    i++;
  }
  return out + css.slice(from);
}

/** the fixed colours a thing's html sets, never only reads (pure): a `--error: …` declaration in its css (a `<style>`
 *  body or a style attribute), never one in its text, a comment, a script or a string. The rewriter will keep them at
 *  generation; until it exists, a thing that sets one is refused at load (#634) */
export function setsFixed(html: string, fixed: readonly string[] = FIXED_COLOURS): string[] {
  if (!fixed.length) return [];
  const re = new RegExp(`(?<![\\w-])--(${fixed.map(esc).join("|")})\\s*:`, "g");
  const set = new Set<string>();
  for (const [a, b] of cssSpans(html)) for (const m of cssCode(html.slice(a, b)).matchAll(re)) set.add(m[1]);
  return [...set];
}

export type FrameState = "loading" | "shown" | "broken" | "stale" | "remake";
export type Fault = { why: string; line: number | null };

/** a thing's state in its frame (pure): broken wins, then loading, then remake (marked at the first start after a
 *  release: it shows its last working version), then stale (made under an older contract) */
export function stateOf(o: { fault: Fault | null; loaded: boolean; made: number; contract: number | null; remake?: boolean }): FrameState {
  if (o.fault) return "broken";
  if (!o.loaded) return "loading";
  if (o.remake) return "remake";
  return o.contract !== null && o.made < o.contract ? "stale" : "shown";
}

/** a thing whose engine half broke at load shows broken in its frame with the engine's reason (pure; #633) */
export const engineFault = (e: EngineHalf | undefined): Fault | null => (e?.state === "broken" ? { why: e.why ?? "its engine half is broken", line: null } : null);
/** undo has somewhere to go: a version before the current one (pure; POST /things/:id/undo, #633) */
export const canUndo = (r: Pick<ThingRecord, "versions" | "current">): boolean => r.versions.some((v) => v.v < r.current);
/** the kinds of the log that can change GET /things (#691 step 3): a block loaded, broken, unloaded, written, its page
 *  or ask edited in place, a tool it registered after its load (plugin.*), an undo, a key. A seat's steps, a tool's call, the engine's own lines never do */
export const THINGS_KINDS = "plugin,undo,key";
/** one answer of GET /log (engine/src/log.ts logAnswer): `kinds` when the engine narrowed it (its switch log.kinds) */
export type LogLook = { off?: boolean; last?: number; events?: unknown[]; next?: number; kinds?: string[] };
/** what the frame does with one answer of the log, from the seq it last saw (pure; -1 before the first answer, -2 off):
 *  read /things again or not, the seq to ask from next, and whether to ask again at once (the page was cut there).
 *  A narrowed answer reads again only when it holds an event; one that was not (an engine with the switch off, or an
 *  older one) reads again whenever the log grew, as it always did. The first answer never reads: the frame read on mount */
export function logStep(last: number, j: LogLook | null): { read: boolean; last: number; more: boolean } {
  if (!j || j.off) return { read: false, last: -2, more: false };
  const top = j.last ?? 0;
  if (!j.kinds) return { read: last >= 0 && top > last, last: top, more: false };
  const more = typeof j.next === "number" && j.next > Math.max(0, last);
  return { read: last >= 0 && (j.events?.length ?? 0) > 0, last: more ? (j.next as number) : top, more };
}
/** with the narrow look, the slow read: once SLOW_MS have gone since the last read of /things, and only when the log grew
 *  since it (pure). What changes the things without a line of its own (the after-release card) comes with other lines,
 *  an engine's start among them; a log that did not move reads nothing, so a quiet window costs no reads */
export const slowDue = (o: { now: number; readAt: number; seqAtRead: number; last: number }, ms = 30000): boolean =>
  o.now - o.readAt >= ms && o.last > o.seqAtRead;
/** the frame's ask of the log from a seq: the first one (-1) asks the newest seq alone, which an engine without the
 *  narrow look reads as from the start, as before */
export const logAsk = (last: number): string => `since=${last < 0 ? -1 : last}&kinds=${THINGS_KINDS}`;

/** the write to show on the frame, while it is fresh (pure; the engine logs every write that passed the gate, #633) */
export const wroteNow = (e: EngineHalf | undefined, now: number, ms = 4000): string | null =>
  e?.wrote && now - e.wrote.at >= 0 && now - e.wrote.at < ms ? e.wrote.what : null;

const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const RAW = new Set(["script", "style", "textarea", "title"]);
// closed by the parser on its own: never a fault when one is left open
const OPTIONAL = new Set("html head body p li dt dd tr td th thead tbody tfoot option optgroup colgroup caption rb rt rp".split(" "));

/** the first place a thing's html is broken, with its line (pure): a tag or a comment that never closes, an element
 *  left open, an end tag that closes nothing. The browser would mend each silently; the frame says it instead. */
export function htmlFault(html: string): Fault | null {
  if (!html.trim()) return { why: "the thing is empty", line: 1 };
  // the line of an index, counted on from the last one asked (the scan only moves forward): linear, not per tag
  let at = 0, ln = 1;
  const lineAt = (i: number) => { if (i < at) { at = 0; ln = 1; } for (; at < i; at++) if (html.charCodeAt(at) === 10) ln++; return ln; };
  const open: { name: string; line: number }[] = [];
  let i = 0;
  while ((i = html.indexOf("<", i)) >= 0) {
    if (html.startsWith("<!--", i)) {
      const e = html.indexOf("-->", i + 4);
      if (e < 0) return { why: "a comment never closes", line: lineAt(i) };
      i = e + 3; continue;
    }
    if (html[i + 1] === "!" || html[i + 1] === "?") { const e = html.indexOf(">", i); if (e < 0) return { why: "a declaration never closes", line: lineAt(i) }; i = e + 1; continue; }
    const m = /^<(\/?)([a-zA-Z][\w-]*)/.exec(html.slice(i, i + 64));
    if (!m) { i++; continue; }
    // the tag's end, past any quoted attribute
    let j = i + m[0].length, q = "";
    // a quote opens a value only right after = (an unquoted value may hold an apostrophe: title=it's)
    for (; j < html.length; j++) { const c = html[j]; if (q) { if (c === q) q = ""; } else if ((c === '"' || c === "'") && /=\s*$/.test(html.slice(Math.max(i, j - 8), j))) q = c; else if (c === ">") break; }
    if (j >= html.length) return { why: `<${m[1]}${m[2]} never closes its tag`, line: lineAt(i) };
    const name = m[2].toLowerCase(), line = lineAt(i), self = html[j - 1] === "/";
    i = j + 1;
    if (m[1]) {
      const k = open.map((o) => o.name).lastIndexOf(name);
      if (k < 0) { if (VOID.has(name) || name === "p") continue; return { why: `</${name}> closes nothing`, line }; }   // a stray </p> is an empty p to a browser
      const left = open.slice(k + 1).find((o) => !OPTIONAL.has(o.name));
      if (left) return { why: `<${left.name}> from line ${left.line} is still open at </${name}>`, line };
      open.length = k;
      continue;
    }
    if (VOID.has(name) || self) continue;
    if (RAW.has(name)) {
      const re = new RegExp(`</${name}(?![\\w-])`, "ig"); re.lastIndex = i;
      const e = re.exec(html)?.index ?? -1;
      if (e < 0) return { why: `<${name}> never closes`, line };
      const end = html.indexOf(">", e);
      if (end < 0) return { why: `</${name} never closes its tag`, line: lineAt(e) };
      i = end + 1; continue;
    }
    open.push({ name, line });
  }
  const left = open.find((o) => !OPTIONAL.has(o.name));
  return left ? { why: `<${left.name}> is never closed`, line: left.line } : null;
}

/** the thing's document for its sandboxed frame (pure): the contract's variables and an error hook put in on the
 *  thing's own first line (after a doctype), so a runtime error's line is the line in the thing's file */
export function srcdoc(html: string, css: string, id: string): string {
  const flat = css.replace(/\s*\n\s*/g, " ");
  const hook = `<style>${flat}</style><script>addEventListener("error",function(e){parent.postMessage({solThing:${JSON.stringify(id)},why:String(e.message),line:e.lineno||null},"*")})</script>`;
  const dt = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return dt ? dt[0] + hook + html.slice(dt[0].length) : hook + html;
}

/** a list kept in this window (pins, closed): the id in or out (pure) */
export const flip = (xs: string[], id: string): string[] => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
/** the order on Home (pure): pinned first, in the order pinned; then the rest as they came */
export const ordered = <T extends { record: { id: string } }>(xs: T[], pins: string[]): T[] =>
  [...xs].sort((a, b) => (pins.includes(a.record.id) ? pins.indexOf(a.record.id) : 1e6) - (pins.includes(b.record.id) ? pins.indexOf(b.record.id) : 1e6));

/** what the after-release card says (pure): one line for what moved, one per thing marked remake, in plain words */
export function releaseLines(p: ReleaseWire): { head: string; moved: string | null; marked: string[] } {
  const renamed = [...new Set(p.moved.flatMap((m) => m.renamed))];
  const ids = p.moved.map((m) => m.id).join(", ");
  return {
    head: `Sol updated to contract ${p.contract}`,
    moved: p.moved.length ? `${p.moved.length === 1 ? "1 thing moved" : `${p.moved.length} things moved`} to contract ${p.contract}: ${ids}${renamed.length ? ` (${renamed.join(", ")})` : ""}` : null,
    marked: p.marked.map((m) => `${m.id}: marked remake, ${m.why}; its last version stays until it is remade`),
  };
}

/** the after-release card's press (#634), on the fetch it is given: the engine's answer read whole. `ok: false` is a
 *  refusal, kept with its reason on the card, never taken for a step done; so is a fetch that fails or a body that is
 *  not json. Only `ok: true` reads the home again (Frame.tsx) */
export async function pressRelease(what: "undo" | "close", base: string, get: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; why: string }> {
  let r: Response;
  try { r = await get(`${base}/things/release/${what}`, { method: "POST", cache: "no-store" }); }
  catch (e) { return { ok: false, why: `the engine did not answer (${(e as Error)?.message || "no answer"})` }; }
  const j = (await r.json().catch(() => null)) as { ok?: unknown; why?: unknown } | null;
  if (r.ok && j?.ok === true) return { ok: true };
  return { ok: false, why: typeof j?.why === "string" && j.why ? j.why : r.ok ? "no reason given" : `the engine answered ${r.status}` };
}
