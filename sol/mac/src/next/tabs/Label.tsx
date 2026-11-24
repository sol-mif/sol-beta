// What names a piece on its tab and in its head when open in place (#1615 BR1; Marco 11:51: a session is not an agent):
// the session's task, its folder's mark (a small tab shape in the folder's colour, dashed when the session is loose,
// in no folder), and only when the session's data has one, a pill for the automation or the seat it runs under. No
// AI's name or face: the agent's own verbs (open, take out, put back) are marked ✦ where they happen instead.
// Signed: marcocyl04-ux's agent, BR1 tabs (#1615).
import { regionOf, type Piece } from "../cv/index.ts";
import { tintOf } from "../plane/layout.ts";

const words = (s: string) => s.replace(/[-_]+/g, " ").trim();
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** the piece's task: a session's own title (its task) when it has one, else its copy's words; any other piece its name */
export function taskOf(p: Piece): string {
  if (typeof p.task === "string" && p.task) return p.task;
  if (p.kind === "session" && p.ai && p.copy && p.name === `${p.ai} in ${p.copy}`) return cap(words(String(p.copy)));
  return p.name || (p.copy ? cap(words(String(p.copy))) : p.id);
}
/** the folder's mark: the folder's colour as the canvas draws it (the same four, in the same order), dashed when loose */
export function FolderMark({ p }: { p: Piece }) {
  const r = regionOf(p.region), i = r ? tintOf(r.id) : -1;   // the folder's own tint (plane/layout.ts), not its place in the list
  return <span className={`fmark${i < 0 ? " loose" : ` t${i}`}`} aria-hidden="true" title={r ? r.name : "Loose: in no folder"} />;
}
/** "automation · x" or "seat · x", only when the session's data names one */
export function RunPill({ p }: { p: Piece }) {
  const a = typeof p.automation === "string" && p.automation ? `automation · ${p.automation}` : typeof p.seat === "string" && p.seat ? `seat · ${p.seat}` : null;
  return a ? <span className="fpill" title={a}>{a}</span> : null;
}
