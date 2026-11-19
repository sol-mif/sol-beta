// Copied from MR (origin/marco/mine-run 54e4f636) sol/mac/src/home/whole/policy.ts l.50-61 (WORDS), l.115-130 (seedSources, SEED_TEXT, SEED_FOLDERS, SEED_LEARNED) and sol/mac/src/home-sources.test.ts l.10-71 (the values his tests expect); not imported: the engine never imports sol/mac.
// Sources and the policy as his face's first scene of Sources has them (scene 7), and fake doors for his five sources:
// the engine has no Mail, Calendar, Canvas or GitHub (design §7.7 "zero sources today"), so his tests are replayed
// against these. A fake counts the calls on its doors and can be signed out.
import type { Health, Rung, SourceId } from "../../../src/contract/home/policy.ts";
import type { KnownFolder, SourceDoor } from "../../../src/home/sources.ts";

export const NOW = new Date(2026, 10, 9, 8, 40).getTime();

/** the 20: one sentence a source and a rung (policy.ts l.50-61) */
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

export const SEED_TEXT = "Look at my calendar and suggest times, but only I put things on it. For school, write drafts and notes in the class folders. Suggest replies to my mail, send nothing. Read Canvas for due dates. Read GitHub for issues that name me. Be sensible with jobs.";
export const SEED_FOLDERS: KnownFolder[] = [{ name: "jobs", source: "mail", asked: "propose" }, { name: "school › bio 201", source: "files", asked: "draft" }];
export const SEED_LEARNED = [
  { id: "evening", text: "You study in the evening, never before 9:00.", seen: 6, sentence: "Plan study in the evening, never before 9:00." },
  { id: "notes", text: "Notes: one page, headings as questions.", seen: 3, sentence: "Write notes on one page, with headings as questions." },
];
/** his seed's rungs (policy.ts l.118-122) */
export const SEED_RUNGS: [SourceId, Rung][] = [["calendar", "propose"], ["mail", "propose"], ["files", "draft"], ["github", "read"], ["canvas", "read"]];

// what his tests expect (home-sources.test.ts)
export const PARSED_SEED: [string, Rung | null][] = [["calendar", "propose"], ["files", "draft"], ["mail", "propose"], ["canvas", "read"], ["github", "read"], ["jobs", null]];   // l.44
export const READ_LINE = "Read: 5 sentences set rungs · 1 sets nothing (“Be sensible with jobs” names no rung: say how far) · above each rung, Sol writes what it would have done";   // l.45
export const MAIL_PROPOSE = "Suggest replies to my mail, send nothing.";   // l.17
export const MAIL_READ = "Send nothing from my mail unless I say so.";   // l.20
export const MAIL_DRAFT = "Draft my replies and hold them for me.";   // l.52
export const DROP_MAIL_LINE = "Mail: read now · its sentence rewritten · jobs held at read";   // l.28
export const CALENDAR_HELD = "Look at my calendar and suggest times, but only I put things on it.";   // l.46
export const A_RULE = "Plan study in the evening, never before 9:00.";   // l.47

export type Fake = SourceDoor & { calls: { read: number; propose: number; draft: number; do: number }; signOut(why: string): void };
/** a fake of one of his five sources, as his seed has it (policy.ts l.115-123) */
export function fake(id: SourceId, now: number, o: { broken?: string; kind?: string } = {}): Fake {
  const seed: Record<SourceId, { name: string; kind: string; reads: string[]; never: string[]; ago: number }> = {
    calendar: { name: "Calendar", kind: "Apple Calendar", reads: ["school", "personal"], never: ["“Family”"], ago: 2 },
    mail: { name: "Mail", kind: "Gmail", reads: ["subjects and senders", "bodies for school and jobs only"], never: [], ago: 4 },
    files: { name: "Files", kind: "Files", reads: ["~/School", "~/Jobs"], never: ["Desktop", "Downloads"], ago: 1 },
    github: { name: "GitHub", kind: "GitHub", reads: ["issues that name you"], never: [], ago: 60 },
    canvas: { name: "Canvas", kind: "Canvas", reads: ["bio 201, chem 110, stats 140", "announcements, due dates"], never: [], ago: 120 },
  };
  const s = seed[id];
  let health: Health = o.broken ? { state: "broken", lastRead: now - s.ago * 60_000, why: o.broken } : { state: "ok", lastRead: now - s.ago * 60_000 };
  const calls = { read: 0, propose: 0, draft: 0, do: 0 };
  return {
    id, name: s.name, kind: o.kind ?? s.kind, calls,
    health: () => health,
    scope: () => ({ reads: s.reads, never: s.never }),
    read: () => { calls.read++; return []; },
    propose: () => { calls.propose++; },
    draft: () => { calls.draft++; },
    do: () => { calls.do++; },
    repair: (at) => { health = { state: "ok", lastRead: at }; return health; },
    signOut: (why) => { health = { ...health, state: "broken", why }; },
  };
}
