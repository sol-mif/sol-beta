// owned by slice 3 (Near), docs/port/slices.md
// The engine's messages Near reads (#1615; map.md rows 11, 12, 14, 16 and "Near, a code session"): live only, the fixture
// never runs a wire. Near's panes are today's own (work/DiffPane, TermPane, FilePane/FileTree, WorkTalk), which read
// work.diff, work.term.*, work.tree, work.view and work.thread themselves through useWork; so this wire keeps the link
// for them and for the moves (work.say, work.readnow, work.review), and the one thing D needs from the engine here: each
// session's folder (work.sessions' cwd), so a piece at Near opens its panes on the right folder.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { change } from "../core.ts";
import type { Engine } from "./types.ts";

let E: Engine | null = null;
const cwds: Record<string, string> = {};
/** the engine link while the new face is open live (null on the fixture) */
export const engine = (): Engine | null => E;
/** a session's folder, as work.sessions said it */
export const cwdOf = (sid: string): string | undefined => cwds[sid];

export function attach(e: Engine): () => void {
  E = e;
  const off = e.subscribe((m: { type?: string; sessions?: { id: string; cwd?: string }[]; sessionId?: string; round?: number; error?: string }) => {
    if (m?.type === "work.sessions" && Array.isArray(m.sessions)) { for (const s of m.sessions) if (s?.id && s.cwd) cwds[s.id] = s.cwd; return; }
    // the review seat answered (map.md #16): the piece says who checked it; its notes arrive as work.items of kind review
    if (m?.type === "work.review" && m.sessionId && !m.error) {
      change((d) => { const p = d.pieces[m.sessionId!]; if (p) p.checked = { by: "Codex", notes: (p.checked as { notes?: string[] })?.notes ?? [] }; });
    }
  });
  return () => { off?.(); E = null; };
}
