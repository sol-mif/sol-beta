// The stage's Home block's wire (#692): engine.md's home.* shapes as the face reads them, and the block's own link to the
// stand-in on 7791. It was home/pass1.ts, shared with the folders' Home; that Home went with #1223 and its socket with
// it, so only the stage's Home block (HomeBlock.tsx, pass2.ts) reads this now.
// ---- engine.md's shapes, as the face reads them ----
export type At = "look" | "draft" | "act" | "spend";
export type Ask = { q: string; why?: string; options: string[] };
export type When = { day: string; label: string; word?: string; time?: string | null; event?: { id: string; title: string } };
export type Step = { i: number; at: string; name: string; what: string; under: { at: At; by: string | null }; would: boolean; ledger: number; artifact?: { ref: string; title: string } };
export type Job = {
  id: string; from: string; words: string; title: string; area: string; mandate: At; under: { at: At; by: string | null };
  state: "reading" | "running" | "would" | "waits" | "stuck" | "done" | "dropped" | "failed" | "handed";
  reading: { area: string; guessed?: boolean; subject: string; when: When | null; person: string | null; intent: string };
  plan: { i: number; name: string; need: At; what: string; would: string }[];
  steps: Step[]; waits_on?: { step: number; since: string; card: Ask }; artifacts: { ref: string; title: string }[];
  record_ids?: string[]; at: string; done_at?: string; gone?: boolean;
};
export type Today = { m: string; job?: string; rec?: string; recs?: string[]; items?: Today[]; b: string; t: string; you: boolean; card?: Ask; when?: string };
export type Rec = { id: string; kind: string; subject: string; area?: string; text: string; from: "said" | "learned"; confirmed: boolean; rejected?: boolean; source?: string; at: string; used_by: string[] };
export type Source = { id: string; kind: string; name: string; health: "on" | "off" | "look"; since: string | null; why?: string; last_read_at: string | null; scope: { days: number; write: boolean } };
export type Area = { area: string; at: At; by: string | null; asks: string[]; recordOnly: boolean; jobs: number };
export type Sentence = { id: string; text: string; rules: unknown[]; unread?: string; reads: string | null };
export type Policy = { text: string; sentences: Sentence[]; clashes: { key: string; a: string; b: string }[]; areas: Area[] };
export type Line = { n: number; at: string; job?: string; title?: string; step: string; what: string; ceiling?: string; area?: string; sentence?: string; policy_sentence?: string; would: boolean; changed_by?: string; undoable: string; sig: string };
export type Ev = { id: string; title: string; start: string; end: string; allDay: boolean; location: string; calendar: string };
export type HomeState = { today: Today[]; jobs: Job[]; record: Rec[]; sources: Source[]; policy: Policy; ledger: Line[]; events: Ev[]; verified: { ok: boolean; lines?: number; at?: number } };

// ---- Home's own link (#692): in Marco's window Home talks to the stub engine on its own socket, while every
// other part of the window stays on its engine (7777, or the NucBox). `?homews=host:port` on the link, or
// `sol.home.engine` in this window's storage, picks it; the default is this Mac's stub, 127.0.0.1:7791. A page opened
// with `?ws=` (the stage) already talks to the stub for everything, so Home uses that link and opens no second one.
export const HOME_DEFAULT = "127.0.0.1:7791";
export function homeAddr(): string | null {
  const q = new URLSearchParams(location.search);
  if (q.get("ws")) return null;
  const a = q.get("homews") ?? (() => { try { return localStorage.getItem("sol.home.engine"); } catch { return null; } })() ?? HOME_DEFAULT;
  return a.startsWith("ws") ? a : `ws://${a}`;
}
