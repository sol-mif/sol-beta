// Home's world (#1093, behind `home.world3d`): Home's view "world". The person's path (S/design/design.md, THE PATH):
//   1. Home's side shows "world" under today. Pressed, the whole life is one island floating on the window's glass: the
//      parts of life at the back (folders as pearl boxes, stickies as tiles on them), Build's workshop in front (a plinth
//      per project, a slab per session), his jelly on the plaza, the shelf of what got done today, teammates' lamps.
//      Over it only three counts (working, wants you, done today); a press on one flies to the first such thing.
//   2. What wants him stands on the island's front edge. A press on a tile comes to it: its name, the line it asks, and
//      `do it` and `done`. A press on a folder or a project goes to it; a second press opens it where it lives.
//   3. `do it` (or the tile dropped on his jelly) asks the engine's one press (agent.press, #1228), as Home's own sticky does;
//      the tile turns green in the same frame. When the agent writes its "did:" line the world ticks it done (undo in
//      the toast) and the tile goes to the shelf by itself.
//   4. By hand: a tile dropped on a folder is filed there, on the shelf is done, on open ground Jev says where it belongs.
// Every act changes the lists on screen at once, then writes the file (read just before, the same change, written with
// its hash), then reads again; a refused write puts it back and the toast says why. Re-read every second while anything
// is green, else every 4 s.
// Source: Home's folders (live: the home's stickies.md files, through the engine; with a made-up person:
// ?world.person=<dir> or storage sol.world.person, the same files under that dir; with no engine at all the made-up
// person in memory). Build's projects from the engine's session list (work.sessions).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { useEngine } from "../../useEngine";
import { HEAD, parse, serialize, type Made } from "../folders/stickies";
import { hopTo } from "../../cross/hop";
import { asks, matesOf, projectsOf, running, thingsOf, type Mate, type Part, type Project, type WorldData } from "./model";
import { canFile, canTie, readSaid, toldFolders, doneBy, edgeTold, formAsk, opensMsg, tiedMsg, endedToday, movedOn, leanBy, pairsFrom, placesAt, tiesFromMd, worldMdTie, finished, markNow, orderFrom, stopped, writeWorldMd, personAllowed, putIn, running as isRunning, settle, takeOutIf, tick, tie, tiesIn, untie, type Op } from "./ops";
import { PERSON } from "./person";
import { REGISTRY } from "./registry";
import { canDraw, formOf, makeWorld, type Extra, type Form, type Target, type World } from "./scene";
import { Acts, Counts, Plot } from "./Over";
import { useWorldDots, useWorldSound } from "./flag";
import { makeSound } from "./sound";
import { firstJev, formJev, whereJev } from "./whereJev";
import { keepDay, keepPast, Still } from "./pieces";
import { JELLY } from "../../kit/tokens";
import "./world3d.css";

type E = ReturnType<typeof useEngine>;
export type Ask = <T>(o: object, ms: number) => Promise<T | null>;
type Src = { kind: "live"; base: string | null } | { kind: "person"; base: string } | { kind: "memory" };
type Spec = { id: string; name: string; part: string; rel: string };
type List = { items: Made[]; head: string; hash?: string };
type ThingT = Extract<Target, { kind: "thing" }>;

function useAsk(e: E): Ask {
  const waits = useRef(new Map<string, (m: any) => void>()); const n = useRef(0);
  useEffect(() => e.subscribe((m: any) => { const f = m?.rid && waits.current.get(m.rid); if (f) { waits.current.delete(m.rid); f(m); } }), [e.subscribe]);
  return useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `w3-${Date.now()}-${++n.current}`;
    const t = window.setTimeout(() => { waits.current.delete(rid); res(null); }, ms);
    waits.current.set(rid, (m) => { window.clearTimeout(t); res(m as T); });
    const go = (k: number) => { if (e.send({ ...o, rid }) !== false) return; if (k < 20) { window.setTimeout(() => go(k + 1), 500); return; } window.clearTimeout(t); waits.current.delete(rid); res(null); };
    go(0);
  }), [e.send]);
}

const personDir = () => { const q = new URLSearchParams(location.search).get("world.person"); if (q) return q; try { return localStorage.getItem("sol.world.person"); } catch { return null; } };
const ORDER = "sol.world.order";
const order = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(ORDER) ?? "{}"); } catch { return {}; } };
const today = () => new Date().toDateString();

/** what the world holds and how it moves */
/** the folders a Home draws: the record's Home (onboard/OneHome.tsx) passes its own; there is no fixed list since #1223 */
export type WorldFolders = { folders: { id: string; name: string; part: string; rel: string }[]; parts: { id: string; name: string }[] };
function useWorldData(e: E, ask: Ask, home: string | null, stand?: (id: string) => string, wall?: boolean, own?: WorldFolders) {
  // a made-up person is read only from a folder under the home or under ~/computer/scratch (or ~/scratch), never anywhere else
  const pq = personDir(), pd = personAllowed(pq, home);
  // always his own Home (before the engine says where it is, or with no engine, every folder stands as not set up and the
  // counts say "not connected"); the made-up person drawn in memory only when asked for by name (?world.person=memory)
  const src: Src = pq === "memory" ? { kind: "memory" } : pd ? { kind: "person", base: pd } : { kind: "live", base: home };
  const specs: Spec[] = src.kind === "live" ? own?.folders ?? [] : PERSON.folders;
  const partsSpec = src.kind === "live" ? own?.parts ?? [] : PERSON.parts;
  const [lists, setLists] = useState<Record<string, List | null>>(() =>
    src.kind === "memory" ? Object.fromEntries(PERSON.folders.map((f) => [f.id, { ...parse(f.stickies) }])) : {});
  const listsRef = useRef(lists); listsRef.current = lists;
  const [work, setWork] = useState<{ projects: any[]; sessions: any[]; runs: Record<string, any> } | null>(null);
  const [arranged, setArranged] = useState(order);
  const arrangedRef = useRef(arranged); arrangedRef.current = arranged;
  // when a thing got done today (hours), for the ticks on the day's arc; kept for today only
  const [doneAt, setDoneAt] = useState<number[]>(() => { try { const d = JSON.parse(localStorage.getItem("sol.world.doneAt") ?? "{}"); return d.day === today() ? d.at : []; } catch { return []; } });
  const base = src.kind === "memory" ? null : src.base;
  const cwd = (f: Spec) => `${base}/${f.rel}`;
  const busy = useRef(0);   // writes in flight: a read meanwhile would show the file before the write

  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());   // folders the engine said are not there (not set up): read, with no list (state: his home counts as read on the next render)
  const readWhy = useRef<Record<string, string>>({});   // why the last read of a folder gave no list (for the toast)
  const readOne = useCallback(async (f: Spec): Promise<List | null | undefined> => {
    const r = await ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd: cwd(f), path: "stickies.md" }, 6000);
    const said = readSaid(r);   // ops.ts: only a missing file is an empty list; a read with no text or hash is never a list
    if (said === "not there") { readWhy.current[f.id] = "this folder is not set up yet"; setAnswered((a) => (a.has(f.id) ? a : new Set([...a, f.id]))); return undefined; }   // a folder not set up: answered (his home counts as read), no list
    if (said === "missing") return null;
    if (!said) { readWhy.current[f.id] = !r ? "the engine did not answer" : r.error ? String(r.error) : "stickies.md could not be read as text"; return undefined; }   // keep what is shown, never written over; the toast says why
    return { ...parse(said.text), hash: said.hash };
  }, [ask, base]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = useCallback(async () => {
    if (!base) return;
    const got = await Promise.all(specs.map(readOne));
    if (busy.current) return;
    setLists((was) => {
      let moved = false; const next = { ...was };
      specs.forEach((f, i) => { const g = got[i]; if (g === undefined) return; const w = was[f.id]; if (w !== undefined && (w === null ? g === null : g !== null && w.hash !== undefined && w.hash === g.hash)) return; next[f.id] = g; moved = true; });
      return moved ? next : was;   // the same files: the same lists, so the world is not set again
    });
  }, [base, readOne, specs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const green = Object.values(lists).some((l) => l?.items.some((m) => !m.done && m.notes.some((n) => /← now\s*$/.test(n))));
  useEffect(() => { if (!e.up || !base) return; void read(); const t = window.setInterval(() => { if (!document.hidden) void read(); }, green ? 1000 : 4000); return () => window.clearInterval(t); }, [e.up, base, read, green]);
  useEffect(() => e.subscribe((m: any) => {
    if (m?.type === "work.sessions") setWork({ projects: m.projects ?? [], sessions: m.sessions ?? [], runs: Object.fromEntries((m.runs ?? []).map((r: any) => [r.sessionId, r])) });
    else if (m?.type === "work.run" && m.sessionId) setWork((w) => w && { ...w, runs: { ...w.runs, [m.sessionId]: m.ended ? { ...w.runs[m.sessionId], busy: false } : { ...w.runs[m.sessionId], ...m } } });
  }), [e.subscribe]);
  useEffect(() => { if (e.up) e.send({ type: "work.list" }); }, [e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  // teammates: who is on the team and whose agent works now, from what Cowork's engine already holds (agent.mates, read
  // only: never team.hello, which would make this window a Cowork face and keep the board syncing with GitHub). A
  // team.state Cowork's own window gets is read too. Asked once a minute; the wall asks nothing.
  const [mates, setMates] = useState<Mate[]>([]);
  useEffect(() => e.subscribe((m: any) => { if (m?.type === "team.state") setMates(matesOf(m)); }), [e.subscribe]);
  useEffect(() => {
    if (!e.up || src.kind !== "live" || wall) return;
    const get = () => void ask<{ ok?: boolean; me?: { login?: string }; members?: string[]; agents?: { of: string; working: boolean }[] }>({ type: "agent.mates" }, 6000).then((r) => { if (r?.ok) setMates(matesOf(r)); });
    get(); const t = window.setInterval(() => { if (!document.hidden) get(); }, 60_000); return () => window.clearInterval(t);
  }, [e.up, src.kind, wall]); // eslint-disable-line react-hooks/exhaustive-deps
  // his arrangement: world.md at the home's root is the source (so a new window shows the same island); the window's
  // storage only when there is no world.md
  const arrangedAt = useRef(0);   // how many times he moved a folder in this window
  const [kept, setKept] = useState<[string, string][]>([]);
  useEffect(() => {
    if (!e.up || !base) return;
    const asked = arrangedAt.current;
    void ask<{ text?: string; error?: string }>({ type: "work.read", cwd: base, path: "world.md" }, 6000).then((r) => {
      if (r?.text) setKept(tiesFromMd(r.text));   // the ties he kept (Jev's pick 4 asks no more about them)
      if (!r?.text || arrangedAt.current !== asked) return;   // a move since: the read is older than what he did
      const o = orderFrom(r.text, partsSpec, specs);
      if (Object.keys(o).length) setArranged((was) => { const n = { ...was, ...o }; try { localStorage.setItem(ORDER, JSON.stringify(n)); } catch { /* private */ } return n; });
    });
  }, [e.up, base]); // eslint-disable-line react-hooks/exhaustive-deps

  /** one change to one folder's list: on screen at once, then on the file as it is now; refused, it is put back */
  /** one change to one folder's list: on screen at once, then on the file as it is now (read, the same change, written
   *  with the hash read; the file changed between the two: read again, three times, as Home's stickies.ts does). The
   *  writes go one after another. Refused, the list on screen is put back. `last` is what the change made of the file. */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const edit = useCallback((fid: string, op: Op, onFile?: (before: Made[], after: Made[]) => void): Promise<string | null> => {
    const f = specs.find((x) => x.id === fid); if (!f) return Promise.resolve("That folder is not here.");
    if (!base && src.kind !== "memory") return Promise.resolve("Not saved: the engine has not said where your home is yet.");
    const was = listsRef.current[fid];
    const shown = was ?? { ...parse(""), head: HEAD(f.name), hash: undefined };
    setLists((l) => ({ ...l, [fid]: { ...shown, items: op(shown.items), hash: undefined } }));   // not the file's hash: the next read replaces it
    if (!base) return Promise.resolve(null);   // the made-up person in memory: on screen only
    busy.current++;
    const run = async (): Promise<string | null> => {
      try {
        for (let k = 0; k < 3; k++) {
          const now = await readOne(f);
          if (now === undefined) { setLists((l) => ({ ...l, [fid]: was })); return `Not saved: ${readWhy.current[f.id] ?? "the engine did not answer"}.`; }
          const cur = now ?? { ...parse(""), head: HEAD(f.name), hash: undefined };   // a new stickies.md gets Home's own header
          const next = op(cur.items);
          const w = await ask<{ ok?: boolean; changed?: boolean; error?: string }>({ type: "work.write", cwd: cwd(f), path: "stickies.md", text: serialize(cur.head, next), hash: now === null ? "" : cur.hash }, 8000);   // no file yet: a create only (one made meanwhile is never written over)
          if (w?.ok) { onFile?.(cur.items, next); return null; }
          if (!w?.changed) { setLists((l) => ({ ...l, [fid]: was })); return `Not saved: ${w?.error ?? "the engine did not answer"}.`; }
        }
        setLists((l) => ({ ...l, [fid]: was })); return "Not saved: the file kept changing under it. Try again.";
      } finally { busy.current--; if (!busy.current) void read(); }
    };
    const p = chain.current.then(run, run); chain.current = p; return p;
  }, [ask, base, read, readOne, specs]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemOf = (fid: string, name: string) => listsRef.current[fid]?.items.find((m) => m.t.replace(/\s*← now\s*$/, "") === name);
  /** filed: put into the other folder first, then taken out of this one, and only when it really went in (a folder that
   *  already holds one by that title is refused in words: nothing is lost, nothing merged) */
  const file = useCallback(async (from: string, name: string, to: string): Promise<string | null> => {
    const shownM = itemOf(from, name); if (!shownM) return "Not filed: that sticky moved meanwhile.";
    const fromSpec = specs.find((x) => x.id === from), toSpec = specs.find((x) => x.id === to);
    if (!fromSpec || !toSpec) return "Not filed: that folder is not here.";
    // the sticky as it is on file now (a line the agent wrote since the last read goes with it)
    const src = base ? await readOne(fromSpec) : listsRef.current[from];
    if (src === undefined && base) return "Not filed: the engine did not answer.";
    const m = src?.items.find((x) => x.t === shownM.t); if (!m) return "Not filed: that sticky moved meanwhile.";
    if (isRunning(m)) return "Not filed: its agent is working on it. Move it when it is done.";
    const there = base ? await readOne(toSpec) : listsRef.current[to];
    if (there === undefined && base) return "Not filed: the engine did not answer.";
    if (!canFile(there?.items ?? [], m.t)) return `Not filed: ${toSpec.name} already has one by that name.`;
    let added = !base;   // in memory it went in (checked above); on disk: what the change did to the file as written
    const e1 = await edit(to, putIn(m), (b, a) => { added = a !== b; });
    if (e1) return e1.replace("Not saved", "Not filed");
    if (!added) return `Not filed: ${toSpec.name} already has one by that name.`;
    // taken out only if it is still the one that went in, inside the same hash-checked write
    let gone = !base;
    const e2 = await edit(from, takeOutIf(m), (b, a) => { gone = a !== b; });
    if (e2) return `Filed, but it is still in ${fromSpec.name} too: ${e2}`;
    if (!gone) return `Filed into ${toSpec.name}; it changed in ${fromSpec.name} meanwhile, so it is in both.`;
    return null;
  }, [base, edit, readOne, specs]); // eslint-disable-line react-hooks/exhaustive-deps
  const setDone = useCallback(async (fid: string, name: string, done: boolean) => {
    const m = itemOf(fid, name); if (!m) return "That sticky moved meanwhile.";
    const err = await edit(fid, tick(m.t, done));
    if (!err && done) setDoneAt((a) => { const n = [...a, new Date().getHours() + new Date().getMinutes() / 60]; try { localStorage.setItem("sol.world.doneAt", JSON.stringify({ day: today(), at: n })); } catch { /* private */ } return n; });
    return err;
  }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps
  /** do it: on his own live home, the engine's one press (agent.press, #1228: marked "← now", the stickies rule written
   *  once, the agent run, the mark off after); a made-up person's run is drawn in memory, never a real agent */
  const doIt = useCallback(async (fid: string, name: string): Promise<{ err: string | null; after?: Made; before?: Made }> => {
    const f = specs.find((x) => x.id === fid), before = itemOf(fid, name);
    if (!f || !before) return { err: "That sticky moved meanwhile." };
    const under = src.kind === "live" && !!base && !!home && cwd(f).startsWith(`${home}/`);   // a made-up person never runs a real agent, even kept under the home
    if (!base || !under) {   // drawn: marked, 7 s, then it has a "did:" line
      const err = await edit(fid, markNow(before.t)); if (err) return { err };
      await new Promise((r) => window.setTimeout(r, 7000));
      await edit(fid, (l) => settle(l).map((m) => (m.t === before.t ? { ...m, notes: [...m.notes, "did: drawn in memory"] } : m)));
      return { err: null, before, after: itemOf(fid, name) };
    }
    setLists((l) => { const x = l[fid]; return x ? { ...l, [fid]: { ...x, items: markNow(before.t)(x.items) } } : l; });   // green at once; the engine writes it
    const r = await ask<{ ok: boolean; why?: string }>({ type: "agent.press", folder: cwd(f), key: before.t }, 20 * 60_000);
    const fresh = await readOne(f); if (fresh) setLists((l) => ({ ...l, [fid]: fresh }));
    if (!r) return { err: "The engine did not answer. Whatever the agent made is in the folder." };
    if (!r.ok) return { err: r.why ?? "It stopped." };
    return { err: null, before, after: fresh?.items.find((m) => m.t === before.t) };
  }, [ask, base, edit, home, readOne, specs]); // eslint-disable-line react-hooks/exhaustive-deps
  /** tied by hand to a project (a "with:" note under the sticky), or the tie taken off */
  /** tied by hand (or the tie taken off); `added` says whether the tie wrote a note (an undo takes off only its own) */
  const tieTo = useCallback(async (fid: string, name: string, project: string, on: boolean): Promise<{ err: string | null; added: boolean }> => {
    const m = itemOf(fid, name); if (!m) return { err: "That sticky moved meanwhile.", added: false };
    let added = !base;
    const err = await edit(fid, on ? tie(m.t, project) : untie(m.t, project), (b, a) => { added = a !== b; });
    return { err, added };
  }, [base, edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrange = useCallback((part: string, ids: string[]): Promise<string | null> => {
    arrangedAt.current++;   // a world.md read still on its way is older than this: it is not applied
    setArranged((o) => { const n = { ...o, [part]: ids }; try { localStorage.setItem(ORDER, JSON.stringify(n)); } catch { /* private */ } return n; });
    // where things are, as he arranged them, in world.md at his home's root, so his agents read it too: only this
    // part's line is changed, on the file as it is now (hash-checked, in the same queue as the stickies' writes)
    if (!base) return Promise.resolve(null);
    const p = partsSpec.find((x) => x.id === part); if (!p) return Promise.resolve(null);
    const mine = specs.filter((f) => f.part === part);
    const names = [...mine].sort((x, y) => (ids.indexOf(x.id) + 1 || 999) - (ids.indexOf(y.id) + 1 || 999)).map((f) => f.name);
    const run = () => writeWorldMd(
      () => ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd: base, path: "world.md" }, 6000),
      (text, hash) => ask<{ ok?: boolean; changed?: boolean; error?: string }>({ type: "work.write", cwd: base, path: "world.md", text, ...(hash !== undefined ? { hash } : {}) }, 8000),
      p.name, names);
    const q = chain.current.then(run, run); chain.current = q; return q;
  }, [ask, base]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Jev's pick 4, pressed: a tie kept (or taken off) as one line in world.md's place, the same hash-checked queue */
  const keepTie = useCallback((a: string, b: string, on: boolean): Promise<string | null> => {
    if (!base) return Promise.resolve("No home to write world.md in.");
    const run = () => writeWorldMd(
      () => ask<{ text?: string; hash?: string; error?: string }>({ type: "work.read", cwd: base, path: "world.md" }, 6000),
      (text, hash) => ask<{ ok?: boolean; changed?: boolean; error?: string }>({ type: "work.write", cwd: base, path: "world.md", text, ...(hash !== undefined ? { hash } : {}) }, 8000),
      (prev) => worldMdTie(prev, a, b, on));
    const q = chain.current.then(run, run); chain.current = q;
    return q.then((err) => { if (!err) setKept((k) => (on ? [...k, [a.toLowerCase(), b.toLowerCase()]] : k.filter(([x, y]) => [x, y].sort().join("|") !== [a, b].map((n) => n.toLowerCase()).sort().join("|")))); return err; });
  }, [ask, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo<WorldData>(() => {
    const parts: Part[] = partsSpec.map((p) => {
      const mine = specs.filter((f) => f.part === p.id), o = arranged[p.id] ?? [];
      const sorted = [...mine].sort((a, b) => (o.indexOf(a.id) + 1 || 999) - (o.indexOf(b.id) + 1 || 999));
      return { id: p.id, name: p.name, folders: sorted.map((f) => {
        const l = lists[f.id];
        return { id: f.id, name: f.name, part: f.part, rel: f.rel, set: src.kind === "live" ? (stand?.(f.id) ?? "none") !== "none" || !!l?.items.length : l !== null && l !== undefined, things: l ? thingsOf(f.id, l.items) : [] };
      }) };
    });
    let projects: Project[] = work ? projectsOf(work.projects, work.sessions, work.runs) : [];
    const drawn = !projects.length;
    if (drawn) projects = src.kind === "live" ? [] : PERSON.projects;   // his own world never shows made-up projects
    return { who: src.kind === "live" ? "you" : PERSON.who, parts, projects, mates: src.kind === "live" ? mates : PERSON.mates, social: src.kind === "live" ? 0 : PERSON.social, source: src.kind === "live" ? "live" : "made-up", at: Date.now(), drawnProjects: drawn } as WorldData & { drawnProjects: boolean };
  }, [lists, work, src.kind, stand, arranged, mates]); // eslint-disable-line react-hooks/exhaustive-deps

  // every folder read once: only then is today's first look taken (keepDay), never on a half-read home
  const loaded = src.kind === "memory" || specs.every((f) => f.id in lists || answered.has(f.id));
  // the ties read back from the files: a project by its name, as the note says it
  const ties = useMemo(() => ((data as WorldData & { drawnProjects?: boolean }).drawnProjects ? [] : Object.values(lists).flatMap((l) => (l ? tiesIn(l.items) : [])).map((t) => ({ thing: t.thing, project: data.projects.find((p) => p.name.toLowerCase() === t.project.toLowerCase())?.id ?? "" })).filter((t) => t.project)), [lists, data.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, src, file, setDone, doIt, arrange, tieTo, ties, doneAt, specs, loaded, listed: work !== null, kept, keepTie, refused: !!pq && pq !== "memory" && !pd };
}

/** part 5's board: its address as the engine says it (agent.areas, from engine/src/agent/areas.ts, the one place) */
let boardAt: string | null = null;
const board = () => boardAt;
const openUrl = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank")); };

/** the world's small record of what he moved (kept in this window) */
/** the world's own record of what he did in it (kept in this window, 200 lines): `place` is the district it happened in,
 *  read back by Jev's pick 5 (where the world opens) */
const remember = (what: string, place?: string, id?: string) => { try { const k = "sol.world.moves"; const l = JSON.parse(localStorage.getItem(k) ?? "[]"); l.push({ at: new Date().toISOString(), what, ...(place ? { place } : {}), ...(id ? { id } : {}) }); localStorage.setItem(k, JSON.stringify(l.slice(-200))); } catch { /* private */ } };


export function World3D({ e, home, stand, onOpen, wall, own }: { e: E; home: string | null; stand?: (id: string) => string; onOpen: (at: string) => void; wall?: boolean; own?: WorldFolders }) {
  const ask = useAsk(e);
  const { data, src, file, setDone, doIt, arrange, tieTo, ties, doneAt, loaded, listed, kept, keepTie, refused } = useWorldData(e, ask, home, stand, wall, own);
  const soundOn = useWorldSound(), soundRef = useRef(soundOn); soundRef.current = soundOn;
  const [sound] = useState(() => makeSound(() => soundRef.current));   // the designer's sounds (sound.ts), off by default
  useEffect(() => () => sound.dispose(), [sound]);
  const root = useRef<HTMLDivElement>(null);   // the scene's canvas is made fresh on each start (a canvas whose context was given back cannot draw again)
  const world = useRef<World | null>(null);
  const [gl, setGl] = useState(() => canDraw() && new URLSearchParams(location.search).get("world.gl") !== "off");
  const [tip, setTip] = useState<{ name: string; x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // a folder not set up, pressed once: it comes near and one Button `set up` rides it (Over.tsx Plot); Esc, a press
  // elsewhere or the island whole again takes it away
  const [plot, setPlot] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const dataRef = useRef(data); dataRef.current = data;
  const partOf = (folder: string): string | undefined => dataRef.current.parts.find((p) => p.folders.some((f) => f.id === folder))?.id;   // a folder's district, for the record
  const toastT = useRef(0);
  const say = useCallback((text: string, undo?: () => void) => { setToast({ text, undo }); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), undo ? 6000 : 4000); }, []);
  const madeUp = data.source === "made-up";
  const folders = () => dataRef.current.parts.flatMap((p) => p.folders);
  const folderName = (id: string) => folders().find((f) => f.id === id)?.name ?? id;
  const thingAt = (id: string) => folders().flatMap((f) => f.things).find((t) => t.id === id);

  const pick = useCallback((id: string | null) => { setPicked(id); world.current?.acts(id); }, []);
  const done = useCallback(async (t: { folder: string; name: string }) => {
    pick(null);
    const err = await setDone(t.folder, t.name, true);
    if (err) return say(err);
    remember(`ticked done "${t.name}"`); sound.snap();
    say(`${t.name} · done`, async () => { const e2 = await setDone(t.folder, t.name, false); if (e2) say(e2); });
  }, [pick, say, setDone, sound]);
  const go = useCallback(async (t: { folder: string; name: string }) => {
    pick(null); remember(`do it: "${t.name}"`); sound.snap();
    const r = await doIt(t.folder, t.name);
    if (r.err) return say(r.err);
    // the agent wrote its "did:" line: done by itself, the tile goes to the shelf; he can take it back
    if (finished(r.before, r.after)) {
      const e2 = await setDone(t.folder, t.name, true);
      if (!e2) { say(`${t.name} · done`, async () => { const e3 = await setDone(t.folder, t.name, false); if (e3) say(e3); }); }
    }
  }, [doIt, pick, say, setDone, sound]);
  const drop = useCallback(async (t: ThingT, to: string) => {
    if (t.folder === to) return;
    const from = t.folder;
    const err = await file(from, t.name, to);
    if (err) return say(err);
    remember(`filed "${t.name}" from ${from} into ${to}`); sound.snap();
    say(`${t.name} → ${folderName(to)}`, async () => { const e2 = await file(to, t.name, from); say(e2 ?? `Back in ${folderName(from)}.`); remember(`undid filing "${t.name}"`); });
  }, [file, say, sound]); // eslint-disable-line react-hooks/exhaustive-deps
  const loose = useCallback(async (t: ThingT) => {
    // Jev's pick 1: where a tile dropped on open ground belongs. 0.7 and over: filed there (undo); 0.45: a dashed
    // hairline to that folder, a press on it files it; under: it stays where it was (the scene glides it back)
    const fs = folders().filter((f) => f.set && f.id !== t.folder);
    const tf = toldFolders(fs.map((f) => ({ ...f, things: f.things.slice(-5).map((x) => x.name) })), own);   // the record's world: no name, no id made from one
    const said = await whereJev(ask, t.name, tf.folders), to = said && tf.real(said.folder), got = said && to ? { ...said, folder: to } : null;
    (window as { __w3jev?: unknown[] }).__w3jev?.push({ thing: t.name, got });   // the walk reads Jev's answer (only with ?world.fps)
    if (!got) return;
    if (got.confidence >= 0.7) return drop(t, got.folder);
    if (got.confidence >= 0.45) world.current?.hint(t.id, got.folder);
  }, [ask, drop]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = useCallback((t: Target) => {
    setTip(null);
    const real = (id: string) => !PERSON.projects.some((p) => p.sessions.some((s) => s.id === id));
    if (t.kind === "thing") { if (t.mood === "ask") remember(`pressed "${t.name}"`, "edge"); world.current?.focus(t.id); pick(t.mood === "done" ? null : t.id); return; }
    pick(null); setPlot(null);
    if (t.kind === "folder") {
      if (madeUp) say(`${t.name} is ${PERSON.who}'s: Home opens your own folders`);
      else { remember(`opened ${t.id}`, partOf(t.id), t.id); onOpen(t.id); }
    } else if (t.kind === "project") {
      const p = dataRef.current.projects.find((x) => x.id === t.id), s = p?.sessions[0];
      if (s && real(s.id)) { remember(`went into ${t.name}`, "build", t.id); hopTo("build", s.id); } else say(`${t.name} is drawn: this engine lists no sessions yet`);
    } else if (t.kind === "session" && t.ghost) { shelve(t.id, "hand");   // Jev's dashed outline, pressed: on the shelf
    } else if (t.kind === "session") {
      if (real(t.id)) { remember(`opened session ${t.name}`, "build"); hopTo("build", t.id); } else say(`"${t.name}" is drawn: this engine lists no such session`);
    } else if (t.kind === "mate") { remember(`opened Cowork at ${t.name}`); hopTo("cowork"); }
    else if (t.kind === "area") { const b = board(); if (!b) say("Part 5's board is not known to this engine."); else { remember(`opened area ${t.id}`); openUrl(`${b}/?at=${encodeURIComponent(t.id)}`); } }   // part 5's board, on that area
    else if (t.kind === "part") { remember(`looked at ${t.name}`, t.id); setLean((l) => (l && !l.sure && l.part === t.id ? null : l)); }   // Jev's ring, pressed: used, gone   // the district itself (the scene moves to it): kept for pick 5
    else if (t.kind === "tie") {   // Jev's pick 4, pressed: kept in world.md, with undo
      const [a, b] = t.id.split("|"), na = nameOf(a), nb = nameOf(b); setTieMaybe([]); if (!na || !nb) return;
      remember(`tied ${na} + ${nb}`); sound.snap();
      void keepTie(na, nb, true).then((err) => say(err ?? `${na} + ${nb} · tied`, err ? undefined : async () => { const e2 = await keepTie(na, nb, false); say(e2 ?? "Untied."); }));
    }
    else if (t.kind === "day") say(t.name);
  }, [madeUp, onOpen, pick, say]);

  // the press, the drop and the rest reach the scene through a ref, so the scene is made once
  /** a folder held and moved in its district: the new order kept, the toast with undo (the order before) */
  const moved = useCallback((f: string, part: string, ids: string[]) => {
    const was = dataRef.current.parts.find((p) => p.id === part)?.folders.map((x) => x.id) ?? [];
    remember(`arranged ${part}: ${ids.join(", ")}`); sound.snap();
    say(`${folderName(f)} moved`, () => { void arrange(part, was).then((err) => err && say(err)); });
    void arrange(part, ids).then((err) => err && say(err));
  }, [arrange, say]); // eslint-disable-line react-hooks/exhaustive-deps
  /** a sticky dropped on a project: tied (its folder's agent reads what it is for), undo takes the tie off */
  const tied = useCallback(async (t: ThingT, pid: string) => {
    // the projects drawn for a made-up day are not his: a real sticky is never tied to one
    if (!canTie(!!(dataRef.current as WorldData & { drawnProjects?: boolean }).drawnProjects)) return say("Those projects are drawn: there is no real one to tie it to yet.");
    const pn = dataRef.current.projects.find((p) => p.id === pid)?.name; if (!pn) return;
    const r = await tieTo(t.folder, t.name, pn, true); if (r.err) return say(r.err);
    if (!r.added) return say(`${t.name} was already with ${pn}.`);
    remember(`tied "${t.name}" with ${pn}`); sound.snap();
    say(`${t.name} · with ${pn}`, async () => { const r2 = await tieTo(t.folder, t.name, pn, false); if (r2.err) say(r2.err); });
  }, [say, tieTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickSound = useCallback(() => sound.pick(), [sound]);
  /** the scene went to this thing: a folder of his own Home not set up gets `set up` on it; anything else, none */
  const plotOn = (id: string | null) => setPlot(id && !madeUp && folders().some((f) => f.id === id && !f.set) ? id : null);
  const handsRef = useRef({ press, drop, go, done, loose, moved, tied, pick: pickSound, plotOn });
  handsRef.current = { press, drop, go, done, loose, moved, tied, pick: pickSound, plotOn };
  useEffect(() => {
    if (!gl || !root.current) return;
    const cv = document.createElement("canvas");
    cv.className = "w3-cv"; cv.tabIndex = 0; cv.setAttribute("aria-label", "your world: drag to move, scroll to come closer, press a thing to open it");
    root.current.prepend(cv);
    let w: World;
    const h = () => handsRef.current;
    try {
      w = makeWorld(cv, {
        onHover: (t, x, y) => setTip(t && t.kind !== "folder" && t.kind !== "project" && t.kind !== "jelly" && t.kind !== "part" ? { name: t.name, x, y } : null),
        onPress: (t) => h().press(t), onDrop: (t, f) => void h().drop(t, f), onCarry: (t) => { if (t) { setTip(null); setPicked(null); h().pick(); } },
        onFeed: (t) => void h().go(t), onShelve: (t) => void h().done(t), onLoose: (t) => void h().loose(t),
        onArrange: (f, part, ids) => h().moved(f, part, ids), onTie: (t, pid) => void h().tied(t, pid),
        onLevel: (l, on) => { if (l === "far") { setPicked(null); w.acts(null); } h().plotOn(l === "far" ? null : on); },
      });
    } catch (err) { console.error("the world could not start its 3D; the flat still instead", err); cv.remove(); setGl(false); return; }   // the same presses
    world.current = w; cv.focus({ preventScroll: true });   // keys move the world while it has focus
    if (new URLSearchParams(location.search).has("world.fps")) Object.assign(window, { __w3: w, __w3data: () => dataRef.current, __w3jev: (window as { __w3jev?: unknown[] }).__w3jev ?? [], __w3maybe: (id: string) => setMaybeDoneRef.current((m) => [...m, id]), __w3lean: (part: string, sure: boolean) => setLeanRef.current({ part, sure }) });   // the walk's hand
    // the WebGL context is let go only once the canvas has left the page (the same canvas may be drawn on again at once)
    return () => { w.dispose(); world.current = null; cv.remove(); };   // the scene gives its WebGL context back itself
  }, [gl]);
  // the Jelly project's lights: part 5's registry, counted by the engine (agent.areas); the copy until it answers
  const [registry, setRegistry] = useState(() => (data.source === "live" ? [] : REGISTRY));
  useEffect(() => { if (!e.up) return; void ask<{ ok?: boolean; areas?: typeof REGISTRY; board?: string }>({ type: "agent.areas" }, 8000).then((r) => { if (r?.board) boardAt = r.board.replace(/\/$/, ""); if (r?.ok && r.areas?.length) setRegistry(r.areas); }); }, [e.up, ask]);
  // each project's pieces (part 1, #1092): a brick each on its plate, `fresh` the ones changed since his last look;
  // read for every real project, again when the engine says a project's pieces changed
  const [pieces, setPieces] = useState<Record<string, { n: number; fresh: number }>>({});
  const realProjects = (data as WorldData & { drawnProjects?: boolean }).drawnProjects ? [] : data.projects;
  const projSig = realProjects.map((p) => p.cwd ?? p.path).join("|");
  const readPieces = useCallback(async (ps: { id: string; path: string; cwd?: string }[]) => {
    const got = await Promise.all(ps.map((p) => ask<{ pieces?: { fresh?: unknown }[] }>({ type: "work.pieces.list", cwd: p.cwd ?? p.path }, 6000)));
    setPieces((was) => { const next = { ...was }; ps.forEach((p, i) => { const l = got[i]?.pieces; if (l) next[p.id] = { n: l.length, fresh: l.filter((x) => !!x.fresh).length }; }); return next; });
  }, [ask]);
  useEffect(() => { if (e.up && realProjects.length) void readPieces(realProjects); }, [e.up, projSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => e.subscribe((m: any) => {
    if (m?.type !== "work.pieces.changed") return;
    const p = dataRef.current.projects.find((x) => x.cwd === m.cwd || x.path === m.cwd || x.name === m.project);
    if (p) void readPieces([p]);
  }), [e.subscribe, readPieces]);
  // today's shelf and the wall of days (pieces.tsx keepDay): what was done before today's first look stays on its
  // folder's figure; what gets done after is today's, on the shelf. The person in memory shows all it has done.
  const doneKeys = data.parts.flatMap((p) => p.folders.flatMap((f) => f.things.filter((t) => t.mood === "done").map((t) => `${f.id}/${t.name}`)));
  const day = useMemo(() => (loaded ? keepDay(src.kind === "memory" ? [] : doneKeys) : { days: [], newDay: false, old: new Set<string>(doneKeys) }), [doneKeys.join("|"), src.kind, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstLook = useRef<boolean | null>(null); if (loaded) firstLook.current ??= day.newDay;
  // Jev's pick 6: a folder whose name does not say what it holds (the scene would draw a plain box) is asked once; the
  // answer is kept in the world's record (sol.world.forms, by folder id); at 0.7 it wears that figure
  const [forms, setForms] = useState<Record<string, { form: string; p: number }>>(() => { try { return JSON.parse(localStorage.getItem("sol.world.forms") ?? "{}"); } catch { return {}; } });
  const boxes = data.parts.flatMap((p) => p.folders.filter((f) => f.set && formOf(f) === "box" && !(f.id in forms)).map((f) => ({ f, part: p.name })));
  const askedForm = useRef(new Set<string>()), [, bumpForm] = useState(0);   // asked in this window (a null answer is not kept, and not asked again here)
  const nextBox = boxes.find((b) => !askedForm.current.has(b.f.id));
  useEffect(() => {
    if (!e.up || wall || !nextBox) return;   // one folder per run; the wall asks nothing
    const { f, part } = nextBox; askedForm.current.add(f.id);
    let live = true, handled = false;
    void formJev(ask, formAsk(f, part, own)).then((r) => {
      if (!live) return;
      handled = true;
      if (!r) { bumpForm((n) => n + 1); return; }   // no key, an error or a timeout: nothing stored; on to the next folder
      setForms((was) => { const n = { ...was, [f.id]: { form: r.form, p: r.confidence } }; try { localStorage.setItem("sol.world.forms", JSON.stringify(n)); } catch { /* private */ } return n; });
    });
    return () => { live = false; if (!handled) askedForm.current.delete(f.id); };   // left before its answer: asked again, never lost
  }, [nextBox?.f.id, e.up, wall]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo<WorldData>(() => ({ ...data, parts: data.parts.map((p) => ({ ...p, folders: p.folders.map((f) => ({ ...f, ...(forms[f.id]?.p >= 0.7 ? { form: forms[f.id].form as Form } : {}), things: f.things.map((t) => (t.mood === "done" && day.old.has(`${f.id}/${t.name}`) ? { ...t, old: true } : t)) })) })) }), [data, day, forms]);
  // Jev's pick 3: a session that stopped and reads as finished goes to today's shelf by itself at 0.7 (toast with undo);
  // at 0.45 a dashed outline on the shelf he can press; under, it stays on its plate. Jev is told the title the engine
  // holds and the talk's shape (agent.finished: counts and kinds; no text of the talk leaves the machine). Kept for today.
  const [shelved, setShelved] = useState<{ id: string; name: string; project?: string; at?: number }[]>(() => { try { const d = JSON.parse(localStorage.getItem("sol.world.shelved") ?? "{}"); return d.day === today() ? d.list : []; } catch { return []; } });
  const [maybeDone, setMaybeDone] = useState<string[]>(() => { try { const d = JSON.parse(localStorage.getItem("sol.world.maybe") ?? "{}"); return d.day === today() && Array.isArray(d.ids) ? d.ids : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("sol.world.maybe", JSON.stringify({ day: today(), ids: maybeDone })); } catch { /* private */ } }, [maybeDone]);   // kept for today: asked once, never lost on a reload
  const setMaybeDoneRef = useRef(setMaybeDone);   // the walk's hand: a maybe drawn without waiting for Jev to be unsure
  const keepShelf = (f: (l: typeof shelved) => typeof shelved) => setShelved((l) => { const n = f(l); try { localStorage.setItem("sol.world.shelved", JSON.stringify({ day: today(), list: n })); } catch { /* private */ } return n; });
  const shelve = useCallback((id: string, by: "jev" | "hand", quiet = false) => {
    const p = dataRef.current.projects.find((q) => q.sessions.some((x) => x.id === id)), x = p?.sessions.find((q) => q.id === id); if (!p || !x) return;
    setMaybeDone((m) => m.filter((k) => k !== id));
    keepShelf((l) => (l.some((q) => q.id === id) ? l : [...l, { id, name: x.title, project: p.name, at: x.at }]));   // at: its last message then: a newer one takes it off
    remember(`${by === "jev" ? "Jev shelved" : "shelved"} session ${x.title}`);
    if (quiet) return;   // the open's pass says it once for all (below)
    sound.done?.(); say(`${x.title} · done`, () => keepShelf((l) => l.filter((q) => q.id !== id)));
  }, [say]); // eslint-disable-line react-hooks/exhaustive-deps
  /** a session stopped: Jev asked whether it is finished, and its answer acted on */
  const askStopped = (id: string, quiet = false): Promise<boolean> => {
    if (shelvedRef.current.some((q) => q.id === id)) return Promise.resolve(false);
    const x = dataRef.current.projects.flatMap((q) => q.sessions).find((q) => q.id === id); if (!x) return Promise.resolve(false);
    return ask<{ p?: number | null }>({ type: "agent.finished", sessionId: id }, 6000).then((r) => {
      const d = doneBy(r?.p), w3 = window as { __w3jev?: unknown[] }; if (location.search.includes("world.fps")) (w3.__w3jev ??= []).push({ pick: 3, id, p: r?.p ?? null, d, open: quiet });   // the walk reads it
      if (d === "shelve") shelve(id, "jev", quiet); else if (d === "ghost") setMaybeDone((m) => (m.includes(id) ? m : [...m, id]));
      return d === "shelve";
    });
  };
  // at the open: the sessions that ended earlier today (overnight too) and were not asked yet today are asked once each
  // (at most six); those Jev reads as finished lie on today's shelf, said once for all, with one undo
  const askedOpen3 = useRef(false);
  useEffect(() => {
    if (askedOpen3.current || !listed || madeUp || wall || !e.up) return;
    askedOpen3.current = true;
    const k = "sol.world.asked3"; let asked = new Set<string>(); try { const d = JSON.parse(localStorage.getItem(k) ?? "{}"); if (d.day === today()) asked = new Set(d.ids); } catch { /* none */ }
    const ids = endedToday(data.projects, new Date(), asked);
    if (!ids.length) return;
    try { localStorage.setItem(k, JSON.stringify({ day: today(), ids: [...asked, ...ids].slice(-200) })); } catch { /* private */ }
    void Promise.all(ids.map((id) => askStopped(id, true))).then((got) => {
      const done = ids.filter((_, i) => got[i]); if (!done.length) return;
      sound.done?.(); say(`${done.length} finished earlier today · on the shelf`, () => keepShelf((l) => l.filter((q) => !done.includes(q.id))));
    });
  }, [listed, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  const shelvedRef = useRef(shelved); shelvedRef.current = shelved;
  const busyWas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (madeUp || wall || !e.up) return;
    const { ended, busy } = stopped(busyWas.current ?? new Set(), data.projects); busyWas.current = busy;
    for (const id of ended) askStopped(id);
    // a session on the shelf that works again, waits for him or failed comes off it (and off the maybes): the plate shows it
    const back = new Set([...data.projects.flatMap((p) => p.sessions).filter((x) => x.busy || x.waiting || x.failed).map((x) => x.id), ...movedOn(shelvedRef.current, data.projects)]);
    if (shelvedRef.current.some((q) => back.has(q.id))) keepShelf((l) => l.filter((q) => !back.has(q.id)));
    setMaybeDone((m) => (m.some((k) => back.has(k)) ? m.filter((k) => !back.has(k)) : m));
  }, [data.projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneNow = shown.parts.reduce((n, p) => n + p.folders.reduce((k, f) => k + f.things.filter((t) => t.mood === "done" && !t.old).length, 0), 0) + (madeUp ? 0 : shelved.length);
  // Jev's pick 2: which thing that wants him stands first on the front edge (the one that blocks the most); asked again
  // only when what waits changes. 0.7 and over: it stands first (his jelly pressed goes there); else the oldest first.
  // Jev's pick 4: two things he opens within a minute of each other on three days (the world's own record, ids of folders
  // and projects) may belong together. Asked once per open, for the pair seen most, told their names and kinds and the
  // count. Never kept by itself: 0.45 and over draws a dashed line between them; pressed, the tie is a line in world.md.
  const [tieMaybe, setTieMaybe] = useState<{ a: string; b: string }[]>([]);
  const nameOf = (id: string) => dataRef.current.parts.flatMap((p) => p.folders).find((f) => f.id === id)?.name ?? dataRef.current.projects.find((p) => p.id === id)?.name;
  const askedTie = useRef(false);
  useEffect(() => {
    if (askedTie.current || !loaded || !listed || madeUp || wall || !e.up) return;
    askedTie.current = true;
    let moves: { at?: unknown; id?: unknown }[] = []; try { moves = JSON.parse(localStorage.getItem("sol.world.moves") ?? "[]"); } catch { /* none */ }
    const known = new Set([...shown.parts.flatMap((p) => p.folders.map((f) => f.id)), ...shown.projects.map((p) => p.id)]);
    const isKept = (a: string, b: string) => kept.some(([x, y]) => [x, y].sort().join("|") === [nameOf(a) ?? "", nameOf(b) ?? ""].map((n) => n.toLowerCase()).sort().join("|"));
    // the pair seen most that is not kept and that Jev can be told (ops.ts tiedMsg: a folder by toldAs, a project as
    // "a project", never two projects)
    const msg = (q: { a: string; b: string; days: number }) => tiedMsg(q, dataRef.current.parts.flatMap((p) => p.folders), dataRef.current.projects, own);
    const pair = pairsFrom(moves, new Date(), known).find((q) => !isKept(q.a, q.b) && msg(q)); if (!pair) return;
    void ask<{ p?: number | null }>(msg(pair)!, 6000).then((r) => {
      const w3 = window as { __w3jev?: unknown[] }; if (location.search.includes("world.fps")) (w3.__w3jev ??= []).push({ pick: 4, a: pair.a, b: pair.b, p: r?.p ?? null });
      if ((r?.p ?? 0) >= 0.45) setTieMaybe([{ a: pair.a, b: pair.b }]);
    });
  }, [loaded, listed, e.up, kept]); // eslint-disable-line react-hooks/exhaustive-deps
  // Jev's pick 5: where the world opens. Asked once per open, told the hour, the titles of what waits and what works,
  // the districts' names and where he went at about this hour on other days (the world's own record). 0.7 and over: the
  // first view leans there; 0.45 and over: a ring on the district's name he can press; under, or no answer: whole.
  // The scene draws it once it reads `lean` (asked of the designer, 06:25); until then nothing shows.
  const [lean, setLean] = useState<{ part: string; sure: boolean } | null>(null);
  const setLeanRef = useRef(setLean);   // the walk's hand: the ring drawn without waiting for Jev (only with ?world.fps)
  const askedOpens = useRef(false);
  useEffect(() => {
    if (askedOpens.current || !loaded || !listed || madeUp || wall || !e.up) return;   // the sessions listed too: what works is known
    askedOpens.current = true;
    let moves: { at?: unknown; place?: unknown }[] = []; try { moves = JSON.parse(localStorage.getItem("sol.world.moves") ?? "[]"); } catch { /* none */ }
    const now = new Date(); if (hourQ && Number.isFinite(Number(hourQ))) now.setHours(Math.floor(Number(hourQ)), 0);
    const msg = opensMsg(shown, asks(shown), now.getHours(), placesAt(moves, now), own); if (!msg) return;   // ops.ts: what it is told
    void ask<{ part?: string | null; confidence?: number }>(msg, 6000).then((r) => {
      const l = leanBy(r), w3 = window as { __w3jev?: unknown[] }; if (location.search.includes("world.fps")) (w3.__w3jev ??= []).push({ pick: 5, part: r?.part ?? null, p: r?.confidence ?? null, lean: l });   // the walk reads it (only with ?world.fps)
      setLean(l);
    });
  }, [loaded, listed, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  const want = asks(shown), wantSig = want.map((a) => a.id).join("|");
  const [edge, setEdge] = useState<string[]>([]);
  useEffect(() => {
    if (want.length < 2 || !e.up || wall) { setEdge([]); return; }   // the wall asks nothing: the main window does
    const fs = shown.parts.flatMap((p) => p.folders);
    let live = true;
    // Jev is told the stickies' titles only (never a note, never a session's name), and how many wait behind each
    const told = edgeTold(want, fs, own);   // the record's world: "t1", never `${folder}#${i}`
    void firstJev(ask, told.things)
      .then((r) => { const at = r && r.confidence >= 0.7 ? told.real(r.first) : null; if (live) setEdge(at ? [at] : []); });
    return () => { live = false; };
  }, [wantSig, e.up]); // eslint-disable-line react-hooks/exhaustive-deps
  // the day pulled back: the island at earlier hours of today (pieces.tsx keepPast), from what is read, never the drawn person
  const past = useMemo(() => (src.kind === "memory" || !loaded ? undefined : keepPast(shown)), [shown, src.kind, loaded]);
  const hourQ = new URLSearchParams(location.search).get("world.hour");
  const dotsOn = useWorldDots(), styleQ = new URLSearchParams(location.search).get("world.style");
  const style: "solid" | "dither" = styleQ === "dither" || styleQ === "solid" ? styleQ : dotsOn ? "dither" : "solid";   // the second look
  // the world moves when the data moves (and at once when he acts: the lists change before the write)
  // a tie he already kept (world.md read late) is never asked about on screen
  const tieShown = useMemo(() => tieMaybe.filter((t) => !kept.some(([x, y]) => [x, y].sort().join("|") === [nameOf(t.a) ?? "", nameOf(t.b) ?? ""].map((n) => n.toLowerCase()).sort().join("|"))), [tieMaybe, kept]); // eslint-disable-line react-hooks/exhaustive-deps
  // the ties he kept (world.md, by name) as ids, so the scene draws a hairline between the two under the pointer
  const tiesKept = useMemo(() => { const ids = new Map<string, string>(); shown.parts.flatMap((p) => p.folders).forEach((f) => ids.set(f.name.toLowerCase(), f.id)); shown.projects.forEach((p) => ids.set(p.name.toLowerCase(), p.id));
    return kept.map(([x, y]) => ({ a: ids.get(x), b: ids.get(y) })).filter((t): t is { a: string; b: string } => !!t.a && !!t.b); }, [kept, shown]);
  const leanX = useMemo(() => ({ ...(lean ? { lean } : {}), ...(tieShown.length ? { tieMaybe: tieShown } : {}), ...(tiesKept.length ? { tiesKept } : {}) }), [lean, tieShown, tiesKept]);   // pick 5, for the scene once it reads it
  const extra = useMemo<Extra>(() => ({ registry, doneAt, days: day.days, newDay: !!firstLook.current, ties, edge, past, pieces, style, wall: !!wall, jelly: [...JELLY.six.slice(0, 5)], ...(hourQ && Number.isFinite(Number(hourQ)) ? { hour: Number(hourQ) } : {}), offline: !e.up && data.source === "live", shelved, maybeDone, ...leanX }), [registry, doneAt, day, ties, edge, past, pieces, style, wall, hourQ, e.up, data.source, shelved, maybeDone, leanX]);
  const lastAsks = useRef(-1), lastDone = useRef(-1);   // -1: the first look makes no sound
  useEffect(() => {
    world.current?.set({ ...shown, ...extra });
    const n = asks(data).length; if (n > lastAsks.current && lastAsks.current >= 0) sound.ask(); lastAsks.current = n;
    if (doneNow > lastDone.current && lastDone.current >= 0) sound.done(); lastDone.current = doneNow;
  }, [shown, extra, gl]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc: the buttons first, then up one level in the world; at the whole island, Home's own Esc runs
  // a made-up person's folder that is not allowed: said once, never a silent made-up day in its place
  useEffect(() => { if (refused) say("That made-up person's folder is outside your home and scratch, so this is your own Home."); }, [refused]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickedRef = useRef(picked); pickedRef.current = picked;
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (pickedRef.current) pick(null); else if (!world.current?.up()) return;
        ev.stopImmediatePropagation(); ev.preventDefault();
      } else if ((ev.metaKey || ev.ctrlKey) && ev.key === "z" && toastRef.current?.undo && !!document.activeElement?.closest(".w3")) { const u = toastRef.current.undo; setToast(null); void u(); ev.preventDefault(); }
    };
    window.addEventListener("keydown", k, true); return () => window.removeEventListener("keydown", k, true);
  }, [pick]);
  const toastRef = useRef(toast); toastRef.current = toast;

  // the counts: a press flies to the first such thing, again to the next
  const cycle = useRef({ run: 0, ask: 0, done: 0 });
  const onGo = (k: "run" | "ask" | "done") => {
    const ts = shown.parts.flatMap((p) => p.folders).flatMap((f) => f.things).filter((t) => t.mood === k && !(k === "done" && t.old));
    const ss = k === "ask" ? data.projects.flatMap((p) => p.sessions.filter((s) => s.waiting)) : k === "run" ? data.projects.flatMap((p) => p.sessions.filter((s) => s.busy)) : madeUp ? [] : shelved;   // done: the sessions on today's shelf too
    const ids = [...ts.map((t) => t.id), ...ss.map((s) => s.id)]; if (!ids.length) return;
    const id = ids[cycle.current[k]++ % ids.length];
    world.current?.focus(id); pick(ts.some((t) => t.id === id) && k === "ask" ? id : null);   // only what wants him gets its buttons
  };
  const p = picked ? thingAt(picked) : undefined;
  const where = useCallback((id: string) => world.current?.where(id) ?? null, []);

  return (
    <div className="w3" data-place="world" ref={root}>
      {!gl && <Still data={shown} onPress={press} />}
      <Counts run={running(data)} ask={asks(data).length} done={doneNow} offline={extra.offline} onGo={onGo} />
      {p && p.mood !== "done" && p.mood !== "run" && gl && <Acts id={p.id} name={p.name} asks={p.mood === "ask" ? p.needs : undefined} where={where} onDo={() => void go(p)} onDone={() => void done(p)} />}
      {plot && !picked && gl && <Plot id={plot} where={where} onSetUp={() => { const id = plot; setPlot(null); remember(`set up ${id}`, partOf(id)); onOpen(id); }} />}
      {tip && !picked && <div className="w3-tip" style={{ left: tip.x, top: tip.y }}>{tip.name}</div>}
      {toast && <div className="w3-toast" role="status">{toast.text}{toast.undo && <button type="button" onClick={() => { const u = toast.undo!; setToast(null); void u(); }}>undo</button>}</div>}
    </div>
  );
}
