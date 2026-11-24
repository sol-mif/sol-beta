// owned by slice 4 (Life and Diary), docs/port/slices.md
// The diary's wire (#1615, BR1): in a real Sol the book's today is the person's today (book.ts goLive) and the engine
// keeps the person's own lines (sol/PROTOCOL.md "## next": next.diary.get · next.diary.write · next.diary.remove). A line
// written here goes to the engine (book.ts out.write); the engine's answer, to every window, gives each line its id, so a
// line written in another window shows here too and one removed there goes here. Once the engine has answered, the
// diary is drawn (ready "write", "remove_line"). The AIs' runs on the hours are next.traces (settings' stWorked, the
// diary view asks); the asks are the store's own. The fixture never runs this.
// Signed: marcocyl04-ux's agent, BR1's Diary (#1615).
import { D, ready, render } from "../core.ts";
import * as B from "../../diary/book.ts";
import type { Engine } from "./types.ts";
import { keysOf } from "./needs.ts";

/** a line as the engine keeps it */
type EngLine = { id: string; at: number; who?: string; words: string; region?: string | null; via?: string | null; because?: unknown; session?: string; embed?: unknown };
/** the folder agent's sort a line says (the engine's next/setup.ts sortRun writes embed { sort: run id }, via "sort") */
const sortOf = (x: EngLine): string | undefined => { const s = (x.embed as { sort?: unknown } | null)?.sort; return typeof s === "string" && s ? s : undefined; };
const ENG = "eng:";
/** the engine's name for today (the Mac's local day, engine next/diary.ts dayOf) */
const today = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

function take(lines: EngLine[]): void {
  const b = B.book(), have = new Set<string>();
  for (const x of lines) {
    if (!x || typeof x.id !== "string" || typeof x.words !== "string") continue;
    const key = ENG + x.id;
    have.add(key);
    const had = B.byKey(key, b);
    if (had) { had.removed = false; continue; }
    // the line this window just wrote, come back with its id
    const mine = B.lines(0, { removed: true }).find((l) => l.mine && !l.key && l.what === x.words.trim());
    if (mine) { mine.key = key; mine.t = B.loc(x.at); continue; }
    // a line Sol wrote for a session (who "sol") is Sol's, said by that session's task, never the person's (BR1 item 7)
    const s = x.who === "sol" ? Object.values(D.pieces).find((p) => p.kind === "session" && (p.sessionId === x.session || p.id === x.session)) : undefined;
    // a sort is the folder's agent's, never the person's line: Sol says it, and its Undo takes the moves back (BR1, #1615)
    const sort = sortOf(x);
    if (sort) { B.note({ who: B.VOICE, kind: "ai", mine: false, force: true, what: x.words.replace(/^Sol (?=sorted )/, ""), region: x.region ?? null, t: B.loc(x.at), day: 0, key, sort, ...keysOf(x.because) }); continue; }
    B.note(x.who === "sol"
      ? { who: s ? B.taskOf(s) : B.VOICE, kind: "ai", mine: false, force: true, what: x.words, region: x.region ?? s?.region ?? null, t: B.loc(x.at), day: 0, key, ...(s ? { embed: { id: s.id } } : {}), ...keysOf(x.because) }
      : { who: "person", kind: "mine", what: x.words, region: x.region ?? null, t: B.loc(x.at), day: 0, key, via: x.via ?? undefined, ...keysOf(x.because) });
  }
  for (const l of B.lines(0)) if (l.key?.startsWith(ENG) && !have.has(l.key)) l.removed = true;   // removed in another window
}

export function attach(e: Engine): () => void {
  B.goLive();
  B.out.write = (l) => { e.send({ type: "next.diary.write", words: l.what, ...(l.region ? { region: l.region } : {}), ...(l.via ? { via: l.via } : {}) }); };
  B.out.remove = (l, back) => { if (l.key?.startsWith(ENG)) e.send({ type: "next.diary.remove", lineId: l.key.slice(ENG.length), ...(back ? { back: true } : {}) }); };
  let first = true;
  const off = e.subscribe((m: { type?: string; day?: string; lines?: EngLine[] }) => {
    if (m?.type !== "next.diary" || !Array.isArray(m.lines) || (m.day && m.day !== today())) return;   // another day's page: not this one
    take(m.lines);
    if (first) { first = false; ready("write", "remove_line", "flip", "pause_diary", "to_sticky"); } else render();
  });
  e.send({ type: "next.diary.get" });
  return () => { off(); B.out.write = undefined; B.out.remove = undefined; };
}
