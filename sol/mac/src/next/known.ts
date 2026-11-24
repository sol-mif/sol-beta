// What Sol knows, as one type (BR1 root part 5, #1615; mine/look/br1/strategy/root.html "One picture of what Sol knows").
// Every screen that shows a learned fact reads it from here, and nothing else describes one:
//   known(at, sources) → Known[]   at is a place (a part's id, or a folder's "w:<path>" / "h:<id>") or "you" (all of it)
// A Known is the line, where it came from in words (source), who said it (by), which read saw it (from, once the
// engine says), when, and the place it belongs to (null: about the person, everywhere). k is its key: "fact:<id>" and
// "tool:<part>:<tool>" are the engine's own (next.you.fact.forget takes them), "learned:<id>" a home.sources line
// (home.learned.keep/drop), "talk" next.you's own field, "seen:<part>:<what>" what a place's fields
// say (Sol works it out; nothing to forget), "fit:<n>" a fits fixture line. The same k is the same fact on every screen.
// The adapters fold the five sources the face hears today: next.you (parts[].knows, its fields, how Sol talks),
// next.folder (its facts), home.sources (learned lines), the fits' facts and next.movein's read (its folders, before
// next.you exists). Pure, so the tests read it with invented
// people only. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Part, Source, You } from "./movein/you/types.ts";
import type { Folder } from "./notes/read.ts";

export type By = "read" | "person" | "sol" | "seat";
export type Known = { k: string; fact: string; source: string; by: By; stale?: true; from?: Source; at?: string; place: string | null; fix?: Fix };
/** on a fix line (fix:<id>, the person's own): what they did (how), to what (what, in their words), and the key of the
 *  line it answers (reason): the one store's record, so a window reads what was forgotten from it, never from a copy */
export type Fix = { how: string; what: string; reason?: string };
/** a fact as next.you sends it in parts[].knows: the part it sits in is its place */
export type KnownIn = Omit<Known, "place">;
/** what known() reads: next.you (and the places the person dropped), the opened folders, Settings' learned lines */
/** engine: next.known's list, once the engine holds it (sol/PROTOCOL.md "next.known"): it stands for next.you's
 *  adapters (ofYou, ofPart), so a key the engine hid or a source turned off is gone here too; Settings' learned lines,
 *  the opened folders' facts and the move-in's read are folded on top until the engine says them as well */
export type Sources = { you?: You | null; engine?: readonly Known[] | null; dropped?: ReadonlySet<string> | readonly string[]; folders?: Record<string, Folder>; learned?: readonly Known[]; found?: readonly Found[]; forgot?: Iterable<string> };

/** the keys the person forgot or hid and has not brought back, read from the one store's own fix lines (next.known,
 *  fix:<id> with its fix): a hide answering a key holds it out, a later show lets it back. Null: no engine list yet */
export function forgotten(eng: readonly Known[] | null | undefined): Set<string> | null {
  if (!eng) return null;
  const out = new Set<string>();
  const lines = eng.filter((f) => f.fix?.reason && (f.fix.how === "hide" || f.fix.how === "show"));
  for (const f of [...lines].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))) {
    if (f.fix!.how === "hide") out.add(f.fix!.reason!); else out.delete(f.fix!.reason!);
  }
  return out;
}

/** a fact the person can take away: the engine holds its key */
export const forgettable = (k: string) => k.startsWith("fact:") || k.startsWith("tool:") || k.startsWith("learned:");
/** a home.sources line's own id, for home.learned.keep/drop */
export const learnedId = (k: string) => (k.startsWith("learned:") ? k.slice(8) : k);

/** where a fact came from, in the person's words */
const FROM: Record<string, string> = {
  "claude-sessions": "your AI chats", "codex-sessions": "your AI chats", projects: "your code", files: "your files", apps: "your apps",
  browser: "your browser", "calendar-store": "your calendar", notes: "your notes", record: "you set it up", you: "you said",
};
export const fromWords = (f: string) => FROM[f] ?? "what Sol read";
const SOURCE = new Set<string>(["claude-sessions", "codex-sessions", "apps", "browser", "calendar-store", "notes", "files", "projects"]);
const isSource = (f: string): f is Source => SOURCE.has(f);

/** a tool's name as a person would say it: one that reads like an id (has "_") is not said until the engine leaves it out */
export const sayable = (tool: string) => !!tool.trim() && !tool.includes("_");

const hr = (h: number) => { const x = ((h % 24) + 24) % 24; return x === 0 ? "12am" : x < 12 ? `${x}am` : x === 12 ? "12pm" : `${x - 12}pm`; };
/** the busiest run of three hours, "9pm–12am" */
export function busiest(at: number[]): string {
  let best = 0, from = 0;
  for (let h = 0; h < 24; h++) { const s = (at[h] || 0) + (at[(h + 1) % 24] || 0) + (at[(h + 2) % 24] || 0); if (s > best) { best = s; from = h; } }
  return best > 0 ? `${hr(from)}–${hr(from + 3)}` : "";
}
/** the AIs that work in a place, by the reads that saw them */
export function aisOf(p: Part): string[] {
  const out: string[] = [];
  if (p.from.includes("claude-sessions")) out.push("Claude Code");
  if (p.from.includes("codex-sessions")) out.push("Codex");
  if (!out.length && p.ais > 0) out.push(p.ais === 1 ? "1 AI" : `${p.ais} AIs`);
  return out;
}

/** what Sol knows of a place, each with where it came from: the engine's own facts of it (parts[].knows) first, then
 *  what its fields say (its AIs, its hours, its share, where else it was seen); with no knows (an older engine) the
 *  tools and the count of told facts are said from the fields too. Nothing here is made up */
export function ofPart(p: Part): Known[] {
  const place = p.id, out: Known[] = [];
  const seen = (what: string, fact: string, source: string, by: By, from?: string): Known =>
    ({ k: `seen:${p.id}:${what}`, fact, source, by, ...(from && isSource(from) ? { from } : {}), place });
  for (const f of p.knows ?? []) if (!(f.k.startsWith("tool:") && !sayable(f.k.split(":").slice(2).join(":")))) out.push({ ...f, place });
  const codeFrom = p.from.includes("projects") ? "projects" : p.from.includes("files") ? "files" : (p.from[0] ?? "");
  const tools = p.tools.filter(sayable);
  if (!p.knows && tools.length) out.push(seen("tools", tools.slice(0, 4).join(", "), fromWords(codeFrom), codeFrom === "record" || codeFrom === "you" ? "person" : "read", codeFrom));
  const ais = aisOf(p).filter((a) => !/^\d/.test(a));
  if (ais.length) { const via = p.from.includes("claude-sessions") ? "claude-sessions" : "codex-sessions"; out.push(seen("ais", `${ais.join(" and ")} work${ais.length > 1 ? "" : "s"} here`, fromWords(via), "read", via)); }
  const when = busiest(p.at);
  if (when) out.push(seen("hours", `Most of your work happens ${when}`, "what Sol read", "sol"));
  if (p.share != null && p.share > 0) out.push(seen("share", p.share < 0.01 ? "Under 1% of your time" : `${Math.round(p.share * 100)}% of your time`, p.main ? "your main place" : "what Sol read", "sol"));
  for (const f of p.from) if (f === "calendar-store" || f === "browser" || f === "notes" || f === "apps") out.push(seen(`in:${f}`, `Seen in ${fromWords(f)}`, fromWords(f), "read", f));
  if (!p.knows && p.facts > 0) out.push(seen("told", p.facts === 1 ? "1 thing you told Sol" : `${p.facts} things you told Sol`, "you said", "person"));
  if (p.new) out.push(seen("new", "New since Sol last looked", "what Sol read", "sol"));
  if (p.faded) out.push(seen("quiet", "Quiet lately", "what Sol read", "sol"));
  return out;
}

/** how Sol talks, in a few words (the circle's chip says them; the fact says them whole) */
export const TALK_W: Record<string, string> = { plain: "Plain words", brief: "Brief, the answer first", explained: "Explains the why" };
/** what Sol knows of the person everywhere, not of a place: how Sol talks to them (once picked or read; the default is no
 *  fact). What they're here for is never a fact here: the purpose step is parked (br1-update) and no answer to it is read */
export function ofYou(y: Partial<Pick<You, "talk">> | null | undefined): Known[] {
  const out: Known[] = [];
  if (!y) return out;
  if (y.talk && y.talk.by !== "default")
    out.push({ k: "talk", fact: `Sol talks to you: ${(TALK_W[y.talk.style] ?? y.talk.style).toLowerCase()}`, source: y.talk.by === "you" ? "you picked it" : y.talk.why ?? "how you set your AIs", by: y.talk.by === "you" ? "person" : "read", ...(y.talk.by === "you" ? {} : { from: "claude-sessions" as const }), place: null });
  return out;
}

/** an opened folder's facts (next.folder): the engine's fact ids, so the same fact as next.you's knows */
export const ofFolder = (f: Folder): Known[] =>
  f.facts.map((x) => ({ k: `fact:${x.id}`, fact: x.fact, source: x.source, by: x.learned ? "sol" : "person", ...(x.stale ? { stale: true as const } : {}), place: f.folder }));

/** home.sources' learned lines: what Sol picked up from what the person did, each with how often it saw it */
export const ofLearned = (lines: readonly { id: string | number; text: string; seen?: number }[]): Known[] =>
  lines.map((l) => ({ k: `learned:${l.id}`, fact: l.text, source: l.seen ? `seen ${l.seen} time${l.seen === 1 ? "" : "s"}` : "what you did", by: "sol", place: null }));

/** a folder as the move-in's read finds it (next.movein, before next.you exists): what it holds, its rules files for AIs,
 *  which apps' sessions ran in it. id is the read's place id, the one next.you names the part by, so a fact found here
 *  is the same fact (the same k, the same words) on screen 4 and in Settings › You; place is the row's folder id */
export type Found = { id: string; place: string; app: boolean; holds?: { repo?: boolean; code?: boolean }; rules?: readonly string[]; sessions?: Partial<Record<"claude" | "codex", number>>; copyOf?: string };
export function ofFound(p: Found): Known[] {
  const out: Known[] = [];
  const seen = (what: string, fact: string, from: Source): Known => ({ k: `seen:${p.id}:${what}`, fact, source: fromWords(from), by: "read", from, place: p.place });
  const holds = p.holds?.repo ? "A repo" : p.holds?.code ? "Has code" : p.app ? "No code in it" : "";
  if (holds) out.push(seen("holds", holds, "projects"));
  if (p.copyOf) out.push(seen("copy", `Another copy of ${p.copyOf}`, "projects"));   // a second checkout of a repo listed (BR1 order 4e)
  const ais = [(p.sessions?.claude ?? 0) > 0 ? "Claude Code" : "", (p.sessions?.codex ?? 0) > 0 ? "Codex" : ""].filter(Boolean);
  if (ais.length) out.push(seen("ais", `${ais.join(" and ")} work${ais.length > 1 ? "" : "s"} here`, ais[0] === "Claude Code" ? "claude-sessions" : "codex-sessions"));
  for (const f of new Set((p.rules ?? []).map((r) => (r === "AGENTS.md" ? r : "CLAUDE.md")))) out.push(seen(`rules:${f}`, `Has ${f}`, "projects"));
  return out;
}

/** one place said two ways: a part's id, a folder's "w:<path>" or "h:<id>", the path itself */
export const samePlace = (a: string, b: string) => a === b || a === `w:${b}` || a === `h:${b}` || b === `w:${a}` || b === `h:${a}`;

/** what Sol knows at a place, or of the person ("you": everything, the person's own first, then each place's). A fact
 *  heard from two sources (a folder's fact is in next.you's knows too) is said once, with the first one's place */
export function known(at: string, s: Sources): Known[] {
  const dropped = new Set(s.dropped ?? []);
  const parts = (s.you?.parts ?? []).filter((p) => !dropped.has(p.id) && (at === "you" || samePlace(p.id, at)));
  const folders = Object.values(s.folders ?? {}).filter((f) => at === "you" || samePlace(f.folder, at) || (!!f.place && samePlace(f.place, at))
    || parts.some((p) => samePlace(p.id, f.folder) || (!!f.place && samePlace(p.id, f.place))));
  const found = (s.found ?? []).filter((f) => at === "you" || samePlace(f.place, at) || samePlace(f.id, at));
  const eng = s.engine ? s.engine.filter((f) => f.place === null ? at === "you" : ![...dropped].some((d) => samePlace(d, f.place!)) && (at === "you" || samePlace(f.place, at))) : null;
  const mine = eng ? eng.filter((f) => f.place === null) : ofYou(s.you), here = eng ? eng.filter((f) => f.place !== null) : parts.flatMap(ofPart);
  const all = [...(at === "you" ? [...mine, ...(s.learned ?? [])] : []), ...here, ...folders.flatMap(ofFolder), ...found.flatMap(ofFound)];
  // what the person forgot is out of every source at once, the folded ones too (an opened folder's facts, the read's)
  const seenK = new Set<string>([...(forgotten(s.engine) ?? []), ...(s.forgot ?? [])]), out: Known[] = [];
  for (const f of all) if (!seenK.has(f.k)) { seenK.add(f.k); out.push(f); }
  return out;
}

/** the because on something Sol did (BR1, #1615; mine/look/br1/because.html): what it did carries why, the keys of the
 *  facts that made it (Diary lines, front lines, asks, workspace plans: agreed with the people builder). label is the
 *  dotted line beside it ("because you write before 11"), facts what it opens to, from where each came from, once each.
 *  No why, or no key Sol still knows: no because (null), never an empty one */
/** label: the whole first fact after "because"; short: the same in at most six words, the grey words a press unfolds (BR1, folder.html) */
export type Because = { label: string; short: string; facts: Known[]; from: string[] };
const DAY = (at: string) => { const t = Date.parse(at); return Number.isNaN(t) ? at : new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
/** a fact as the rest of "because …": its last full stop gone, and a person's own "You" said small */
export const clause = (fact: string) => { const s = fact.trim().replace(/[.。]$/, ""); return /^(You|Your|You're|You’re)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };
export function becauseOf(why: readonly string[] | undefined, all: readonly Known[]): Because | null {
  const by = new Map(all.map((f) => [f.k, f] as const));
  const facts = [...new Set(why ?? [])].map((k) => by.get(k)).filter((f): f is Known => !!f);
  if (!facts.length) return null;
  const from = [...new Set(facts.map((f) => `${f.source}${f.at ? ` · ${DAY(f.at)}` : ""}`))];
  const c = clause(facts[0].fact), w = c.split(/\s+/);
  return { label: `because ${c}`, short: w.length <= 5 ? `because ${c}` : `because ${w.slice(0, 4).join(" ")}…`, facts, from };
}
