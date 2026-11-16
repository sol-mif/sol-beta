// Sources and the policy paragraph (#796, plan Part C slice 33; home/whole.md "Sources, the policy, record-only",
// "The engine half"; scene 7), behind sol.home.whole. Face half; the engine half is #828 (Frank's). The pure half and
// its stub: the sources (health, scope, the rung on the ladder read · propose · draft · act), the policy as the person's
// paragraph read into sentences (each naming a source or a folder and the rung it sets, or nothing), a rung change
// rewriting its sentence, a sentence that names no rung setting nothing, "what Sol learned" (a rule only on a press),
// and a folder never above its source. Nothing here draws; Sources.tsx does.
//
// Stubbed until #828 lands: `stub()` answers the messages whole.md names (`home.policy.write {text}`, `home.source.set
// {id, rung}`) and the few the scene needs beside them (`home.sources`, `home.source.repair`, `home.learned.keep`,
// `home.learned.drop`, `home.sources.undo`), each with a `home.sources` message of the shape below. The parse is a
// keyword stand-in for the engine's (whole.md: "The parse runs on save").

export const RUNGS = ["read", "propose", "draft", "act"] as const;
export type Rung = (typeof RUNGS)[number];
export type SourceId = "calendar" | "mail" | "files" | "github" | "canvas";
/** a source (whole.md "The engine half": Source {id, kind, health, scope, rung}); `would` is the record-only count
 *  (what Sol would have done today on the rung above), `note` the line under the ladder */
export type Source = {
  id: SourceId; name: string; kind: string;
  health: { state: "ok" | "stale" | "broken"; lastRead: number; why?: string };
  scope: { reads: string[]; never: string[] };
  rung: Rung; would: number;
};
/** a sentence of the policy: its words, what it sets (a source or a folder) and the rung, or null: it names a source or
 *  a folder but no rung, and sets nothing; one that names neither is a rule of yours (`rule`), not a rung */
export type Sentence = { span: string; source?: SourceId; folder?: string; rung: Rung | null; rule?: true };
export type Policy = { text: string; sentences: Sentence[] };
/** a folder carries its own rung, never above its source's (whole.md; scene 8) */
export type Folder = { name: string; source: SourceId; rung: Rung; asked: Rung };
/** what Sol learned about you: a rule only when you press (whole.md) */
export type LearnedLine = { id: string; text: string; seen: number; sentence: string };
/** the engine's message after every ask (#828): the whole of Sources, and the receipt of what was just done */
export type SourcesMsg = { type: "home.sources"; sources: Source[]; policy: Policy; folders: Folder[]; learned: LearnedLine[]; done: SourcesDone | null };
export type SourcesDone = { ledgerId: string; line: string };
export type SourcesAsk =
  | { type: "home.sources" }
  | { type: "home.source.set"; id: SourceId; rung: Rung }
  | { type: "home.policy.write"; text: string }
  | { type: "home.source.repair"; id: SourceId }
  | { type: "home.learned.keep"; id: string }
  | { type: "home.learned.drop"; id: string }
  | { type: "home.sources.undo"; ledgerId: string };

export const rungAt = (r: Rung) => RUNGS.indexOf(r);
export const lowest = (a: Rung, b: Rung): Rung => (rungAt(a) <= rungAt(b) ? a : b);
/** a folder's rung as it stands: what it asked for, held at its source's (never above) */
export const folderRung = (asked: Rung, source: Rung): Rung => lowest(asked, source);

// ── the words a rung writes (scene 7's own, one sentence per source and rung) ─────────────────────────────────────
export const WORDS: Record<SourceId, Record<Rung, string>> = {
  calendar: { read: "Look at my calendar, but only I put things on it.", propose: "Look at my calendar and suggest times, but only I put things on it.",
    draft: "Look at my calendar and pencil things in; I keep or drop them.", act: "Put things on my calendar and tell me." },
  mail: { read: "Send nothing from my mail unless I say so.", propose: "Suggest replies to my mail, send nothing.",
    draft: "Draft my replies and hold them for me.", act: "Reply to my mail for me where it is routine, and tell me." },
  files: { read: "For school, read the class folders.", propose: "For school, suggest notes in the class folders.",
    draft: "For school, write drafts and notes in the class folders.", act: "For school, write and file things in the class folders for me." },
  canvas: { read: "Read Canvas for due dates.", propose: "Read Canvas and suggest what to save.",
    draft: "Read Canvas and save new slides to the class.", act: "Read Canvas, save and submit drafts I approved." },
  github: { read: "Read GitHub for issues that name me.", propose: "Read GitHub for issues that name me, suggesting replies.",
    draft: "Read GitHub for issues that name me, drafting replies.", act: "Answer GitHub issues that name me, for me." },
};
/** the line under a ladder: what the rung above would do, kept as a record only (scene 7) */
export function wouldLine(s: Source): string {
  if (s.rung === "act") return "acts, every act in the ledger, undo where real";
  if (s.id === "files" && s.rung === "draft") return "writes only inside made/";
  if (s.id === "calendar" && s.rung === "propose") return "dashed until you keep it";
  return `would have: ${s.would === 0 ? "0" : `${s.would} today`}`;
}

// ── the parse (a stand-in for #828's: whole.md "The parse runs on save") ──────────────────────────────────────────
// a source named outright first; "replies" says mail only when nothing else is named
const NAMES: [RegExp, SourceId][] = [[/\bcalendar\b/i, "calendar"], [/\bcanvas\b/i, "canvas"], [/\bgithub|issues?\b/i, "github"],
  [/\bclass folders?|school folders?|files?\b/i, "files"], [/\b(e?mail|replies)\b/i, "mail"]];
const FOLDER = /\b(?:with|for|in)\s+(jobs|school|life|work)\b/i;
// what a sentence says about how far: the furthest it allows wins; a held-back clause ("but only I …", "send nothing …",
// "unless I say so") moves nothing up, and says read
const HELD = /\b(but\s+)?only i\b[^.;!?]*|\bsend nothing\b[^.;!?]*|\bunless i say so\b/gi;
const SAYS: [RegExp, Rung][] = [
  [/\b(and tell me|answer|submit|file things|put things on|reply for me)\b/i, "act"],
  [/\b(drafts?|drafting|pencil|save new|hold them)\b/i, "draft"],
  [/\b(suggest|suggesting|propose|ask me first)\b/i, "propose"],
  [/\b(read|look at|watch)\b/i, "read"],
];
/** one sentence read: what it names and the rung it sets, or null (it names something but no rung: "be sensible") */
export function readSentence(span: string): Sentence {
  const source = NAMES.find(([re]) => re.test(span))?.[1];
  const folder = source ? undefined : FOLDER.exec(span)?.[1]?.toLowerCase();
  if (!source && !folder) return { span, rung: null, rule: true };
  const free = span.replace(HELD, " ");
  const rung = SAYS.find(([re]) => re.test(free))?.[1] ?? (HELD.test(span) ? "read" : null);
  HELD.lastIndex = 0;
  return { span, ...(source ? { source } : {}), ...(folder ? { folder } : {}), rung };
}
/** the paragraph into sentences ("." "!" "?" ";" end one), each read */
export function parse(text: string): Policy {
  const spans = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?;])\s+/).filter(Boolean);
  return { text: spans.join(" "), sentences: spans.map(readSentence) };
}
/** the summary under the paragraph (scene 7: "Read: 5 sentences set rungs · 1 sets nothing …") */
export function readLine(p: Policy): string {
  const sets = p.sentences.filter((s) => s.rung), none = p.sentences.filter((s) => !s.rung && !s.rule);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [`Read: ${n(sets.length, "sentence sets a rung", "sentences set rungs")}`,
    ...(none.length ? [`${n(none.length, "sets nothing", "set nothing")} (“${none[0].span.replace(/[.;!?]$/, "")}” names no rung: say how far)`] : []),
    "above each rung, Sol writes what it would have done"].join(" · ");
}
/** a rung change rewrites its sentence: the sentence that sets this source gets the rung's words; none, one is added */
export function rewrite(p: Policy, id: SourceId, rung: Rung): Policy {
  const words = WORDS[id][rung], i = p.sentences.findIndex((s) => s.source === id);
  const sentences = i >= 0 ? p.sentences.map((s, j) => (j === i ? { span: words, source: id, rung } : s)) : [...p.sentences, { span: words, source: id, rung }];
  return { text: sentences.map((s) => s.span).join(" "), sentences };
}

// ── the stub (until #828): the engine's half, answered in the face ────────────────────────────────────────────────
export function seedSources(now: number): Source[] {
  const ago = (min: number) => now - min * 60_000;
  return [
    { id: "calendar", name: "Calendar", kind: "Apple Calendar", health: { state: "ok", lastRead: ago(2) }, scope: { reads: ["school", "personal"], never: ["“Family”"] }, rung: "propose", would: 0 },
    { id: "mail", name: "Mail", kind: "Gmail", health: { state: "ok", lastRead: ago(4) }, scope: { reads: ["subjects and senders", "bodies for school and jobs only"], never: [] }, rung: "propose", would: 2 },
    { id: "files", name: "Files", kind: "Files", health: { state: "ok", lastRead: ago(1) }, scope: { reads: ["~/School", "~/Jobs"], never: ["Desktop", "Downloads"] }, rung: "draft", would: 0 },
    { id: "github", name: "GitHub", kind: "GitHub", health: { state: "ok", lastRead: ago(60) }, scope: { reads: ["issues that name you"], never: [] }, rung: "read", would: 0 },
    { id: "canvas", name: "Canvas", kind: "Canvas", health: { state: "broken", lastRead: ago(120), why: "signed out" }, scope: { reads: ["bio 201, chem 110, stats 140", "announcements, due dates"], never: [] }, rung: "read", would: 0 },
  ];
}
export const SEED_TEXT = "Look at my calendar and suggest times, but only I put things on it. For school, write drafts and notes in the class folders. Suggest replies to my mail, send nothing. Read Canvas for due dates. Read GitHub for issues that name me. Be sensible with jobs.";
export const SEED_FOLDERS: Folder[] = [{ name: "jobs", source: "mail", rung: "propose", asked: "propose" }, { name: "school › bio 201", source: "files", rung: "draft", asked: "draft" }];
export const SEED_LEARNED: LearnedLine[] = [
  { id: "evening", text: "You study in the evening, never before 9:00.", seen: 6, sentence: "Plan study in the evening, never before 9:00." },
  { id: "notes", text: "Notes: one page, headings as questions.", seen: 3, sentence: "Write notes on one page, with headings as questions." },
];

type State = { sources: Source[]; policy: Policy; folders: Folder[]; learned: LearnedLine[] };
/** the folders held at their sources: a folder that asked above its source stands at the source's rung */
export const holdFolders = (folders: Folder[], sources: Source[]): Folder[] =>
  folders.map((f) => ({ ...f, rung: folderRung(f.asked, sources.find((s) => s.id === f.source)?.rung ?? "read") }));
/** the policy's sentences set the sources' rungs (on save); a source no sentence names keeps its rung */
function apply(st: State, p: Policy): State {
  const sources = st.sources.map((s) => { const set = p.sentences.find((x) => x.source === s.id && x.rung); return set ? { ...s, rung: set.rung! } : s; });
  return { ...st, policy: p, sources, folders: holdFolders(st.folders, sources) };
}

/** the engine's answers, in the face: every ask gets the whole of Sources back, with the receipt of what it did */
export function stub(now: () => number = Date.now) {
  let st: State = apply({ sources: seedSources(now()), policy: parse(SEED_TEXT), folders: SEED_FOLDERS, learned: SEED_LEARNED }, parse(SEED_TEXT));
  const kept = new Map<string, State>();
  let n = 0;
  const msg = (done: SourcesDone | null): SourcesMsg => ({ type: "home.sources", ...st, done });
  const keep = (line: string): SourcesDone => { const ledgerId = `s${++n}`; kept.set(ledgerId, st); return { ledgerId, line }; };
  return (a: SourcesAsk): SourcesMsg => {
    if (a.type === "home.sources") return msg(null);
    if (a.type === "home.sources.undo") { const was = kept.get(a.ledgerId); if (was) { st = was; kept.delete(a.ledgerId); } return msg(null); }
    if (a.type === "home.source.set") {
      const s = st.sources.find((x) => x.id === a.id);
      if (!s || s.rung === a.rung) return msg(null);
      const done = keep(`${s.name}: ${a.rung} now · its sentence rewritten`);
      const sources = st.sources.map((x) => (x.id === a.id ? { ...x, rung: a.rung } : x));
      st = { ...st, sources, policy: rewrite(st.policy, a.id, a.rung), folders: holdFolders(st.folders, sources) };
      const held = st.folders.filter((f) => f.source === a.id && f.rung !== f.asked);
      return msg(held.length ? { ...done, line: `${done.line} · ${held.map((f) => f.name).join(", ")} held at ${a.rung}` } : done);
    }
    if (a.type === "home.policy.write") {
      const p = parse(a.text), done = keep("your policy, read again");
      st = apply(st, p);
      return msg(done);
    }
    if (a.type === "home.source.repair") {
      const s = st.sources.find((x) => x.id === a.id);
      if (!s || s.health.state === "ok") return msg(null);
      const done = keep(`${s.name}: signed in again, reading`);
      st = { ...st, sources: st.sources.map((x) => (x.id === a.id ? { ...x, health: { state: "ok", lastRead: now() } } : x)) };
      return msg(done);
    }
    const l = st.learned.find((x) => x.id === a.id);
    if (!l) return msg(null);
    if (a.type === "home.learned.keep") {
      const done = keep("now a sentence in your policy");
      st = { ...apply(st, parse(`${st.policy.text} ${l.sentence}`)), learned: st.learned.filter((x) => x.id !== a.id) };
      return msg(done);
    }
    const done = keep(`forgotten: ${l.text}`);
    st = { ...st, learned: st.learned.filter((x) => x.id !== a.id) };
    return msg(done);
  };
}

// ── the words on the page ─────────────────────────────────────────────────────────────────────────────────────────
const WORDN = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
/** the one line (scene 7: "Five sources. Canvas needs you: it signed out.") */
export function sourcesLine(sources: Source[]): [string, string] {
  const first = `${WORDN[sources.length] ?? sources.length} source${sources.length === 1 ? "" : "s"}.`;
  const bad = sources.filter((s) => s.health.state === "broken");
  if (!bad.length) return [first, "All of them reading."];
  return [first, bad.length === 1 ? `${bad[0].name} needs you: it ${bad[0].health.why ?? "stopped"}.` : `${bad.map((s) => s.name).join(" and ")} need you.`];
}
/** a source's health line: "read 4 min ago", "watching", "signed out 2 h ago" */
export function healthLine(s: Source, now: number): string {
  const m = Math.max(0, Math.round((now - s.health.lastRead) / 60_000));
  const ago = m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  if (s.health.state === "broken") return `${s.health.why ?? "stopped"} ${ago}`;
  if (s.id === "files") return "watching";
  return `read ${ago}`;
}
/** the scope in one line: what it reads, then what it never reads */
export const scopeLine = (s: Source) => `${s.kind} · ${s.scope.reads.join("; ")}${s.scope.never.length ? ` · not ${s.scope.never.join(" or ")}` : ""}`;
