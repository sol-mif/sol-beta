// Every Claude Code session on this machine, read through the SDK (listed.ts keeps ~/.claude/projects as an index; nothing
// here writes it), grouped by the folder it works in. A side copy (a git worktree Sol made, copies.ts)
// files under its repo with a worktree tag. Syncthing brings the other machine's sessions too: a folder under another
// home (/Users/<x>/… on the Mac, /home/<x>/… on the NucBox) files under the same folder in this home, and the session
// carries the machine it ran on. A folder renamed or moved (state.ts moved, #129) keeps its sessions: a transcript still
// says the old place, and files under the new one. Scratch dirs drop out; a folder that is not here stays, marked gone,
// but a folder whose sessions are all gone drops out too unless the stale pref is on. A folder wears its own name on the
// disk (#181: renaming it in the side renames the folder, rename.ts), or parent/name when two listed share one.
// A GPT talk in a folder (a Codex thread whose cwd is not Sol's home, threads.ts codexTalks, #182) files the same way,
// beside Claude's, with seat "codex": the face tags it gpt and opens it as a talk with the GPT seat.
import { existsSync, readdirSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { getSessionMessages, type SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { listed, stale, projectsDir } from "./listed.js";
import { workState, prefs, moved, type Marks } from "./state.js";
import { Items, type Item } from "./items.js";
import { copyOf, worktreeOf, forgetWorktrees } from "./copies.js";
import { heldElsewhere, type Holder } from "./holders.js";
import { lastSaid } from "./said.js";
import { inHome, machineOf, twinIn, type Machine } from "../home.js";
import { codexTalks } from "../threads.js";
import { getTitles } from "../titles.js";
import { titleOf } from "../cross.js";   // #1031: a title is the person's words, never the Home line

export type WorkSession = {
  id: string; title: string; cwd: string; project: string; worktree?: string; branch?: string; machine?: Machine;
  updatedAt: number; createdAt?: number; size?: number; tag?: string; gone?: boolean;
  held?: Holder;   // open in another live process (the Claude app, another Sol): read-only here
  seat?: "codex";  // a GPT talk (#182); a Claude session has none
  running?: boolean;   // a GPT talk with a turn going (busy.ts; Claude's say so through runs)
} & Marks;
export type Project = { path: string; name: string; count: number; added?: boolean; group?: string; latest?: number };   // group: the group the folder sits in
// latest: its last activity, the newest last-said time over its sessions that are not archived, pinned and grouped ones too
// (#1179: the face sorted folders by their loose sessions only, so a folder whose sessions all sat in topic groups sank)
export type { Machine };
export { twinIn };

// the same folder in this machine's home
const local = (p: string) => twinIn(p, homedir());
// the repo a folder is a copy of: as copies.ts reads it, else read in this home (a worktree on the other machine, #496)
const copyIn = (cwd: string) => copyOf(cwd) ?? (local(cwd) !== cwd ? worktreeOf(local(cwd)) : null);

// scratch folders (test fixtures, other sessions' scratchpads) stay out unless Marco adds one by hand
const SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//;
// the Claude desktop app's scratch workspaces: scratch too, shown only with the stale pref (or added by hand)
const APP_SCRATCH = /\/Library\/Application Support\/Claude\/scratch-workspaces\//;
const there = new Map<string, boolean>();
const exists = (p: string) => { let v = there.get(p); if (v === undefined) { v = existsSync(p); there.set(p, v); } return v; };
// a folder renamed or moved (state.ts moved; sol/mine/live --rename writes it, #129): a path recorded in the old place,
// or under it, is the same path in the new one. The map is keyed by this home's paths; the twin goes through it after
const same = (p: string) => p;
export const movedTo = (map: Record<string, string>) => (p: string) => {
  for (const [from, to] of Object.entries(map)) if (p === from || p.startsWith(from + "/")) return to + p.slice(from.length);
  return p;
};
export const relocated = (p: string) => movedTo(moved())(p);

// the folder a session works in on this machine (One Sol, #62): its own, else the same folder in this home (a session
// the other machine made, its transcript brought by Syncthing), where it went if that folder moved (#129), else none
export const workFolderIn = (cwd: string, home: string, isDir: (p: string) => boolean, at: (p: string) => string = same) => {
  if (isDir(cwd)) return cwd;
  const t = at(twinIn(cwd, home));
  return t !== cwd && isDir(t) ? t : undefined;
};

// where Claude Code keeps a session's transcript: under ~/.claude/projects, in a folder named after its cwd. One from
// the other machine keeps its own folder name when it comes over Syncthing; if it was filed under this home instead,
// the next guess finds it; a folder that moved may keep its old name there (a move by hand) or wear the new one (live
// renames them), so both are tried (and a miss costs nothing: lastSaid falls back to the file's time).
export const slug = (p: string) => p.replace(/[^A-Za-z0-9]/g, "-");
const transcript = (id: string, ...cwds: string[]) => {
  const guesses = [...new Set(cwds.flatMap((c) => (inHome(c) ? [c, local(c)] : [c])))].map((c) => join(homedir(), ".claude", "projects", slug(c), `${id}.jsonl`));
  return guesses.find((f) => existsSync(f)) ?? guesses[0];
};
/** a session's transcript and those of the background agents it started (Claude Code keeps them beside it, under
 *  `<id>/subagents`): where the hand-in card reads which PRs the session opened (#579, team/handin.ts openedIn) */
export function transcriptFiles(id: string, cwd: string): string[] {
  const f = transcript(id, cwd);
  if (!existsSync(f)) return [];
  const sub = join(f.slice(0, -".jsonl".length), "subagents");
  let agents: string[] = [];
  try { agents = readdirSync(sub).filter((x) => x.endsWith(".jsonl")).map((x) => join(sub, x)); } catch { /* it started none */ }
  return [f, ...agents];
}

// the index of transcripts (listed.ts): read again only where a transcript changed (the watcher below) or a write here
// marked it stale; 10 s is the net under both
const all = () => listed();

// GPT talks in folders (#182): Sol's home (its own chats stay Life's) and the threads that are not talks (`skip`, the
// review seat's) are set once by the engine
let gptHome: string | null = null, gptSkip: () => Set<string> = () => new Set();
export function setWorkHome(home: string, skip?: () => Set<string>) { gptHome = home; if (skip) gptSkip = skip; }
export type GptInfo = { sessionId: string; cwd: string; summary: string; lastModified: number; fileSize?: number };
async function gptTalks(): Promise<GptInfo[]> {
  if (!gptHome) return [];
  const names = getTitles();   // Sol's own name for a talk (nameThread) wins over the cut first message
  return (await codexTalks(gptHome, gptSkip())).map((t) => ({ sessionId: t.id, cwd: t.cwd, summary: names[t.id] || t.title || "new talk", lastModified: t.updatedAt, fileSize: t.size }));
}

export async function workSessions(): Promise<{ sessions: WorkSession[]; projects: Project[] }> {
  const [claude, gpt] = await Promise.all([all(), gptTalks().catch(() => [])]);
  return fileSessions(claude, gpt);
}

// the SDK's list filed by folder, with Sol's marks and groups on it (no reading of ~/.claude here: tests feed it),
// and the GPT talks beside it, filed by the same rules
export function fileSessions(list: (SDKSessionInfo & { file?: string })[], gpt: GptInfo[] = []): { sessions: WorkSession[]; projects: Project[] } {
  const st = workState(), stale = prefs().stale;
  const hidden = new Set(st.hidden), byHand = new Set(st.folders);
  let out: WorkSession[] = [];
  const counts = new Map<string, number>();
  const here = new Set<string>();   // folders with at least one session whose folder is still there
  const at = movedTo(st.moved ?? {});
  const both: (SDKSessionInfo & { file?: string; gpt?: true })[] = [...list, ...gpt.map((g) => ({ ...g, gpt: true as const }))];
  for (const s of both) {
    if (!s.cwd) continue;
    if (st.marks[s.sessionId]?.canvas || st.marks[s.sessionId]?.help) continue;   // the canvas bar's own session is no folder's (#1615, next/canvas-agent.ts)
    const cwd = at(s.cwd);   // a folder that moved: the session is in its new place (its transcript still says the old one)
    const w = copyIn(cwd);
    const marked = st.marks[s.sessionId]?.folder;   // Marco put it under another folder
    const project = marked || at(local(w ? w.repo : cwd));
    if ((SCRATCH.test(cwd) || (APP_SCRATCH.test(cwd) && !stale)) && !byHand.has(project)) continue;
    const gone = !workFolderIn(cwd, homedir(), exists, at);   // a removed side copy: the row stays (search, archive, fork, delete), marked
    if (hidden.has(project)) continue;
    if (!gone) here.add(project);
    counts.set(project, (counts.get(project) ?? 0) + 1);
    out.push({
      id: s.sessionId, title: s.customTitle || titleOf(s.summary || s.firstPrompt || "") || "untitled", cwd, project,   // #1031 the person's words
      ...(machineOf(cwd) ? { machine: machineOf(cwd) } : {}),
      ...(w ? { worktree: w.name } : {}), ...(gone ? { gone: true } : {}), ...(s.gitBranch ? { branch: s.gitBranch } : {}),
      // the row's time is the last message, not the file: the Claude app writes bookkeeping into idle transcripts (#45).
      // A Codex rollout is only written by its talk: its time is the file's
      updatedAt: s.gpt ? s.lastModified : lastSaid(s.file ?? transcript(s.sessionId, cwd, s.cwd), s.lastModified, s.file ? s.fileSize : undefined), createdAt: s.createdAt, size: s.fileSize, ...(s.tag ? { tag: s.tag } : {}),
      ...(s.gpt ? { seat: "codex" as const } : {}),
      ...(st.marks[s.sessionId] ?? {}),
    });
    if (s.gpt) continue;   // the holders are Claude processes
    const h = heldElsewhere(s.sessionId);
    if (h) out[out.length - 1].held = h;
  }
  // a gone folder: every session in it gone and the folder itself not here; it stays only with the stale pref or by hand
  if (!stale) for (const p of [...counts.keys()]) if (!here.has(p) && !byHand.has(p) && !exists(p)) counts.delete(p);
  if (!stale) out = out.filter((s) => counts.has(s.project));
  for (const f of st.folders) if (!counts.has(f) && exists(f)) counts.set(f, 0);
  // a folder's last activity (#1179): every session shown in it, archived ones apart (the side lists those on their own)
  // and Cowork's (they sit in their own fold, never under a folder)
  const latest = new Map<string, number>();
  for (const s of out) if (!s.archived && s.mode !== "cowork") latest.set(s.project, Math.max(latest.get(s.project) ?? 0, s.updatedAt));
  const added = new Set(st.folders);
  const groupOf = new Map<string, string>();
  for (const g of st.groups) for (const f of g.folders ?? []) groupOf.set(f, g.id);
  const names = new Map<string, number>();
  for (const p of counts.keys()) names.set(basename(p), (names.get(basename(p)) ?? 0) + 1);
  const nameOf = (p: string) => (names.get(basename(p))! > 1 ? `${basename(dirname(p))}/${basename(p)}` : basename(p) || p);
  const projects = [...counts].map(([path, count]) => ({ path, name: nameOf(path), count, ...(added.has(path) ? { added: true } : {}), ...(groupOf.has(path) ? { group: groupOf.get(path) } : {}), ...(latest.has(path) ? { latest: latest.get(path) } : {}) }));
  return { sessions: out, projects };
}

// A run the list does not know yet (a fresh session: its transcript is not written, or not read, yet) shows at once as a
// row of its own, under its folder, with Sol's marks on it (#111). The SDK's row replaces it when the file is read.
export function withRuns(filed: { sessions: WorkSession[]; projects: Project[] }, runs: { sessionId: string; cwd: string; since?: number }[]) {
  const st = workState();
  const have = new Set(filed.sessions.map((s) => s.id));
  const sessions = [...filed.sessions], projects = [...filed.projects];
  for (const r of runs) {
    if (have.has(r.sessionId) || !r.cwd || st.marks[r.sessionId]?.canvas) continue;
    const w = copyIn(r.cwd);
    const project = st.marks[r.sessionId]?.folder || local(w ? w.repo : r.cwd);
    const at = r.since ?? Date.now();
    sessions.push({ id: r.sessionId, title: "new session", cwd: r.cwd, project, ...(w ? { worktree: w.name } : {}), updatedAt: at, createdAt: at, ...(st.marks[r.sessionId] ?? {}) });
    const i = projects.findIndex((x) => x.path === project);
    if (i >= 0) projects[i] = { ...projects[i], count: projects[i].count + 1, latest: Math.max(projects[i].latest ?? 0, at) };
    else projects.push({ path: project, name: basename(project) || project, count: 1, latest: at });
  }
  return { sessions, projects };
}

// the folder a session files under (its own, or the one Marco moved it to), and the topic groups there the model may
// pick from: those inside that folder that say what they are for
export function topicsFor(sessionId: string, cwd: string): { id: string; about: string }[] {
  const st = workState(), w = copyIn(cwd);
  const project = st.marks[sessionId]?.folder || relocated(local(w ? w.repo : cwd));
  return st.groups.filter((g) => g.in === project && g.about).map((g) => ({ id: g.id, about: g.about! }));
}

export function invalidate() { stale(); there.clear(); forgetWorktrees(); }

// A session's transcript as items. Subagents' own steps are read on demand (the subagent pane).
export async function sessionItems(id: string): Promise<Items> {
  const items = new Items();
  const msgs = await getSessionMessages(id, { includeSystemMessages: true });
  for (const m of msgs) items.feed(m);
  items.settle(true);
  return items;
}
export const itemsOf = (x: Items): Item[] => x.list;

// the SDK's row, its folder where it is now if that folder moved (#129): a resume starts there
export async function sessionInfo(id: string) {
  const s = (await all()).find((s) => s.sessionId === id);
  return s?.cwd ? { ...s, cwd: relocated(s.cwd) } : s;
}

// one session's row as the side draws it (its title, folder, branch and the person's marks), read alone: the orchestration
// stage refreshes a block per child per change, never a scan of every session for it (children.ts)
export async function oneSession(id: string): Promise<{ id: string; title: string; cwd?: string; branch?: string } & Marks | undefined> {
  const s = await sessionInfo(id);
  if (!s) return undefined;
  return {
    id, title: s.customTitle || titleOf(s.summary || s.firstPrompt || "") || "untitled",
    ...(s.cwd ? { cwd: s.cwd } : {}), ...(s.gitBranch ? { branch: s.gitBranch } : {}), ...(workState().marks[id] ?? {}),
  };
}

// ~/.claude/projects changes when any Claude Code session writes (Sol's, the desktop app's, a terminal's): the side
// list follows it, at most every 800 ms.
let watcher: FSWatcher | null = null;
export function watchSessions(changed: () => void) {
  if (watcher) return;
  let t: NodeJS.Timeout | undefined;
  try {
    watcher = watch(projectsDir(), { recursive: true }, (_e, name) => {
      if (name && !/\.jsonl$|custom-title\.json$/.test(String(name))) return;
      clearTimeout(t);
      t = setTimeout(() => { stale(); changed(); }, 800);
    });
  } catch { /* no folder yet */ }
}
