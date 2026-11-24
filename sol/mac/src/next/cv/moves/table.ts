// A session's table (BR1, mine/look/br1/inside.html §2 and §3, #1615): everything it is using and everything it made, as
// real pieces. It holds pieces, never folders (canvas › folders › sessions › pieces). What it uses: what the person gave
// it (a piece or a note dragged in) and the pages of the folder it works in, which it knows; what it made: its change, the
// automations made in it (birth.html row 5) and its blocks. A tab draws it big beside the conversation, the pane beside
// the canvas a strip of it (near/Table.tsx). table_give is the drag in: the thing goes to the session as its next message
// (near.ts talk) and is on its table from then on. Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).
import { D, M, done, piecesIn, regionOf, render, type Done, type Moves, type Piece } from "../core.ts";
import { MOVE_FN } from "../../agent/calls.ts";
import { titleOf } from "../../plane/layout.ts";
import { pieceId } from "../../auto/model.ts";
import type { Work } from "../../work/read.ts";

export type TableItem = {
  key: string; kind: string; title: string;
  /** used: the person gave it, or its folder has it; made: it made it */
  how: "gave" | "folder" | "made";
  /** where it came from, in words: "you gave it", "from Client sites", "it made this" */
  from: string;
  /** the piece on the canvas it is, when it is one (it opens) */
  piece?: string;
};
type Given = { key: string; kind: string; title: string; piece?: string };

/** what was given to each session, by its piece's id; the engine has it as the session's messages */
const G = (): Record<string, Given[]> => ((D.given as Record<string, Given[]> | undefined) ?? (D.given = {})) as Record<string, Given[]>;
const NOT_ON_TABLE = new Set(["session", "folder", "starter", "place", "level", "fit", "arrivals", "copies", "diary"]);
const isSession = (id: string) => D.pieces[id]?.kind === "session";

/** "Drag anything here" on the table shows until the person's first drag in, then never again (the sixth moment) */
export const HINT_KEY = "sol.next.table-hint";
export function hintGone(): boolean { try { return globalThis.localStorage?.getItem(HINT_KEY) === "1"; } catch { return false; } }
function hintDone(): void { try { globalThis.localStorage?.setItem(HINT_KEY, "1"); } catch { /* no storage: it shows again */ } }

/** a session's table, newest given first, then what its folder has, then what it made */
export function tableOf(pid: string): TableItem[] {
  const p = D.pieces[pid];
  if (!p || p.kind !== "session") return [];
  const out: TableItem[] = [], seen = new Set<string>();
  const add = (t: TableItem) => { const k = t.piece ?? t.key; if (!seen.has(k)) { seen.add(k); out.push(t); } };
  for (const g of [...(G()[pid] ?? [])].reverse()) add({ ...g, how: "gave", from: "you gave it" });
  const r = regionOf(String(p.region ?? ""));
  if (r) for (const q of piecesIn(r.id)) if (!NOT_ON_TABLE.has(q.kind) && !q.inside && q.id !== pid && !String(q.id).startsWith("auto:"))
    add({ key: q.id, kind: q.kind, title: titleOf(q), how: "folder", from: `from ${r.name}`, piece: q.id });
  if (typeof p.files === "number" && p.files > 0) add({ key: "change", kind: "change", title: `${p.files} file${p.files === 1 ? "" : "s"} changed`, how: "made", from: "its change" });
  for (const a of (D.work as Work | undefined)?.autos ?? []) if (a.in && (a.in === pid || a.in === p.sessionId))
    add({ key: `auto:${a.id}`, kind: "automation", title: a.name, how: "made", from: "it made this", piece: pieceId(a.id) });
  for (const b of Array.isArray(p.arrivals) ? (p.arrivals as { id: string; kind: string; title: string }[]) : [])
    add({ key: `blk:${b.id}`, kind: b.kind, title: b.title, how: "made", from: "it made this" });
  return out;
}

/** the words a session reads when a thing is given to it: its kind, its name and what it says */
export function givenWords(q: Piece | { kind: string; name?: string; text?: string }): string {
  const name = "id" in q ? titleOf(q as Piece) : String(q.name ?? "");
  const text = typeof q.text === "string" ? q.text.trim().slice(0, 4000) : "";
  const at = typeof (q as Piece).path === "string" ? ` (${(q as Piece).path})` : typeof (q as Piece).url === "string" ? ` (${(q as Piece).url})` : "";
  return `Here is a ${q.kind === "doc" ? "page" : q.kind} to use: ${name}${at}${text ? `\n\n${text}` : ""}`;
}

/** a note given to a session (notes/drop.ts, once sent): on its table from then on */
export function gaveNote(to: string, id: string, text: string): void {
  const pid = isSession(to) ? to : Object.values(D.pieces).find((q) => q.kind === "session" && String(q.sessionId ?? "") === to)?.id;
  if (!pid) return;
  const title = text.trim().split("\n")[0].slice(0, 80) || "a note";
  (G()[pid] = (G()[pid] ?? []).filter((g) => g.key !== id)).push({ key: id, kind: "note", title });
  hintDone(); render();
}

const own: Moves = {
  /** a piece of the canvas dragged into a session: its next message, and on its table; the piece stays where it was */
  table_give(pid: string, what: string): Done {
    const q = D.pieces[what];
    if (!isSession(pid) || !q || NOT_ON_TABLE.has(q.kind)) return done(false);
    if ((G()[pid] ?? []).some((g) => g.piece === what)) return done(false, pid);   // it has it already
    const r = M.talk(pid, givenWords(q)) as Done;
    if (r && r.ok === false) return r;
    (G()[pid] = G()[pid] ?? []).push({ key: what, kind: q.kind, title: titleOf(q), piece: what });
    hintDone(); render();
    return done(true, pid, () => { G()[pid] = (G()[pid] ?? []).filter((g) => g.piece !== what); render(); });
  },
};
export default own;

Object.assign(MOVE_FN, { table_give: "attach" });
