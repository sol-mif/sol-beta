// Help (#1615 BR1, learn.html parts 3, 7, 8, 9): one standing session in every Sol that explains how Sol works and
// never changes anything. It answers from the shipped plain-words file (faq.md beside this file) and the six walks
// (WALKS below, the words of learn.html "The six walks", steps numbered from 0). An answer a walk step shows ends with
// Show me { walk, step }. Made the way the canvas bar's standing session is (next/canvas-agent.ts): started once on the
// person's own Claude, its id kept in SOL_HOME/next/help.json { v: 1, session, at, brief }, continued after, started
// again when gone or begun on an older brief. Read-only by construction: it is given one tool of its own, help_find,
// which makes it narrow (work/tools.ts narrowFor, work/runs.ts): no shell, no edits, no web, none of Sol's other tools,
// no MCP server. The canvas bar's "how do I…" comes here too (helpAsk, isHowAsk): answered at once from the faq and the
// walks when they hold it, else by the session. The wire with the face: wire.ts and README.md.
// Signed: marcocyl04-ux's agent (builder T-engine), BR1 (#1615).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { nextDir, readJson, writeJson } from "../file.js";
import { WALK_IDS, type FaqEntry, type ShowMe, type Walk, type WalkId } from "./wire.js";

// ---------------------------------------------------------------- the six walks (learn.html, word for word)

export const WALKS: Walk[] = [
  { id: "around", title: "Getting around", about: "canvas · zoom · the sidebar", steps: [
    "Your folders are cards; the sidebar lists the same ones in the same order",
    "⌘↑ zooms out to All folders; ⌘↓ goes back in",
    "Where shows the whole canvas small; press a spot to go there",
    "Esc always steps back one level",
  ] },
  { id: "folders", title: "Your folders", about: "open · folders in folders · Shelf · Arrange", steps: [
    "One press opens a folder: Working now, What changed, Coming up, Files",
    "The path at the top names every level; press one to go up",
    "Drag a folder onto another to put it inside",
    "The Shelf puts a folder away; nothing is deleted, and Undo brings it back",
    "Arrange tidies the canvas four ways",
  ] },
  { id: "ai", title: "Working with an AI", about: "a session, start to finish", steps: [
    "New session (⌘N) inside a folder: the AI already knows that folder",
    "As a tab or kept open beside the canvas; ‹ or Esc leaves it",
    "An ask sits above the box with the amber dot: Wait, Go ahead, Tell it…",
    "The model chip: who answers, how hard it thinks, whether it asks first",
    "Changes: what it changed, and Pause or Stop at any time",
  ] },
  { id: "bar", title: "The bar", about: "one bar, everywhere", steps: [
    "To: says who you're talking to; it slides when that changes",
    "A move or a question: \"put X next to Y\", \"what's left in Z?\"",
    "Drag a card in; the bar lights with its verb",
    "✦ point at things on screen; \"+N picked\" shows them, × removes one",
    "Hold fn to talk instead of typing",
  ] },
  { id: "needs", title: "What needs you", about: "Waiting on you · the Diary · At work", steps: [
    "Waiting on you gathers every ask in one list",
    "The Diary: what happened while you were away; because… says why",
    "At work: Now, Next, What your AI did; Pause finishes the step first",
  ] },
  { id: "yours", title: "Make it yours", about: "Add · Customize · Settings · How Sol sees you", steps: [
    "Add to a folder: a session, an automation, a note",
    "Customize: colours, sizes, Light or Night, Keep or Back",
    "How Sol sees you: each place looks, prepares, or does it for you",
    "Privacy: turn a source off and Sol forgets; Back brings it back",
  ] },
];

/** the walk step named, or null when there is no such walk or step (pure) */
export function stepOf(s: { walk?: unknown; step?: unknown } | null | undefined): ShowMe | null {
  const w = WALKS.find((x) => x.id === s?.walk), n = s?.step;
  return w && typeof n === "number" && Number.isInteger(n) && n >= 0 && n < w.steps.length ? { walk: w.id, step: n } : null;
}

/** the chips under Help's box (learn.html part 3) */
export const STARTERS = ["Replay a walk", "What does \"Sol knows 12\" mean?", "What's a seat?", "Why does it ask first?", "What can Sol see?"];

// ---------------------------------------------------------------- the faq (faq.md, shipped with the engine)

const HERE = dirname(fileURLToPath(import.meta.url));
/** faq.md: beside this file under tsx; built, dist/next/help/ has no .md, so the source beside dist */
export function faqFile(): string {
  const near = join(HERE, "faq.md");
  return existsSync(near) ? near : join(HERE, "..", "..", "..", "src", "next", "help", "faq.md");
}

/** the faq's entries (pure): each `## question`, the paragraph under it, and its `Show me: walk step` line if any */
export function parseFaq(md: string): FaqEntry[] {
  const out: FaqEntry[] = [];
  for (const part of md.split(/^## /m).slice(1)) {
    const [q, ...rest] = part.split("\n");
    let show: ShowMe | null = null;
    const a = rest.filter((l) => {
      const m = /^Show me:\s*(\w+)\s+(\d+)\s*$/.exec(l.trim());
      if (m) { show = stepOf({ walk: m[1], step: Number(m[2]) }); return false; }
      return true;
    }).join(" ").replace(/\s+/g, " ").trim();
    if (q.trim() && a) out.push({ q: q.trim(), a, ...(show ? { show } : {}) });
  }
  return out;
}
let faqKept: FaqEntry[] | null = null;
export const FAQ = (): FaqEntry[] => (faqKept ??= parseFaq(readFileSync(faqFile(), "utf8")));

// ---------------------------------------------------------------- finding the answer in the faq and the walks

const STOP = new Set(("a an the i me my mine you your it its is are was be been do does did done can could would should " +
  "will how what whats what's where why when which who whom to of in on at for and or but with by from this that these " +
  "there here so if as up out about any some one ones get got just please tell explain mean means meaning sol thing things " +
  "way want need use using make made have has had am into onto").split(" "));
const SAME: Record<string, string> = { nest: "inside", within: "inside", remove: "delete", trash: "delete", erase: "delete", lose: "delete",
  tidy: "arrange", organise: "arrange", organize: "arrange", sort: "arrange", zoom: "zoom", shrink: "zoom", chat: "session", talk: "session",
  agent: "ai", claude: "ai", codex: "ai", model: "ai", permission: "ask", permissions: "ask", approve: "ask", privacy: "privacy", see: "sees",
  voice: "fn", speak: "fn", dictate: "fn", theme: "customize", colour: "customize", color: "customize", dark: "night" };
const stem = (w: string) => w.replace(/'s$/, "").replace(/(?<=..)(ing|ed|es|s)$/, "").replace(/(?<=...)e$/, "");
/** a question's words, as compared (pure) */
export function words(t: string): string[] {
  return [...new Set(t.toLowerCase().replace(/[’']/g, "'").split(/[^a-z0-9'⌘↑↓✦]+/).filter((w) => w && !STOP.has(w))
    .map((w) => stem(SAME[w] ?? w)).filter((w) => w.length > 1 || /[⌘↑↓✦]/.test(w)))];
}

// a step's quoted examples ("put X next to Y", "what's left in Z?") are not what it is about
const unquoted = (t: string) => t.replace(/"[^"]*"/g, " ");
type Doc = { kind: "faq"; i: number; text: string; show?: ShowMe; ws: string[]; qs: string[] } | { kind: "step"; show: ShowMe; text: string; ws: string[]; qs: string[] };
function docs(): Doc[] {
  const f: Doc[] = FAQ().map((e, i) => ({ kind: "faq", i, text: e.a, ...(e.show ? { show: e.show } : {}), ws: words(`${e.q} ${e.a}`), qs: words(e.q) }));
  const s: Doc[] = WALKS.flatMap((w) => w.steps.map((t, step) => ({ kind: "step" as const, show: { walk: w.id, step }, text: t, ws: words(`${unquoted(t)} ${w.title}`), qs: words(unquoted(t)) })));
  return [...f, ...s];
}

export type Found = { text: string; show?: ShowMe; score: number; from: "faq" | "step" };
/** the best answer the faq and the walks hold for these words, and how sure (0..1): each word weighs by how rare it is
 *  across them, a word they never use weighs most, so "what's left in shop?" finds nothing (pure) */
export function findHelp(text: string): Found | null {
  const q = words(text);
  if (!q.length) return null;
  const all = docs(), N = all.length;
  const df = (w: string) => all.filter((d) => d.ws.includes(w)).length;
  const idf = (w: string) => Math.log((N + 1) / (df(w) + 0.5));
  const total = q.reduce((s, w) => s + idf(w), 0);
  let best: { d: Doc; score: number; rank: number; tie: number } | null = null;
  for (const d of all) {
    // a word of the question itself counts a half more: "what's a seat?" is the faq's seat before a step that names a seat;
    // between the equally sure, the one most about those words (the most of its own words matched)
    const got = q.reduce((s, w) => s + (d.ws.includes(w) ? idf(w) * (d.qs.includes(w) ? 1.5 : 1) : 0), 0);
    const score = Math.min(1, q.reduce((s, w) => s + (d.ws.includes(w) ? idf(w) : 0), 0) / total), rank = got / total;
    const tie = q.filter((w) => d.ws.includes(w)).length / Math.max(1, d.ws.length);
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && (rank > best.rank + 1e-9 || (Math.abs(rank - best.rank) < 1e-9 && tie > best.tie + 1e-9)))) best = { d, score, rank, tie };
  }
  if (!best || best.score <= 0) return null;
  const d = best.d;
  return { text: d.text, ...(d.show ? { show: d.show } : {}), score: best.score, from: d.kind };
}

// ---------------------------------------------------------------- which of the bar's words are a "how do I…"

const HOW_ALWAYS = /^\s*(how\s+(do|can|could|would|should|might)\s+i\b|how\s+to\b|how\s+does\b|how\s+do\s+you\b|where\s+(is|are|do|does|can)\b|where's\b|is\s+there\s+a\s+way\b|can\s+i\b|help\b|\?\s*$)/i;
const HOW_MAYBE = /^\s*(what\s+(is|are|does|do)\b|what's\b|whats\b|why\s+(does|is|do|did|can't|won't)\b|what\s+happens\b|is\s+(anything|it|there|my)\b|does\b|do\s+i\b|will\b)/i;
/** a "how do I…" for Help, or null for the canvas agent (pure). "how do I / how can I / where is / can I…" are always
 *  Help's; "what is / why does…" are Help's when the faq or the walks hold the answer, so "what's left in shop?" stays
 *  the canvas agent's */
export function isHowAsk(text: string): { found: Found | null } | null {
  const t = text.trim();
  if (!t) return null;
  const found = findHelp(t);
  if (HOW_ALWAYS.test(t)) return { found: found && found.score >= SURE ? found : null };
  if (HOW_MAYBE.test(t) && found && found.score >= SURE) return { found };
  return null;
}
/** how sure an answer must be to be given at once, with no session asked */
export const SURE = 0.6;

/** one line for the bar (pure): the first sentence or two, at most 200 characters, never a list */
export function oneLine(t: string): string {
  const flat = t.replace(/^\s*[-*•]\s+/gm, "").replace(/\s+/g, " ").trim();
  if (flat.length <= 200) return flat;
  const cut = flat.slice(0, 200), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, 197).replace(/\s+\S*$/, "")}…`;
}

/** the answer as the face shows it (pure): Show me taken off its last line (`Show me: folders 2`), checked against the walks */
export function splitShow(said: string): { text: string; show?: ShowMe; replay?: WalkId } {
  const lines = said.trimEnd().split("\n");
  let show: ShowMe | null = null;
  while (lines.length) {
    const m = /^\s*\**\s*show me\s*\**\s*:?\s*\**\s*\{?\s*(?:walk\s*[:=]\s*)?"?(\w+)"?\s*[,\s]\s*(?:step\s*[:=]\s*)?(\d+)\s*\}?\s*\**\s*$/i.exec(lines[lines.length - 1]);
    if (!m) { if (!lines[lines.length - 1].trim()) { lines.pop(); continue; } break; }
    show = stepOf({ walk: m[1].toLowerCase(), step: Number(m[2]) });
    lines.pop();
    break;
  }
  const text = lines.join("\n").trim();
  return show ? { text, show, replay: show.walk } : { text };
}

// ---------------------------------------------------------------- the standing session

export const helpFile = (home: string) => join(nextDir(home), "help.json");
const ID = /^[A-Za-z0-9_-]{8,80}$/;
/** how Help runs: the bar's model at low effort; read-only comes from its one tool (narrow), not from a mode */
export const HOW = { model: "claude-opus-5-5", effort: "low" } as const;
export const BRIEF_V = 1;

/** this home's Help session, or null when there is none yet (or it was begun on an older brief) */
export function helpSession(home: string): string | null {
  const d = readJson(helpFile(home)).data, s = d.session;
  return typeof s === "string" && ID.test(s) && d.brief === BRIEF_V ? s : null;
}

/** the walks and the faq as the session reads them (pure) */
export function knowledge(faq: FaqEntry[] = FAQ()): string {
  const w = WALKS.map((x) => `Walk "${x.id}" (${x.title}: ${x.about}):\n${x.steps.map((s, i) => `  ${x.id} ${i}: ${s}`).join("\n")}`).join("\n");
  const f = faq.map((e) => `Q: ${e.q}\nA: ${e.a}${e.show ? `\n(Show me: ${e.show.walk} ${e.show.step})` : ""}`).join("\n\n");
  return `THE WALKS (each step is "walk step", from 0):\n${w}\n\nTHE QUESTIONS AND ANSWERS:\n${f}`;
}

/** told once, at the session's first turn */
export const BRIEF = (faq: FaqEntry[] = FAQ()) => "You are Help, inside Sol. The person asks how Sol works; you explain it in plain words. " +
  "You never change anything: no file, no setting, no folder, no session. If they ask you to do something, say how they " +
  "can do it themselves, or that the canvas bar at the foot of the canvas can do it for them. Answer only from what is " +
  "below (help_find searches it). If it does not say, say plainly that you don't know that yet, never guess how Sol " +
  "works. Write two or three short plain sentences, no list, no headings. When one walk step below shows the answer on " +
  "their own Sol, end with one last line exactly like `Show me: folders 2` (the walk's id and the step's number), and " +
  "nothing after it; when none fits, leave that line out.\n\n" + knowledge(faq) + "\n\nThe question:";

/** the words as the session reads them (pure): the brief first on a fresh session */
export const helpWords = (text: string, fresh: boolean): string => `${fresh ? `${BRIEF()}\n\n` : ""}${text.trim()}`;

/** help_find: the session's one tool, which reads and never writes (and makes it narrow: nothing else) */
export const HELP_TOOL = {
  name: "help_find",
  description: "Search Sol's questions and answers and the six walks for the words given; returns the best answer and the walk step that shows it.",
  shape: { words: z.string().describe("the person's question, or words from it") },
  run: async (a: { words?: unknown }) => {
    const f = findHelp(String(a?.words ?? ""));
    return f ? `${f.text}${f.show ? `\nShow me: ${f.show.walk} ${f.show.step}` : ""}` : "Nothing in the answers or the walks says that.";
  },
};

export type HelpDeps = {
  say: (id: string, text: string, fresh?: { cwd: string }, how?: { model?: string; effort?: string }) => Promise<void>;
  known: (id: string) => Promise<boolean>;
  /** marked Help's, so no list draws it as a folder's session (work/state.ts mark { help: true }) */
  mark: (id: string) => void;
  /** gives the session its one tool before each turn (work/tools.ts giveTool), so a restart keeps it read-only */
  give: (id: string, tool: typeof HELP_TOOL) => void;
  cwd: () => string;
  uuid: () => string;
};

/** the words to the home's Help session: continued when it is there, else started (and kept) */
export async function helpSay(home: string, text: unknown, d: HelpDeps, now = Date.now()): Promise<{ ok: true; session: string; fresh: boolean } | { ok: false; why: string }> {
  const t = typeof text === "string" ? text.slice(0, 4000) : "";
  if (!t.trim()) return { ok: false, why: "nothing to ask" };
  const was = helpSession(home), keep = was && (await d.known(was).catch(() => false)) ? was : null;
  const id = keep ?? d.uuid(), fresh = !keep;
  d.give(id, HELP_TOOL);   // before the run starts: narrow, help_find and nothing else
  if (fresh) { d.mark(id); writeJson(helpFile(home), { v: 1, session: id, at: now, brief: BRIEF_V }); }
  await d.say(id, helpWords(t, fresh), fresh ? { cwd: d.cwd() } : undefined, { ...HOW });
  return { ok: true, session: id, fresh };
}

export { WALK_IDS };
