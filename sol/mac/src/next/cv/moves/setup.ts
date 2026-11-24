// A folder's setup and its agent, in fit mode (BR1 people item 2, #1615; the engine's next/setup.ts, sol/PROTOCOL.md
// "Every folder has a setup"). Pointing at a folder in Fit Sol shows what it is for, how its things are organized, what it
// shows at rest and opened, and its look, each a row of takes; a take is tried through the engine's preview
// (next.folder.setup.set → { preview: { token } }) and kept or left with that token, as fit mode's own takes are. "Use
// this setup" sets a folder up as it stands, and from then its agent sorts new things in; "Sort now" asks it at once;
// each sort is one Diary line, and its moves are undone here (fsSortBack) or from the line. Every word comes from the
// engine, so nothing here words a field or a take. Live only: the fixture has no engine to read a folder with.
// The state is S.fs; the answers land through cv/wire/setup.ts. Named fs* so none meets a shared move.
// Signed: marcocyl04-ux's agent, BR1 people item 2 (#1615).
import { MODE, S, done, hooks, render, type Done, type Moves } from "../core.ts";
import type { Engine } from "../wire/types.ts";
import { MOVE_FN, PERSON_ONLY } from "../../agent/calls.ts";
import { SETUPS } from "../../folder/setup/fixture.ts";

export type SetupField = { field: string; n: string; take: string; name: string; by: "default" | "person" | "sol"; takes: { id: string; n: string }[] };
/** the setup read from what the folder holds (setup.html, P9's setup-read.ts): three lines, ✦ (sol) until kept; empty:
 *  too early, no lines and no guess */
export type ReadLine = { key: "for" | "organized" | "looks"; field: "job" | "order" | "look"; n: string; line: string; short: string; because: string; k: string; by: "sol" | "person" };
export type SetupRead = { empty: boolean; line: string; sol: boolean; lines: ReadLine[]; why?: string };
export type FolderSetup = { folder: string; scope: string | null; because: string[]; history: boolean; set: { at: number; by: "person" | "sol" } | null; fields: SetupField[]; look: string; sorts: boolean; read?: SetupRead };
export type SortMove = { thing: { kind: "note" | "session"; id: string; label: string }; from: string; to: string; toN: string; why: string; made: boolean; back?: number };
export type SortRun = { id: string; at: number; folder: string; by: "sol" | "person"; moves: SortMove[]; line?: string };
export type FsTry = { folder: string; field: string; take: string; token: string | null; fromN: string | null; toN: string; keeping?: boolean; why?: string };
export type FS = {
  /** each folder's setup as the engine last said it, by the folder's id */
  by: Record<string, FolderSetup>;
  trying: FsTry | null;
  kept: { folder: string; field: string; token: string; toN: string } | null;
  /** the last sort of a folder, for its Undo here */
  runs: Record<string, SortRun>;
  says: string | null;
  /** the folder whose setup line is open in its header (setup.html §2); the bar talks to it while that folder is open */
  open?: string | null;
};

export const fsLink: { e: Engine | null } = { e: null };
const live = () => MODE === "live";
const send = (o: object) => (fsLink.e ? fsLink.e.send(o) : false);

export function FSs(): FS {
  if (!S.fs) S.fs = { by: {}, trying: null, kept: null, runs: {}, says: null } satisfies FS;
  return S.fs as FS;
}
/** a folder's setup: the engine's, else (the dev page and tests, no engine) the fixture's, folder/setup/fixture.ts */
export const setupOf = (folder: string): FolderSetup | null => FSs().by[folder] ?? (live() ? null : SETUPS[folder] ?? null);
const asked = new Set<string>();
/** asked once per folder drawn, live (its card's front line and its header line read it) */
export function fsAsk(folder: string): void {
  if (!folder || !live() || asked.has(folder) || FSs().by[folder]) return;
  asked.add(folder);
  send({ type: "next.folder.setup", folder });
}
/** on the fixture there is no engine: a change is made to a copy here, so the dev page answers a press */
function fixChange(folder: string, f: (r: SetupRead) => SetupRead): boolean {
  const s = setupOf(folder);
  if (!s?.read) return false;
  FSs().by[folder] = { ...s, read: f(s.read) };
  return true;
}
/** the look a folder is drawn with at rest: its setup's, once the engine said it */
export const lookOf = (folder: string): string | null => FSs().by[folder]?.look ?? null;

/** every sort this window heard of, by its id: a Diary line names its run (book.ts Line.sort), whose moves say why */
const seen = new Map<string, SortRun>();
hooks.onLoad.push(() => seen.clear());
export const sortRunOf = (id: string): SortRun | undefined => seen.get(id);
function drop(f: FS) {
  if (f.trying?.token && live()) send({ type: "next.folder.setup.set", folder: f.trying.folder, token: f.trying.token, back: true });
  f.trying = null;
}

/** the wire's half: the engine's answers (cv/wire/setup.ts) */
export function heard(m: { type?: string; ok?: boolean; why?: string; setup?: FolderSetup; setups?: FolderSetup[]; preview?: { token: string; changes: { field?: string; folder?: string; to: string; fromN?: string; toN?: string }[] };
  kept?: boolean; back?: boolean; token?: string; run?: SortRun | null; refused?: { why: string }[]; says?: string }): void {
  const f = FSs();
  if (m.ok === false) {
    if (m.type === "next.folder.setup.set" && f.trying) { f.trying.why = m.why ?? "That didn’t take."; f.trying.keeping = false; }
    else f.says = m.why ?? null;
    render(); return;
  }
  if (m.setups) for (const s of m.setups) f.by[s.folder] = s;
  if (m.setup) f.by[m.setup.folder] = m.setup;
  if (m.type === "next.folder.setup.set") {
    const t = f.trying;
    if (m.preview && t && !t.token) {
      const c = m.preview.changes?.[0];
      if (c && c.folder === t.folder && c.field === t.field && c.to === t.take) { t.token = m.preview.token; t.fromN = c.fromN ?? null; }
      else send({ type: "next.folder.setup.set", folder: c?.folder ?? t.folder, token: m.preview.token, back: true });   // an answer to a try already left
    } else if (m.kept && t && m.token === t.token) {
      f.kept = { folder: t.folder, field: t.field, token: t.token, toN: t.toN };
      f.trying = null;
      hooks.flash?.(`Kept: ${t.toN}`);
    } else if (m.back && f.kept?.token === m.token) f.kept = null;
  }
  if (m.type === "next.folder.sorted") {
    if (m.run) { f.runs[m.run.folder] = m.run; seen.set(m.run.id, m.run); }
    f.says = m.refused?.length ? m.refused.map((x) => x.why).join(" ") : m.says ?? null;
  }
  render();
}

const moves: Moves = {
  /** ask the engine for a folder's setup (the card opened on it, or it was pointed at) */
  fsLoad(folder: string): Done {
    if (!folder || !live()) return done(false);
    send({ type: "next.folder.setup", folder });
    return done(true, folder);
  },
  /** the setup line pressed: its three lines open in place, and the bar talks to it (setup.html §2) */
  fsOpen(folder: string): Done {
    const s = setupOf(folder), f = FSs();
    if (!s?.read || s.read.empty || f.open === folder) return done(false);
    const was = f.open ?? null;
    f.open = folder; f.says = null;
    render();
    return done(true, folder, () => { FSs().open = was; render(); });
  },
  /** Esc, × on the bar's To, or the line pressed again: closed to its one line */
  fsClose(): Done {
    const f = FSs(), was = f.open;
    if (!was) return done(false);
    drop(f); f.open = null;
    render();
    return done(true, was, () => { FSs().open = was; render(); });
  },
  /** × on a read line: taken out, and Sol remembers it (the engine's one fix line, next.folder.setup.drop) */
  fsDrop(folder: string, line: string): Done {
    const s = setupOf(folder), l = s?.read?.lines.find((x) => x.key === line);
    if (!l) return done(false);
    if (live()) send({ type: "next.folder.setup.drop", folder, line });
    else fixChange(folder, (r) => { const lines = r.lines.filter((x) => x.key !== line); return { ...r, lines, line: lines.map((x) => x.short).join(" · ") }; });
    hooks.flash?.(`Taken out: “${l.short}”. Sol remembers it.`);
    render();
    return done(true, `${folder}:${line}`);
  },
  /** try a take of one field in the folder: nothing changes until Keep */
  fsTry(folder: string, field: string, take: string): Done {
    const f = FSs(), s = f.by[folder], x = s?.fields.find((y) => y.field === field), t = x?.takes.find((y) => y.id === take);
    if (!s || !x || !t || !live()) return done(false);
    if (f.trying && f.trying.folder === folder && f.trying.field === field && f.trying.take === take) return done(true, take);
    drop(f); f.says = null;
    if (take === x.take) { render(); return done(false, field); }
    f.trying = { folder, field, take, token: null, fromN: x.name, toN: t.n };
    send({ type: "next.folder.setup.set", folder, field, take, by: "pick" });
    render();
    return done(true, `${field}:${take}`, () => { drop(FSs()); render(); });
  },
  fsKeep(): Done {
    const t = FSs().trying;
    if (!t?.token || t.keeping) return done(false);
    t.keeping = true; t.why = undefined;
    send({ type: "next.folder.setup.set", folder: t.folder, token: t.token, keep: true });
    render();
    return done(true, t.field);
  },
  fsBack(): Done { const f = FSs(), was = !!f.trying; drop(f); render(); return done(was); },
  /** take back the field just kept (the engine holds it there, so Sol leaves it alone) */
  fsUndo(): Done {
    const k = FSs().kept; if (!k) return done(false);
    send({ type: "next.folder.setup.set", folder: k.folder, token: k.token, back: true });
    return done(true, k.field);
  },
  /** set the folder up as it stands: its agent sorts new things in from now */
  fsUse(folder: string): Done {
    if (!live() && setupOf(folder)?.read?.sol && fixChange(folder, (r) => ({ ...r, sol: false }))) { render(); return done(true, folder); }   // the dev page: ✦ goes
    if (!FSs().by[folder] || !live()) return done(false);
    send({ type: "next.folder.setup.keep", folder });
    return done(true, folder);
  },
  /** the folder's agent sorts what is new now */
  fsSort(folder: string): Done {
    if (!FSs().by[folder] || !live()) return done(false);
    FSs().says = null;
    send({ type: "next.folder.sort", folder });
    return done(true, folder);
  },
  /** a sort's moves put back (or one of them): each stays where it was put back, and the agent leaves it */
  fsSortBack(run: string, move?: number): Done {
    if (!run || !live()) return done(false);
    send({ type: "next.folder.sort.back", run, ...(typeof move === "number" ? { move } : {}) });
    return done(true, run);
  },
};
export default moves;

// the AI's side (count 13): looking and trying are the AI's to offer; keeping a setup, setting a folder up and taking a
// sort back are the person's
Object.assign(MOVE_FN, { fsOpen: "look", fsClose: "look", fsDrop: "take_back", fsLoad: "look", fsTry: "offer", fsKeep: "offer", fsBack: "offer", fsUndo: "take_back", fsUse: "offer", fsSort: "offer", fsSortBack: "take_back" });
for (const m of ["fsKeep", "fsUndo", "fsUse", "fsSortBack", "fsDrop"]) PERSON_ONLY[m] = "setting";
for (const m of ["fsOpen", "fsClose"]) PERSON_ONLY[m] = "camera";
