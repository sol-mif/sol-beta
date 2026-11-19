// Home, drawn from the person's record (#1088): the one Home since #1223, made by the one onboarding.
// What was wrong before, walked as a made-up person (Noa) on a test engine on 2026-11-13:
//   - Home's folders are constants (a file under home/folders/): Noa opens Home and sees the owner's classes and jobs
//     marked "you said" that she never said; her own life is nowhere.
//   - Home finds its own place on disk through that first folder's agent (agent.tickets), so on a home without it the
//     tour's door never shows: Home's onboarding cannot even start.
//   - Each folder then has its own onboarding (Quick, or the six-step setup with five agent turns): a second and third
//     onboarding after the first run, asking again what the tour already read.
// Here: the folders are the onboarding's own (Folder.tsx, the designer's: the same pieces the person watched fill), so
// the hand-over ends where Home begins. A folder opens large; a piece turns over to say where each thing was read; a
// piece with a yellow ring holds what is still unsure, and pressing it opens the two answers in place (Yours.tsx
// Evidence); turned over, every thing not kept yet carries "keep" and "not here". That is the folder's whole setup
// (#1227): no Setup, no Quick, no talk on the path. Each answer lands in the folder's ground.json with its source
// (ground.ts answerIn) and in the record, and has its undo. The level is set here only, inside a folder, into the
// record's consent (#1216), which the engine reads at each turn. "+" takes one sentence and makes another part.
// Each folder made (by the hand-over or "+") is checked once (Check.tsx, checked.ts): a card over Home walks the new
// folders one at a time; "check later" leaves the folder ringed until it is opened.
// Writes go to ~/.sol/record/me.json and the folder's ground.json.
import { Fragment, lazy, Suspense, useCallback, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import type { useEngine } from "../useEngine";
import { Frame, Head } from "../kit/Chrome";
import { Glass } from "../kit";
import { CURVE } from "../kit/tokens";
import { Rail, STOPS, type StopId, type StopState } from "./Lens";
import { Folder, daysTo, routinesOf, type PieceKind, type Routine, type Run, type Scr } from "./Folder";
import { FolderStickies } from "../home/folders/FolderStickies";   // a folder's stickies, kept by the engine (#1228)
import { answerIn, changeGround, restoreIn, thingIn, type Ground } from "../home/folders/ground";
import { Evidence, Level } from "./Yours";
import { Check } from "./Check";
import { afterCheck, opened, putOff, toCheck } from "./checked";
import { afterLanding, oneLevelAtATime, changeRecord, FRESH_KEY, HELD_KEY, landFolders, newFolders, setRung, since, readRecord, type Record } from "./record";
import { makeRecordDir, shellOk } from "./run";
import { againHref } from "./flag";
import { setHomeFolders } from "../cross/folders";   // the shelf by the spine offers these folders (#1045, #1223)
import { levelOf, withLevel } from "./consent";   // what the person allowed (#1216): the level per folder, in the record's consent
import { areasOf, placeOf, readingOf, type Area, type Confirm, type Found } from "./sort";
import { kidsOf, newIdIn, pathOf, topOf, treeOf, underOf, upOf } from "./depth";   // places at any depth (#1481)
import { BlankSticky, type Put } from "../home/folders/Blank";   // the blank sticky (#1483)
import { dueIn, dueOf, dueWord, soon, todayOf, tomorrowOf } from "../home/folders/due";   // Today (#1487)
import "../home/folders/today.css";
import type { Made } from "../home/folders/stickies";
import { allMade, byDay, isNew, waitingOf, type MadeThing } from "../home/folders/madeLines";   // what was made (#1490), what waits (#1497)
import { MadeCard, MadeSheet, SOL, tellOpened, useSeen, useYes, type Maker } from "../home/folders/Made";
import { UNDO_FOR, zonesFor } from "../home/folders/finishZones";   // finish or drop (#1493)
import { useCarry } from "../home/folders/Finish";
import { AGENT_AT, OPEN_AGENT, openAgent, useAgentsOn } from "../agents/flag";
import { Again, AgentTags, useAgentsForHome } from "../agents/HomeTags";
import { Jelly } from "../agents/Jelly";
import { doingOf, postureOf, railOf } from "../agents/model";
import { useHomeWorld } from "../home/world3d/flag";   // #1093: Home's world, in this Home too (off: nothing here changes)
import type { WorldFolders } from "../home/world3d/World3D";
import "../home/folders/folders.css";
import "./one.css";
import "./onboard.css";

type E = ReturnType<typeof useEngine>;
type Record_<K extends string, V> = { [k in K]: V };
const PART = { school: "school", work: "work", life: "life", build: "projects", found: "found" } as const;
const nowLine = () => new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" }) + " · " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const words = (n: number) => ["No parts", "One part", "Two parts", "Three parts", "Four parts", "Five parts", "Six parts"][n] ?? `${n} parts`;
/** the first file in a ledger's "made" (the engine joins names with ", "; a name may hold a comma itself): the shortest
 *  start that ends in a file's extension, then its last path part */
const firstMade = (made: string) => (/^(.+?\.[A-Za-z0-9]{1,8})(?=, |$| and )/.exec(made.trim())?.[1] ?? made.split(", ")[0]).trim().split("/").pop();
// #1093 in the record's Home (morning round 2026-11-13): the same "world" row FolderHome has, drawing this Home's folders
import { NoWorld } from "../home/world3d/NoWorld";
const World3D = lazy(() => import("../home/world3d/World3D").then((m) => ({ default: m.World3D }), () => ({ default: NoWorld })));   // #1187
// Agents inside Home (#1327; Marco 2026-11-18: Agents ships inside Home, as Home's doers, not a mode): with agents.mode
// on, the side holds the agents as a place (its shelf under it while open), the place draws the floor and the desks in
// Home's frame, a folder and its open stickies wear the jelly of the agent that does them (a press opens its desk here),
// and a sticky ticked done wears "again?" where Sol noticed a job. Off: nothing here asks the engine or draws.
const AgentsView = lazy(() => import("../agents/AgentsView").then((m) => ({ default: m.AgentsView })));
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

export function OneHome({ e }: { e: E }) {
  const n = useRef(0);
  const ask = useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `ob1h-${++n.current}`;
    const t = window.setTimeout(() => { off(); res(null); }, ms);
    const off = e.subscribe((m: any) => { if (m?.rid === rid) { window.clearTimeout(t); off(); res(m as T); } });
    e.send({ ...o, rid });
  }), [e.send, e.subscribe]);   // eslint-disable-line react-hooks/exhaustive-deps -- the wire, not the whole engine object
  const [rec, setRec] = useState<Record | null | undefined>(undefined);
  const [at, setAt] = useState<string>("home");
  const [side, setSide] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);   // a place named inside the open one (#1481)
  // whether the engine reads a sentence in any language (#1195; asked when the "+" box opens), and a reading under way
  const reads = useRef(false), [making, setMaking] = useState(false), addRun = useRef(0);   // (addRun: "not now" while it reads ends that reading)
  const openAdd = () => { setAdding(""); void ask<{ on?: boolean }>({ type: "onboard.warm" }, 4000).then((a) => { reads.current = !!a?.on; }); };
  const [front, setFront] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  // the folders being checked (checked.ts): taken once when the record arrives, and again for the folders "+" makes
  const [checking, setChecking] = useState<Record["areas"] | null>(null), checkTaken = useRef(false);
  const [runs, setRuns] = useState<Record_<string, Run>>({});
  const [step, setStep] = useState<[string, string] | null>(null);   // Home's one line while a routine runs: the name, then three words
  useEffect(() => { if (e.up) void readRecord(ask).then(setRec); }, [e.up, ask]);
  useEffect(() => { if (rec?.built) setHomeFolders(rec.areas); }, [rec]);
  useEffect(() => { if (!rec?.built || checkTaken.current) return; checkTaken.current = true; const q = toCheck(rec); if (q.length) setChecking(q); }, [rec]);
  // a change to the record: made on the record as it is on disk now (written with the hash read), never a copy held here;
  // when it could not be written the person is told, and the screen keeps what is on disk
  const save = async (change: (r: Record) => Record) => {
    const next = await changeRecord(ask, change);
    if (next) { setRec(next); return next; }
    say("I could not save that just now; nothing changed. Press again in a moment.");
    return null;
  };
  // one line at the foot; a line after a write carries its undo, and stays long enough to press it
  const say = (text: string, undo?: () => void) => { const t = { text, undo }; setToast(t); window.setTimeout(() => setToast((x) => (x === t ? null : x)), undo ? UNDO_FOR : 2600); };
  // what the last "look again" brought: marked on its pieces until its folder is opened; said once
  // (read when the record arrives: Home may have mounted behind the onboarding, before the look wrote it)
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [looked, setLooked] = useState<[string, string] | null>(null);
  // a run's timer and subscription, cleared when Home goes (a run may take minutes)
  const stopRun = useRef<(() => void) | null>(null);
  const recRef = useRef(rec); recRef.current = rec;
  // the blank sticky at Home (#1483): Jev's "which place?" (agent.where) files it at 0.7 and over; between 0.45 and 0.7
  // the two nearest places are chips on it; under that, or with no Jev, it stays loose: the Sol home's loose/ folder,
  // not a place, drawn at Home only while it holds an open sticky
  const LOOSE = "loose", AT_LOOSE = "@loose";   // its folder, and its view (never a place's id)
  // every place's stickies and loose/'s, read again on any change: Today (#1487) is drawn from them, and loose/ from its own
  const looseDir = rec?.solHome ? `${rec.solHome}/${LOOSE}` : null;
  const placeIds = (rec?.areas ?? []).map((a) => a.id).join("\n");
  const [lists, setLists] = useState<{ place: string; items: Made[] }[]>([]);
  useEffect(() => {
    const home = rec?.solHome;
    if (!home) return;
    const ids = [...(placeIds ? placeIds.split("\n") : []), LOOSE];
    let live = true;
    const read = () => void Promise.all(ids.map((id) => ask<{ ok?: boolean; items?: Made[] }>({ type: "agent.stickies", folder: `${home}/${id}` }, 6000).then((r) => ({ place: id, items: r?.ok ? r.items ?? [] : [] }))))
      .then((l) => { if (live) setLists(l); });
    read();
    const off = e.subscribe((m: any) => { if (m?.type === "agent.changed") read(); });
    return () => { live = false; off(); };
  }, [rec?.solHome, placeIds, ask]);   // eslint-disable-line react-hooks/exhaustive-deps -- the wire, not the whole engine object
  const loose = (lists.find((l) => l.place === LOOSE)?.items ?? []).filter((m) => !m.done);
  const [now, setNow] = useState(() => Date.now());   // Today moves with the clock: looked at again each minute
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);
  const today = todayOf(lists, now);
  // finish or drop from Today (#1493): carried to the tray, or Delete on the slip in focus; said with its undo
  const stickyIn = (place: string) => `${recRef.current?.solHome}/${place}`;
  const finishAt = async (place: string, key: string, via: "carry" | "key") => {
    const folder = stickyIn(place), r = await ask<{ ok?: boolean; why?: string }>({ type: "agent.sticky", folder, op: "done", key, done: true, via }, 8000);
    if (r?.ok) say(`Done: “${key}”.`, () => void ask({ type: "agent.sticky", folder, op: "done", key, done: false }, 8000)); else say(`Not ticked: ${r?.why ?? "the engine did not answer"}.`);
  };
  const dropAt = async (place: string, key: string, via: "carry" | "key") => {
    const folder = stickyIn(place), r = await ask<{ ok?: boolean; why?: string; undo?: string }>({ type: "agent.sticky", folder, op: "remove", key, via }, 8000);
    if (r?.ok) say(`Dropped “${key}”.`, r.undo ? () => void ask({ type: "agent.sticky", folder, op: "undo", id: r.undo }, 8000) : undefined); else say(`Not dropped: ${r?.why ?? "the engine did not answer"}.`);
  };
  const carry = useCarry((k, z) => { const [place, key] = k.split("\n"); if (z === "done") void finishAt(place, key, "carry"); else if (z === "drop") void dropAt(place, key, "carry"); });
  // what was made (#1490): every place's did: lines, newest first; opened ones remembered on this computer, the same set
  // a place's cards read, so the side's count drops as one is opened anywhere
  const { seen, see } = useSeen();
  const made = allMade(lists, now), madeNew = made.filter((x) => isNew(x, seen, now)).length;
  const [openMade, setOpenMade] = useState<MadeThing | null>(null);
  // the trust gate (#1497): a draft or an ask waiting on the person is in Today beside what is due, from every place, and
  // counted in it; pressed, it opens whole with its act (Send, Pay …), the person's yes held a moment for undo
  const waiting = waitingOf(made);
  const yes = useYes(ask, say, UNDO_FOR);
  const openIt = (x: MadeThing, from: "made" | "place") => { tellOpened(ask, x, isNew(x, seen, now), from); see(x.key); setOpenMade(x); };
  const pathName = (id: string) => (id === LOOSE ? LOOSE : pathOf(recRef.current?.areas ?? [], id).map((x) => x.name).join(" › ") || id);
  /** one sticky made in a place (or loose), said with the whole path and its undo; false when it could not be */
  const putIn = async (place: string, text: string): Promise<boolean> => {
    const home = recRef.current?.solHome;
    if (!home) return false;
    const folder = `${home}/${place}`;
    const d = dueIn(text), due = d ? dueOf([`due: ${d.due}`]) : null;
    // the engine makes loose/ the first time something stays loose, and a record's place with no folder (#1511)
    const r = await ask<{ ok?: boolean; why?: string; key?: string }>({ type: "agent.sticky", folder, op: "make", line: d?.t ?? text, ...(d ? { due: d.due } : {}) }, 8000);
    if (!r?.ok) { say(r?.why ? `Not put down: ${r.why}.` : "Not put down: Sol did not answer. Press Enter again in a moment."); return false; }
    const key = r.key ?? text;
    say(place === LOOSE ? `Kept loose: “${key}” is in no place yet.` : soon(due) ? `On Today, kept in ${pathName(place)}.` : `Put in ${pathName(place)}.`, () => void ask({ type: "agent.sticky", folder, op: "remove", key }, 8000));
    return true;
  };
  const putAtHome = async (text: string): Promise<Put> => {
    const areas = recRef.current?.areas ?? [];
    const folders = areas.map((a) => ({ id: a.id, name: pathName(a.id), things: kidsOf(areas, a.id).map((k) => k.name) }));
    const w = folders.length ? await ask<{ ok?: boolean; folder?: string | null; confidence?: number; near?: string[] }>({ type: "agent.where", sticky: text, folders }, 6000) : null;
    const at = w?.folder && areas.some((a) => a.id === w.folder) ? w.folder : null, p = Number(w?.confidence ?? 0);
    if (at && p >= 0.7) { if (!(await putIn(at, text))) throw new Error("not put"); return; }
    if (at && p >= 0.45) return { near: (w?.near?.length ? w.near : [at]).filter((id) => areas.some((a) => a.id === id)).slice(0, 2) };
    if (!(await putIn(LOOSE, text))) throw new Error("not put");
  };
  useEffect(() => () => stopRun.current?.(), []);
  const [reopen, setReopen] = useState<StopId | null>(null);   // a closed source pressed once: asked before it is read
  useEffect(() => {
    if (!rec?.built) return;
    let looked: { ids: string[]; since: string | null } | null = null;
    try { const j = JSON.parse(sessionStorage.getItem(FRESH_KEY) ?? "null"); sessionStorage.removeItem(FRESH_KEY); if (j && Array.isArray(j.ids)) looked = j; } catch { /* none */ }
    if (!looked) return;
    const n = looked.ids.length, from = since(looked.since);
    setFresh(new Set(looked.ids));
    // said in Home's own line for 3 s, then the nearest thing again (no toast)
    const said: [string, string] = [n ? (n === 1 ? "One new thing" : `${n} new things`) : "Nothing new", `since ${from}.`];
    setLooked(said); window.setTimeout(() => setLooked((x) => (x === said ? null : x)), 3000);
  }, [rec?.built]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a folder opened is checked: its ring goes (written only when it was unchecked)
  useEffect(() => { if (!rec || !(rec.unchecked ?? []).includes(at)) return; void changeRecord(ask, (r) => opened(r, at) ?? r).then((n) => { if (n) setRec(n); }); }, [at]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (at === "home" || at === "you" || !rec) return; const ids = new Set(rec.facts.filter((f) => f.area === at).map((f) => f.id)); setFresh((x) => (([...x].some((id) => ids.has(id))) ? new Set([...x].filter((id) => !ids.has(id))) : x)); }, [at, rec]);
  // look again: every source (the arrow), one source alone (a lit glyph, or a door just opened: ?only=), or a closed
  // one opened and read (?open=)
  const lookAgain = (open?: StopId, only?: StopId) => { const q = new URLSearchParams(location.search); q.set("onboard", "again"); q.set("look", "again"); q.delete("open"); q.delete("only"); if (open) q.set("open", open); if (only) q.set("only", only); location.search = q.toString(); };
  // a source's door (a glyph that gave nothing, or the computer said no): one line, one button that opens something
  // real; then that source alone is read while they watch (designer NOW 04:59 item 3)
  const [door, setDoor] = useState<StopId | null>(null), [doorSaid, setDoorSaid] = useState<string | null>(null);
  // esc, or a press anywhere else, shuts the door
  useEffect(() => {
    if (!door) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") setDoor(null); };
    const down = (ev: PointerEvent) => { if (!(ev.target as Element).closest?.("[data-door], [data-again]")) setDoor(null); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", down);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", down); };
  }, [door]);
  // Esc in a place goes up one level, then Home (#1481); never while typing, nor while a card or the check is open
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.defaultPrevented || door || front || checking) return;
      if ((ev.target as Element | null)?.closest?.("input, textarea, [contenteditable]")) return;
      const areas = recRef.current?.areas;
      if (areas?.some((a) => a.id === at)) { setNaming(null); setAt(upOf(areas, at)); }
      else if (at === AT_LOOSE) setAt("home");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [at, door, front, checking]);
  const DOOR: Partial<Record_<StopId, [string, string | null]>> = { tools: ["Your AI tools have no connections yet.", "show my tools"], calendar: ["No calendar on this computer yet.", "open Calendar"], files: ["I may not read your files yet.", "allow in Settings"], projects: ["No projects here yet.", "sign in to GitHub"], browser: ["I may not read your history yet.", "allow in Settings"], ai: ["No AI tool signed in here yet.", null] };
  // what a door waits for (a GitHub yes, the person coming back from Settings or Calendar): one at a time, removed when
  // the door shuts or Home goes; a return counts only after the window was left (a blur first)
  const doorWait = useRef<(() => void) | null>(null);
  const waitDoor = (stop: () => void) => { doorWait.current?.(); doorWait.current = stop; };
  useEffect(() => { if (!door) { doorWait.current?.(); doorWait.current = null; } }, [door]);
  useEffect(() => () => doorWait.current?.(), []);
  const onReturn = (then: () => void) => {
    const blur = () => { window.removeEventListener("blur", blur); window.addEventListener("focus", focus); };
    const focus = () => { stop(); then(); };
    const stop = () => { window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); };
    window.addEventListener("blur", blur);
    waitDoor(stop);
  };
  // the door still open and Home still here after each await: else nothing is armed (its cleanup already ran)
  const doorRef = useRef<StopId | null>(null); doorRef.current = door;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const openDoor = async (id: StopId) => {
    const still = () => mounted.current && doorRef.current === id;
    if (id === "projects") {
      const r = await ask<{ code?: string; url?: string; error?: string }>({ type: "team.github.connect" }, 30_000);
      if (!still()) return;
      if (!r?.code || !r.url) return setDoorSaid(r?.error ?? "GitHub did not answer. Press again in a moment.");
      setDoorSaid(`Your code: ${r.code}. Paste it on the GitHub page; I read your projects as soon as it says yes.`);
      window.open(r.url, "_blank");
      const off = e.subscribe((m: any) => { if (m?.type === "team.github.connected") { off(); doorWait.current = null; lookAgain(undefined, "projects"); } else if (m?.type === "team.github.connect.failed") { off(); doorWait.current = null; setDoorSaid(m.error ?? "GitHub said no."); } });
      waitDoor(off);
      return;
    }
    if (id === "files" || id === "browser") {
      // armed before the await (the blur comes as System Settings opens); taken back if the door shut meanwhile
      onReturn(() => { void (async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("permit_back"); } catch { /* not in the app */ } })(); lookAgain(undefined, id); });
      const asked = await (async () => { try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("permit_open", { which: id === "files" ? "files" : "browser" }); return true; } catch { return false; } })();
      if (!still()) { doorWait.current?.(); doorWait.current = null; return; }
      if (!asked) { doorWait.current?.(); doorWait.current = null; return setDoorSaid("Open System Settings › Privacy & Security › Full Disk Access, and allow Jelly."); }
      setDoorSaid("When you have allowed it, come back here: I read it then.");
      return;
    }
    if (id === "calendar") {
      onReturn(() => lookAgain(undefined, "calendar"));
      const ok = await shellOk(ask, e, "open -a Calendar");   // its real exit code (run.ts)
      if (!still()) { doorWait.current?.(); doorWait.current = null; return; }
      if (!ok) { doorWait.current?.(); doorWait.current = null; return setDoorSaid("I could not open Calendar from here. Open it yourself; I read it when you come back."); }
      setDoorSaid("Calendar is open. Add your calendars there; I read them when you come back.");
      return;
    }
    if (id === "tools") { window.dispatchEvent(new CustomEvent("sol:settings", { detail: "me" })); setDoorSaid(null); setDoor(null); }
  };

  // folders the onboarding could not write to (their read did not answer): said once, in one line
  useEffect(() => { try { const h = sessionStorage.getItem(HELD_KEY); if (h) { sessionStorage.removeItem(HELD_KEY); window.setTimeout(() => say(`${h}: I could not reach ${h.includes(",") ? "these folders" : "this folder"}, so I left ${h.includes(",") ? "them" : "it"} as ${h.includes(",") ? "they were" : "it was"}.`), 1500); } } catch { /* private */ } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((rec?.facts ?? []).map((f) => [f.id, f])), [rec]);
  // what is still unsure: the confirms the onboarding left (record.asks) that no answer has closed since
  const open: Confirm[] = useMemo(() => (rec?.asks ?? []).filter((c) => !rec?.confirmed[c.id]), [rec]);
  const unsure = useMemo(() => new Set(open.map((c) => c.fact ?? "")), [open]);
  const cur = open.find((c) => c.id === front);
  const worldOn = useHomeWorld();
  useEffect(() => { if (at === "world" && !worldOn) setAt("home"); }, [at, worldOn]);   // switched off while open: today
  const agentsOn = useAgentsOn();
  const { agents, offers, need: agentsNeed } = useAgentsForHome(e);   // both null with agents.mode off
  useEffect(() => { if (at === "agents" && !agentsOn) setAt("home"); }, [at, agentsOn]);
  // a press on an agent's jelly or on "again?" anywhere in Home: Home goes to its agents (AgentsView reads where)
  useEffect(() => { if (!agentsOn) return; const f = () => setAt("agents"); window.addEventListener(OPEN_AGENT, f); return () => window.removeEventListener(OPEN_AGENT, f); }, [agentsOn]);
  // the world's island holds the record's folders (each at <home>/<id>, as the landing made them), grouped by their part
  const worldFolders = useMemo<WorldFolders | undefined>(() => rec ? { folders: rec.areas.map((a) => ({ id: a.id, name: a.name, part: a.part, rel: a.id })),
    parts: [...new Set(rec.areas.map((a) => a.part))].map((p) => ({ id: p, name: PART[p] })) } : undefined, [rec]);
  // a folder the landing made and filled (its ground.json and policy.md written: record.madeDirs, not fillDirs) stands as
  // set up in the world; one still waiting to be filled, "none" (World3D's `stand`: "none" is not set up)
  const stand = useCallback((id: string) => (rec?.madeDirs?.includes(id) && !rec.fillDirs?.includes(id) ? "set" : "none"), [rec]);
  // #1227: one thing answered in place, by a touch ("keep", "not here") or a ringed piece's answer. The folder's
  // ground.json first (the answer and its source beside where the thing was read), then the record; a record that will
  // not take it puts the ground back, so the two never disagree. Every answer has its undo.
  const settle = async (factId: string, said: "keep" | "no", c?: Confirm) => {
    if (!rec) return;
    const f = byId.get(factId), folder = f && f.area !== "you" && rec.solHome ? rec.areas.find((a) => a.id === f.area) : undefined;
    const cwd = folder && `${rec.solHome}/${folder.id}`;
    const ground = (op: (g: Ground) => Ground) => (folder && cwd ? changeGround(ask, cwd, folder.id, folder.name, op) : Promise.resolve(null));
    let before: ReturnType<typeof thingIn> | null = null;
    if (f && folder && !(await ground((g) => { before = thingIn(g, f.id); return answerIn(g, f, said, new Date().toISOString()); })))
      return say(`I could not reach ${folder.name} just now, so nothing changed. Press again in a moment.`);
    const put = (g: Ground) => restoreIn(g, factId, before!, f?.v ?? factId, new Date().toISOString());
    const was = { st: f?.st, said: c ? rec.confirmed[c.id] : undefined };
    const next = await save((r) => ({ ...r, confirmed: c ? { ...r.confirmed, [c.id]: said === "keep" ? "yes" : "no" } : r.confirmed,
      facts: r.facts.map((x) => (x.id === factId ? { ...x, st: said === "keep" ? "confirmed" : "no" } : x)) }));
    if (!next) { if (before) await ground(put); return; }
    const undo = async () => {
      if (before && !(await ground(put))) return say(`I could not reach ${folder!.name} just now; the answer stands. Press undo again in a moment.`);
      const back = await save((r) => {
        const confirmed = { ...r.confirmed };
        if (c) { if (was.said) confirmed[c.id] = was.said; else delete confirmed[c.id]; }
        return { ...r, confirmed, facts: r.facts.map((x) => (x.id === factId && was.st ? { ...x, st: was.st } : x)) };
      });
      if (back) say("Put back as it was.");
    };
    say(said === "keep" ? `Kept${folder ? ` in ${folder.name}` : ""}.` : `Taken out of ${folder?.name ?? "the folder"}.`, () => void undo());
  };
  const answer = async (c: Confirm, a: "yes" | "no" | "into") => {
    if (!rec) return;
    setFront(null);
    // a guessed folder put inside another (sort.ts's `into`): its things move there and the guessed folder goes
    if (a === "into" && c.into && c.area) {
      const from = c.area, to = c.into.area;
      const next = await save((r) => ({ ...r, confirmed: { ...r.confirmed, [c.id]: "no" }, into: { ...(r.into ?? {}), [c.id]: to },
        facts: r.facts.map((f) => (f.area === from ? { ...f, area: to } : f)),
        areas: r.areas.filter((x) => x.id !== from).map((x) => (x.id === to ? { ...x, facts: [...x.facts, ...(r.areas.find((y) => y.id === from)?.facts ?? [])] } : x)) }));
      if (next) say(`Put in ${c.into.label.replace(/^put it in /, "")}.`);
      return;
    }
    const yn = a === "yes" ? "yes" : "no";
    if (c.fact) return settle(c.fact, yn === "yes" ? "keep" : "no", c);
    // an answer about no one thing (a part, a sign-in, what stays closed): the record's alone
    const next = await save((r) => ({ ...r, confirmed: { ...r.confirmed, [c.id]: yn } }));
    if (next) say(yn === "yes" ? "Kept." : "Noted.");
  };
  const addPart = async (sentence: string) => {
    if (!recRef.current || !sentence.trim()) return setAdding(null);
    if (making) return;
    // the new part from the one sentence, read by the person's own Claude where the engine does that and by the rules
    // where it does not; what was found and sat in no folder ("you") moves in where it belongs
    let named: Area[] | null = null;
    if (reads.current) {
      const me = ++addRun.current;
      setMaking(true);
      named = readingOf(await ask({ type: "onboard.read", said: sentence }, 16_000), sentence, () => true).read?.areas.map((a) => ({ ...a, facts: [] })) ?? null;
      setMaking(false);
      if (addRun.current !== me) return;   // "not now", pressed while it read: nothing is made
      if (named && !named.length) named = null;   // read, and no part told from it: the rules have their turn
    }
    // the record as it is now, not as it was when the reading began; and the new parts are put into the record as it is
    // on disk when it is written (`withParts`), so an answer given while this waited stays
    const rec = recRef.current;
    if (!rec) return setAdding(null);
    const told = named ?? areasOf(sentence).areas;
    const withParts = (r: Record) => {
      const fresh = told.filter((a) => !r.areas.some((x) => x.id === a.id));
      const facts = r.facts.map((f) => { if (f.area !== "you" || f.kind === "machine" || f.kind === "ai" || f.kind === "tool") return f; const p = placeOf(f, fresh); return p === "you" ? f : { ...f, area: p }; });
      const areas = [...r.areas, ...fresh.map((a) => ({ id: a.id, name: a.name, part: a.part, facts: [] as string[], said: sentence.trim() }))].map((a) => ({ ...a, facts: facts.filter((f) => f.area === a.id).map((f) => f.id) }));
      return { fresh, facts, areas };
    };
    const { fresh, areas } = withParts(rec);
    if (!fresh.length) { setAdding(null); return say("I could not tell a new part from that; say it the way you'd tell a friend."); }
    setAdding(null);
    // which of the new parts' folders are new on disk is asked before any is made (record.ts newFolders)
    const unread = new Set<string>();
    // with them, a folder an earlier landing made whose files did not answer (fillDirs): retried here too
    const made = await newFolders(ask, { ...rec, areas: areas.filter((x) => fresh.some((f) => f.id === x.id) || (rec.fillDirs ?? []).includes(x.id)) }, rec.solHome ?? null, unread);
    // the new folders wait in fillDirs until made and both files written; only then are they the onboarding's (madeDirs)
    const next = await save((r) => { const w = withParts(r); return { ...r, said: `${r.said} ${sentence.trim()}`.trim(), areas: w.areas, facts: w.facts, fillDirs: [...new Set([...(r.fillDirs ?? []), ...made])], unchecked: [...new Set([...(r.unchecked ?? []), ...w.fresh.map((a) => a.id)])] }; });
    if (!next) return;
    // not made by the engine (#1511): nothing written, they wait in fillDirs and are named as not reached
    const dirs = !next.solHome || (await makeRecordDir(ask, made.map((id) => `${next.solHome}/${id}`)));
    const landed = dirs ? (await landFolders(ask, next, next.solHome ?? null, made)).held : made.map((id) => next.areas.find((a) => a.id === id)?.name ?? id);
    const done = next.solHome ? made.filter((id) => !landed.includes(next.areas.find((a) => a.id === id)?.name ?? id)) : [];
    if (made.length) { const n2 = await changeRecord(ask, (r) => afterLanding(r, made, done)); if (n2) setRec(n2); }
    const held = [...landed, ...unread];
    // the new folder is checked before it is only a tile in Home (the same card as after the hand-over)
    const mine = toCheck(next).filter((a) => fresh.some((f) => f.id === a.id));
    if (mine.length) setChecking(mine);
    const got = fresh.map((a) => next.areas.find((x) => x.id === a.id)?.facts.length ?? 0).reduce((k, x) => k + x, 0);
    // said in Home's own line for 3 s, then the nearest thing again (no toast); a folder not reached is still a toast
    const said: [string, string] = got ? [`${list(fresh.map((a) => a.name))},`, `with ${got} ${got === 1 ? "thing" : "things"} already found.`] : [list(fresh.map((a) => a.name)), "is made."];
    setLooked(said); window.setTimeout(() => setLooked((x) => (x === said ? null : x)), 3000);
    if (held.length) say(`I could not reach ${list(held)}, so I left it as it was.`);
  };
  // a place the person names inside the open one (#1481): its id is its path, so its folder is made inside the
  // parent's, with the same two files and the same landing as a part made by "+" at Home
  const addPlace = async (parent: string, name: string) => {
    const r0 = recRef.current, up = r0?.areas.find((a) => a.id === parent);
    setNaming(null);
    if (!r0 || !up || !name.trim()) return;
    const id = newIdIn(r0.areas, parent, name);
    if (!id) return say("Give it a name with a letter in it.");
    const fresh = { id, name: name.trim(), part: up.part, facts: [] as string[], said: name.trim() };
    const made = await newFolders(ask, { ...r0, areas: [fresh] }, r0.solHome ?? null);
    const next = await save((r) => (r.areas.some((a) => a.id === id) ? r : { ...r, areas: [...r.areas, fresh], fillDirs: [...new Set([...(r.fillDirs ?? []), ...made])] }));
    if (!next) return;
    // the place's folder and, when it has none, its parent's, by the engine (#1511); not made: said, and made next time
    const dirs = !next.solHome || (await makeRecordDir(ask, made.map((x) => `${next.solHome}/${x}`)));
    const held = dirs ? (await landFolders(ask, next, next.solHome ?? null, made)).held : [fresh.name];
    const done = next.solHome ? made.filter((x) => !held.length || x !== id) : [];
    if (made.length) { const n2 = await changeRecord(ask, (r) => afterLanding(r, made, done)); if (n2) setRec(n2); }
    say(held.length ? `${fresh.name} is in ${up.name}; its folder could not be reached, so it is made next time.` : `${fresh.name} is in ${up.name}.`);
  };

  // "<folder> is right": what was pressed is over, the sentence is in, the folder is checked (checked.ts)
  const checkRight = async (area: string, over: ReadonlySet<string>, said: string) =>
    !!(await save((r) => afterCheck(r, area, over, said, (r.asks ?? []).filter((c) => !r.confirmed[c.id]))));

  // a routine kept is a sticky in the folder's own stickies.md (the same list the folder's agent reads), kept by the
  // engine (#1228: agent.sticky); its run is the one press (agent.press), followed by the steps the engine tells
  const lineOf = (r: Routine) => `${r.event.v}${r.event.when ? ` — ${r.event.when}` : ""}: ${[r.place && `open ${r.place.v}`, r.file && `${r.place ? "and " : "open "}${r.file.v}`].filter(Boolean).join(" ")}; write what is due this week`;
  const dirOf = (area: string) => (rec?.solHome ? `${rec.solHome}/${area}` : null);
  /** the routine's sticky in the folder (found by its event's words, or made); null: the engine could not be reached */
  const stickyFor = async (area: string, r: Routine): Promise<string | null> => {
    const folder = dirOf(area);
    if (!folder) return null;
    const l = await ask<{ ok?: boolean; items?: { done: boolean; t: string }[] }>({ type: "agent.stickies", folder }, 8000);
    if (!l?.ok) { say("I could not reach this folder's stickies just now, so I changed nothing. Press again in a moment."); return null; }
    const had = l.items?.find((i) => !i.done && i.t.startsWith(r.event.v));
    if (had) return had.t;
    const made = await ask<{ ok?: boolean; key?: string; why?: string }>({ type: "agent.sticky", folder, op: "make", line: lineOf(r) }, 8000);
    if (!made?.ok) { say(`Not made: ${made?.why ?? "Sol did not answer"}.`); return null; }
    return made.key ?? null;
  };
  const keep = async (area: string, r: Routine) => {
    if (!rec) return;
    if (rec.solHome && !(await makeRecordDir(ask, [`${rec.solHome}/${area}`]))) return say("Not kept: Sol could not make this place just now. Press again in a moment.");
    const on = !(rec.routines ?? []).includes(r.id);
    const next = await save((x) => ({ ...x, routines: on ? [...new Set([...(x.routines ?? []), r.id])] : (x.routines ?? []).filter((y) => y !== r.id) }));
    if (!next) return;
    if (on) await stickyFor(area, r);
  };
  const run = async (area: string, r: Routine) => {
    if (!rec) return;
    const line = lineOf(r), folder = dirOf(area);
    if (levelOf(rec, area) === "record") {   // record only: what it would do is written down, nothing is opened
      const key = await stickyFor(area, r);
      if (key && folder) await ask({ type: "agent.sticky", folder, op: "note", key, line: `would: ${line.split(": ").slice(1).join(": ")}` }, 8000);
      setRuns((x) => ({ ...x, [r.id]: { at: 3, made: "a note of what it would do" } }));
      return say("Written down. Nothing was opened.");
    }
    setRuns((x) => ({ ...x, [r.id]: { at: 0 } }));
    const host = r.place?.v.replace(/^www\./, "").split(".")[0], file = r.file?.v.replace(/^[A-Z]{2,4} ?\d{3} /, "");
    setStep([r.event.v, host ? `opening ${host}` : `reading the ${file ?? "page"}`]);
    const key = await stickyFor(area, r);
    // the stops breathe while the folder's agent works; nothing is called done until it says so. Past the first two stops
    // the making part fills by the run's real steps as the engine tells them (agent.step: each tool in use, each file
    // made): each is a dot, its words are Home's line; the seconds are counted. No step yet: no dots, only the seconds
    let at = 0, ticks = 0;
    let over = false;
    const t0 = Date.now();
    const show = () => setRuns((x) => (x[r.id] && !x[r.id].broke && x[r.id].at < 3 ? { ...x, [r.id]: at < 2 ? { at } : { at, ticks, secs: Math.round((Date.now() - t0) / 1000) } } : x));
    stopRun.current = () => { over = true; window.clearInterval(tick); off(); };
    const tick = window.setInterval(() => {
      if (at < 2) { at++; setStep([r.event.v, at === 1 ? `reading the ${file ?? "page"}` : "working"]); }
      show();
    }, 1000);
    const off = e.subscribe((m: any) => {
      if (over || m?.type !== "agent.step" || m.folder !== area) return;
      const st = m.step as { kind: string; text: string } | undefined;
      if (!st || (st.kind !== "tool" && st.kind !== "made")) return;
      ticks++; at = 2; show();
      setStep([r.event.v, st.kind === "made" ? `wrote ${st.text.split("/").pop()}` : st.text.split(/\s+/).slice(0, 3).join(" ")]);
    });
    const res = key && folder ? await ask<{ ok: boolean; why?: string; ticket?: { runs?: { report?: string; said?: string }[]; needs?: { title?: string }; ledger?: { made?: string }[] } | null }>({ type: "agent.press", folder, key }, 20 * 60_000) : null;
    over = true; window.clearInterval(tick); off(); stopRun.current = null;
    if (rec.first === r.id && res?.ok) void save((x) => { const { first: _, ...rest } = x; return rest as Record; });   // once it has run, the head is plain again
    setStep(null);
    const last = res?.ticket?.runs?.[res.ticket.runs.length - 1];
    if (res?.ok && last?.report === "failed") setRuns((x) => ({ ...x, [r.id]: { at: 2, broke: "could not start", why: last.said ?? "" } as Run & { why?: string } }));
    else if (res?.ok) {
      // the run's own ledger line names what it made (a file written over counts too)
      const said = res.ticket?.ledger?.[res.ticket.ledger.length - 1]?.made;
      const made = said && !/^nothing/.test(said) ? firstMade(said) : undefined;
      setRuns((x) => ({ ...x, [r.id]: { at: 3, made: made ?? "in the folder" } }));
      const needs = last?.report === "blocked" ? res.ticket?.needs?.title : undefined;
      say(needs ? `Made ${made ?? "a note"}. It needs one thing from you: ${needs.replace(/\.$/, "")}.` : `Done: ${made ?? "it is in the folder"}. Nothing was sent.`);
    }
    else setRuns((x) => ({ ...x, [r.id]: { at: 0, broke: !key ? "no folder on disk yet" : /sign/i.test(res?.why ?? "") ? "asked for a sign-in" : "could not start", why: res?.why ?? "no answer from the engine" } as Run & { why?: string } }));
  };

  if (rec === undefined) return <Frame head={<Head title="home" />}><div className="fh fh-main" /></Frame>;
  // no record yet (someone who used Sol before #1223, or "not now" at the ask): one line and the one press that makes it
  if (rec === null || !rec.built) return <Frame head={<Head title="home" />}><div className="fh fh-main" data-place="talk"><div className="fh-view"><div className="fh-head"><h1 className="fh-one">No Home yet. <em>Tell me about your life in a few sentences and I make its folders while you watch.</em></h1><a className="ob-make" href={againHref} data-make-home>make my Home</a></div></div></div></Frame>;

  const area = rec.areas.find((a) => a.id === at);
  const factsOf = (id: string): Found[] => rec.facts.filter((f) => f.area === id && f.st !== "no");
  const leftIn = (id: string) => open.filter((c) => c.area === id || (!!c.fact && byId.get(c.fact)?.area === id));
  // the top places, and a folder's small word: the places inside it, else its part of life (#1481)
  const tops = topOf(rec.areas);
  const wordOf = (a: Record["areas"][number]) => { const k = kidsOf(rec.areas, a.id); return k.length ? k.map((x) => x.name).join(" · ") : PART[a.part]; };
  // what the person has kept (drawn plain), and a touch on one thing: keep or "not here" (#1227)
  const sure = new Set(rec.facts.filter((f) => f.st === "confirmed" || f.st === "said").map((f) => f.id));
  const touch = (id: string, keep: boolean) => void settle(id, keep ? "keep" : "no");
  const screens: Scr[] = rec.machine.screens.map((s) => ({ id: s.id, w: s.w, h: s.h, x: s.x, y: s.y, main: s.main }));
  const pieceAsk = (id: string) => (k: PieceKind) => { const c = leftIn(id).find((x) => !x.fact || (k === "week" ? !!byId.get(x.fact)?.repeats : true)); if (c) setFront(c.id); };
  const head = (crumb: ReactNode, one: ReactNode, right?: ReactNode) => <div className="fh-head"><div className="top"><div className="fh-date">{crumb}</div>{right}</div><h1 className="fh-one">{one}</h1></div>;
  // the level, inside a folder (the only place Home shows it): that folder's alone, in the record's consent, and that
  // folder agent's rung (only the stickies line in its policy.md); one write at a time with the first-visit card's
  const setFolderLevel = (id: string, h: Record["hands"]) => void oneLevelAtATime(async () => {
    const next = await save((r) => withLevel(r, h, id));
    if (next?.solHome && (await setRung(ask, `${next.solHome}/${id}`, h)) === "unknown") say("The level is saved; the folder could not be reached, so its agent keeps its old level for now.");
  });

  // the one line: the nearest dated thing across the folders (a one-off, not a weekly), else the parts of the life
  const nextIn = (only?: string) => rec.facts.filter((f) => f.area !== "you" && (!only || f.area === only) && f.kind === "event" && !f.repeats && f.st !== "no" && f.when)
    .map((f) => ({ f, d: daysTo(f.when) })).filter((x): x is { f: typeof x.f; d: number } => typeof x.d === "number" && x.d >= 0).sort((a, b) => a.d - b.d)[0];
  const next = nextIn();
  // the one thing Home arrives with: the folder holding the routine picked at the hand-over (rec.first), until it has run
  const firstIn = rec.first && rec.hands !== "record" ? rec.areas.find((a) => routinesOf(factsOf(a.id)).some((r) => r.id === rec.first))?.id : undefined;
  // the seven sources as the rail draws them in Home: a count where something was read, struck where it is closed
  const railCounts: Partial<Record_<StopId, number>> = {}, railStates: Partial<Record_<StopId, StopState>> = {};
  for (const [id] of STOPS) { railCounts[id] = rec.facts.filter((f) => f.stop === id && f.k !== "name").length; railStates[id] = id === "machine" ? "done" : rec.refused?.includes(id) ? "refused" : rec.skipped?.includes(id) ? "closed" : railCounts[id] ? "done" : "none"; }
  // who made a place's things: the agent that works there (its jelly), else Sol
  const makerOf = (place: string): Maker => { const a = agents?.find((x) => x.rules.some((r) => r.folder === place)); return a ? { name: a.name, turn: a.turn } : SOL; };
  const dirOfMade = (place: string) => (place === LOOSE ? looseDir : dirOf(place));
  let view: ReactNode;
  if (at === "made") view = (
    <div className="fh-view" key="made" data-made-view={made.length}>
      {head(<><button type="button" onClick={() => setAt("home")}>home</button> › <b>made</b></>, made.length ? <>Made. <em>By Sol and your agents, newest first.</em></> : <>Made. <em>Nothing yet: what a sticky's run makes lands here and under its sticky.</em></>)}
      {byDay(made, now).map((g) => (
        <Fragment key={g.day}>
          <div className="fh-made-day">{g.day}</div>
          <div className="fh-surface" style={{ paddingTop: 8 }}>{g.items.map((x) => <MadeCard key={x.key} x={x} maker={makerOf(x.place)} seen={seen} now={now} lip={pathName(x.place)} onOpen={(y) => { tellOpened(ask, y, isNew(y, seen, now), "made"); see(y.key); setOpenMade(y); }} />)}</div>
        </Fragment>
      ))}
    </div>
  );
  else if (at === "world" && worldOn) view = <div key="world" style={{ position: "absolute", inset: 0 }}><Suspense fallback={<div className="fh-view">{head(nowLine(), <>Your world. <em>Drawing it…</em></>)}</div>}><World3D e={e} home={rec.solHome ?? null} stand={stand} own={worldFolders} onOpen={(id) => { if (rec.areas.some((a) => a.id === id)) setAt(id); }} /></Suspense></div>;
  else if (at === "agents" && agentsOn) view = (
    <div className="fh-view" key="agents" data-home-agents>
      <Suspense fallback={<p className="fh-note">Reading your agents…</p>}><AgentsView e={e} inHome /></Suspense>
    </div>
  );
  else if (at === "you") view = (
    <div className="fh-view" key="you">
      {head(<><button type="button" onClick={() => setAt("home")}>home</button> › <b>{rec.name || "you"}</b></>, <>{rec.name || "You"}. <em>What every folder and mode reads first.</em></>)}
      <div style={{ maxWidth: 880, width: "100%" }}><Folder id="you" name={rec.name || "You"} word="this computer" facts={factsOf("you")} screens={screens} size="l" unsure={unsure} sure={sure} onThing={touch} onPiece={pieceAsk("you")} /></div>
      <p className="fh-note" style={{ marginTop: 18 }}>Never: {rec.off.join(", ") || "nothing said"} · kept on this computer, in ~/.sol/record/me.json{rec.skipped?.length ? ` · not read: ${rec.skipped.join(", ")}` : ""}</p>
      <div style={{ marginTop: 18 }}><button type="button" className="ob1-btn" data-look-again onClick={() => lookAgain()}>look again</button></div>
    </div>
  );
  else if (at === AT_LOOSE && looseDir) view = (
    <div className="fh-view" key="loose" data-loose>
      {head(<><button type="button" onClick={() => setAt("home")}>home</button> › <b>loose</b></>, <>Loose. <em>Not in a place yet.</em></>)}
      <FolderStickies ask={ask} sub={e.subscribe} folder={looseDir} name="loose" dry={false} say={say} place={LOOSE} seen={seen} see={see} />
    </div>
  );
  else if (area) {
    // its places first, as small folders, then the "+" that names one more; with none, the "+" alone and small
    const kids = kidsOf(rec.areas, area.id), cols = kids.length ? undefined : naming === null ? "auto" : "minmax(0, 300px)";
    view = (
      <div className="fh-view" key={area.id} data-area={area.id}>
        {head(<><button type="button" onClick={() => setAt("home")}>home</button>{pathOf(rec.areas, area.id).slice(0, -1).map((p) => <Fragment key={p.id}> › <button type="button" onClick={() => setAt(p.id)} data-crumb={p.id}>{p.name}</button></Fragment>)} › <b>{area.name}</b></>, (() => { const nx = nextIn(area.id); return step ? <span className="ob1-next run"><b>{step[0]}</b> <em>{step[1]}</em></span> : nx ? <span className="ob1-next">{nx.f.v} <em>{nx.d === 0 ? "today" : nx.d === 1 ? "tomorrow" : `in ${nx.d} days`}.</em></span> : <></>; })(), <div data-level-small><Level value={levelOf(rec, area.id)} onChange={(h) => setFolderLevel(area.id, h)} w={200} /></div>)}
        <div className={`ob-folders n${kids.length} ob-withplus oh-grid`} style={{ paddingTop: 0, marginBottom: 22, maxWidth: 880, width: "100%", boxSizing: "border-box", gridTemplateColumns: cols }} data-subs>
          {kids.map((k) => <Folder key={k.id} id={k.id} name={k.name} word={wordOf(k)} facts={factsOf(k.id)} unsure={unsure} fresh={fresh} kept={new Set<string>()} onOpen={() => setAt(k.id)}><AgentTags agents={agents} folder={k.id} /></Folder>)}
          {naming === null
            ? kids.length
              ? <button type="button" className="ob1-plus" data-add-place onClick={() => setNaming("")} title={`a place in ${area.name}`} aria-label={`a place in ${area.name}`}>+</button>
              : <div><button type="button" className="ob1-btn" data-add-place onClick={() => setNaming("")} title={`a place in ${area.name}`}>+ a place inside</button></div>
            : <div className="fh-folder obf" style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="who">a place in {area.name}</div>
              <input className="ob1-box" autoFocus value={naming} onChange={(ev) => setNaming(ev.target.value)} placeholder="its name" data-add-place-name
                onKeyDown={(ev) => { if (ev.key === "Enter") void addPlace(area.id, naming); if (ev.key === "Escape") { ev.preventDefault(); setNaming(null); } }} /></div>}
        </div>
        <div style={{ maxWidth: 880, width: "100%" }}><Folder id={area.id} name={area.name} word={PART[area.part]} facts={factsOf(area.id)} size="l" unsure={unsure} sure={sure} onThing={touch} onPiece={pieceAsk(area.id)}
          kept={new Set(rec.routines ?? [])} runs={runs} dry={levelOf(rec, area.id) === "record"} onRoutine={(r) => void keep(area.id, r)} onRun={(r) => void run(area.id, r)} onMend={(r) => void run(area.id, r)}><AgentTags agents={agents} folder={area.id} /></Folder></div>
        <FolderStickies ask={ask} sub={e.subscribe} folder={dirOf(area.id)} name={area.name} dry={levelOf(rec, area.id) === "record"} say={say}
          doer={<AgentTags agents={agents} folder={area.id} />} peek={(t) => <Again offers={offers} place={area.id} sticky={t} />} place={area.id} maker={makerOf(area.id)} seen={seen} see={see} />
      </div>
    );
  } else view = (
    <div className="fh-view" key="home">
      {head(nowLine(), reopen ? <span className="ob1-next" data-reopen>Open {STOPS.find((x) => x[0] === reopen)?.[2].replace(/, by name$/, "")} again? <em>Press it once more.</em></span> : step ? <span className="ob1-next run"><b>{step[0]}</b> <em>{step[1]}</em></span> : looked ? <span className="ob1-next" data-looked>{looked[0]} <em>{looked[1]}</em></span> : next
        ? <button type="button" className="ob1-next" onClick={() => setAt(next.f.area)} data-next>{next.f.v} <em>{next.d === 0 ? "today" : next.d === 1 ? "tomorrow" : `in ${next.d} days`}.</em></button>
        : tops.length ? <>{words(tops.length)} of your life. <em>{`${list(tops.map((a) => a.name))}.`}</em></> : <>Name a part of your life.</>, <div className="ob-again" data-again>
        <Rail at={door} states={railStates} counts={railCounts} onPress={(id) => {
          if (id === "machine") return;
          if (railStates[id] === "done") return lookAgain(undefined, id);
          if (railStates[id] === "none" || railStates[id] === "refused") { setDoorSaid(null); return setDoor(door === id ? null : id); }
          // a source closed to me opens only on a second press: asked once, in Home's own line
          if (reopen !== id) { setReopen(id); window.setTimeout(() => setReopen((x) => (x === id ? null : x)), 5000); return; }
          lookAgain(id);
        }} />
        {rec.hands !== "record" && <button type="button" className="ob-round" aria-label="look again" title="look again, while you watch" onClick={() => lookAgain()}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13.2 2.2v3h-3" /></svg></button>}
        {door && DOOR[door] && <div className="ob-door" data-door={door}><div className="t-body">{doorSaid ?? DOOR[door]![0]}</div>{DOOR[door]![1] && !doorSaid && <button type="button" className="ob1-btn pearl" data-door-go onClick={() => void openDoor(door)}>{DOOR[door]![1]}</button>}</div>}
      </div>)}
      <div className="fh-today" data-today={today.length + waiting.length}>
        <div className="fh-today-put"><BlankSticky hint="put something down" onPut={putAtHome} onNear={putIn} nameOf={pathName} /></div>
        {today.map((x, i) => (
          <Fragment key={`${x.place}\n${x.m.t}`}>
            {x.due >= tomorrowOf(now) && (i === 0 || today[i - 1].due < tomorrowOf(now)) && <div className="fh-today-split" data-today-split><i />tomorrow<i /></div>}
            <button type="button" className="fh-sticky fh-today-slip" onClick={() => setAt(x.place === LOOSE ? AT_LOOSE : x.place)} data-today-slip={x.m.t}
              onPointerDown={carry.down(`${x.place}\n${x.m.t}`, zonesFor(x.due, true, now))} onClickCapture={carry.swallow}
              onKeyDown={(ev) => { if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); void dropAt(x.place, x.m.t, "key"); } }}>
              <span className="t">{x.m.t}</span>
              <span className="fh-today-foot"><em className={`fh-due ${x.due < now ? "passed" : ""}`}>{dueWord(x.due, now)}</em><span className="where">{pathName(x.place)}</span></span>
            </button>
          </Fragment>
        ))}
        {waiting.map((x) => <MadeCard key={x.key} x={x} maker={makerOf(x.place)} seen={seen} now={now} lip={pathName(x.place)} onOpen={(y) => openIt(y, "place")} />)}
      </div>
      <div className={`ob-folders n${tops.length} ob-withplus oh-grid`} style={{ paddingTop: 18, width: "100%", boxSizing: "border-box" }}>
        {tops.map((a) => <Folder key={a.id} id={a.id} name={a.name} word={wordOf(a)} facts={factsOf(a.id)} unsure={unsure} fresh={fresh} unchecked={!checking && (rec.unchecked ?? []).includes(a.id)} onOpen={() => setAt(a.id)}
          {...(a.id === firstIn ? { first: rec.first, kept: new Set([rec.first!]), runs, dry: levelOf(rec, a.id) === "record", onRun: (r: Routine) => { setAt(a.id); void run(a.id, r); } } : { kept: new Set<string>() })} onPiece={(k) => { if (leftIn(a.id).length) pieceAsk(a.id)(k); else setAt(a.id); }}><AgentTags agents={agents} folder={a.id} /></Folder>)}
        {loose.length > 0 && <Folder id={LOOSE} name="loose" word="not in a place yet" facts={[]} kept={new Set<string>()} onOpen={() => setAt(AT_LOOSE)}><div className="fh-note" data-loose-slips>{loose.slice(0, 3).map((m) => m.t).join(" · ")}</div></Folder>}
        {adding === null
          ? <button type="button" className="ob1-plus" data-add onClick={openAdd} title="one sentence makes another part" aria-label="another part of your life">+</button>
          : <div className="fh-folder obf" style={{ display: "flex", flexDirection: "column", gap: 8 }}><div className="who">one sentence: a part of your life</div>
            <textarea className="ob1-box" autoFocus value={adding} readOnly={making} onChange={(ev) => setAdding(ev.target.value)} placeholder="I'm also learning Spanish…" style={{ minHeight: 80 }} data-add-said />
            <div style={{ display: "flex", gap: 8 }}><button className="ob1-btn pearl" onClick={() => void addPart(adding)} data-add-go data-reading={making ? "" : undefined}>{making ? "reading…" : "make it"}</button><button className="ob1-btn" onClick={() => { addRun.current++; setMaking(false); setAdding(null); }}>not now</button></div></div>}
      </div>
    </div>
  );

  const sideEl = (
    <div className="fh fh-side">
      <button type="button" className={`fh-row ${at === "home" ? "on" : ""}`} onClick={() => setAt("home")} data-side-today>today{today.length + waiting.length > 0 && <span className="n" title={`${today.length} due within a day${waiting.length ? `, ${waiting.length} waiting on you` : ""}`}>{today.length + waiting.length}</span>}</button>
      <button type="button" className={`fh-row ${at === "made" ? "on" : ""}`} onClick={() => setAt("made")} data-side-made={madeNew}>made{madeNew > 0 && <span className="n" title={`${madeNew} not opened yet`}>{madeNew} new</span>}</button>
      {worldOn && <button type="button" className={`fh-row ${at === "world" ? "on" : ""}`} onClick={() => setAt("world")}>world</button>}
      {treeOf(rec.areas).map(({ p: a, depth }) => { const k = underOf(rec.areas, a.id).reduce((n, id) => n + leftIn(id).length + ((rec.unchecked ?? []).includes(id) ? 1 : 0), 0); return <button type="button" key={a.id} className={`fh-row ${depth && at !== a.id ? "fh-sub" : ""} ${at === a.id ? "on" : ""}`} style={depth ? { paddingLeft: 26 + 14 * (depth - 1) } : undefined} onClick={() => setAt(a.id)} data-side-area={a.id}>{a.name}{k > 0 && <span className="n" title={`${k} to say`} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", boxShadow: "inset 0 0 0 2px var(--yellow-strong, #f5c84b)", fontSize: 0 }}>{k}</span>}</button>; })}
      {agentsOn && <button type="button" className={`fh-row ${at === "agents" ? "on" : ""}`} onClick={() => { try { sessionStorage.removeItem(AGENT_AT); } catch { /* private */ } setAt("agents"); }} data-side-agents>
        <Jelly size={16} turn={0} doing={agentsNeed ? "needs" : undefined} />agents{agentsNeed > 0 && <span className="n" title={`${agentsNeed} need you`}>{agentsNeed}</span>}</button>}
      {agentsOn && at === "agents" && agents && railOf(agents).rows.map((a) => (
        <button type="button" key={a.id} className="fh-row fh-sub" onClick={() => openAgent(a.id)} data-side-agent={a.id}>
          <Jelly size={14} turn={a.turn} doing={doingOf(a.state)} className={postureOf(a) === "blocked" || postureOf(a) === "paused" ? "ag-asleep" : undefined} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span></button>
      ))}
      <button type="button" className={`fh-row ${at === "you" ? "on" : ""}`} onClick={() => setAt("you")}>{rec.name ? rec.name.split(" ")[0] : "you"}</button>
    </div>
  );
  return (
    <Frame className="ev" open={side} head={<Head side={{ open: side, onFlip: () => setSide((o) => !o) }} title="home" where={area?.name ?? (at === "you" ? "you" : at === "world" && worldOn ? "world" : at === "agents" && agentsOn ? "agents" : undefined)} />} side={sideEl}>
      <div className="fh fh-main" data-place="talk" data-onehome>
        {view}
        {/* a made thing opened from the made row or from Today's waiting ones (a place's own opens in FolderStickies) */}
        {openMade && <MadeSheet ask={ask} dir={dirOfMade(openMade.place)} x={openMade} maker={makerOf(openMade.place)} where={pathName(openMade.place)} onClose={() => setOpenMade(null)} onYes={(x) => yes(stickyIn(x.place), x)} />}
        {cur && (
          <div className="ob-scrim" style={{ position: "fixed", paddingLeft: 0 }} onClick={() => setFront(null)}>
            <div className="ob-card" onClick={(ev) => ev.stopPropagation()} data-home-ask>
              <Glass w={420} h={400} r={CURVE.radius.card} step="pop"><Evidence key={cur.id} c={cur} fact={cur.fact ? byId.get(cur.fact) : undefined} likely={cur.kind === "guess" ? "yes" : null} left={0} onAnswer={(a) => void answer(cur, a)} /></Glass>
            </div>
          </div>
        )}
        {checking && (
          <div className="ob-scrim" style={{ position: "fixed", paddingLeft: 0 }} data-check-scrim>
            <Check rec={rec} areas={checking} open={open} onRight={checkRight} onLater={(id) => void save((r) => putOff(r, id))} onDone={() => setChecking(null)} />
          </div>
        )}
        {carry.tray}
        {toast && <div className="fh-toast" data-toast>{toast.text}{toast.undo && <> <button type="button" className="ob1-btn" data-undo onClick={() => { const u = toast.undo!; setToast(null); u(); }}>undo</button></>}</div>}
      </div>
    </Frame>
  );
}
