// The move-in's rows and rules (round 6 · M1, #1615; the mockup's merge/movein.js, ported as it is): the panel's people
// only (Dev, Denise, Jayden, Sam), each with the places, sessions and AIs Sol found and the rows it is unsure of. The
// choices are pure data: being made (EDIT, while the screen is open) and made (DONE, applied at every load of that canvas).
//   a row left alone is kept · Fix renames it · Drop archives a folder, a chat or an AI hidden (nothing is deleted)
//   dropping a session hides its AI with it when that was the AI's only session
//   an unsure row: one of its two answers, or "Ask me later" (one Needs-you ask, mv:<scn>:<uid>, once the person goes on)
// Fixture data only: a real Sol reads its rows from the engine (next.movein.read, slice 7), never from here.
// Signed: marcocyl04-ux's agent, port slice 11 (#1615).
import type { Data, Piece } from "../cv/types.ts";
import type { Found } from "../known.ts";
import type { Mig, Plan } from "./plan.ts";

export type Kind = "place" | "session" | "ai";
/** one row: `z` a place's zone; `ai` and `in` a session's AI and place; `seat` and `rt` an AI's plan and routines */
export type Row = {
  id: string; k: Kind; n: string; z?: "Build" | "Life"; from?: string; extra?: boolean; ai?: string; in?: string; seat?: string; rt?: string;
  /** live (BR1): the small line as the engine's read gives it, a line of what Sol adds, the sessions a place holds, an
   *  app's own row (Claude Code, Codex: nothing to fix or drop), and a folder to make when kept (an app's project) */
  small?: string; plus?: string; sessions?: number; locked?: boolean; path?: string; app?: string; unsure?: boolean;
  /** live (BR1 order 4e): another checkout of the repo whose row this is (its id): its folder stands inside that one */
  copyOf?: string;
  /** live (migration.html B): the person's own words that opened or named this folder (read 2), kept apart from what Sol
   *  saw, for the migration's "you said" */
  said?: string[];
  /** live (BR1 root part 5): the folder as the read found it, which known() says as facts (what it holds, its AIs, its
   *  rules files), each a chip under the row */
  found?: Found;
};
/** a row Sol is unsure of: its question, why, and two answers ("drop:<row>", "merge:<row>:<into>", "seat:<id>", "keep") */
export type Unsure = { id: string; q: string; w: string; opts: [string, string][]; later?: string };
/** apps: the apps found on this Mac (BR1: "Claude Code · 4 projects · 61 sessions"); live: read from this Mac */
export type Person = {
  who: string; moved: boolean; finished: number; finishedWord?: string; replace?: boolean; rows: Row[]; unsure: Unsure[];
  apps?: { app: string; name: string; projects: number; sessions: number }[]; live?: boolean;
  /** the migration (migration.html C): the moves Sol made and what it asks, from the engine's judge (plan.ts planOf) */
  plan?: Plan;
};
/** drop: 1 by hand, "u" by an unsure row's answer, or the session it rests with · name: a fixed name · merge: into ·
 *  done: an unsure row's answer (its label) · later: left for later */
export type Choices = {
  drop: Record<string, string | number>; name: Record<string, string>; merge: Record<string, string>;
  done: Record<string, string>; later: Record<string, number>; skipped?: number; seen?: number;
  /** a place's zone, said by the person (an unsure row's Life or Build) */
  zone?: Record<string, "Build" | "Life">;
  /** the migration's answers (plan.ts Mig): the screen it is on, the moves changed back, each ask's answer */
  mig?: Mig;
};

// a session is named by its task, never its AI (Marco, 2026-11-21 11:51): "Fix login", not "Ada · fix-login"
const task = (c: string) => { const t = c.replace(/[-_]+/g, " "); return t[0].toUpperCase() + t.slice(1); };
const sessionsOf = (xs: [string, string, string, string][]): Row[] => xs.map(([a, c, r, f]) => ({ id: "s-" + a, k: "session", n: task(c), ai: a, in: r, from: f }));
const aisOf = (xs: [string, string, string][]): Row[] => xs.map(([a, seat, rt]) => ({ id: a, k: "ai", n: a, seat, rt }));

export const DATA: Record<string, Person> = {
  "dev-morning": { who: "Dev", moved: true, finished: 46, rows: [
    { id: "api", k: "place", z: "Build", n: "api (repo)", from: "~/code/api · 31 sessions since March" },
    { id: "web", k: "place", z: "Build", n: "web (repo)", from: "~/code/web · 18 sessions" },
    { id: "infra", k: "place", z: "Build", n: "infra (repo)", from: "~/code/infra · 9 sessions" },
    { id: "cli", k: "place", z: "Build", n: "cli (repo)", from: "~/code/cli · 12 sessions" },
    { id: "old", k: "place", z: "Build", n: "old-landing (repo)", from: "~/code/old-landing · last opened 14 July", extra: true },
    { id: "home", k: "place", z: "Life", n: "home, errands", from: "your Reminders list “Home” · 6 open" },
    { id: "money", k: "place", z: "Life", n: "money", from: "4 sessions about budget.xlsx" },
    { id: "health", k: "place", z: "Life", n: "health", from: "2 calendar events · a note “dentist”" },
    ...sessionsOf([["Ada", "fix-login", "api", "40 files changed, not merged yet"], ["Rex", "migrate-db", "api", "9 files · waits on you"], ["Kai", "main-check", "web", "3 files"], ["Lu", "nav-cleanup", "web", "6 files"],
      ["Mo", "tf-upgrade", "infra", "14 files"], ["Ned", "deploy-dir", "infra", "5 files"], ["Oz", "json-flag", "cli", "4 files"], ["Pia", "docs-sweep", "cli", "11 files"]]),
    ...aisOf([["Ada", "Claude Code", "Runs the login tests on every push · sums up last night in api"], ["Rex", "Codex", "Checks the backups restore, 2:00 · retries a failed migration once"],
      ["Kai", "Claude Code", "Checks main builds, hourly · tells you when it breaks"], ["Lu", "Claude Code", "Tidies unused styles, Fridays · screenshots the nav"],
      ["Mo", "Claude Code", "Plans infra changes, never applies · watches cloud spend"], ["Ned", "Codex", "Sweeps old builds, Sundays · checks certificates, Mondays"],
      ["Oz", "Claude Code", "Runs the cli on samples · notes new flags"], ["Pia", "Claude Code", "Fixes broken doc links, 1:00 · keeps README examples running"]])],
  unsure: [
    { id: "u1", q: "old-landing hasn’t been opened since 14 July. Keep it, or let it rest?", w: "Resting puts it in the Diary’s past, out of the sidebar. Its 7 sessions stay findable.", opts: [["Let it rest", "drop:old"], ["Keep it", "keep"]] },
    { id: "u2", q: "Rex and Ned both run in Codex, and Codex’s sign-in ends Friday.", w: "After Friday they stop at the sign-in. Renewing takes a minute, on Codex’s own page.", opts: [["Renew now", "seat:cx"], ["Remind me Thursday", "keep"]] }] },
  denise: { who: "Denise", moved: true, finished: 4, finishedWord: "talks with June", rows: [
    { id: "house", k: "place", z: "Life", n: "home", from: "your calendar · your notes “groceries, call mum”" },
    { id: "kids", k: "place", z: "Life", n: "kids", from: "school emails · 3 this month" },
    { id: "mia-place", k: "place", z: "Life", n: "Mia", from: "the dentist’s emails · the school form", extra: true },
    { id: "work", k: "place", z: "Life", n: "work draft", from: "the report you write with June · second draft" },
    { id: "June", k: "ai", n: "June", seat: "Claude", rt: "Puts school mail in your calendar, 7:00 · reminds you of the bins, Thursdays · gathers the week’s appointments, Sundays" }],
  unsure: [{ id: "u1", q: "Is “Mia” a place of its own, or part of “kids”?", w: "Inside kids, Mia’s dentist and school form sit with the rest of the school things.", opts: [["Part of kids", "merge:mia-place:kids"], ["Her own place", "keep"]] }] },
  jayden: { who: "Jayden", moved: true, finished: 11, rows: [
    { id: "cs", k: "place", z: "Build", n: "CS 101 (class + repo)", from: "~/school/cs101 · the syllabus PDF" },
    { id: "essay", k: "place", z: "Life", n: "history essay", from: "essay-draft.docx · 3 sessions" },
    { id: "reading", k: "place", z: "Life", n: "reading", from: "chapter 4 · due 9:00 tomorrow" },
    { id: "life", k: "place", z: "Life", n: "life", from: "phone plan · renews Friday" },
    { id: "job", k: "place", z: "Life", n: "summer job", from: "shift emails · last one 22 August", extra: true },
    { id: "s-Bo", k: "session", n: "Bo · hw3", ai: "Bo", in: "cs", from: "7 files · 1 test still failing" },
    { id: "Bo", k: "ai", n: "Bo", seat: "Sol’s own, free", rt: "Runs the HW tests an hour before due · sums up lecture notes · lists the week, Sundays" }],
  unsure: [{ id: "u1", q: "“summer job” hasn’t had anything since 22 August. Let it rest?", w: "It leaves the sidebar and stays in the Diary’s past. Nothing is deleted.", opts: [["Let it rest", "drop:job"], ["Keep it", "keep"]] }] },
  /* Sam, new: nothing is there yet, so every row is a proposal (from what he said and what is on his Mac) */
  fresh: { who: "Sam", moved: false, finished: 36, finishedWord: "Claude Code sessions, read by title", replace: true, rows: [
    { id: "murmur", k: "place", z: "Build", n: "Murmur (app)", from: "~/code/murmur · 212 commits · 37 Claude Code sessions", extra: true },
    { id: "job", k: "place", z: "Build", n: "work", from: "your sentence: “I’m a developer”", extra: true },
    { id: "physio", k: "place", z: "Life", n: "physio", from: "calendar: “Physio – Dr. Lane”, Tue and Thu 8:00", extra: true },
    { id: "home", k: "place", z: "Life", n: "home", from: "Reminders: “Home” · 4 open", extra: true },
    { id: "s-Ada", k: "session", n: "Fix the wake word", ai: "Ada", in: "murmur", from: "from Claude Code, yesterday · 5 files", extra: true },
    { id: "Ada", k: "ai", n: "Ada", seat: "Claude Code", rt: "No routines yet: they come when you show it something once", extra: true }],
  unsure: [{ id: "u1", q: "Is “work” the same as Murmur, or a job of its own?", w: "You said “I’m a developer” and “Murmur on weekends”.", opts: [["Same as Murmur", "merge:job:murmur"], ["A job of its own", "keep"]] }] },
};

// ---------------------------------------------------------------- the choices

export const blank = (): Choices => ({ drop: {}, name: {}, merge: {}, done: {}, later: {} });
export const copy = (c: Choices): Choices => JSON.parse(JSON.stringify(c));
/** a row's name as it stands */
export const nm = (c: Choices, r: Pick<Row, "id" | "n">) => c.name[r.id] ?? r.n;
/** a row dropped or merged away */
export const gone = (c: Choices, r: Pick<Row, "id">) => !!(c.drop[r.id] || c.merge[r.id]);
export function tally(p: Person, c: Choices): { kept: number; fixed: number; dropped: number; looked: Record<Kind, number>; shelved: number; merged: number; hidden: number } {
  let kept = 0, fixed = 0, dropped = 0, shelved = 0, merged = 0, hidden = 0;
  const looked: Record<Kind, number> = { place: 0, session: 0, ai: 0 };
  for (const r of p.rows) {
    looked[r.k]++;
    if (!gone(c, r)) { kept++; if (c.name[r.id] != null && c.name[r.id] !== r.n) fixed++; continue; }
    dropped++;
    if (c.merge[r.id]) merged++; else if (r.k === "place") shelved++; else hidden++;
  }
  return { kept, fixed, dropped, looked, shelved, merged, hidden };
}
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
/** plain facts, first-timer P 2: "Sol looked at 5 folders and 3 AIs · 1 renamed · 2 archived" (a folder removed is
 *  archived, found in Sessions › Archived, holders.html; a chat or an AI removed is hidden) */
export function tallyWords(t: ReturnType<typeof tally>): string {
  const what = [t.looked.place && many(t.looked.place, "folder"), t.looked.session && many(t.looked.session, "chat"), t.looked.ai && many(t.looked.ai, "AI")].filter(Boolean) as string[];
  const seen = what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what[what.length - 1]}` : what[0] ?? "nothing";
  return [`Sol looked at ${seen}`, t.fixed && `${t.fixed} renamed`, t.merged && `${t.merged} merged`, t.shelved && `${t.shelved} archived`, t.hidden && `${t.hidden} hidden`].filter(Boolean).join(" · ");
}

/** an answer to an unsure row: drop:<row> · merge:<row>:<into> · seat:<id> (Seats does the renewing: `seat` is told) ·
 *  keep. No answer says what kind a folder is: zones are gone (BR1, 2026-11-21) */
export function answerTo(c: Choices, u: Unsure, a: string, label: string, seat?: (id: string) => void): void {
  c.done[u.id] = label; delete c.later[u.id];
  const [k, x, y] = a.split(":");
  if (k === "drop") c.drop[x] = "u";
  else if (k === "merge") c.merge[x] = y;
  else if (k === "seat") seat?.(x);
}
/** an answer taken back */
export function unanswer(c: Choices, u: Pick<Unsure, "id" | "opts">): void {
  const o = u.opts.find(([l]) => l === c.done[u.id]);
  delete c.done[u.id];
  if (!o) return;
  const [k, x] = o[1].split(":");
  if (k === "drop" && c.drop[x] === "u") delete c.drop[x];
  if (k === "merge") delete c.merge[x];
}
/** one row kept (Bring back), fixed (a new name) or dropped; a dropped session rests its AI with it when that was the
 *  AI's only session left. False when there is no such row */
export function rowMove(p: Person, c: Choices, id: string, what: "keep" | "fix" | "drop", val?: unknown): boolean {
  const r = p.rows.find((x) => x.id === id);
  if (!r) return false;
  if (what === "drop") {
    c.drop[id] = 1;
    if (r.k === "session" && !p.rows.some((x) => x.k === "session" && x.ai === r.ai && x.id !== id && !gone(c, x)) && p.rows.some((x) => x.id === r.ai)) c.drop[r.ai!] = id;
  } else if (what === "keep") {
    delete c.drop[id]; delete c.merge[id];
    for (const k in c.drop) if (c.drop[k] === id) delete c.drop[k];
  } else if (what === "fix") {
    const v = String(val ?? "").trim();
    if (v && v !== r.n) c.name[id] = v; else delete c.name[id];
  }
  return true;
}
/** Skip: everything as it is, every unsure row not answered left for later */
export function skipAll(p: Person, c: Choices): void { c.skipped = 1; for (const u of p.unsure) if (!c.done[u.id]) c.later[u.id] = 1; }

// ---------------------------------------------------------------- applied to the canvas at its load: exactly the kept rows

export const piecesOf = (D: Data, rid: string) => Object.values(D.pieces).filter((p) => p.region === rid).map((p) => p.id);
export function removePiece(D: Data, id: string): void {
  delete D.pieces[id];
  for (const a in D.asks) if (D.asks[a].piece === id) delete D.asks[a];
  D.ais = D.ais.filter((a) => a.piece !== id);
}
/** the canvas holds exactly the kept rows (merge/movein.js apply), before the plane is laid out; `only`, the engine's
 *  tree once it has come (#1816): a kept row draws a folder only if the tree holds it */
export function apply(D: Data, p: Person, c: Choices, only?: ReadonlySet<string>): void {
  if (p.replace) {
    for (const r of D.regions.slice()) if (!p.rows.some((x) => x.id === r.id)) for (const id of piecesOf(D, r.id)) removePiece(D, id);
    D.regions = D.regions.filter((r) => p.rows.some((x) => x.id === r.id));
    D.crew = [];
  }
  for (const r of p.rows) {
    const out = gone(c, r), reg = D.regions.find((x) => x.id === r.id);
    if (r.k === "place") {
      if (out) {
        const into = c.merge[r.id] ? D.regions.find((x) => x.id === c.merge[r.id]) : undefined;
        for (const id of piecesOf(D, r.id)) { if (into) D.pieces[id].region = into.id; else removePiece(D, id); }
        D.regions = D.regions.filter((x) => x.id !== r.id);
      } else {
        const kind = zoneOf(c, r) === "Life" ? "life" : "code";
        if (reg) { reg.name = nm(c, r); if (c.zone?.[r.id]) reg.kind = kind; if (r.path && !reg.path) reg.path = r.path; }
        // a kept folder is always drawn, live too: one with no session yet (a project folder, an empty Sol home folder)
        // was left off the canvas, so a person's kept folder showed only in the sidebar (BR1, #1615)
        else if (!only || only.has(r.id)) D.regions.push({ id: r.id, name: nm(c, r), kind, made: true, ...(r.path ? { path: r.path, from: r.id.startsWith("h:") ? "places" : "work" } : {}) });
      }
    } else if (r.k === "session") {
      if (out) { removePiece(D, r.id); continue; }
      if (!D.pieces[r.id] && D.regions.some((x) => x.id === r.in)) {
        const cp = nm(c, r).split(" · ").slice(1).join(" · ") || r.n;
        const s: Piece = { id: r.id, region: r.in!, kind: "session", name: `${r.ai} in ${cp}`, ai: r.ai, copy: cp, branch: "ai/" + cp.replace(/\W+/g, "-"), files: 5, state: "working",
          term: { lines: [`~/${r.in} $ _`], waiting: null, stateWord: "working" }, talk: [`${r.ai}: on it.`] };
        D.pieces[r.id] = s;
        if (!D.ais.some((a) => a.name === r.ai)) D.ais.push({ name: r.ai!, piece: r.id });
      } else if (D.pieces[r.id] && c.name[r.id] != null) {
        const cp = nm(c, r).split(" · ").slice(1).join(" · ");
        if (cp) { D.pieces[r.id].copy = cp; D.pieces[r.id].name = `${r.ai} in ${cp}`; }
      }
    } else if (r.k === "ai") {
      if (out) { D.ais = D.ais.filter((a) => a.name !== r.id); continue; }
      const to = nm(c, r);
      if (to !== r.n) { for (const a of D.ais) if (a.name === r.n) a.name = to; for (const q of Object.values(D.pieces)) if (q.ai === r.n) q.ai = to; }
    }
  }
}

/** a place's zone as it stands: the person's answer, else what was read; an unsure place not answered is Build (it came
 *  from an AI app's sessions) */
export const zoneOf = (c: Choices, r: Pick<Row, "id" | "z">): "Build" | "Life" => c.zone?.[r.id] ?? r.z ?? "Build";

/** the Diary's lines for a move-in: one for the move, one for each change (a keep is the default and writes nothing) */
export function linesOf(name: string, p: Person, c: Choices): { key: string; what: string; why: string }[] {
  const out = [{ key: `movein:${name}`, what: `You moved in. ${tallyWords(tally(p, c))}.`, why: "Moving in" }];
  for (const r of p.rows) {
    const key = `movein:${name}:${r.id}`;
    if (c.merge[r.id]) out.push({ key, what: `${r.n} is part of ${(p.rows.find((x) => x.id === c.merge[r.id]) || { n: c.merge[r.id] }).n} now.`, why: "Moving in · undo in Bring in what you have" });
    else if (c.drop[r.id]) out.push(r.k === "place"
      ? { key, what: `${r.n} is archived; nothing was deleted.`, why: "Moving in · Bring back in Sessions › Archived" }
      : { key, what: `${r.n} is hidden; nothing was deleted.`, why: "Moving in · Bring back in Bring in what you have" });
    else if (c.name[r.id] != null && c.name[r.id] !== r.n) out.push({ key, what: `${r.n} is called ${c.name[r.id]} now.`, why: "Moving in" });
  }
  return out;
}

/** why a row is gone (merged, dropped), in words; "" while it is kept */
export function goneWhy(p: Person, c: Choices, r: Row): string {
  const d = c.drop[r.id], by = d && d !== "u" && d !== 1 ? (p.rows.find((x) => x.id === d) || ({} as Partial<Row>)).n : null;
  return c.merge[r.id] ? `now part of ${nm(c, p.rows.find((x) => x.id === c.merge[r.id]) || { id: c.merge[r.id], n: c.merge[r.id] })}`
    : by ? `hidden with ${by}` : d ? (r.k === "place" ? "archived" : "hidden") : "";
}
/** where a row came from: the read's words for it (a folder's path and what it is; an AI's skills), else the scene's.
 *  How much a folder holds is not said here: that is its place's line (place.ts) */
export function fromWords(p: Person, c: Choices, r: Row): string {
  const inName = r.in ? nm(c, p.rows.find((x) => x.id === r.in) || { id: r.in, n: r.in }) : "";
  return r.small ?? (r.k === "ai" ? `in ${r.seat} · ${r.rt}` : r.k === "session" ? `in ${inName} · ${r.from}` : r.from ?? "");
}
