// The runs view (#889, behind build.runs): one screen where a person sees every project's builders, on which machine,
// what needs them and what is ready to try, and starts a multi-agent build with one sentence and one press. The rules
// are runs/rules.ts (tested in src/runs.test.ts); this file only draws them. A solid surface over Build: nothing of the
// sessions reads through it. Live: the board is read every 5 s (board.ts); a new row arrives on a spring (motion.ts);
// the time since a builder last moved counts up once a second. Only a stalled builder asks for the eye.
// #906: every choice is read from his sheet ("How builds run", sheet.ts), opened from the head; each project's tab holds
// its sessions (sessions.ts, read from the side list's own message); Try opens a card that says what landed.
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Meter } from "../kit";
import { enter, growTo } from "../motion";
import { askCancel, askPlan, askStart, useBoard, type LocalAsk } from "./board";
import { SHEET_KEY } from "./doorDot";
import { FIXED, FOLDERS, ELSEWHERE, RULES, changed, changedIds, readSheet, resetRule, ruleWords, setRule, valueWord, type Rule, type Sheet, type Value } from "./sheet";
import { GROUPS, fold, markWithSessions, sessionsByProject, type Groups, type Row } from "./sessions";
import { openSession, useSessions, type Engine } from "./useSessions";
import {
  boardUrl, calmLine, firstTab, SCREEN, sharedWhy, joinCount, judged, landed, localPlan, machineName, meters, minutesWord, needsYou, projectMark, readyOf, screenLayout, shortName,
  liveWhy, sinceMoved, span, stalled, STATE_WORD, sureWord, TRACK, trackLayout, type Board, type Line, type Need, type Plan, type Run,
} from "./rules";
import "./runs.css";

const SEEN = "runs.seen";
const readSeen = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SEEN) ?? "{}") ?? {}; } catch { return {}; } };
const writeSeen = (s: Record<string, number>) => { try { localStorage.setItem(SEEN, JSON.stringify(s)); } catch { /* private */ } };
const loadSheet = () => { try { return readSheet(localStorage.getItem(SHEET_KEY)); } catch { return readSheet(null); } };
const keepSheet = (s: Sheet) => { try { localStorage.setItem(SHEET_KEY, JSON.stringify(Object.fromEntries(changedIds(s).map((id) => [id, s[id]])))); } catch { /* private */ } };
const openUrl = (url: string) => { import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank", "noopener")); };
const REPO = "https://github.com/sol-mif/sol-dev";
const MACHINES_UNDER = 640;   // narrow, the machines' column keeps a reading width (runs.css .rv-body.under .rv-machines)

/** a row that arrives on a spring the first time it is drawn, never on a re-read of the board */
function Arrive({ className, children, ...rest }: { className: string; children: ReactNode } & Record<string, unknown>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) enter(ref.current, { y: 8 }); }, []);
  return <div ref={ref} className={className} {...rest}>{children}</div>;
}
/** a word that changes moves in with the kit's motion (motion.ts enter: none with reduced motion); the first draw is still */
function Moves({ className, word }: { className: string; word: string }) {
  const ref = useRef<HTMLSpanElement>(null), was = useRef(word);
  useLayoutEffect(() => { if (was.current !== word && ref.current) enter(ref.current, { y: 6 }); was.current = word; }, [word]);
  return <span ref={ref} className={className} style={{ display: "inline-block" }}>{word}</span>;
}
/** a box whose height follows what it holds on a spring, never a jump */
function Grows({ className, dep, children }: { className: string; dep: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), h = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (h.current !== null) growTo(el, h.current);
    h.current = el.offsetHeight;
  }, [dep]);
  return <div ref={ref} className={className}>{children}</div>;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null), [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const take = () => setW(Math.round(el.getBoundingClientRect().width));
    take();
    const ro = new ResizeObserver(take); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** the view in its own fence: a board it cannot read stops this screen only, says so, and keeps the way back */
class Fence extends Component<{ onClose: () => void; children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <section className="rv" data-place="runs" aria-label="runs">
        <header className="rv-head"><div className="rv-title">Runs</div><div className="rv-space" /><button type="button" className="rv-close" onClick={this.props.onClose}>Back to sessions</button></header>
        <div className="rv-empty">The runs view could not draw this board ({this.state.err}). Your sessions are untouched.</div>
      </section>
    );
  }
}
export const RunsView = ({ onClose, e }: { onClose: () => void; e?: Engine }) => <Fence onClose={onClose}><RunsScreen onClose={onClose} e={e} /></Fence>;

const ELSE = { id: ELSEWHERE, name: "Elsewhere" };

function RunsScreen({ onClose, e }: { onClose: () => void; e?: Engine }) {
  const url = useMemo(() => boardUrl(location.search), []);
  const { board: raw, error, okAt, reading } = useBoard(url);
  const [{ sheet, note }, setSheetState] = useState(loadSheet);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { sessions, runs: sessionRuns } = useSessions(e);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const [seen, setSeen] = useState(readSeen);
  const [tab, setTab] = useState<string | null>(null);
  const [did, setDid] = useState<{ words: string; undo?: () => void } | null>(null);
  const [asks, setAsks] = useState<LocalAsk[]>([]);
  const [rootRef, bodyW] = useWidth<HTMLElement>();   // the section is always drawn, so its width is known before the board
  const nowSec = Math.floor(now / 1000);
  // the board as his sheet judges it: a builder silent under his minutes is not stuck, a machine's room by his cap
  const board = useMemo(() => (raw ? judged(raw, sheet, nowSec) : null), [raw, sheet, nowSec]);
  const changeRule = (id: string, v: Value) => {
    const r = setRule(sheet, id, v); if (!r.ok) return r.why;
    const before = sheet[id];
    setSheetState({ sheet: r.sheet, note: null }); keepSheet(r.sheet);
    setDid({ words: `You changed a rule: ${ruleWords(r.sheet, id)}`, undo: () => {
      setSheetState((o) => { const n = { ...o.sheet, [id]: before }; keepSheet(n); return { sheet: n, note: null }; }); setDid({ words: "You put the rule back as it was" });
    } });
    return null;
  };
  const resetOne = (id: string) => changeRule(id, resetRule(sheet, id)[id]);

  const projects = board?.projects ?? [];
  const bySession = useMemo(() => sessionsByProject(sessions, sessionRuns, projects, now), [sessions, sessionRuns, projects, now]);
  const tabs = bySession.has(ELSEWHERE) ? [...projects, ELSE] : projects;
  const marks = useMemo(() => new Map(tabs.map((p) => [p.id, markWithSessions(p.id === ELSEWHERE ? elsewhereMark(bySession.get(ELSEWHERE)) : projectMark(withAsks(board, asks), p.id, seen), bySession.get(p.id))])), [board, asks, seen, tabs, bySession]);
  // the tab that opens is chosen once (rules.ts firstTab) and kept: a re-read never moves it under the eye
  const first = firstTab(tabs, marks);
  useEffect(() => { if (!tab && first && board) setTab(first); }, [tab, first, board]);   // chosen once the board is read, never from the sessions alone
  const open = tabs.some((p) => p.id === tab) ? tab! : first;
  const [trying, setTrying] = useState<string | null>(null);   // the line whose Try card is open

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !(ev.target instanceof HTMLInputElement) && !(ev.target instanceof HTMLSelectElement)) { if (sheetOpen) setSheetOpen(false); else if (trying) setTrying(null); else onClose(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose, sheetOpen, trying]);

  const layout = screenLayout(bodyW || 1);
  const where = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const fresh = error
    ? `The board at ${where} does not answer (${error}); ${okAt ? `showing what it said ${span((now - okAt) / 1000)} ago` : "nothing read yet"}, trying again every 5 s`
    : okAt ? `Read from ${where} ${Math.round((now - okAt) / 1000) < 2 ? "just now" : `${Math.round((now - okAt) / 1000)} s ago`}; again every 5 s` : `Reading the board at ${where}…`;

  // Try (#906): a card in the view that says what landed; "Mark as tried" is the press, GitHub's list a quiet link
  const markTried = (l: Line, count: number) => {
    const before = seen[l.id] ?? 0, next = { ...seen, [l.id]: count };
    setSeen(next); writeSeen(next); setTrying(null);
    setDid({ words: `You marked what landed on “${l.name}” as tried`, undo: () => { const b = { ...readSeen(), [l.id]: before }; setSeen(b); writeSeen(b); setDid(null); } });
  };
  const github = (l: Line) => openUrl(`${REPO}/pulls?q=${encodeURIComponent(`is:pr is:merged base:${l.try ?? ""}`)}`);
  const tryCard = board && trying ? (board.lines ?? []).find((l) => l.id === trying && l.project === open) : undefined;
  const mine = changedIds(sheet).length;
  // sessions waiting on him, said in Needs you's calm line so it never says "nothing" while a tab says "needs you"
  const waitIn = tabs.filter((p) => bySession.get(p.id)?.waits.length);
  const nWait = waitIn.reduce((a, p) => a + bySession.get(p.id)!.waits.length, 0);
  const waitsLine = nWait ? `${nWait} session${nWait === 1 ? " waits" : "s wait"} on you in ${waitIn.map((p) => p.name).join(", ")}, under ${waitIn.length === 1 ? "its tab" : "their tabs"}.` : null;

  return (
    <section ref={rootRef} className="rv" data-place="runs" aria-label="runs">
      <header className="rv-head">
        <div className="rv-title">Runs</div>
        {board && <div className={`rv-fresh ${error ? "off" : ""}`} title={url}>{fresh}</div>}
        <div className="rv-space" />
        {did && <div className="rv-did"><span>{did.words}</span>{did.undo && <button type="button" className="rv-link" onClick={did.undo}>Undo</button>}</div>}
        <button type="button" className={`rv-close rv-sheetdoor ${sheetOpen ? "on" : ""}`} aria-pressed={sheetOpen} onClick={() => setSheetOpen((o) => !o)}
          title="the rules every plan follows; change any of them">How builds run{mine ? <span className="rv-yours">{mine} yours</span> : null}</button>
        <button type="button" className="rv-close" onClick={onClose} title="back to your sessions (esc)">Back to sessions</button>
      </header>
      {!board
        ? <div className="rv-empty">{reading ? `Reading the runs board at ${where}…` : `The runs board at ${where} does not answer (${error}). Trying again every 5 s.`}</div>
        : <>
          <nav className="rv-tabs" role="tablist" aria-label="projects">
            {tabs.map((p) => {
              const m = marks.get(p.id)!;
              return (
                <button key={p.id} type="button" role="tab" aria-selected={p.id === open} className={`rv-tab ${p.id === open ? "on" : ""} ${p.id === ELSEWHERE ? "rv-else" : ""}`} data-mark={m.mark} onClick={() => { setTab(p.id); setTrying(null); }}>
                  <span className="rv-tabname">{p.name}</span>
                  <span className="rv-tabmark"><i className="rv-dot" data-mark={m.mark} aria-hidden /><Moves className="rv-tabword" word={m.word} /><span className="rv-tabdetail">{m.detail}</span></span>
                </button>
              );
            })}
          </nav>
          <div className={`rv-body ${layout.beside ? "beside" : "under"} ${sheetOpen ? "rv-withsheet" : ""}`}>
            {!layout.beside && !sheetOpen && <div className="rv-side rv-first"><Needs board={board} nowSec={nowSec} waits={waitsLine} onOpen={(n) => n.project && setTab(n.project)} /></div>}
            {(layout.beside || !sheetOpen) && <main className="rv-main">
              {open === ELSEWHERE
                ? <div className="rv-none">Sessions whose folder belongs to none of your projects. Which folder is which project is at the end of “How builds run”.</div>
                : open && <Start key={open} board={raw ?? board} sheet={sheet} url={url} project={open} projectName={projects.find((p) => p.id === open)?.name ?? open}
                onStarted={(plan, sentence, here, undo) => {
                  const ask: LocalAsk = { id: plan.id, sentence, project: open, state: here ? "kept here: the board cannot start runs yet" : "asked; waiting to start", at: nowSec, here: true };
                  setAsks((a) => [...a, ask]);
                  setDid({ words: `You started “${sentence}” in ${projects.find((p) => p.id === open)?.name}`, undo: async () => { await undo(); setAsks((a) => a.filter((x) => x.id !== plan.id)); setDid({ words: `You took back “${sentence}”` }); } });
                }} />}
              {open !== ELSEWHERE && <Asked board={board} asks={asks} project={open} />}
              <Sessions groups={open ? bySession.get(open) : undefined} width={layout.beside ? layout.linesW - (sheetOpen ? SHEET_W - SCREEN.sideW : 0) : bodyW} onOpen={(id) => { openSession(id); onClose(); }} />
              {tryCard && <TryCard board={board} line={tryCard} count={readyOf(board, tryCard.id, seen).count} onTried={markTried} onGithub={github} onClose={() => setTrying(null)} />}
              {open !== ELSEWHERE && <Lines board={board} project={open} width={layout.beside ? layout.linesW - (sheetOpen ? SHEET_W - SCREEN.sideW : 0) : layout.linesW} nowSec={nowSec} seen={seen} trying={trying} onTry={(l) => setTrying((t) => (t === l.id ? null : l.id))} />}
            </main>}
            {sheetOpen
              ? <aside className="rv-side rv-sheetside"><SheetView sheet={sheet} note={note} onChange={changeRule} onReset={resetOne} onClose={() => setSheetOpen(false)} needs={needsYou(board, nowSec).length} beside={layout.beside} /></aside>
              : <aside className="rv-side">
                {layout.beside && <Needs board={board} nowSec={nowSec} waits={waitsLine} onOpen={(n) => n.project && setTab(n.project)} />}
                <Machines board={board} sheet={sheet} width={layout.beside ? SCREEN.sideW : Math.min(bodyW, MACHINES_UNDER + 48)} />
              </aside>}
          </div>
        </>}
    </section>
  );
}

const withAsks = (b: Board | null, asks: LocalAsk[]): Board => (b ? { ...b, requests: [...(b.requests ?? []), ...asks] } : { at: 0 });
const SHEET_W = 416;   // runs.css .rv-sheetside: the sheet's column, wider than the side's 320 so a sentence and its control sit on one line
/** the Elsewhere tab's own mark: only from its sessions (it has no builders) */
function elsewhereMark(g: Groups | undefined) {
  const n = g?.count ?? 0, w = g?.working.length ?? 0;
  return { mark: (w ? "working" : "calm") as "working" | "calm", word: w ? "working" : "calm", detail: `${n} session${n === 1 ? "" : "s"}` };
}

function Lines({ board, project, width, nowSec, seen, trying, onTry }: {
  board: Board; project: string | null; width: number; nowSec: number; seen: Record<string, number>; trying: string | null; onTry: (l: Line) => void;
}) {
  const lines = (board.lines ?? []).filter((l) => l.project === project);
  const inner = Math.max(0, width - 2 * 24 - 2 * 16);   // the main's inset and the card's
  const row = lines.length ? !trackLayout([], inner).stacked : false;
  if (!lines.length) return <div className="rv-none">No line runs in this project. Say what to build above, and it starts one.</div>;
  return (
    <div className="rv-lines">
      {row && <div className="rv-cols" style={{ gridTemplateColumns: trackLayout([], inner).cols }}><span>the goal</span><span>builders at work</span><span>merged in order</span><span>ready to try</span></div>}
      {lines.map((l) => <Track key={l.id} board={board} line={l} width={inner} nowSec={nowSec} seen={seen} trying={trying === l.id} onTry={onTry} />)}
    </div>
  );
}

function Track({ board, line, width, nowSec, seen, trying, onTry }: { board: Board; line: Line; width: number; nowSec: number; seen: Record<string, number>; trying: boolean; onTry: (l: Line) => void }) {
  const runs = (board.runs ?? []).filter((r) => r.line === line.id);
  const t = trackLayout(runs, width);
  const joins = (board.joins ?? []).filter((j) => j.line === line.id);
  const ready = readyOf(board, line.id, seen);
  const label = (s: string) => (t.stacked ? <div className="rv-cell-label">{s}</div> : null);
  return (
    <Grows className={`rv-track ${t.stacked ? "rv-stacked" : "rv-inrow"}`} dep={`${t.shown.length}-${t.folded?.count ?? 0}-${t.stacked}`}>
      <div className="rv-grid" style={{ gridTemplateColumns: t.cols }}>
        <div className="rv-goal">
          <div className="rv-name">{line.name}{line.issue ? <span className="rv-issue"> #{line.issue}</span> : null}</div>
          {line.goal && <div className="rv-goaltext">{line.goal}</div>}
        </div>
        <div className="rv-builders">
          {label("builders at work")}
          {t.shown.length === 0 && <div className="rv-quiet">No builder on it now.</div>}
          {t.shown.map((r) => <Builder key={r.id} r={r} board={board} nowSec={nowSec} />)}
          {t.folded && <div className="rv-folded">{t.folded.words}</div>}
        </div>
        <div className="rv-join">
          {label("merged in order")}
          {joins.length === 0 && <div className="rv-quiet">No merge queue.</div>}
          {joins.map((j) => {
            const c = joinCount(j, board.merged);
            return (
              <div key={j.name} className="rv-joinone">
                <div className="rv-joinname">{j.name}</div>
                <div className="rv-joincount">{c.merged} of {c.of} merged</div>
                <Meter w={t.stacked ? Math.min(240, width) : TRACK.join - 16} h={6} value={c.of ? c.merged / c.of : 0} label={`${j.name}: ${c.merged} of ${c.of} merged`} />
                {c.next && <div className="rv-quiet">next: #{c.next}</div>}
              </div>
            );
          })}
        </div>
        <div className="rv-try">
          {label("ready to try")}
          {ready.fresh > 0 && line.try
            ? <><div className="rv-trywords">{ready.fresh} new on {line.try}</div><Button h={32} onClick={() => onTry(line)}>{trying ? "Close" : "Try"}</Button></>
            : ready.count > 0 ? <div className="rv-quiet">Tried: {ready.count} on {line.try ?? "its branch"}</div>
            : <div className="rv-quiet">Nothing to try yet.</div>}
        </div>
      </div>
    </Grows>
  );
}

function Builder({ r, board, nowSec }: { r: Run; board: Board; nowSec: number }) {
  const q = sinceMoved(r, board.at, nowSec), bad = stalled(r.state);
  const said = bad ? liveWhy(r.why, q) : r.said || r.why || r.did;
  return (
    <Arrive className={`rv-b ${bad ? "stalled" : ""}`} data-state={r.state}>
      <div className="rv-bline">
        <i className="rv-dot" data-state={r.state} aria-hidden />
        <span className="rv-bname">{shortName(r.id)}</span>
        <Moves className="rv-bstate" word={STATE_WORD[r.state]} />
        <span className="rv-bmeta">on the {machineName(r.machine)}{q !== null && !bad && <> · moved {q < 60 ? "just now" : `${span(q)} ago`}</>}</span>
        {r.pr && <span className="rv-bpr">#{r.pr.number}</span>}
      </div>
      {said && <div className={`rv-said ${bad ? "whole" : ""}`} title={said}>{said}</div>}
    </Arrive>
  );
}

function Asked({ board, asks, project }: { board: Board; asks: LocalAsk[]; project: string | null }) {
  const all = [...(board.requests ?? []).filter((q) => q.project === project), ...asks.filter((a) => a.project === project)];
  if (!all.length) return null;
  return (
    <div className="rv-asked">
      <div className="rv-h">Waiting to start</div>
      {all.map((q, i) => <Arrive key={q.id ?? i} className="rv-ask"><span className="rv-asksent">“{q.sentence}”</span><span className="rv-quiet">{q.state ?? "asked"}</span></Arrive>)}
    </div>
  );
}

function Needs({ board, nowSec, onOpen, waits }: { board: Board; nowSec: number; onOpen: (n: Need) => void; waits: string | null }) {
  const needs = needsYou(board, nowSec);
  return (
    <div className="rv-needs" aria-live="polite">
      <div className="rv-h">Needs you{needs.length ? <span className="rv-count">{needs.length}</span> : null}</div>
      {needs.length === 0
        ? <div className="rv-calm">{waits ? `No builder needs you. ${waits}` : calmLine(board)}</div>
        : needs.map((n, i) => (
          <Arrive key={n.key} className={`rv-need ${i === 0 ? "first" : ""}`} role="button" tabIndex={0} onClick={() => onOpen(n)}>
            <div className="rv-needtitle">{n.title}</div>
            <div className="rv-needwhy">{n.why}</div>
          </Arrive>
        ))}
    </div>
  );
}

function Machines({ board, sheet, width }: { board: Board; sheet: Sheet; width: number }) {
  const ms = meters(board, sheet);
  const other = (board.alerts ?? []).filter((a) => a.level === "watch" && !(a.where in (board.machines ?? {})));
  return (
    <div className="rv-machines">
      <div className="rv-h">Machines</div>
      {ms.map((m) => (
        <div key={m.id} className={`rv-m ${m.reporting ? "" : "off"}`}>
          <div className="rv-mline"><span className="rv-mname">{m.name}</span><span className="rv-mword">{m.word}</span></div>
          <Meter w={Math.max(80, width - 2 * 24)} h={6} value={m.full} label={`${m.name}: ${m.word}`} />
          <div className="rv-mwhy">{m.why}</div>
          {m.watch && <div className="rv-mwhy">{m.watch}</div>}
        </div>
      ))}
      {other.map((a) => <div key={a.what} className="rv-mwhy rv-other">{a.what}</div>)}
    </div>
  );
}

function Start({ board, sheet, url, project, projectName, onStarted }: {
  board: Board; sheet: Sheet; url: string; project: string; projectName: string;
  onStarted: (p: Plan, sentence: string, here: boolean, undo: () => Promise<void>) => void;
}) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"" | "planning" | "starting">("");
  const [said, setSaid] = useState("");
  const [err, setErr] = useState("");
  const ask = async () => {
    const s = text.trim(); if (!s || busy) return;
    setBusy("planning"); setErr(""); setSaid(s);
    try { setPlan(await askPlan(url, board, s, project, sheet)); } finally { setBusy(""); }
  };
  // a rule changed on the sheet changes a plan made here at once (the board's own plans follow when the engine sends
  // it the sheet: POST <board>/sheet, stubbed)
  const sheetKey = JSON.stringify(sheet);
  useEffect(() => { setPlan((p) => (p && p.by === "planned here" ? { ...localPlan(board, said, Math.floor(Date.now() / 1000), sheet), id: p.id } : p)); }, [sheetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (!plan || busy) return;
    setBusy("starting");
    const r = await askStart(url, plan);
    setBusy("");
    if (!r.ok) { setErr(`It did not start: ${r.state}.`); return; }
    const p = plan;
    onStarted(p, said, r.here, async () => { await askCancel(url, p.id, r.here); });
    setPlan(null); setText("");
  };
  const name = (m: string) => machineName(m);
  const shared = plan ? sharedWhy(plan) : null;
  const hisCount = (plan?.ruled ?? []).filter((id) => /^(builders\.|split)/.test(id)).length;   // his rules that decided how many builders
  return (
    <Grows className="rv-start" dep={`${!!plan}-${busy}-${err}`}>
      <form className="rv-ask-row" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input className="rv-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Say what to build in ${projectName}, in one sentence`} aria-label="what to build, in one sentence" />
        <Button h={32} onClick={ask}>{busy === "planning" ? "Planning…" : "Plan it"}</Button>
      </form>
      {plan && (
        <div className="rv-plan" aria-label="the plan">
          <div className="rv-planhead">The plan for “{said}”<span className="rv-quiet"> · {minutesWord(plan.est_minutes)} · {sureWord(plan.confidence)} · {plan.by}</span></div>
          <ol className="rv-parts">
            {plan.parts.map((p) => (
              <li key={p.name}><span className="rv-pwhat">{p.what}</span><span className="rv-pon">on the {name(p.machine)}</span>{!shared && <span className="rv-why">{p.why}</span>}</li>
            ))}
          </ol>
          {shared && <span className="rv-why">{shared}</span>}
          <div className={`rv-pick ${hisCount ? "his" : ""}`}><b>{plan.builders} builder{plan.builders === 1 ? "" : "s"}</b><span className="rv-why">{plan.why_builders}</span></div>
          <div className="rv-pick"><b>Review on the {name(plan.review.machine)}</b><span className="rv-why">{plan.review.why}</span>{plan.review.shots && <span className="rv-why">{plan.review.shots}</span>}</div>
          <div className="rv-pick"><b>Merged {plan.join.order.length > 1 ? plan.join.order.join(", then ") : "as one"}</b><span className="rv-why">{plan.join.why}</span></div>
          <div className="rv-planacts">
            <Button h={32} onClick={run}>{busy === "starting" ? "Starting…" : "Run"}</Button>
            <button type="button" className="rv-link" onClick={() => { setPlan(null); setErr(""); }}>Not now</button>
            {plan.starts && <span className="rv-quiet">{plan.starts}</span>}
            {err && <span className="rv-err">{err}</span>}
          </div>
        </div>
      )}
    </Grows>
  );
}

// ---- #906: the sheet, a project's sessions, the Try card ----

/** "How builds run": each rule one sentence with its value as a control inside it, the why under it, "Back to the
 *  default" only when changed; a changed rule is marked "yours". The MacBook rule is a fixed line, never a control */
function SheetView({ sheet, note, onChange, onReset, onClose, needs, beside }: {
  sheet: Sheet; note: string | null; onChange: (id: string, v: Value) => string | null; onReset: (id: string) => void; onClose: () => void; needs: number; beside: boolean;
}) {
  const mine = changedIds(sheet).length;
  return (
    <div className="rv-sheet" aria-label="How builds run">
      <div className="rv-sheethead">
        <div className="rv-sheettitle">How builds run</div>
        <button type="button" className="rv-link" onClick={onClose}>{beside ? "Close" : "Back to the runs"}</button>
      </div>
      <div className="rv-quiet">Every plan follows these rules. Each starts at what a careful team does; change any, and the plan on the left changes with it. {mine ? `${mine} ${mine === 1 ? "is" : "are"} yours.` : "None is changed."}</div>
      {needs > 0 && <button type="button" className="rv-link rv-sheetneeds" onClick={onClose}>{needs === 1 ? "One thing needs" : `${needs} things need`} you: back to the runs</button>}
      {note && <div className="rv-note" role="status">{note}</div>}
      {RULES.map((r) => <RuleRow key={r.id} rule={r} value={sheet[r.id]} his={changed(sheet, r.id)} onChange={onChange} onReset={onReset} />)}
      <div className="rv-h rv-sheetsub">Always</div>
      {FIXED.map((f) => <div key={f.id} className="rv-rule fixed"><div className="rv-rulesent">{f.line}</div><div className="rv-why">{f.why}</div></div>)}
      <div className="rv-h rv-sheetsub">Which project a session belongs to</div>
      <div className="rv-folders">
        {FOLDERS.map((f) => <div key={f.under} className="rv-folder"><span>a folder in …/{f.under}</span><span>{f.name}</span></div>)}
        <div className="rv-folder"><span>any other folder</span><span>Elsewhere</span></div>
      </div>
    </div>
  );
}

function RuleRow({ rule, value, his, onChange, onReset }: { rule: Rule; value: Value; his: boolean; onChange: (id: string, v: Value) => string | null; onReset: (id: string) => void }) {
  const [text, setText] = useState(String(value));
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => { setText(String(value)); setRefused(null); }, [value]);
  const spec = rule.spec;
  const control = spec.kind === "number"
    ? <input className={`rv-ctl rv-num ${refused ? "bad" : ""}`} inputMode="numeric" value={text} aria-label={rule.name.replace("{v}", "how many")} aria-invalid={!!refused}
      onChange={(ev) => { setText(ev.target.value); const why = ev.target.value.trim() === "" ? null : onChange(rule.id, ev.target.value); setRefused(why); }}
      onBlur={() => { if (refused || text.trim() === "") { setText(String(value)); setRefused(null); } }} />
    : <select className="rv-ctl" value={spec.kind === "yesno" ? (value ? "yes" : "no") : String(value)} aria-label={rule.name.replace("{v}", "which")}
      onChange={(ev) => onChange(rule.id, spec.kind === "yesno" ? ev.target.value === "yes" : ev.target.value)}>
      {spec.kind === "yesno"
        ? <><option value="yes">{spec.yes}</option><option value="no">{spec.no}</option></>
        : spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>;
  return (
    <div className={`rv-rule ${his ? "his" : ""}`}>
      <div className="rv-rulesent">{rule.before} {control}{rule.after ? ` ${rule.after}` : ""}</div>
      {refused && <div className="rv-refused" role="alert">{refused} It stays at {valueWord(rule, value)}.</div>}
      <div className="rv-why">{rule.why}</div>
      {his && <div className="rv-ruleyours"><span className="rv-yours">yours</span><button type="button" className="rv-link rv-back" onClick={() => onReset(rule.id)}>Back to the default ({valueWord(rule, rule.def)})</button></div>}
    </div>
  );
}

/** a project's sessions, above its lines: waiting on you, working, done and unread; at most four a group, one press opens one */
function Sessions({ groups, width, onOpen }: { groups: Groups | undefined; width: number; onOpen: (id: string) => void }) {
  if (!groups?.count) return null;
  const shown = GROUPS.filter((g) => groups[g.id].length);
  const row = width >= 720;   // three groups side by side from the track's own row width (rules.ts TRACK.row)
  return (
    <div className="rv-sessions">
      <div className="rv-h">Sessions</div>
      <div className={`rv-sgroups ${row ? "rv-inline" : ""}`} style={row ? { gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` } : undefined}>
        {shown.map((g) => {
          const f = fold(groups[g.id]);
          return (
            <div key={g.id} className="rv-sgroup" data-group={g.id}>
              <div className="rv-sgword">{g.word}<span className="rv-quiet"> · {groups[g.id].length}</span></div>
              {f.shown.map((x: Row) => (
                <Arrive key={x.id} className="rv-sess" role="button" tabIndex={0} data-group={g.id} title={x.title}
                  onClick={() => onOpen(x.id)} onKeyDown={(ev: React.KeyboardEvent) => { if (ev.key === "Enter") onOpen(x.id); }}>
                  <div className="rv-sline"><i className="rv-dot" data-group={g.id} aria-hidden /><span className="rv-sname">{x.title}</span></div>
                  <div className="rv-said">{x.line}</div>
                </Arrive>
              ))}
              {f.more > 0 && <div className="rv-folded">and {f.more} more in the side list</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Try, in ordinary words: what landed on the line's branch, where it is, and the one press; GitHub's list is second */
function TryCard({ board, line, count, onTried, onGithub, onClose }: { board: Board; line: Line; count: number; onTried: (l: Line, n: number) => void; onGithub: (l: Line) => void; onClose: () => void }) {
  const got = landed(board, line);
  return (
    <Arrive className="rv-plan rv-trycard" aria-label={`ready to try in ${line.name}`}>
      <div className="rv-planhead">Ready to try in “{line.name}”</div>
      {got.titles.length
        ? <ul className="rv-landed">{got.titles.map((t) => <li key={t}>{t}</li>)}{got.more > 0 && <li className="rv-quiet">and {got.more} more</li>}</ul>
        : <div className="rv-quiet">The board does not say what each change is; it counts {count} merged.</div>}
      <div className="rv-why">It is on {line.try ? `“${line.try}”` : "the line's branch"}, and reaches your window when Jelly is updated to it.</div>
      <div className="rv-planacts">
        <Button h={32} onClick={() => onTried(line, count)}>Mark as tried</Button>
        <button type="button" className="rv-link" onClick={onClose}>Not now</button>
        <button type="button" className="rv-link rv-quietlink" onClick={() => onGithub(line)}>The list on GitHub</button>
      </div>
    </Arrive>
  );
}
