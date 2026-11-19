// The one onboarding as it should be when finished (#1088, the designer's page): a dev page of the face, drawn from the
// kit (kit/index.ts), the real jelly (Body.tsx), Home's own folder (folders.css) and the three pieces the builder lifts:
// Folder.tsx, Lens.tsx, Yours.tsx. The sorting is the builder's own (sort.ts); the person is made up (noa.ts).
//   three moments on one screen, the folders never leaving it:
//     ask    "you" is already filled (what needs no permission); one box; the seven stops as glyphs; go
//     watch  the lens shows each source being read; each fact is seen there, then carried to its folder
//     yours  the unsure things one at a time with their evidence; the level; "this is my Home"
//     home   the left column leaves, Home's spine and side arrive, the folders glide to Home's place
//   onboard-design.html?m=ask|watch|yours|home   &play=1 (types and goes by itself)   &fast=1   &jev=0   &broke=1
//   keys: ⌘↵ go · space pause · ← → answer · ⌘Z undo
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Glass, Glyph, type GlyphName } from "../../kit";
import { CURVE, JELLY } from "../../kit/tokens";
import { Body, haloDoing } from "../../Body";
import { Folder, daysTo, pieceOf, type PieceKind, type Routine, type Run } from "../Folder";
import { carry } from "../carry";
import { VisitCard } from "../VisitCard";
import { Lens, Rail, STOPS, type StopId, type StopState } from "../Lens";
import { Evidence, Level, LEVELS } from "../Yours";
import { esc, sortAll, type Confirm, type Explored } from "../sort";
import type { Hands } from "../record";
import { FOUND, NOW, SAID, SCREENS } from "./noa";
import "../../palette.css";
import "../../kit/type.css";
import "./page.css";

const q = new URLSearchParams(location.search);
const FAST = q.has("fast") ? 0.25 : q.has("slow") ? 4 : 1, JEV = q.get("jev") !== "0";
type Moment = "ask" | "watch" | "yours" | "home" | "build" | "cowork";
const ORDER = STOPS.map((s) => s[0]);
// ?many=1: a fuller computer, as a real one is (the explorer's own caps: 12 sites, 8 projects, 16 events)
if (q.has("many")) {
  const more = (id: string, kind: "place" | "project" | "event" | "file", v: string, src: string, x: object = {}) => ({ id, k: kind, v, src, kind, sure: true, ...x });
  FOUND.browser.push(...["dribbble.com", "are.na", "youtube.com", "linkedin.com", "docs.google.com", "fonts.google.com"].map((h, i) => more(`s-m${i}`, "place", h, `Chrome history, ${34 - i * 5} visits in 30 days`)));
  FOUND.projects.push(...["type-specimens", "run-log", "okra-landing", "dotfiles", "thesis-notes", "poster-gen"].map((p, i) => more(`p-m${i}`, "project", p, `~/code/${p}`, { owner: "noa-makes" })));
  FOUND.calendar.push(...([["Typography lab", "Tue/Thu 2pm"], ["Studio hours", "Mon/Wed 10am"], ["Track club", "Tue/Thu 6pm"], ["Okra standup", "Mon/Wed/Fri 9am"]] as const).map(([v, when], i) => more(`e-m${i}`, "event", v, "your calendar", { when, repeats: true })));
  FOUND.files.push(...["crit notes", "moodboard", "type scale", "grid study", "reading list"].map((v, i) => more(`f-m${i}`, "file", v, `Documents/Westbrook/DES 210`)), ...["invoice 015", "invoice 016", "brand notes", "site map"].map((v, i) => more(`f-n${i}`, "file", v, `Documents/Clients/Lumen`)));
}
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms * FAST));
const first = (s: string) => s.split(" ")[0];
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");
const WORDS = ["No parts", "One part", "Two parts", "Three parts", "Four parts", "Five parts"];

function Page() {
  const [m, setM] = useState<Moment>((q.get("m") as Moment) ?? "ask");
  const [said, setSaid] = useState(q.get("m") && q.get("m") !== "ask" ? SAID : "");
  const [closed, setClosed] = useState<Set<StopId>>(new Set());
  const [at, setAt] = useState<StopId | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [landed, setLanded] = useState<Set<string>>(new Set(q.get("m") && q.get("m") !== "ask" ? FOUND.machine.map((f) => f.id) : []));
  const [here, setHere] = useState(!!(q.get("m") && q.get("m") !== "ask"));   // the first second is over: "you" is filled
  const [lit, setLit] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [took, setTook] = useState<Record<string, "yes" | "no">>({});
  const [front, setFront] = useState<string | null>(null);
  const [hands, setHands] = useState<Hands>("show");
  const [open, setOpen] = useState<string | null>(null);
  const [made, setMade] = useState(false);          // the ghost folder, pressed into being
  const [broke, setBroke] = useState(false);
  const [started, setStarted] = useState<string | null | undefined>(undefined);   // a later mode's first visit: the thing pressed
  const [careful, setCareful] = useState(false);
  const [runs, setRuns] = useState<Record<string, Run>>({});                       // a kept routine, done once: the line is the run
  const [doing, setDoing] = useState<[string, string] | null>(null);   // "only what I tell you": it looked at nothing
  const layer = useRef<HTMLDivElement>(null), run = useRef(0), hold = useRef(false), box = useRef<HTMLTextAreaElement>(null);
  hold.current = paused;
  // the frame is 1280 wide at real size; a narrower window sees all of it, smaller
  const [zoom, setZoom] = useState(1);
  useEffect(() => { const fit = () => setZoom(Math.min(1, window.innerWidth / 1280)); fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, []);

  const all = useMemo(() => ORDER.flatMap((s) => FOUND[s]), []);
  const byId = useMemo(() => new Map(all.map((f) => [f.id, f])), [all]);
  const ex: Explored = useMemo(() => ({ v: 1, made: "", home: "", stops: ORDER.map((id) => ({ id, state: "done" as const, line: "", facts: FOUND[id].filter((f) => landed.has(f.id)) })) }), [landed]);
  const sorted = useMemo(() => sortAll(said + (made ? " Portfolio and job applications." : ""), ex), [said, ex, made]);
  const whole = useMemo(() => sortAll(said, { v: 1, made: "", home: "", stops: ORDER.map((id) => ({ id, state: "done" as const, line: "", facts: closed.has(id) ? [] : FOUND[id] })) }), [said, closed]);
  const name = byId.get("name")?.v ?? "";
  const open5 = sorted.confirms.filter((c) => !answers[c.id]);
  const unsure = useMemo(() => new Set(m === "ask" || m === "watch" ? [] : open5.map((c) => c.fact ?? "")), [open5, m]);
  const cur = open5.find((c) => c.id === front) ?? open5[0];

  // everything landed at once: for ?m=yours and ?m=home, and for "only what I tell you" never
  const landAll = useCallback(() => { setLanded(new Set(all.filter((f) => !closed.has(ORDER.find((s) => FOUND[s].includes(f))!)).map((f) => f.id))); }, [all, closed]);
  useEffect(() => { if (m === "yours" || m === "home") if (landed.size <= FOUND.machine.length && !q.has("careful")) landAll(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Jev, standing in: the clash it is sure of is answered by itself (the newer, more specific reading)
  useEffect(() => {
    if (!JEV || m !== "yours") return;
    const c = sorted.confirms.find((x) => x.kind === "conflict");
    if (c && !answers[c.id] && took[c.id] === undefined) { setTook((t) => ({ ...t, [c.id]: "yes" })); setAnswers((a) => ({ ...a, [c.id]: "yes" })); }
  }, [m, sorted.confirms, answers, took]);

  // the watching: stop by stop; a fact is seen in the lens, then carried to its folder
  const watch = useCallback(async () => {
    const me = ++run.current, live = () => run.current === me, wait = async (ms: number) => { await sleep(ms); while (hold.current && live()) await sleep(120); };
    setM("watch"); setHere(true); setLanded((l) => new Set([...l, ...FOUND.machine.map((f) => f.id)]));   // go pressed inside the first second: "you" is whole at once
    if (q.has("broke")) { setBroke(true); return; }
    for (const id of ORDER) {
      if (!live()) return;
      if (id === "machine" || closed.has(id)) continue;
      setAt(id);
      await wait(500);
      for (const f of FOUND[id]) {
        if (!live()) return;
        setShown((s) => new Set(s).add(f.id));
        void (async () => {
          await wait(430);
          const from = document.querySelector(`[data-lens-fact="${f.id}"]`);
          const area = whole.place[f.id] ?? "you";
          // it lands on its own piece when the folder has one already, else on the folder (the piece grows there)
          const to = (document.querySelector(`[data-piece="${area}:${pieceOf(f)}"]`) ?? document.querySelector(`[data-folder="${area}"]`))?.getBoundingClientRect();
          if (from && to && layer.current && live()) await carry(layer.current, from, to, 450 * FAST);
          if (!live()) return;
          setLanded((l) => new Set(l).add(f.id));
          setLit(area); window.setTimeout(() => setLit((x) => (x === area ? null : x)), 220);
        })();
        await wait(260);
      }
      await wait(1400);
    }
    if (!live()) return;
    setAt(null);
    await wait(300);
    setLit("all"); window.setTimeout(() => setLit(null), 260);   // the last second of the watching: all of it settles, together
    await wait(600);
    if (live()) setM("yours");
  }, [closed, whole.place]);

  // a kept routine done once while the person watches (made up here; in the face it is the folder's sticky rule)
  const runIt = async (r: Routine) => {
    const set = (run: Run) => setRuns((x) => ({ ...x, [r.id]: run })), dry = hands === "record";
    set({ at: r.place ? 0 : 1 }); setDoing([r.event.v, r.place ? `opening ${r.place.v.replace(/^www\./, "")}` : `reading ${r.file?.v}`]);
    if (r.place) { await sleep(1300); set({ at: 1 }); setDoing([r.event.v, r.file ? `reading ${r.file.v}` : "reading the page"]); }
    await sleep(1300); set({ at: 2 }); setDoing([r.event.v, dry ? "writing down what I would do" : "writing what is due this week"]);
    await sleep(1400); set({ at: 3, made: dry ? "what I would do" : `this week in ${r.event.v.replace(/ (Studio|Drawing)$/, "")}` });
    setDoing([dry ? "Written down." : "Done.", hands === "do" ? "It is in the folder." : "Nothing was sent. It is in the folder."]);
    await sleep(3200); setDoing(null);
  };
  // the first second, no press: what needs no permission arrives by itself: the name, the screens, the apps one by one
  const arrive = useCallback(async () => {
    const me = ++run.current, live = () => run.current === me;
    setHere(false); setLanded(new Set());
    await sleep(350); if (!live()) return;
    setLanded(new Set(["name"]));
    await sleep(250);
    for (const f of FOUND.machine.filter((x) => x.k !== "name")) { if (!live()) return; setLanded((l) => new Set(l).add(f.id)); setLit("you"); window.setTimeout(() => setLit((x) => (x === "you" ? null : x)), 120); await sleep(90); }
    if (live()) setHere(true);
  }, []);
  const go = () => { if (m === "ask") void watch(); };
  const goCareful = () => { run.current++; setCareful(true); setHands("record"); setM("yours"); };
  const answer = (c: Confirm, a: "yes" | "no" | "into") => { setAnswers((x) => ({ ...x, [c.id]: a === "into" ? "no" : a })); setFront(null); };
  const undo = () => { const last = Object.keys(answers).pop(); if (!last) return; setAnswers((x) => { const n = { ...x }; delete n[last]; return n; }); setTook((t) => ({ ...t, [last]: "no" as const })); setFront(last); };
  const toHome = () => { run.current++; setM("home"); };
  const again = (to: Moment) => { run.current++; setM(to); setAt(null); setShown(new Set()); setPaused(false); setBroke(false); setCareful(false); setAnswers({}); setTook({}); setOpen(null); setMade(false); setRuns({}); setDoing(null);
    setStarted(undefined);
    if (to === "ask") { setSaid(""); void arrive(); window.setTimeout(() => box.current?.focus(), 50); }
    else { setSaid(SAID); if (to === "watch") { setLanded(new Set(FOUND.machine.map((f) => f.id))); window.setTimeout(() => void watch(), 50); } else landAll(); } };
  const typeIt = async () => { const me = ++run.current; setSaid(""); for (let i = 1; i <= SAID.length; i++) { if (run.current !== me) return; setSaid(SAID.slice(0, i)); await sleep(SAID[i - 1] === "." ? 260 : 24); } };

  useEffect(() => { if (!q.get("m") || q.get("m") === "ask") void arrive().then(() => { if (q.has("play")) void typeIt().then(() => sleep(900)).then(go); }); else if (q.has("play")) void typeIt().then(() => sleep(900)).then(go); else if (q.get("m") === "watch") void watch(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); m === "ask" ? go() : m === "yours" && toHome(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "z" && m !== "ask") { e.preventDefault(); undo(); }
      else if (m === "watch" && (e.key === " " || e.key === "Escape")) { e.preventDefault(); setPaused((p) => !p); }
      else if (m === "yours" && cur && !took[cur.id] && (e.key === "ArrowLeft" || e.key === "ArrowRight") && (e.target as Element).getAttribute("role") !== "slider") answer(cur, e.key === "ArrowLeft" ? "yes" : "no");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // the rail's states
  const states: Partial<Record<StopId, StopState>> = {}, counts: Partial<Record<StopId, number>> = {};
  for (const id of ORDER) {
    const n = FOUND[id].filter((f) => landed.has(f.id) && f.k !== "name").length;
    counts[id] = n;
    states[id] = closed.has(id) || (careful && id !== "machine") ? "closed" : id === "machine" ? "done" : m === "ask" ? "ready" : at === id ? "now" : ORDER.indexOf(id) < (at ? ORDER.indexOf(at) : m === "watch" ? 1 : 99) ? (n ? "done" : "none") : "wait";
  }
  const total = landed.size - 1, apps = FOUND.machine.length - 1;
  void apps;   // the name is the folder's name, not a thing in it
  const lastTook = Object.entries(took).filter(([, a]) => a === "yes").map(([id]) => sorted.confirms.find((c) => c.id === id)).find((c) => c && cur === undefined ? true : false);
  const next = all.filter((f) => f.kind === "event" && !f.repeats && landed.has(f.id) && whole.place[f.id] && whole.place[f.id] !== "you").map((f) => ({ f, n: daysTo(f.when, NOW) ?? 999 })).sort((x, y) => x.n - y.n)[0];
  const line: [string, string] =
    m === "ask" ? (here ? [`Hi ${first(name)}. Tell me about your life right now.`, "A few sentences. I'll look at the rest myself, while you watch."] : [landed.has("name") ? `Hi ${first(name)}.` : "Hi.", "\u00a0"])
    : m === "watch" ? (broke ? ["I couldn't look this time.", "Your words still make your folders."] : paused ? [at ? `Paused at ${STOPS.find((x) => x[0] === at)![2].replace(/, by name$/, "")}.` : "Paused.", `${total} things so far.`]
      : [at ? `Reading ${STOPS.find((s) => s[0] === at)![2]}.` : "Done looking.", `${total} things so far.`])
    : m === "yours" ? [cur ? (open5.length === 1 ? "One thing I'm not sure of." : `${open5.length} things I'm not sure of.`) : "That's everything.", cur ? `${total} things are in.` : LEVELS.find((l) => l[0] === hands)![2]]
    : doing ? doing
    : next ? [`${next.f.v}`, `${next.n === 0 ? "is today" : next.n === 1 ? "is tomorrow" : `in ${next.n} days`}.`]   // Home's one line: the nearest thing, not the folders' names again
    : [`${WORDS[sorted.areas.length] ?? sorted.areas.length + " parts"} of your life.`, `${list(sorted.areas.map((a) => a.name))}.`];
  void lastTook;

  const you = sorted.you.map((id) => byId.get(id)!).filter(Boolean);
  const ghostFolder = JEV && !made && (m === "yours" || m === "home") && landed.has("f-resume");
  const curFact = cur?.fact ? byId.get(cur.fact) : undefined;
  const other = cur?.kind === "conflict" ? all.find((f) => f.repeats && curFact && f.v.slice(0, 7) === curFact.v.slice(0, 7)) : undefined;
  const near = cur?.kind === "guess" && curFact ? all.filter((f) => f.id !== curFact.id && (f.kind === "file" || f.kind === "project") && new RegExp(`(^|\\W)${esc(curFact.v)}(\\W|$)`, "i").test(`${f.v} ${f.src}`)) : undefined;
  const tookC = sorted.confirms.find((c) => took[c.id] === "yes"), tookF = tookC?.fact ? byId.get(tookC.fact) : undefined;
  const step = ["read", "make", "write", "send"] as const, stepGlyph: GlyphName[] = ["page", "run", "note", "mail"];

  return (
    <div className="ob-wrap" style={{ zoom }}>
      <div className={`ob-stage m-${m} fh`} data-moment={m}>
        {/* Home's spine and side: they arrive at the hand-over */}
        <div className="ob-spine">{(["files", "terminal", "canvas", "messages"] as GlyphName[]).map((g, i) => <span key={g} className={i === 0 ? "on" : ""}><Glyph name={g} hover={i === 0} /></span>)}</div>
        <div className="ob-side">
          <div className="t-label">places</div>
          {sorted.areas.map((a) => { const n = open5.filter((c) => c.area === a.id).length; return <button key={a.id} type="button" className={open === a.id ? "on" : ""} onClick={() => setOpen(open === a.id ? null : a.id)}>{a.name}{n > 0 && <i>{n}</i>}</button>; })}
          <button type="button">{first(name)}</button>
        </div>

        {/* the jelly: top of the left column; on the spine once Home is theirs */}
        <div className="ob-jelly"><Body size={40} state="settled" follow halo={haloDoing((m === "ask" && !here) || (m === "watch" && !paused && !broke) || (doing && Object.values(runs).some((r) => r.at < 3)) ? "working" : "rest")} /></div>
        <div className="ob-line" key={m + (m === "ask" ? "" : line[0])}>
          {m === "home" && <div className="ob-date t-label">Friday 13 November</div>}
          <div className="t-display">{m === "home" ? (next && !doing ? <button type="button" className="ob-next" onClick={() => setOpen(whole.place[next.f.id])}>{line[0]} <span>{line[1]}</span></button> : <>{line[0]} <span>{line[1]}</span></>) : line[0]}</div>
          {m !== "home" && <div className="t-read">{line[1]}</div>}
        </div>

        {/* the left column: the box, then the lens, then the one thing in front; the rail and the level stay under the hand */}
        <div className="ob-left">
          <div className="ob-rail"><Rail at={at} states={states} counts={counts} onPress={(id) => { if (id === "machine") return; if (m === "ask") setClosed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; }); }} /></div>
          <div className="ob-pane">
            <div className="ob-glass"><Glass w={440} h={m === "ask" ? 132 : 420} r={CURVE.radius.card} step="card"><span /></Glass></div>
            {m === "ask" && <textarea ref={box} className="ob-box t-read" autoFocus value={said} onChange={(e) => setSaid(e.target.value)} placeholder={"School, work, a side thing, a family… and anything I should never open."} />}
            {m === "watch" && !broke && at && <Lens stop={at} shown={FOUND[at].filter((f) => shown.has(f.id))} gone={landed} screens={SCREENS} paused={paused} />}
            {m === "watch" && broke && <div className="ob-quote t-read">“{said}”</div>}
            {m === "yours" && cur && <Evidence key={cur.id} c={cur} fact={curFact} other={other} near={near} likely={JEV && cur.kind === "guess" ? "yes" : null} left={open5.length - 1} onAnswer={(a) => answer(cur, a)} />}
            {m === "yours" && !cur && (
              <div className="ob-steps" data-level={hands}>
                {step.map((s, i) => { const mine = i <= LEVELS.findIndex((l) => l[0] === hands); return <div key={s} className={mine ? "mine" : ""} style={mine ? { background: JELLY.warm[i] } : undefined}><Glyph name={stepGlyph[i]} hover /><span>{s}</span><em>{mine ? "me" : "you"}</em></div>; })}
              </div>
            )}
          </div>
          {m === "yours" && tookC && tookF && <div className="ob-took t-label">I took {tookC.yes.replace(/^yes, /, "")} for {tookF.v}: the newer entry. <button type="button" onClick={undo}>undo</button></div>}
          <div className={`ob-foot ${m}`}>
            {m === "ask" && <><Button h={44} onClick={go}>go, I'll watch</Button><button type="button" className="ob-quiet" onClick={goCareful}>only what I tell you</button></>}
            {m === "watch" && !broke && <button type="button" className="ob-quiet" onClick={() => setPaused((p) => !p)}>{paused ? "go on" : "pause"} <kbd>space</kbd></button>}
            {m === "watch" && broke && <Button h={44} onClick={() => setM("yours")}>go on</Button>}
            {m === "yours" && <><Level value={hands} onChange={setHands} ghost={JEV && /don'?t|never|careful|private/i.test(said) ? "record" : null} w={440} /><Button h={44} onClick={toHome}>this is my Home</Button></>}
          </div>
        </div>

        {/* the folders: Home's own; they never leave the screen */}
        <div className="ob-right">
          <Folder id="you" name={m === "home" ? first(name) : landed.has("name") ? name : "\u00a0"} word="this computer" facts={you} screens={landed.size > 1 ? SCREENS : []} size="s" lit={lit === "you" || lit === "all"} now={NOW} unsure={unsure} />
          <div className={`ob-folders n${sorted.areas.length} ${ghostFolder || m === "home" ? "ob-withplus" : ""}`}>
            {sorted.areas.map((a) => (
              <Folder key={a.id} id={a.id} name={a.name} word={a.part === "build" ? "projects" : a.part} facts={a.facts.map((id) => byId.get(id)!).filter(Boolean)} unsure={unsure} lit={lit === a.id || lit === "all"} now={NOW}
                runs={runs} dry={hands === "record"} onRun={(r) => void runIt(r)}
                size={open === a.id ? "l" : "s"} onOpen={m === "home" ? () => setOpen(open === a.id ? null : a.id) : undefined}
                onPiece={(k: PieceKind) => { const c = open5.find((x) => x.area === a.id && x.fact && (k === "week" ? byId.get(x.fact)?.repeats : true)); if (c) setFront(c.id); else if (m === "home") setOpen(open === a.id ? null : a.id); }} />
            ))}
            {ghostFolder && <div className="ob-plus" onClick={() => setMade(true)} title="found, not said: press to make it"><Folder id="ghost" name="Portfolio" word="found, not said" facts={[]} ghost /></div>}
            {!ghostFolder && m === "home" && <div className="ob-plus" title="one sentence makes another part"><Folder id="plus" name="+" facts={[]} ghost /></div>}
            {m === "ask" && sorted.areas.length === 0 && <Folder id="none" name=" " facts={[]} />}
          </div>
        </div>
        {m === "home" && front && cur && cur.id === front && (
          <div className="ob-scrim" onClick={() => setFront(null)}>
            <div className="ob-card" onClick={(e) => e.stopPropagation()}>
              <Glass w={400} h={380} r={CURVE.radius.card} step="pop"><Evidence key={cur.id} c={cur} fact={curFact} other={other} near={near} likely={JEV && cur.kind === "guess" ? "yes" : null} left={0} onAnswer={(x) => answer(cur, x)} /></Glass>
            </div>
          </div>
        )}
        {(m === "build" || m === "cowork") && (() => {
          const mine = "noa-makes", teams = [...new Set(FOUND.projects.map((p) => p.owner!).filter((o) => o !== mine))];
          const things = m === "build" ? FOUND.projects.map((p) => ({ id: p.id, name: p.v, under: p.owner })) : teams.map((t) => ({ id: t, name: t, under: FOUND.projects.filter((p) => p.owner === t).map((p) => p.v).join(", ") }));
          const got = things.find((t) => t.id === started);
          return (
            <div className={`ob-mode ${m}`}>
              <div className="ob-mside">
                <button type="button">＋ {m === "build" ? "new session" : "new project"}</button>
                <div className="t-label">{m === "build" ? "projects" : "projects"}</div>
                {got ? <button type="button" className="on new">{got.name}</button> : <em>{started === null ? "none yet" : ""}</em>}
              </div>
              <div className="ob-mmain">
                {started === undefined && <VisitCard key={m} where={m} name={name} things={things} likely={things[0]?.id} sure={JEV} screens={SCREENS} ai={FOUND.ai.map((f) => ({ name: f.v, signed: f.signed !== false }))}
                  hands={hands} onHands={setHands} onStart={(id) => setStarted(id)} onLater={() => setStarted(null)} w={m === "build" ? 712 : 620} />}
                {m === "cowork" && got && <div className="ob-mdone"><div className="t-title">{got.name}</div><div className="t-read">you, your agent, and room for the team</div></div>}
                {m === "build" && <div className="ob-chat"><span>{got ? `${got.name} · say what to do` : "say something"}</span></div>}
              </div>
            </div>
          );
        })()}
        <div ref={layer} className="ob-fly" />
      </div>

      {/* the page's own strip, not part of the design: jump, play, states */}
      <div className="ob-dev t-label">
        {(["ask", "watch", "yours", "home", "build", "cowork"] as Moment[]).map((x) => <button key={x} type="button" className={m === x ? "on" : ""} onClick={() => again(x)}>{x}</button>)}
        <span />
        {m === "ask" && <button type="button" onClick={() => void typeIt()}>type for me</button>}
        <button type="button" onClick={() => { location.search = FAST === 1 ? "?fast=1" : ""; }}>{FAST === 1 ? "×4 faster" : "real speed"}</button>
        <button type="button" onClick={() => { location.search = JEV ? "?jev=0" : ""; }}>{JEV ? "Jev on" : "Jev off"}</button>
        <button type="button" onClick={() => { location.search = "?broke=1&play=1"; }}>no shell</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
