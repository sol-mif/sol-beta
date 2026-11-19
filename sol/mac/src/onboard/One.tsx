// The one onboarding (#1088; the default since #1223, in place of the first run, the walk and Home's tour): ask once, then the agent works while the person watches. Drawn
// by the night's designer (S/design: design/page.tsx is the page it was drawn on, with a made-up person); this is the
// same screen on live data: the explorer (explore.mjs) on this computer, the record (record.ts), the real Home after.
// Three moments on one screen, the folders never leaving it:
//   ask    "you" is already filled with what needs no permission (the apps, the screens, the name: the explorer's first
//          stop, run at open); one box; the seven stops as glyphs (Lens.tsx Rail), a press closes one; go (⌘↵);
//          "only use what I wrote" (the consent's "only what I tell you") reads nothing more and sets the level to record
//          only; the line above the glyphs says what they are and what a press does (Marco's try 2026-11-17); under
//          the box the places a person can sign in to (SignIns.tsx, places.ts: Marco's pick A, 2026-11-17); first of them
//          "Sol" (#1608, decision #1606): the Google sign-in on Sol's cloud that says whose Home this is; go, ⌘↵ and
//          "only use what I wrote" pass its door first (no Home without it): the engine says who is signed in, and
//          nobody means the line says to sign in and Sol's card opens. A press before the engine is up waits as it
//          always did ("Setting myself up first", try again on a failed install) and meets the door when it is
//   watch  each stop as its own drawing (Lens): a fact is seen there, then a dot of the jelly carries it to the folder
//          it belongs to (sort.ts), which dips as it lands; space pauses; a stop closed to the explorer is named
//   yours  the unsure things one at a time with their evidence (Yours.tsx Evidence, ← →), the level (Level), and
//          "this is my Home" from the first second; it writes ~/.sol/record/me.json and each folder's ground.json,
//          then the left column leaves and the folders glide to Home's place, and the real Home (OneHome) takes over
// No shell here: the box comes back with "I could not look", and the words still make the folders.
// The app with no code yet (lib.rs: /?firstrun=1) runs the install behind the ask (install.ts): the person types while
// it runs, its phrase is the line's second half, and "go" waits for the engine with the words kept ("Setting myself up").
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { useEngine } from "../useEngine";
import { Button, Glass, Glyph, type GlyphName } from "../kit";
import { CURVE, JELLY } from "../kit/tokens";
import { Body, haloDoing } from "../Body";
import { Folder, daysTo, pieceOf, routinesOf, type PieceKind, type Scr } from "./Folder";
import { carry } from "./carry";
import { glide, homeReady, offBy } from "./handover";
import { Lens, Rail, STOPS, type StopId, type StopState } from "./Lens";
import { Evidence, Level, LEVELS } from "./Yours";
import { Reach, SideBySide } from "./SideBySide";
import { openOf, rowsOf, setupOf, type Choice, type Reach as ReachT } from "./setup";
import { askJev, explore, makeRecordDir, solHomeOf } from "./run";
import { bandOf, jevBody, readAnswers, toldLine, type Pick } from "./jev";
import { brief, esc, offOf, readingOf, sortAll, wordsClose, type Confirm, type Explored, type Found, type Reading } from "./sort";
import { afterLanding, changeRecord, newFolders, setRung, FRESH_KEY, HELD_KEY, keyOf, landFolders, since, writeRecord, mergeRecords, readRecord, readRecordAt, recordOf, type Hands, type Record as Rec } from "./record";
import { landKeys } from "./which";
import { installWanted, startInstall, type Install } from "./install";
import { consentIn, consentOf, pendingMachine, PENDING_KEY, type Agreed } from "./consent";
import { readScreens, screensLine, type Screen } from "./screens";
import { watchRows } from "./watchLog";
import { placesOf, type Place, type Reach as SignedIn } from "./places";
import { SignIns, CONNECTORS_PAGE } from "./SignIns";
import { connectedServices, forgetServices, inSol, type Service } from "./reach";
import "./one.css";

type E = ReturnType<typeof useEngine>;
type Moment = "ask" | "watch" | "yours" | "home";
const ORDER = STOPS.map((s) => s[0]);
// what their words close, as they type them (designer NOW 05:29 item 3; local rules on sorted.off, nothing is sent):
// a source by its ordinary names, struck on the rail; a thing that holds messages, struck where it is drawn
const WORD_SHUTS: [StopId, RegExp][] = [["calendar", /\b(calendar|schedule)\b/i], ["files", /\b(files?|documents?|folders?)\b/i], ["projects", /\b(code|projects?|github|repos?)\b/i], ["browser", /\b(browser|history|browsing)\b/i], ["tools", /\b(connections?|connectors?)\b/i]];
const HOLDS = /\b(messages?|chats?|texts?|mail|email|inbox|dms?|slack)\b/i, HELD = /slack|mail\.google|gmail|whatsapp|messages|discord/i;
/** a word of theirs that closes something on this screen: a source on the rail, or the things that hold messages */
const closesSome = (w: string) => HOLDS.test(w) || WORD_SHUTS.some(([, re]) => re.test(w));
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const first = (s: string) => s.split(" ")[0];
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");
const WORDS = ["No parts", "One part", "Two parts", "Three parts", "Four parts", "Five parts", "Six parts"];
const labelOf = (id: StopId) => STOPS.find((s) => s[0] === id)![2];
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const empty = (): Record<StopId, Found[]> => ({ machine: [], ai: [], tools: [], calendar: [], files: [], projects: [], browser: [] });

/** a question on the wire with a rid, its answer back (FolderHome's own way) */
function useAsk(e: E) {
  const waits = useRef(new Map<string, (m: any) => void>());
  const n = useRef(0);
  useEffect(() => e.subscribe((m: any) => { const f = m?.rid && waits.current.get(m.rid); if (f) { waits.current.delete(m.rid); f(m); } }), [e.subscribe]);
  return useCallback(<T,>(o: object, ms: number) => new Promise<T | null>((res) => {
    const rid = `ob1-${Date.now()}-${++n.current}`;
    const t = window.setTimeout(() => { waits.current.delete(rid); res(null); }, ms);
    waits.current.set(rid, (m) => { window.clearTimeout(t); res(m as T); });
    const go = (k: number) => { if (e.send({ ...o, rid }) !== false) return; if (k < 20) { window.setTimeout(() => go(k + 1), 500); return; } window.clearTimeout(t); waits.current.delete(rid); res(null); };
    go(0);
  }), [e.send]);
}

const scr = (s: Screen[]): Scr[] => s.map((x) => ({ id: x.id, w: x.w, h: x.h, x: x.x, y: x.y, main: x.main }));

export default function One({ e, onDone, onLanding }: { e: E; onDone: (home: boolean) => void; onLanding?: () => void }) {
  const ask = useAsk(e);
  const [m, setM] = useState<Moment>("ask");
  // each moment reached and left, so where a first-time Sol user stops can be counted (engine track.ts
  // home.onboarding.step, #1474): the moment's word and the seconds in it, nothing they said; reached and never left is
  // where they stopped
  useEffect(() => {
    const at = Date.now();
    e.send({ type: "home.onboarding.step", step: m, how: "reached" });
    return () => { e.send({ type: "home.onboarding.step", step: m, how: "left", secs: Math.round((Date.now() - at) / 1000) }); };
  }, [m]);   // eslint-disable-line react-hooks/exhaustive-deps -- the wire, not the whole engine object
  const [said, setSaid] = useState("");
  const [closed, setClosed] = useState<Set<StopId>>(new Set());
  const [found, setFound] = useState<Record<StopId, Found[]>>(empty);
  const [states, setStates] = useState<Partial<Record<StopId, StopState>>>({});
  const [at, setAt] = useState<StopId | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const [lit, setLit] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [into, setInto] = useState<Record<string, string>>({});   // a guessed folder put inside another: confirm id → area
  const [took, setTook] = useState<Record<string, "yes" | "no">>({});
  const [front, setFront] = useState<string | null>(null);
  const [hands, setHands] = useState<Hands>("show");
  const [screens, setScreens] = useState<Screen[]>([]);
  const [solHome, setSolHome] = useState<string | null>(null);
  const [broke, setBroke] = useState(false);
  const [openNow, setOpenNow] = useState<{ stop: string; what: string; n: number } | null>(null);   // the source open now (explore.mjs `open`)
  const [xNow, setXNow] = useState<Explored | null>(null);   // the reader's report as it goes: each stop's source open, facts and skips (#1223)
  const [careful, setCareful] = useState(false);
  // their own AI setup beside Jelly's (#1423): each disagreement's choice, how far Jelly may change their files, and
  // whether they went on to the unsure things. "read" until they say: nothing of theirs is written by default
  const [choices, setChoices] = useState<Partial<Record<string, Choice>>>({}), [reach, setReach] = useState<ReachT>("read"), [sideDone, setSideDone] = useState(false);
  const [presses, setPresses] = useState(0);
  // the places under the box (#1423): what is signed in by presence (explore.mjs stop 0, read at open), the Claude
  // account's services, the place a press is waiting on, and what each press said back
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null), [services, setServices] = useState<Service[] | null>(null);
  const [signBusy, setSignBusy] = useState<string | null>(null), [signSaid, setSignSaid] = useState<Record<string, string>>({});
  // whose Home this is (#1608): the Sol name signed in on the cloud, asked once the engine is up (undefined until it
  // says; null: nobody); `cloud` false when there is none to sign in to (a developer's own run: no door); `needMe`
  // counts the presses that met the door with nobody signed in (each opens Sol's card again)
  const [me, setMe] = useState<string | null | undefined>(undefined), [cloud, setCloud] = useState(true), [needMe, setNeedMe] = useState(0);
  const meAsk = useRef<Promise<{ login: string; cloud: boolean }> | null>(null), meNow = useRef<{ login: string; cloud: boolean } | null>(null);   // the ask on its way; the latest known (the engine's answer, then the sign-in's)
  // their sentences as their own Claude read them (#1195; sort.ts Reading): asked once at go, kept for the sentences it
  // was read from; `held` is what must be put to them before anything is opened (the line says it, the rail closes it)
  const [read, setRead] = useState<{ of: string; r: Reading } | null>(null);
  const [reading, setReading] = useState(false), [held, setHeld] = useState<string[] | null>(null), [wide, setWide] = useState<string[]>([]);
  const reads = useRef<boolean | null>(null), warmed = useRef(0), heldOf = useRef<string | null>(null);   // the engine said it reads; when a seat was last asked for; the sentences already held once
  const warming = useRef<Promise<void> | null>(null);   // the engine's answer to "do you read", on its way
  const heldAll = useRef<string[]>([]);   // what was put to them for `heldOf`: an edit undone back to those sentences asks it again
  const agreed = useRef<Agreed | null>(null);   // the ask's answer in this run (consent.ts): go, or only what I tell you
  const levelMoved = useRef(false);   // the person moved the level in this run (Jev's start is not theirs)
  // "look again" (?look=again, from Home): the same sentences, no ask; the record it continues keeps its answers and visits
  const again = useRef(typeof location !== "undefined" && new URLSearchParams(location.search).get("look") === "again");
  const prev = useRef<Rec | null>(null);
  // look again, as drawn: what the record already holds (by what it is) is in the lens at once and does not move; only
  // what is new is seen, carried and kept as `fresh`. No "yours" moment: the record is written and Home comes back.
  const known = useRef<Set<string>>(new Set());
  const arrived = useRef(false);
  const pressedAt = useRef(0);
  const buildRef = useRef<HTMLSpanElement>(null), [heldW, setHeldW] = useState<number | null>(null);   // the button's width, held   // "this is my Home" pressed: the hand-over's beat is measured from here   // the first second has played
  const onlyRef = useRef<StopId | null>(null);
  const fresh = useRef<Set<string>>(new Set());
  const toHomeRef = useRef<() => Promise<void>>(async () => {});
  // Jev's picks (jev.ts): undefined until asked, null when it could not answer (then the rules stand in)
  const [levelWhy, setLevelWhy] = useState<Hands | null>(null);   // the level Jev started at, said once in the line
  const [jev, setJev] = useState<{ picks: Record<string, Pick>; level?: Pick & { choice: Hands } } | null | undefined>(undefined);
  const press = () => setPresses((p) => p + 1);
  // the install (#1223, from the first run): only in the app with no code yet; "try again" starts it once more
  const [inst, setInst] = useState<Install | null>(null), [tries, setTries] = useState(0);
  useEffect(() => (installWanted() ? startInstall("", setInst) : undefined), [tries]);
  const [waitUp, setWaitUp] = useState(false);   // "go" pressed before the engine answered: the watch starts once it does
  const layer = useRef<HTMLDivElement>(null), run = useRef(0), hold = useRef(false);
  // the pane's glass and the level are as wide as the pane (Glass takes numbers): measured, so a narrow pane has a narrow
  // lens; under 900 px the stage is one column (one.css, the container rule at its end)
  const stage = useRef<HTMLDivElement>(null), pane = useRef<HTMLDivElement>(null);
  const [pw, setPw] = useState(440), [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (pane.current) setPw(pane.current.offsetWidth || 440); if (stage.current) setNarrow(stage.current.offsetWidth < 900); });
    if (pane.current) ro.observe(pane.current);
    if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  const exRef = useRef<Explored | null>(null), doneRef = useRef(false), skipRef = useRef<StopId | null>(null);
  hold.current = paused;

  // the first second: what needs no permission (the screens from the window; the apps and the name from the explorer's
  // first stop, run alone at open) is in "you" before anything is asked
  const firstRead = useRef<"no" | "going" | "done">("no");
  const [goNow, setGoNow] = useState(false);
  const writing = useRef(false);
  const [stuck, setStuck] = useState<string | null>(null);   // a write held back so nothing of theirs is lost, said in the line
  useEffect(() => { void readScreens().then(setScreens); }, []);
  useEffect(() => {
    if (!e.up || firstRead.current !== "no") return;   // the engine first: a window that opens before it is up reads once it is
    firstRead.current = "going";
    void connectedServices(ask).then(setServices);
    void explore(ask, e, ORDER.filter((s) => s !== "machine"), (x) => {
      if (x.reach) setSignedIn(x.reach);
      const mach = x.stops.find((s) => s.id === "machine");
      if (mach && mach.state !== "now") {
        const fs = mach.facts.map((f) => ({ ...f, id: `m-${f.id}` }));
        setFound((f) => ({ ...f, machine: fs }));
        // the first second: the name first, then the screens and the apps 90 ms apart, "you" dipping for each
        if (!arrived.current) {
          arrived.current = true;
          const nm = fs.filter((f) => f.k === "name"), rest = fs.filter((f) => f.k !== "name");
          setLanded((l) => { const n = new Set(l); nm.forEach((f) => n.add(f.id)); return n; });
          rest.forEach((f, i) => window.setTimeout(() => { setLanded((l) => new Set(l).add(f.id)); setLit("you"); window.setTimeout(() => setLit((x) => (x === "you" ? null : x)), 120); }, 250 + i * 90));
        } else setLanded((l) => { const n = new Set(l); fs.forEach((f) => n.add(f.id)); return n; });
      }
    }, setSolHome, ".sol/onboard/explore-first.json", { said: true }).then(async (r) => {
      firstRead.current = r ? "done" : "no";
      if (!r || !again.current) return;
      const rec = await readRecord(ask);
      if (!rec) return;
      prev.current = rec;
      // their setup's earlier choices and reach stand: a run over a record asks only what is new
      if (rec.setup) { setChoices(Object.fromEntries(Object.entries(rec.setup.choices).filter(([, c]) => c !== "later"))); setReach(rec.setup.files); }
      known.current = new Set(rec.facts.map(keyOf));
      // the folders stay whole from the first second: what the record holds is in them before the look begins
      const had: Record<StopId, Found[]> = empty();
      for (const f of rec.facts) if (f.stop && f.stop !== "machine" && f.stop in had) had[f.stop as StopId].push(f);
      setFound((x) => ({ ...had, machine: x.machine }));
      setLanded((l) => new Set([...l, ...rec.facts.filter((f) => f.stop && f.stop !== "machine").map((f) => f.id)]));
      // what was closed stays closed; a glyph pressed in Home (?open=<source>) opens that one again
      const q = new URLSearchParams(location.search), reopen = q.get("open"), only = q.get("only") as StopId | null;
      // ?only=<source>: that source alone is read (a glyph pressed in Home, or a door just opened); the others stay as they were
      onlyRef.current = only && ORDER.includes(only) ? only : null;
      setClosed(new Set(onlyRef.current ? ORDER.filter((x) => x !== "machine" && x !== onlyRef.current) : (rec.skipped ?? []).filter((x): x is StopId => ORDER.includes(x as StopId) && x !== reopen)));
      // a record made from a reading keeps its folders as they were read: looking again asks no model
      if (rec.readBy === "ai") setRead({ of: rec.said, r: { areas: rec.areas.map((a) => ({ id: a.id, name: a.name, part: a.part, said: a.said ?? rec.said })), off: rec.off } });
      setSaid(rec.said); setHands(rec.hands);
      setAnswers(rec.confirmed);   // what was answered before is not asked again
      setInto(rec.into ?? {});
      window.setTimeout(() => setGoNow(true), 300);
    });
  }, [e.up]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** whose Home this is, as the engine says it, asked once (the engine up): the Sol name signed in on the cloud ("" for
   *  nobody) and whether there is a cloud to sign in to at all. No answer in 8 s: a cloud, nobody (the sign-in says) */
  const whose = useCallback(() => (meAsk.current ??= ask<{ login?: string; cloud?: boolean }>({ type: "team.cloud.me" }, 8000).then((r) => { const w = meNow.current ?? { login: r?.login || "", cloud: r?.cloud !== false }; meNow.current = w; setCloud(w.cloud); setMe(w.login || null); return w; })), [ask]);
  useEffect(() => { if (e.up) void whose(); }, [e.up, whose]);
  const gated = cloud && me === null;   // the engine said: a cloud, and nobody signed in. No Home before the sign-in (Frank's decision, #1606: no other door)
  /** the door before anything is made (#1608), asked with the engine up: true to go on; else the line says to sign in
   *  first and Sol's card opens (the words stay in the box) */
  const door = async (): Promise<boolean> => { const w = meNow.current ?? (await whose()); if (w.cloud && !w.login) { setNeedMe((n) => n + 1); return false; } return true; };

  const all = useMemo(() => ORDER.flatMap((s) => found[s]), [found]);
  const byId = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  const screensFact: Found | null = screens.length ? { id: "screens", k: "screens", v: screensLine(screens), src: "this window", kind: "machine", sure: true } : null;
  const ex: Explored = useMemo(() => ({ v: 1, made: "", home: "", stops: ORDER.map((id) => ({ id, state: "done" as const, line: "", facts: found[id].filter((f) => landed.has(f.id)) })) }), [found, landed]);
  const readNow = read?.of === said ? read.r : null;
  const readRef = useRef(readNow); readRef.current = readNow;
  // (a reading of the sentences as they were before an edit still closes what it closed, while its sentence is there)
  const readBefore = read && read.of !== said ? read.r : null;
  const sorted = useMemo(() => sortAll(said, ex, readNow, readBefore), [said, ex, readNow, readBefore]);
  // Sol's place is there once the engine has said there is a cloud (places.ts); the other places once the explorer's reach is in
  const places = useMemo(() => placesOf({ reach: signedIn, services, said, off: sorted.off, closed, careful, me, cloud: me !== undefined && cloud }), [signedIn, services, said, sorted.off, closed, careful, me, cloud]);
  const solRow = me !== undefined && cloud;
  const saySign = (id: string, line: string | null) => setSignSaid((x) => { const n = { ...x }; if (line) n[id] = line; else delete n[id]; return n; });
  /** a place's one press (SignIns.tsx): GitHub's code, an AI tool's own page, or the Claude account's connectors page;
   *  the place turns "reading" when it comes back signed in, and nothing is read before "look around" */
  const sign = async (p: Place) => {
    press(); setSignBusy(p.id); saySign(p.id, null);
    const done = (line: string | null) => { setSignBusy((b) => (b === p.id ? null : b)); saySign(p.id, line); };
    if (p.way === "google") {   // Sol's own sign-in (#1608): Google in the system browser, through the engine (team.cloud.signin)
      const r = await ask<{ ok?: boolean; login?: string; error?: string }>({ type: "team.cloud.signin" }, 11 * 60_000);
      if (!r?.ok) return done(r?.error ?? "Google did not answer. Press again in a moment.");
      const name = r.login || (await ask<{ login?: string }>({ type: "team.cloud.me" }, 8000))?.login || "";
      if (!name) return done("Signed in, but I could not read the name yet. Press again in a moment.");
      meNow.current = { login: name, cloud: true }; setMe(name);
      return done(null);
    }
    if (p.way === "github") {
      const r = await ask<{ code?: string; url?: string; error?: string }>({ type: "team.github.connect" }, 30_000);
      if (!r?.code || !r.url) return done(r?.error ?? "GitHub did not answer. Press again in a moment.");
      saySign(p.id, `Your code: ${r.code}. Paste it on GitHub's page; I read your projects once it says yes.`);
      window.open(r.url, "_blank");
      const off = e.subscribe((m: any) => {
        if (m?.type === "team.github.connected") { off(); setSignedIn((x) => (x ? { ...x, gh: true } : x)); done(null); }
        else if (m?.type === "team.github.connect.failed") { off(); done(m.error ?? "GitHub said no."); }
      });
      return;
    }
    if (p.way === "claude" || p.way === "codex") {
      if (!inSol) return done(`Sign in from ${p.name} itself (${p.way === "claude" ? "claude auth login" : "codex login"}); I see it when you come back.`);
      const id = p.way;
      try {
        const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
        const un = await listen<{ which: string; ok: boolean }>("signin-done", (m) => {
          if (m.payload.which !== id) return;
          un();
          if (m.payload.ok) { setSignedIn((x) => (x ? { ...x, ai: { ...x.ai, [id]: true } } : x)); done(null); }
          else done("The page closed before it finished. Press again to open it.");
        });
        await invoke(id === "claude" ? "claude_login" : "codex_login");
        saySign(p.id, `${id === "claude" ? "Claude" : "ChatGPT"}'s page is open in your browser; sign in there and come back.`);
      } catch (err) { done(String(err)); }
      return;
    }
    // the Claude account's connectors: the page in the browser, the list asked again when the window has them back
    window.open(CONNECTORS_PAGE, "_blank");
    saySign(p.id, `Connect ${p.name} on that page, then come back here.`);
    const back = () => { window.removeEventListener("focus", back); forgetServices(); void connectedServices(ask).then((l) => { if (l) setServices(l); done(null); }); };
    window.setTimeout(() => window.addEventListener("focus", back), 500);
  };
  const exRef2 = useRef(ex); exRef2.current = ex;
  // a source their words name is struck on the rail 300 ms after the word, and opens again if the words go
  const byWords = useRef<Set<StopId>>(new Set());
  const pressOpened = useRef<Set<StopId>>(new Set());   // opened by a press after the words closed it: the words leave it open
  const closedRef = useRef(closed); closedRef.current = closed;
  useEffect(() => {
    if (m !== "ask") return;
    const t = window.setTimeout(() => {
      const named = new Set<string>(WORD_SHUTS.filter(([, re]) => sorted.off.some((o) => re.test(o))).map(([id]) => id));
      const r = wordsClose(closedRef.current, byWords.current, named, pressOpened.current);   // words never open what a press closed (sort.ts)
      byWords.current = r.byWords as Set<StopId>; pressOpened.current = r.opened as Set<StopId>;
      if (r.closed.size !== closedRef.current.size || [...r.closed].some((x) => !closedRef.current.has(x as StopId))) setClosed(r.closed as Set<StopId>);
    }, 300);
    return () => window.clearTimeout(t);
  }, [sorted.off, m]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shut = useMemo(() => new Set(sorted.off.some((o) => HOLDS.test(o)) ? all.filter((f) => HELD.test(f.v)).map((f) => f.id) : []), [sorted.off, all]);   // what has landed so far, for where the next thing flies
  const name = all.find((f) => f.k === "name")?.v ?? "";
  const open5 = sorted.confirms.filter((c) => !answers[c.id]);
  const unsure = useMemo(() => new Set(m === "ask" || m === "watch" ? [] : open5.map((c) => c.fact ?? "")), [open5, m]);
  const cur = open5.find((c) => c.id === front) ?? open5[0];
  // their own setup, side by side (#1423): shown first in the closing moment when the explorer read one (on their yes)
  const setupRows = useMemo(() => (careful ? [] : rowsOf(xNow?.setup)), [xNow?.setup, careful]);
  const side = (m === "yours" || m === "home") && setupRows.length > 0 && !sideDone && !stuck;
  const differs = openOf(setupRows, choices).length, differed = openOf(setupRows, {}).length;
  const refused = ORDER.filter((id) => states[id] === "refused");

  // Jev, once, when the unsure things come (design.md JEV 3 and 5): an answer it is sure of (0.7 and over) is taken by
  // itself and shown as taken, with undo; a likely one (0.45 and over) is the ghost button; the level likewise. When Jev
  // cannot answer (no key, an error, over 4 s), the rule stands in: a clash of two dates takes the newer reading.
  useEffect(() => {
    if (m !== "yours" || careful || jev !== undefined) return;
    setJev(null);
    void askJev(ask, e, jevBody(said, sorted.confirms, byId)).then((r) => {
      const got = r?.answers ? readAnswers(r.answers, sorted.confirms) : null;
      if (!got || (!Object.keys(got.picks).length && !got.level)) {
        const c = sorted.confirms.find((x) => x.kind === "conflict");
        if (c) { setTook((t) => ({ ...t, [c.id]: "yes" })); setAnswers((a) => ({ ...a, [c.id]: "yes" })); }
        return;
      }
      setJev(got);
      // what Jelly may open is never a judge's call: a private or a sign-in question is at most a ghost (design.md JEV 3)
      const kindOf = (id: string) => sorted.confirms.find((c) => c.id === id)?.kind;
      const sure = Object.entries(got.picks).filter(([id, p]) => bandOf(p.confidence) === "acts" && kindOf(id) !== "private");
      if (sure.length) {
        setTook((t) => ({ ...t, ...Object.fromEntries(sure.map(([id, p]) => [id, p.choice as "yes" | "no"])) }));
        setAnswers((a) => ({ ...a, ...Object.fromEntries(sure.map(([id, p]) => [id, p.choice as "yes" | "no"])) }));
      }
      // Jev may lower the level, never raise it: only "record only" is taken by itself
      if (got.level && bandOf(got.level.confidence) === "acts" && got.level.choice === "record") { setHands("record"); setLevelWhy("record"); }
    });
  }, [m]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the watching: stop by stop, each as soon as the explorer has read it; a fact is seen in the lens, then carried
  const watch = useCallback(async () => {
    const me = ++run.current, live = () => run.current === me, wait = async (ms: number) => { await sleep(ms); while (hold.current && live()) await sleep(120); };
    setM("watch");
    doneRef.current = false;
    exRef.current = null;
    const shut = closedRef.current;   // as it is at go (go may have just closed more)
    const skip = ORDER.filter((id) => id === "machine" || shut.has(id));
    let started = true;
    // the source the explorer has open right now (#1217): the line says what is being read while it is read
    void explore(ask, e, skip, (x) => { exRef.current = x; setXNow(x); const s = x.stops.find((y) => y.state === "now"); setOpenNow(s?.open ? { stop: s.id, what: s.open, n: s.read ?? 0 } : null); }, setSolHome, undefined, { said: true }).then((r) => { doneRef.current = true; setOpenNow(null); if (!r) started = false; });
    for (const id of ORDER) {
      if (!live()) return;
      if (id === "machine" || shut.has(id)) continue;
      setAt(id);
      // wait for the explorer to finish this stop (or to end, or to fail to start)
      let stop = (exRef.current as Explored | null)?.stops.find((s) => s.id === id);
      while (live() && (!stop || stop.state === "now")) {
        // the explorer ended (or never started), or the person skipped it: this stop ends here, whatever its state
        if (!started || doneRef.current || skipRef.current === id) break;
        await sleep(120);
        stop = (exRef.current as Explored | null)?.stops.find((s) => s.id === id);
      }
      if (!live()) return;
      if (!started) { setBroke(true); setAt(null); return; }
      if (skipRef.current === id) { skipRef.current = null; setStates((s) => ({ ...s, [id]: "closed" })); setClosed((c) => new Set(c).add(id)); continue; }   // into closed, so it reaches the record's skipped
      if (stop?.state === "now") stop = { ...stop, state: "none" };
      if (!stop || stop.state === "refused") { setStates((s) => ({ ...s, [id]: stop ? "refused" : "none" })); await wait(1600); continue; }
      // a folder that only repeats a part's name or its parent's says nothing new: left out of the lens and the record
      const parts = new Set(sortAll(said, { v: 1, made: "", home: "", stops: [] }, readRef.current).areas.map((a) => a.name.toLowerCase()));
      const fs = stop.facts.filter((f) => !(f.k === "folder" && (parts.has(f.v.toLowerCase()) || f.src.split("/").pop()?.toLowerCase() === f.v.toLowerCase())));
      const look = again.current && known.current.size > 0;
      // looking again never drops what the record held: a thing not found this time (moved, an early end) stays
      if (look) { const got = new Set(fs.map(keyOf)); setFound((f) => ({ ...f, [id]: [...fs, ...f[id].filter((x) => !got.has(keyOf(x)))] })); }
      else setFound((f) => ({ ...f, [id]: fs }));
      const had = look ? fs.filter((f) => known.current.has(keyOf(f))) : [], news = look ? fs.filter((f) => !known.current.has(keyOf(f))) : fs;
      if (had.length) { setShown((s) => new Set([...s, ...had.map((f) => f.id)])); setLanded((l) => new Set([...l, ...had.map((f) => f.id)])); }
      await wait(look && !news.length ? 340 : 500);
      for (const f of news) {
        if (!live()) return;
        setShown((s) => new Set(s).add(f.id));
        void (async () => {
          await wait(430);
          // the thing itself travels (carry.ts): what was seen in the lens lifts out and sets down in its own piece
          const from = document.querySelector(`[data-lens-fact="${f.id}"]`);
          const area = sortAll(said, { v: 1, made: "", home: "", stops: [...exRef2.current.stops, { id, state: "done", line: "", facts: [f] }] }, readRef.current).place[f.id] ?? "you";
          // its own piece when that piece has a box (narrow, the pieces are folded away), else the folder's head
          const pc = document.querySelector(`.ob1-stage [data-piece="${area}:${pieceOf(f)}"]`);
          const to = (pc && pc.getClientRects().length ? pc : document.querySelector(`.ob1-stage [data-folder="${area}"]`))?.getBoundingClientRect();
          if (from && to && layer.current && live()) await carry(layer.current, from, to, 450);
          if (!live()) return;
          setLanded((l) => new Set(l).add(f.id));
          if (look) fresh.current.add(f.id);
          setLit(area); window.setTimeout(() => setLit((x) => (x === area ? null : x)), 220);
        })();
        await wait(fs.length > 12 ? 140 : 260);
      }
      setStates((s) => ({ ...s, [id]: fs.length ? "done" : "none" }));
      await wait(look ? (news.length ? 700 : 0) : 1100);
    }
    if (!live()) return;
    setAt(null);
    if (again.current && known.current.size > 0) { await wait(500); if (live()) await toHomeRef.current(); return; }   // look again: no questions
    setLit("all"); window.setTimeout(() => setLit((x) => (x === "all" ? null : x)), 220);   // every folder dips once, together
    await wait(900);   // the full folders, held, before the first unsure thing
    if (live()) setM("yours");
  }, [closed, said, ask, e]);

  // the words are worked out at go too: ⌘↵ inside the 300 ms never starts with a source their words closed still open
  // and so are the sentences themselves (#1195): when the engine said it reads, their own Claude reads them once, here,
  // before anything is opened; what it closes is closed first. A sentence that may refuse something and closed nothing
  // is put to them (the line), one sentence a go, and the look starts at the go after the last. No answer: the rules,
  // as before. The engine waits 12 s for the turn and then answers what its word net caught, so this waits past that.
  const go = async () => {
    if (m !== "ask" || reading) return;
    press();
    if (e.up && !(await door())) return;   // #1608: whose Home this is, first (the engine not up: the press waits below and meets the door then)
    if (held && held.length > 1 && heldOf.current === said) { setHeld(held.slice(1)); return; }
    let got = readNow, off = sorted.off;
    if (said.trim() && !got && heldOf.current !== said && reads.current !== false) {
      const me = run.current;
      setReading(true);
      // pasted and sent at once: whether this engine reads is still on its way (or was never asked)
      if (reads.current === null) await (warming.current ?? warm());
      const a = reads.current && run.current === me ? readingOf(await ask({ type: "onboard.read", said }, 16_000), said, closesSome) : { read: null, ask: [] as string[], wide: [] as string[] };
      setReading(false);
      if (run.current !== me) return;   // "not now" or "only what I tell you", pressed meanwhile
      got = a.read;
      if (got) { setRead({ of: said, r: got }); readRef.current = got; off = offOf(said, got); }
      if (a.ask.length) { heldOf.current = said; heldAll.current = a.ask; setHeld(a.ask); setWide(a.wide); }
      const shut = wordsClose(closedRef.current, byWords.current, new Set<string>(WORD_SHUTS.filter(([, re]) => off.some((o) => re.test(o))).map(([id]) => id)), pressOpened.current);
      byWords.current = shut.byWords as Set<StopId>; pressOpened.current = shut.opened as Set<StopId>; closedRef.current = shut.closed as Set<StopId>; setClosed(shut.closed as Set<StopId>);
      if (a.ask.length) return;
    }
    setHeld(null); heldAll.current = [];
    agreed.current = { said: "go", at: new Date().toISOString(), by: "the one onboarding" };
    const named = new Set<string>(WORD_SHUTS.filter(([, re]) => off.some((o) => re.test(o))).map(([id]) => id));
    const r = wordsClose(closedRef.current, byWords.current, named, pressOpened.current);
    byWords.current = r.byWords as Set<StopId>; pressOpened.current = r.opened as Set<StopId>; closedRef.current = r.closed as Set<StopId>; setClosed(r.closed as Set<StopId>);
    if (!e.up) { setM("watch"); setWaitUp(true); return; }   // the words are kept; the look starts when the engine does
    void watch();
  };
  // the first word typed brings their Claude's small seat up, so go waits for the reading alone; the answer says whether
  // this engine reads at all (one that does not is never asked to; one that has not said yet is waited for at go, 4 s at
  // most). Asked again past four minutes of typing: a seat nobody asked is closed at five
  const warm = () => { warmed.current = Date.now(); return (warming.current = ask<{ on?: boolean }>({ type: "onboard.warm" }, 4000).then((a) => { reads.current = !!a?.on; })); };
  const typed = (v: string) => {
    setSaid(v); setHeld(v === heldOf.current && heldAll.current.length ? heldAll.current : null);
    if (v.trim() && Date.now() - warmed.current >= 240_000) void warm();
  };
  // the engine came up with a press waiting (the words kept): the door first (#1608), then the look, or the careful close
  useEffect(() => {
    if (!waitUp || !e.up) return;
    setWaitUp(false);
    void door().then((ok) => { const careful = carefulWait.current; carefulWait.current = false; if (!ok) { setM("ask"); return; } if (careful) carefulGo(); else void watch(); });
  }, [waitUp, e.up]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (goNow && m === "ask") { setGoNow(false); void watch(); } }, [goNow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const carefulWait = useRef(false);   // "only use what I wrote" pressed before the engine was up: done once it is, past the door
  const carefulGo = () => { agreed.current = { said: "only what I tell you", at: new Date().toISOString(), by: "the one onboarding" }; run.current++; levelMoved.current = true; setCareful(true); setHands("record"); setClosed(new Set(ORDER.filter((x) => x !== "machine"))); setM("yours"); };   // every source closed by them: struck in Home, not "nothing found"
  const onlyWhatISay = async () => { press(); if (!e.up) { carefulWait.current = true; setM("watch"); setWaitUp(true); return; } if (!(await door())) return; carefulGo(); };   // the engine writes the record, so this waits for it like go; and the door first (#1608)
  const answer = (c: Confirm, a: "yes" | "no" | "into") => {
    press(); setAnswers((x) => ({ ...x, [c.id]: a === "into" ? "no" : a }));
    setInto((x) => { const n = { ...x }; if (a === "into" && c.into) n[c.id] = c.into.area; else delete n[c.id]; return n; });
    setFront(null);
  };
  const undo = () => { const last = Object.keys(answers).pop(); if (!last) return; setAnswers((x) => { const n = { ...x }; delete n[last]; return n; }); setTook((t) => ({ ...t, [last]: "no" as const })); setFront(last); };

  // "this is my Home": the record and each folder's ground, written; then the glide, then the real Home
  const toHome = async (looked = false) => {
    if ((m !== "yours" && !looked) || writing.current) return;
    writing.current = true;
    try { await toHome1(); } finally { writing.current = false; }
  };
  toHomeRef.current = () => toHome(true);
  // looking again, "back to Home": the look stops where it is; what landed stays (written as at the end)
  const backHome = () => { run.current++; setAt(null); setPaused(false); void toHome(true); };
  const toHome1 = async () => {
    press();
    if (!again.current && e.up && !(await door())) { setM("ask"); return; }   // the one door to a new Home, kept here too (#1608); a Home that exists is looked at again as before
    pressedAt.current = performance.now();
    setHeldW(buildRef.current?.getBoundingClientRect().width || null);
    const stopOf = new Map(ORDER.flatMap((id) => found[id].map((f) => [f.id, id] as const)));
    const kept = all.filter((f) => landed.has(f.id)).map((f) => ({ ...f, stop: stopOf.get(f.id) }));
    // the earlier record first: a run over one keeps what the person did since (answers in Home, parts made with +,
    // visits, level). A read that did not answer (a timeout, a file that will not parse) writes nothing at all.
    let old = prev.current;
    if (!old) {
      const g = await readRecordAt(ask);
      if ("unknown" in g) { setM("yours"); setStuck(`${cap1(g.unknown)}, so I wrote nothing. Press again in a moment.`); return; }
      old = "rec" in g ? g.rec : null;
    }
    const rec = recordOf(name, said, screensFact ? [screensFact, ...kept] : kept, sorted, screens, onlyRef.current ? (prev.current?.skipped ?? []).filter((x) => x !== onlyRef.current) : [...closed, ...refused]);
    if (readNow) rec.readBy = "ai";
    rec.hands = hands;
    if (setupRows.length) rec.setup = setupOf(setupRows, choices, reach);
    // a source read alone (a door) that is refused again stays refused
    rec.refused = onlyRef.current ? [...(prev.current?.refused ?? []).filter((x) => x !== onlyRef.current), ...refused.filter((x) => x === onlyRef.current)] : refused;
    rec.confirmed = { ...(old?.confirmed ?? {}), ...answers };
    if (old) rec.visits = old.visits;
    // asks and fact states from every answer, this run's and the earlier record's, so a second run does not ask again
    rec.asks = sorted.confirms.filter((c) => !rec.confirmed[c.id]);
    // a surmised folder they said is not a part (#1223): no folder; what was found for it goes back to their record
    // put inside another folder: its things go there instead (rec.into, kept so a second run does the same)
    rec.into = { ...(old?.into ?? {}), ...into };
    const notParts = new Set(rec.areas.filter((x) => x.part === "found" && rec.confirmed[`c-area-${x.id}`] === "no").map((x) => x.id));
    const to = (id: string) => { const t = rec.into?.[`c-area-${id}`]; return t && rec.areas.some((a) => a.id === t && !notParts.has(a.id)) ? t : "you"; };
    if (notParts.size) {
      for (const f of rec.facts) if (notParts.has(f.area)) f.area = to(f.area);
      for (const a of rec.areas) if (notParts.has(a.id)) { const t = rec.areas.find((x) => x.id === to(a.id)); if (t) t.facts = [...t.facts, ...a.facts]; }
      rec.areas = rec.areas.filter((x) => !notParts.has(x.id));
    }
    for (const c of sorted.confirms) { const f = rec.facts.find((x) => x.id === c.fact); const a = rec.confirmed[c.id]; if (f) f.st = a === "no" ? "no" : a ? "confirmed" : "unsure"; }
    rec.built = new Date().toISOString();
    // the earlier one is kept beside it, dated; me.json is written only once that copy is safe
    if (old) {   // whenever there is one, built or not
      const c = await ask<{ ok?: boolean }>({ type: "work.write", cwd: "~", path: `.sol/record/me-${(old.built ?? old.made ?? new Date().toISOString()).replace(/[:.]/g, "-")}.json`, text: JSON.stringify(old, null, 2) + "\n" }, 6000);
      if (!c?.ok) { setM("yours"); setStuck("I could not keep a copy of your earlier record, so I wrote nothing. Press again in a moment."); return; }
    }
    rec.solHome = solHome ?? old?.solHome ?? (await solHomeOf(ask));   // no terminal said $SOL_HOME: the engine's (#1510)
    rec.routines = old?.routines ?? [];
    const merged = mergeRecords(old, rec, levelMoved.current);
    Object.assign(rec, merged);
    // what the person allowed, one record (consent.ts, #1216): this run's answer, off-limits, stops left out and levels,
    // with what the first run saw before there was a record, and an earlier record's consent, joined
    rec.consent = consentOf(rec, old ? consentIn(old) : null, { agreed: agreed.current, levelMoved: levelMoved.current, machine: pendingMachine(localStorage) });
    // Home arrives with one thing to press: the routine that leads to the nearest dated thing in a folder (Jev pick 8,
    // standing in by rule). Kept for them, its ▶ sits on the closed folder's head; never run by itself; none at record only
    if (rec.hands !== "record" && !rec.first) {
      const dated = rec.facts.filter((f) => f.kind === "event" && !f.repeats && f.area !== "you" && f.st !== "no").map((f) => ({ f, n: daysTo(f.when) ?? 999 })).filter((x) => x.n >= 0).sort((x, y) => x.n - y.n);
      for (const { f } of dated) {
        const rs = routinesOf(rec.facts.filter((x) => x.area === f.area && x.st !== "no"));
        const r = rs.find((x) => f.v.startsWith(x.event.v.split(" ").slice(0, 2).join(" "))) ?? rs[0];
        if (r) { rec.first = r.id; rec.routines = [...new Set([...(rec.routines ?? []), r.id])]; break; }
      }
    }
    setStuck(null);
    run.current++;
    setM("home");
    const home = rec.solHome;
    // which folders are new is decided before any is made; only those are made and written into
    // a record from before madeDirs existed: its folders were the onboarding's, so they count as made
    const before = old ? (old.madeDirs ?? old.areas.map((a) => a.id)) : [];
    const unread = new Set<string>();
    const made = await newFolders(ask, { ...rec, madeDirs: before, fillDirs: [...new Set([...(old?.fillDirs ?? []), ...(rec.fillDirs ?? [])])] }, home ?? null, unread);
    rec.madeDirs = before;   // a folder is added only once it is made and both its files are written (below)
    rec.fillDirs = [...new Set([...(old?.fillDirs ?? []), ...made])];   // made now, filled below; a write with no answer is filled next time
    rec.unchecked = [...new Set([...(old?.unchecked ?? []), ...made])];   // each new folder is checked once in Home (checked.ts)
    if (old?.later?.length) rec.later = old.later;   // a folder put off stays put off
    // the record's folder and the new places' folders, by the engine (#1511, #1510): not made, nothing is written and it says so
    if (!(await makeRecordDir(ask, home ? made.map((id) => `${home}/${id}`) : []))) { setM("yours"); setStuck("I could not make the folders for your Home just now, so this is not your Home yet. Press again in a moment."); return; }
    // the record: over an earlier one it is changed with the hash read (a change made since, by Home or a mode's first
    // visit, is read again and joined); a first record is written new
    let wrote = old ? await changeRecord(ask, (cur) => (JSON.stringify(cur) === JSON.stringify(old) ? rec : { ...mergeRecords(cur, rec, levelMoved.current), madeDirs: [...new Set([...(cur.madeDirs ?? []), ...(rec.madeDirs ?? [])])], fillDirs: [...new Set([...(cur.fillDirs ?? []), ...(rec.fillDirs ?? [])])], unchecked: [...new Set([...(cur.unchecked ?? []), ...(rec.unchecked ?? [])])] })) : (await writeRecord(ask, rec)) ? rec : null;
    if (!wrote && old && "missing" in (await readRecordAt(ask)) && (await writeRecord(ask, rec))) wrote = rec;   // the file went since: written new
    const landed1 = wrote ? { ok: true, ...(await landFolders(ask, wrote, home ?? null, made)) } : { ok: false, held: [] as string[] };
    if (wrote) {
      for (const n of unread) if (!landed1.held.includes(n)) landed1.held.push(n);
      const done = made.filter((id) => !landed1.held.includes(wrote!.areas.find((a) => a.id === id)?.name ?? id));
      if (made.length) { const w2 = await changeRecord(ask, (cur) => afterLanding(cur, made, done)); if (w2) wrote = w2; }
    }
    // the level pressed in this run is a press of the level: every folder agent's rung follows it (only the stickies line)
    if (wrote && home && levelMoved.current) {
      const rungs = await Promise.all(wrote.areas.map((a) => setRung(ask, `${home}/${a.id}`, wrote!.hands)));
      wrote.areas.forEach((a, i) => { if (rungs[i] === "unknown" && !landed1.held.includes(a.name)) landed1.held.push(a.name); });   // said in Home, never dropped
    }
    if (!landed1.ok) { setM("yours"); setStuck("I could not write your record just now, so this is not your Home yet. Press again in a moment."); return; }
    try { localStorage.removeItem(PENDING_KEY); } catch { /* private */ }   // the record holds the permissions now
    try { if (landed1.held.length) sessionStorage.setItem(HELD_KEY, landed1.held.join(", ")); } catch { /* private */ }
    // the Home is made, and the switch it was made under is kept on in this window (which.ts): a reload draws this Home
    try { landKeys(localStorage, rec.built!); } catch { /* private */ }
    // the seat a new chat starts on (the first run's pick, #1223): signed in to only one of Claude and ChatGPT, that one
    const signed = rec.ai.filter((a) => a.signed).map((a) => a.name), cl = signed.some((n) => /claude/i.test(n)), cx = signed.some((n) => /chatgpt|codex|openai/i.test(n));
    if (cl !== cx && !old) e.send({ type: "team.settings", rid: `first-seat-${Date.now()}`, patch: { seats: { life: cl ? "claude" : "codex" } } });
    try { if (again.current) sessionStorage.setItem(FRESH_KEY, JSON.stringify({ ids: [...fresh.current].filter((id) => rec.facts.some((f) => f.id === id)), since: old?.built ?? null })); } catch { /* private */ }
    // "again" was for this one run: out of the address, so a reload is Home, not a second run
    try { const q = new URLSearchParams(location.search); q.delete("onboard"); q.delete("look"); history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}${location.hash}`); } catch { /* fine */ }
    // the hand-over (handover.ts): the real Home is mounted under the stage; once its folders have their boxes, the
    // stage's folders glide onto them and the stage goes in the same frame. Not there in 1.5 s: a cut, never a wait
    onLanding?.();
    const ids = rec.areas.map((a) => a.id), t0 = performance.now();
    let homeEl: HTMLElement | null = null;
    // Home's boxes, held still for three frames (its record, its line and its sources arrive in their own time)
    const at = (el: HTMLElement) => ids.map((id) => { const r = el.querySelector(`[data-folder="${CSS.escape(id)}"]`)?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}` : "-"; }).join(" ");
    try { await Promise.race([document.fonts.ready, sleep(400)]); } catch { /* no font api */ }
    let last = "", still = 0;
    while (performance.now() - t0 < 1500) {
      homeEl = document.querySelector<HTMLElement>("[data-onehome]");
      if (homeEl && homeReady(homeEl, ids)) { const now = at(homeEl); still = now === last ? still + 1 : 0; last = now; if (still >= 4) break; }
      await new Promise((r) => { requestAnimationFrame(r); window.setTimeout(r, 50); });   // a hidden window has no frames: the 1.5 s still ends
    }
    if (homeEl && !homeReady(homeEl, ids)) homeEl = null;
    // the beat before the glide (the record written, Home mounted), measured for the walk; the jelly works through it
    (window as any).__obBeat = Math.round(performance.now() - pressedAt.current);
    // a glide that throws is a cut: Home is already under it, so the stage just goes (never a dead layer over Home)
    if (homeEl && stage.current) try { stage.current.dataset.gliding = "1"; await glide(stage.current, homeEl, 450); (window as any).__obOffBy = offBy(stage.current, homeEl); (window as any).__obOffDetail = [...stage.current.querySelectorAll<HTMLElement>(".ob-folders [data-folder]")].map((el) => { const t = homeEl!.querySelector(`[data-folder="${CSS.escape(el.dataset.folder ?? "")}"]`)?.getBoundingClientRect(), r = el.getBoundingClientRect(); return t ? `${el.dataset.folder} dx${Math.round(r.left - t.left)} dy${Math.round(r.top - t.top)} dw${Math.round(r.width - t.width)}` : `${el.dataset.folder} none`; }).join("; "); } catch { /* cut */ }
    onDone(true);
  };

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") { ev.preventDefault(); if (m === "ask") void go(); else if (m === "yours") void toHome(); }
      else if ((ev.metaKey || ev.ctrlKey) && ev.key === "z" && m === "yours") { ev.preventDefault(); undo(); }
      else if (m === "watch" && ev.key === "Escape" && again.current && known.current.size > 0) { ev.preventDefault(); press(); backHome(); }
      else if (m === "watch" && (ev.key === " " || ev.key === "Escape")) { ev.preventDefault(); press(); setPaused((p) => !p); }
      else if (m === "yours" && cur && !side && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") && (ev.target as Element).getAttribute("role") !== "slider") answer(cur, ev.key === "ArrowLeft" ? "yes" : "no");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // the rail's states and counts
  const railStates: Partial<Record<StopId, StopState>> = {}, counts: Partial<Record<StopId, number>> = {};
  for (const id of ORDER) {
    counts[id] = found[id].filter((f) => landed.has(f.id) && f.k !== "name").length;
    railStates[id] = closed.has(id) ? "closed" : id === "machine" ? "done" : m === "ask" ? "ready" : at === id ? "now" : states[id] ?? (careful ? "closed" : "wait");
  }
  const total = Math.max(0, landed.size - (name ? 1 : 0));
  const line: [string, string] =
    m === "ask" && needMe > 0 && gated ? ["Sign in with Google first.", "So I know whose Home this is. Press Sol under the box; your browser opens Google, and you come back here."]
    : m === "ask" && reading ? ["Reading what you wrote.", "Nothing is opened yet."]
    : m === "ask" && held ? [held.length === 1 ? "One thing I want to get right." : `${held.length} things I want to get right.`, wide.includes(held[0]) ? `“${brief(held[0])}” It could be anywhere, so I closed all of it. Open what is safe on the left, then go.` : `“${brief(held[0])}” Close what holds it on the left, then go.`]
    : m === "ask" ? (again.current ? [`${name ? `${first(name)}, l` : "L"}ooking again.`, "The same folders; whatever is new lands in them."] : [`${name ? `Hi ${first(name)}. ` : ""}Tell me about your life right now.`, `Write a few sentences in the box. Then I look through this computer while you watch, and make your Home's folders from both.${inst && !inst.done ? ` Meanwhile I'm ${inst.failed ? "stuck setting myself up" : inst.phrase}.` : ""}`])
    : m === "watch" && waitUp ? ["Setting myself up first.", inst?.failed ? `It stopped: ${inst.failed}. Your words are kept.` : inst ? `${cap1(inst.phrase)}; your words are kept, and I look the moment I can.` : "Waiting for my engine to start; your words are kept."]
    : m === "watch" ? (broke ? ["I couldn't look this time.", "Your words still make your folders."] : paused ? [at ? `Paused at ${labelOf(at)}.` : "Paused.", "Space goes on."]
      : at && states[at] === "refused" ? [`${cap1(labelOf(at))}: closed to me.`, "It stays out of your Home; the rest goes on."]
      : again.current && known.current.size ? [at ? `Reading ${labelOf(at)}.` : "Looking again.", fresh.current.size ? `${fresh.current.size} new since ${since(prev.current?.built)}.` : "Nothing new yet."]
      : [at ? `Reading ${labelOf(at)}.` : "Done looking.", at && openNow?.stop === at ? `${openNow.what}${openNow.n ? ` · ${openNow.n} looked at` : ""} · ${total} things so far.` : `${total} things so far.`])
    : m === "yours" && stuck ? ["Nothing is lost.", stuck]
    : side ? ["Your setup and mine, side by side.", differs ? `Yours comes in as it is. ${differs === 1 ? "One thing differs" : `${differs} things differ`}: pick, or leave it and yours holds.` : differed ? "Yours comes in as it is, and what differed is settled." : "Yours comes in as it is; nothing differs."]
    : m === "yours" ? [cur ? (open5.length === 1 ? "One thing I'm not sure of." : `${open5.length} things I'm not sure of.`) : careful ? "Only what you told me." : "That's everything.",
        levelWhy && !cur ? (levelWhy === "record" ? "From what you said, I only watch to start. Move it if you want more." : `From what you said, I start at ${LEVELS.find((l) => l[0] === levelWhy)![1]}. Move it if you want less.`) : cur ? `${total} things are in.${refused.length ? ` ${cap1(list(refused.map(labelOf)))}: closed to me.` : ""}` : careful ? "I read nothing more, and I only watch: I write down what I would do." : "Check how much I may do, below, then press “this is my Home”."]
    : [`${WORDS[sorted.areas.length] ?? sorted.areas.length + " parts"} of your life.`, `${list(sorted.areas.map((a) => a.name))}.`];

  const you = sorted.you.map((id) => byId.get(id)!).filter(Boolean);
  const curFact = cur?.fact ? byId.get(cur.fact) : undefined;
  const other = cur?.kind === "conflict" ? all.find((f) => f.repeats && curFact && f.v.slice(0, 7) === curFact.v.slice(0, 7)) : undefined;
  const near = cur?.kind === "guess" && curFact ? all.filter((f) => f.id !== curFact.id && (f.kind === "file" || f.kind === "project") && new RegExp(`(^|\\W)${esc(curFact.v)}(\\W|$)`, "i").test(`${f.v} ${f.src}`)) : undefined;
  const taken = sorted.confirms.filter((c) => took[c.id] && answers[c.id] === took[c.id]);
  const tookC = taken[taken.length - 1];
  const step = ["read", "make", "write", "send"] as const, stepGlyph: GlyphName[] = ["page", "run", "note", "mail"];
  const now = new Date();

  return (
    <div ref={stage} className={`ob-stage ob1-stage m-${m} fh`} data-moment={m} data-presses={presses}>

      <div className="ob-jelly"><Body size={40} state="settled" follow halo={haloDoing((m === "watch" && at !== null && !paused && !broke) || m === "home" ? "working" : "rest")} /></div>
      <div className="ob-line" key={m + line[0]}>
        <div className="t-display">{line[0]}</div>
        <div className="t-read">{line[1]}</div>
      </div>

      <div className="ob-left">
        {m === "ask" && <div className="ob-rail-says t-label" data-rail-says>{closed.size ? `I'll leave ${list([...closed].map(labelOf))} closed. Press again to open.` : "What I'll look at. Press one to keep it closed to me."}</div>}
        <div className="ob-rail"><Rail at={at} states={railStates} counts={counts} named={m === "ask"} onPress={(id) => { if (id === "machine" || m !== "ask") return; press(); if (byWords.current.has(id)) pressOpened.current.add(id); else pressOpened.current.delete(id); byWords.current.delete(id); setClosed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; }); }} /></div>
        <div className="ob-pane" ref={pane}>
          <div className="ob-glass"><Glass w={pw} h={m === "ask" ? 132 : narrow && m === "watch" ? 240 : narrow && m === "yours" ? 320 : 420} r={CURVE.radius.card} step="card"><span /></Glass></div>
          {m === "ask" && <textarea className="ob-box t-read" autoFocus value={said} readOnly={reading} onChange={(ev) => typed(ev.target.value)} data-said placeholder={"School, work, a side thing, a family… and anything I should never open."} />}
          {m === "watch" && !broke && at && states[at] !== "refused" && <Lens stop={at} shown={found[at].filter((f) => shown.has(f.id))} gone={landed} screens={scr(screens)} paused={paused} />}
          {m === "watch" && broke && <div className="ob-quote t-read">“{said}”</div>}
          {side && <SideBySide rows={setupRows} choices={choices} onChoose={(id, c) => { press(); setChoices((x) => { const n = { ...x }; if (c) n[id] = c; else delete n[id]; return n; }); }} onDone={() => { press(); setSideDone(true); }} />}
          {(m === "yours" || m === "home") && cur && !side && <Evidence key={cur.id} c={cur} fact={curFact} other={other} near={near} likely={jev?.picks[cur.id] && bandOf(jev.picks[cur.id].confidence) !== "none" && (cur.kind !== "private" || jev.picks[cur.id].choice === "yes") ? (jev.picks[cur.id].choice as "yes" | "no") : jev === null && cur.kind === "guess" ? "yes" : null} left={open5.length - 1} onAnswer={(a) => answer(cur, a)} />}
          {(m === "yours" || m === "home") && !cur && !side && (
            <div className="ob-steps" data-level={hands}>
              {step.map((s, i) => { const mine = i <= LEVELS.findIndex((l) => l[0] === hands); return <div key={s} className={mine ? "mine" : ""} style={mine ? { background: JELLY.warm[i] } : undefined}><Glyph name={stepGlyph[i]} hover /><span>{s}</span><em>{mine ? "me" : "you"}</em></div>; })}
            </div>
          )}
        </div>
        {m === "ask" && (signedIn || solRow) && <SignIns places={signedIn ? places : places.filter((p) => p.way === "google")} busy={signBusy} said={signSaid} want={gated ? needMe : 0} onSign={(p) => void sign(p)} />}
        {m === "yours" && (tookC || jev) && <div className="ob-took t-label" data-took data-jev-told title={jev ? toldLine(sorted.confirms) : undefined}>{tookC && <>I answered {taken.length === 1 ? "one" : taken.length} myself · <button type="button" title={`“${tookC.q.replace(/\?$/, "")}”: ${took[tookC.id] === "yes" ? tookC.yes : tookC.no}`} onClick={() => { const id = tookC.id; setAnswers((x) => { const n = { ...x }; delete n[id]; return n; }); setTook((t) => { const n = { ...t }; delete n[id]; return n; }); setFront(id); }}>undo</button>{jev ? " · " : ""}</>}{jev && "Jev saw kinds, never names."}</div>}
        {/* what the reader is checking, live (#1223): the source open now, each thing found with where it was read, each
            thing left unread with why; drawn from the reader's own report, never a spinner */}
        {m === "watch" && at && !waitUp && !broke && (() => { const rows = watchRows(xNow?.stops.find((x) => x.id === at), found[at].filter((f) => shown.has(f.id))); return rows.length ? (
          <ol className="ob-log t-label" data-watch-log aria-live="polite">{rows.map((r) => <li key={r.id} data-k={r.k}><span>{r.text}</span><em>{r.proof}</em></li>)}</ol>) : null; })()}
        <div className={`ob-foot ${m === "home" ? "yours" : m}`}>
          {m === "ask" && <><span data-go data-reading={reading || undefined} data-held={held?.length || undefined}><Button h={44} onClick={() => void go()}>look around, I'll watch</Button></span><button type="button" className="ob-quiet" data-careful onClick={onlyWhatISay} title="I open nothing on this computer; your folders come from your words alone">only use what I wrote</button><button type="button" className="ob-quiet" data-not-now onClick={() => { press(); run.current++; onDone(false); }}>not now</button></>}
          {m === "watch" && waitUp && <>{inst?.failed && <span data-install-again><Button h={44} onClick={() => { press(); setInst(null); setTries((t) => t + 1); }}>try again</Button></span>}<button type="button" className="ob-quiet" data-not-now onClick={() => { press(); run.current++; setWaitUp(false); onDone(false); }}>not now</button></>}
          {m === "watch" && !waitUp && !broke && <><button type="button" className="ob-quiet" data-pause onClick={() => { press(); setPaused((p) => !p); }}>{paused ? "go on" : "pause"} <kbd>space</kbd></button>
            {at && <button type="button" className="ob-quiet" data-skip title={`skip ${labelOf(at)}`} onClick={() => { press(); skipRef.current = at; }}>skip</button>}
            {again.current && known.current.size > 0 && <button type="button" className="ob-quiet" data-back onClick={() => { press(); backHome(); }}>back to Home <kbd>esc</kbd></button>}</>}
          {m === "watch" && broke && <span data-go-on><Button h={44} onClick={() => { press(); setM("yours"); }}>go on</Button></span>}
          {(m === "yours" || m === "home") && <><Level value={hands} onChange={(h) => { press(); levelMoved.current = true; setHands(h); }} ghost={jev?.level && bandOf(jev.level.confidence) === "ghost" && jev.level.choice === "record" ? "record" : jev === undefined || jev === null ? (/don'?t|never|careful|private/i.test(said) || (readNow && sorted.off.length) ? "record" : null) : null} w={pw} />{setupRows.length > 0 && <Reach value={reach} onChange={(r) => { press(); setReach(r); }} w={pw} />}<span data-build ref={buildRef}>{m === "home" && heldW
            // held pressed through the hand-over's beat: the Button's own shape and size (kit Glass, its corner), filled pearl
            ? <Glass w={heldW} h={44} r={Math.min(CURVE.radius.row, 22)} fill="var(--pearl)" edge={0}><div style={{ height: "100%", display: "grid", placeItems: "center", fontWeight: 500, color: "#0a0a0b", whiteSpace: "nowrap" }}>this is my Home</div></Glass>
            : <Button h={44} onClick={() => void toHome()}>this is my Home</Button>}</span></>}
        </div>
      </div>

      <div className="ob-right">
        <Folder id="you" name={name || "You"} word="this computer" facts={you} shut={shut} screens={scr(screens)} size="s" lit={lit === "you" || lit === "all"} now={now} unsure={unsure} />
        <div className={`ob-folders n${sorted.areas.length}`}>
          {sorted.areas.map((a) => (
            <Folder key={a.id} id={a.id} name={a.name} word={a.part === "build" ? "projects" : a.part} facts={a.facts.map((id) => byId.get(id)!).filter(Boolean)} shut={shut} unsure={unsure} lit={lit === a.id || lit === "all"} now={now}
              onPiece={(k: PieceKind) => { const c = open5.find((x) => x.area === a.id && x.fact && (k === "week" ? byId.get(x.fact)?.repeats : true)); if (c) setFront(c.id); }} />
          ))}
          {m === "ask" && sorted.areas.length === 0 && <Folder id="none" name=" " facts={[]} />}
        </div>
      </div>
      <div ref={layer} className="ob-fly" />
    </div>
  );
}
