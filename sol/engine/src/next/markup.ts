// Mark up (BR1, #1615; the BR1 design of 2026-11-22 ~00:20, mine/look/br1/customize.html "Point at it moves to the chat
// bar"): the person presses things in Sol itself, a folder or a piece, and types a few words on each; the marks ride in
// the message. Here each mark is read into what the session is told: which thing it is (its id, kind, name and folder),
// the person's words, and what Sol knows of it: the one store's lines at that place (next.known) and the facts its parts
// show (next.folder.look), a few each. A piece is known by its folder. Read only: nothing is written, nothing is sent;
// the face sends the text as its message (work.say). Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { knownNow, samePlace } from "./you-known.js";
import type { Where } from "./you.js";
import { looksOf } from "./look.js";

export type Kind = "folder" | "piece" | "session";
/** a mark as the face sends it: the thing pressed and the words on it */
export type Mark = { thing: string; words: string; kind: Kind; name: string; in: string | null; session?: string };
/** a mark with what Sol knows of its thing (of its folder, for a piece) */
export type Marked = Mark & { knows: string[] };

export const MAX_MARKS = 12;
export const MAX_KNOWS = 4;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const lastOf = (id: string) => id.replace(/^[wh]:/, "").replace(/\/+$/, "").split("/").pop() || id;

/** one mark from the face, or null when it names no thing */
export function markOf(v: unknown): Mark | null {
  const m = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const thing = clean(m.thing, 1000);
  if (!thing) return null;
  const kind: Kind = m.kind === "piece" || m.kind === "session" ? m.kind : "folder";
  const inn = kind === "folder" ? null : clean(m.in, 1000) || null, session = kind === "session" ? clean(m.session, 120) : "";
  return { thing, words: clean(m.words, 400), kind, name: clean(m.name, 200) || lastOf(thing), in: inn, ...(session ? { session } : {}) };
}

/** what Sol knows of a mark's place, a few lines: the store's at that place first (never the person-wide ones), then its
 *  parts' facts; the same words once */
export function knowsOf(w: Where, place: string | null, looks: Record<string, { seen: { fact: string }[] }>, now = Date.now()): string[] {
  if (!place) return [];
  const facts = knownNow(w, { at: place }, now).facts.filter((f) => f.place !== null && samePlace(f.place, place)).map((f) => f.fact);
  const seen = (looks[place]?.seen ?? []).map((x) => x.fact);
  return [...new Set([...facts, ...seen])].slice(0, MAX_KNOWS);
}

/** the message the session gets: the person's words, then each mark on its own line with its thing and what Sol knows */
export function textOf(words: string, marks: readonly Marked[]): string {
  const where = (m: Marked) => (m.kind === "folder" ? `the folder “${m.name}” (${m.thing})` : `the ${m.kind === "session" ? "session" : "piece"} “${m.name}” (${m.session ? `session ${m.session}` : m.thing}${m.in ? `, in ${lastOf(m.in)}` : ""})`);
  const lines = marks.map((m, i) => {
    const said = m.words ? `: “${m.words}”` : "", knows = m.knows.length ? ` Sol knows${m.kind === "folder" ? "" : ` of ${lastOf(m.in ?? "")}`}: ${m.knows.join("; ")}.` : "";
    return `${i + 1}. On ${where(m)}${said}.${knows}`;
  });
  const head = `I marked ${marks.length === 1 ? "one thing" : `${marks.length} things`} in Sol; each mark is on the thing itself:`;
  return [words, head, ...lines].filter(Boolean).join("\n");
}

/** next.markup.read { marks: [{ thing, words, kind?, name?, in?, session? }], text? } → { marks: Marked[], text } */
export function marksOf(w: Where, a: { marks?: unknown; text?: unknown }, now = Date.now()) {
  const marks = (Array.isArray(a.marks) ? a.marks : []).slice(0, MAX_MARKS).map(markOf).filter((m): m is Mark => !!m);
  if (!marks.length) return { ok: false as const, why: "marks are the things pressed, each { thing, words }" };
  const places = [...new Set(marks.map((m) => (m.kind === "folder" ? m.thing : m.in)).filter((x): x is string => !!x))];
  let looks: Record<string, { seen: { fact: string }[] }> = {};
  try { looks = looksOf(w.sol, places, now); } catch { looks = {}; }   // a folder it cannot read says no parts
  // a Coming up with nothing dated is an absence, not a thing Sol knows (BR1 hold)
  for (const l of Object.values(looks) as { seen: { fact: string; part?: string; items?: unknown[] }[] }[]) l.seen = l.seen.filter((x) => !(x.part === "coming" && !x.items?.length));
  const out: Marked[] = marks.map((m) => ({ ...m, knows: knowsOf(w, m.kind === "folder" ? m.thing : m.in, looks, now) }));
  return { ok: true as const, marks: out, text: textOf(clean(a.text, 4000), out) };
}
