// Build with the one session (#1002, behind `build.one`; the design: mine/look/one/all.html and index.html). One
// session the person talks to; it runs the others. Left: its talk. Right: the stage, where it talks back in pieces,
// under one line that answers the four questions at a glance (where am I, what is happening, what needs me, what did I
// just do) and a picture of the sessions it runs. Never a board of sessions, never a queue: the picture is a picture;
// what needs the person comes as a piece. Nothing acts unchosen: a piece's answer goes after a short grace, and undo
// sits where send was, until the engine has acted; after, undo stops what it started.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKey, type MouseEvent as RMouse } from "react";
import { link } from "../socket";
import { ENGINE, ENGINE_HTTP } from "../engine";
import { awayOf, byGoal, gridOf, sectionsOf, STATES, moveTo, rowLine, isOrder, isPicture, moveStep, noteMark, proofLine, putMark, type Future, type Mark, type Shows, titleOf, answerOf, draftOf, earlier, glance, goingOf, LACK_WORDS, onStage, pressPick, sendOf, threads, type Did, type Draft, type Piece, type Row } from "./model";
import { TeamLayer, undoTeamDid, useTeamDid, useTeamNeeds } from "./TeamLayer";   // #1002 team size, build.one.team
import { LongDials, LongSince, PullBack, useBuildOneLong } from "./LongLayer";   // #1002 the long project, build.one.long
import type { LongView } from "./long";
import "./one.css";
import { KeptMark } from "./KeptMark";   // how it is kept: full, its renewals, what it runs, where it writes
import { quietOf, type Kept } from "./kept";
import { Body, haloDoing } from "../Body";   // the body itself in the talk's head, never a drawn copy
import { useBuildSnap } from "../snap/fit";   // #1024 pieces that snap, build.snap
const SnapBench = lazy(() => import("../snap/SnapBench").then((m) => ({ default: m.SnapBench })));

type Item = { id: string; kind: string; text?: string; tool?: string; input?: any; live?: boolean };
// the page's one socket to the engine (socket.ts keeps one per address): every message, and its up and down
const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
const wireSend = (o: object) => L?.send(o) ?? false;
type Ev = { link: boolean } | { msg: any };
const onWire = (f: (e: Ev) => void) => { const a = L?.on((m) => f({ msg: m })), b = L?.onLink((up) => f({ link: up })); return () => { a?.(); b?.(); }; };
let rid = 0;
function ask<T = any>(o: object): Promise<T> {
  const r = `one-${++rid}`;
  return new Promise((res, rej) => {
    const off = onWire((e) => { if ("msg" in e && e.msg?.rid === r) { off(); clearTimeout(t); if (e.msg.error) rej(new Error(e.msg.error)); else res(e.msg); } });
    const t = setTimeout(() => { off(); rej(new Error("the engine did not answer")); }, 20000);
    if (!wireSend({ ...o, rid: r })) { off(); clearTimeout(t); rej(new Error("the engine is not there")); }
  });
}
const drafts = new Map<string, Draft>();
// the engine on this very computer (its address is local): the sessions use this computer, not another machine
const HERE = /\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(ENGINE);   // each piece's draft, kept across redraws until the page reloads

export function OneApp() {
  const [id, setId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [did, setDid] = useState<Did[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [folder, setFolder] = useState("");
  const [line, setLine] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showEarlier, setShowEarlier] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  // open a piece in full and put focus in it: tried until it is drawn (a busy machine can take longer than a frame)
  const openBig = (pid: string) => {
    setBig(pid);
    let n = 0;
    const go = () => { const el = document.querySelector<HTMLElement>(`[data-piece="${pid}"] [data-first], [data-piece="${pid}"] .o-undo`); if (el) { el.focus(); return; } if (++n < 20) setTimeout(go, 50); };
    setTimeout(go, 0);
  };
  // when the person last looked: read once on open (for "while you were away"), then kept fresh while they look
  const [seen] = useState(() => Number(localStorage.getItem("build.one.seen") ?? 0));
  const [awayShut, setAwayShut] = useState(false);
  useEffect(() => { const k = () => { if (document.visibilityState === "visible") localStorage.setItem("build.one.seen", String(Date.now())); };
    const t = setInterval(k, 30_000); document.addEventListener("visibilitychange", k); window.addEventListener("pagehide", k);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", k); window.removeEventListener("pagehide", k); }; }, []);
  // the long project (build.one.long): the engine's view of his answers and of since he was here, fetched when pieces move
  const longOn = useBuildOneLong();
  const [longView, setLongView] = useState<LongView | null>(null);
  const longRef = useRef(longOn); longRef.current = longOn;
  const fetchLong = useCallback(() => { if (longRef.current) void ask<LongView>({ type: "work.one.long" }).then(setLongView).catch(() => {}); else setLongView(null); }, []);
  useEffect(() => { if (idRef.current) void ask({ type: "work.one.open", long: longOn }).then(fetchLong).catch(() => {}); }, [longOn]); // eslint-disable-line react-hooks/exhaustive-deps
  // he leaves the window (hidden, or the page goes): the project's "since you were here" starts from now
  useEffect(() => { if (!longOn) return; const k = () => { if (document.visibilityState === "hidden") wireSend({ type: "work.one.seen" }); };
    document.addEventListener("visibilitychange", k); window.addEventListener("pagehide", k);
    return () => { document.removeEventListener("visibilitychange", k); window.removeEventListener("pagehide", k); }; }, [longOn]);
  const setDial = (kind: string, to: string) => void ask<LongView>({ type: "work.one.dial", kind, to }).then(setLongView).catch((e) => setErr(e.message));
  const idRef = useRef<string | null>(null);
  // how it is kept (work.one.kept): asked on open, then pushed by the engine on each change; "renew now" held while it goes
  const [kept, setKept] = useState<Kept | null>(null);
  const [renewPress, setRenewPress] = useState(false);
  const [keptErr, setKeptErr] = useState("");
  const renew = () => { setRenewPress(true); setKeptErr(""); void ask({ type: "work.one.renew" }).catch((e) => setKeptErr(String(e.message ?? e))).finally(() => setRenewPress(false)); };
  const talkEnd = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // the one session: made once by the engine and kept; this window opens it
  useEffect(() => {
    let gone = false;
    const open = () => ask({ type: "work.one.open", long: longRef.current }).then((m) => {
      if (gone) return;
      idRef.current = m.sessionId; setId(m.sessionId); setPieces(m.pieces ?? []); setDid(m.did ?? []); setRows(m.roster ?? []); setErr("");
      wireSend({ type: "work.open", sessionId: m.sessionId });
      fetchLong();
      void ask<Kept>({ type: "work.one.kept" }).then((k) => !gone && setKept(k)).catch(() => {});
    }).catch((e) => !gone && setErr(String(e.message ?? e)));
    const off = onWire((e) => {
      if ("link" in e) { if (e.link) void open(); return; }
      const m = e.msg; if (!m?.type) return;
      if (m.type === "work.one.longed") { fetchLong(); return; }
      // a renewal moved the name to a fresh copy: open that one, so its talk is what shows
      if (m.type === "work.one.kept") { if (!m.rid) setKept(m as Kept); if (m.sessionId && idRef.current && m.sessionId !== idRef.current) void open(); return; }
      if (m.type === "work.one.pieces") { setPieces(m.pieces ?? []); setDid(m.did ?? []); if (longRef.current) setTimeout(fetchLong, 400); setTimeout(() => void ask({ type: "work.one.roster" }).then((r) => setRows(r.roster ?? [])).catch(() => {}), 1500); return; }
      if (m.sessionId !== idRef.current) { if (m.type === "work.run" && m.ended) void ask({ type: "work.one.roster" }).then((r) => setRows(r.roster ?? [])).catch(() => {}); return; }
      if (m.type === "work.thread") { setItems((m.items ?? []).filter(shown)); setFolder(m.cwd ?? ""); setBusy(!!m.run?.busy); }
      else if (m.type === "work.item") setItems((l) => { const it = m.item as Item; if (!shown(it)) return l; const i = l.findIndex((x) => x.id === it.id); if (i < 0) return [...l, it]; const c = l.slice(); c[i] = { ...c[i], ...it }; return c; });
      else if (m.type === "work.delta") setItems((l) => l.map((x) => (x.id === m.id ? { ...x, text: (x.text ?? "") + m.text } : x)));
      else if (m.type === "work.run") { setBusy(!!m.busy); if (m.cwd) setFolder(m.cwd); if (m.ended) wireSend({ type: "work.open", sessionId: m.sessionId }); }   // the whole talk again after each turn: nothing said before the id came is lost
    });
    return () => { gone = true; off(); };
  }, []);
  // the roster every 8 s while shown (the picture), and a clock for the grace's count
  useEffect(() => { const t = setInterval(() => { if (idRef.current) void ask({ type: "work.one.roster" }).then((r) => setRows(r.roster ?? [])).catch(() => {}); }, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { talkEnd.current?.scrollIntoView({ block: "end" }); }, [items.length]);

  const failed = items.length > 0 && items[items.length - 1].kind === "error";
  const g0 = useMemo(() => glance({ folder, busy, rows, pieces, did, failed }), [folder, busy, rows, pieces, did, failed]);
  // the team size (build.one.team): a teammate's hand waiting on the person is a need too, said after the person's own
  const team = useTeamNeeds();
  const g1 = team.count && !g0.needsId ? { ...g0, needs: team.count > 1 ? `${team.first} · ${team.count - 1} more` : team.first, waiting: g0.waiting + team.count } : g0;
  // what did I just do: the newer of the person's own last deed here and their last deed with the team (its undo a pull back)
  const teamDid = useTeamDid(), myAt = did.length ? did[did.length - 1].at : 0;
  const teamNewer = !!teamDid && teamDid.at > myAt;
  const g = teamNewer ? { ...g1, did: teamDid!.words, didUndo: undefined } : g1;
  const undoTeam = () => void undoTeamDid().then((r) => r.error && setErr(r.error));
  const say = () => {
    const t = line.trim(); if (!t || !id) return;
    wireSend({ type: "work.say", sessionId: id, text: t }); setLine("");
  };
  const undo = useCallback((pid: string) => ask({ type: "work.one.undo", id: pid }).then((m) => { drafts.delete(pid); setTimeout(() => document.querySelector<HTMLElement>(`[data-piece="${pid}"] [data-first]`)?.focus(), 30); return m; }).catch((e) => setErr(e.message)), []);
  // ⌘Z anywhere in the one session takes back what was just done, while it can be
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && (g.didUndo || (teamNewer && teamDid?.back))) {
        const t = e.target as HTMLElement; if (t?.tagName === "TEXTAREA" || t?.tagName === "INPUT") return;
        e.preventDefault(); if (g.didUndo) void undo(g.didUndo); else undoTeam();
      }
      if (e.key === "/" && document.activeElement === document.body) { e.preventDefault(); box.current?.focus(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [g.didUndo, undo, teamNewer, teamDid]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = useBuildSnap();
  const staged = onStage(pieces, rows), old = earlier(pieces, rows);
  // away, one alert per piece that needs the person (the design's notify-away): never repeated, none while they look.
  // A banner through Build's own (work.notify, on the engine's machine) when that is this computer; always the title count.
  const needy = staged.filter((p) => p.state === "open" && p.lack !== "none");
  const titled = useRef<string | null>(null);   // the title this wrote, so it gives back only its own (pings.ts writes one too)
  useEffect(() => {
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (hidden && needy.length) { const t = `(${needy.length}) Sol`; if (!titled.current) titled.current = document.title; document.title = t; }
    else if (titled.current !== null) { if (/^\(\d+\) Sol$/.test(document.title)) document.title = titled.current.replace(/^\(\d+\) /, ""); titled.current = null; }
    // what the person saw while looking is never alerted later
    if (!hidden) { for (const p of needy) localStorage.setItem(`build.one.told.${p.id}`, "1"); return; }
    for (const p of needy) {
      const k = `build.one.told.${p.id}`;
      if (localStorage.getItem(k)) continue;
      localStorage.setItem(k, "1");
      if (HERE) wireSend({ type: "work.notify", title: `Sol needs ${LACK_WORDS[p.lack]}`, body: p.title });
    }
  }, [needy.map((p) => p.id).join(","), now > 0 && document.visibilityState]); // eslint-disable-line react-hooks/exhaustive-deps
  // a dense stage stays calm (the design's dense-session): one piece in full, the first that needs the person (or the one
  // they opened); every other one a single line that opens on a press
  const lead = (big && staged.some((p) => p.id === big) ? big : undefined) ?? (longOn ? staged.find((p) => p.state === "open" && p.early)?.id : undefined) ?? staged.find((p) => p.state === "open" && p.lack !== "none")?.id ?? staged[0]?.id;
  const atWork = rows.filter((r) => r.state === "working").length;
  return (
    <div className="one-app" data-one>
      <header className="one-glance" aria-label="at a glance">
        <div className="g-cell"><span className="g-q">where am I</span><span className="g-a">{g.where}</span></div>
        <div className="g-cell"><span className="g-q">what is happening</span><span className="g-a">{busy && <i className="g-dot live" />}{g.happening}</span></div>
        <button className={`g-cell ${g.needsId || g.waiting ? "hot" : ""}`} disabled={!g.needsId && !team.count} onClick={() => (g.needsId ? openBig(g.needsId) : document.querySelector<HTMLElement>(".one-team button, .one-team input")?.focus())}>
          <span className="g-q">what needs me</span><span className="g-a">{g.needs}</span></button>
        <div className="g-cell"><span className="g-q">what did I just do</span><span className="g-a"><span className="g-t">{g.did}</span>{g.didUndo && <button className="g-undo" onClick={() => void undo(g.didUndo!)}>undo <kbd>⌘Z</kbd></button>}{teamNewer && teamDid?.back && <button className="g-undo" onClick={undoTeam}>pull back <kbd>⌘Z</kbd></button>}</span></div>
      </header>
      <div className="one-body">
        <section className="one-talk" aria-label="the one session's talk">
          <div className="one-who"><span className="one-who-body" aria-hidden><Body size={34} state="settled" halo={haloDoing(busy ? "working" : "rest")} /></span><div><b>Sol</b><small>this project, kept{atWork ? ` · ${atWork} at work` : ""}{kept && (() => { const l = quietOf(kept, now).line; return l ? ` · ${l}` : ""; })()}</small></div>
            <KeptMark kept={kept} rows={rows} now={now} pressing={renewPress} err={keptErr} onRenew={renew} /></div>
          <div className="one-lines">
            {!id && !err && <p className="one-hint">opening the project…</p>}
            {id && !items.length && !err && <p className="one-hint">Say what you want, in one loose sentence. It reads it back as a goal, splits it, and starts nothing until you pick.</p>}
            {items.map((it) => <TalkLine key={it.id} it={it} onPiece={(title) => { const q = pieces.find((x) => x.title === title && x.state !== "done" && x.state !== "dropped"); if (q) openBig(q.id); }} />)}
            {busy && <p className="one-typing" aria-live="polite">thinking…</p>}
            <div ref={talkEnd} />
          </div>
          {err && <p className="one-err" role="alert">{err}</p>}
          <form className="one-say" onSubmit={(e) => { e.preventDefault(); say(); }}>
            <textarea ref={box} rows={2} value={line} placeholder="say what you want · it goes to the project's session" aria-label="say to the project"
              onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); say(); } }} />
            <button type="submit" aria-label="send" disabled={!line.trim() || !id}>↑</button>
          </form>
        </section>
        <section className="one-stage" aria-label="the stage">
          {snap && <Suspense fallback={null}><SnapBench rows={rows} folder={folder} /></Suspense>}
          <Picture rows={threads(rows)} busy={busy} now={now} onPick={(r) => { setLine((l) => `${l}${l && !l.endsWith(" ") ? " " : ""}about “${r.title}”: `); box.current?.focus(); }} />
          {longOn && <LongSince view={longView} now={now} onOpen={openBig} onGot={() => void ask({ type: "work.one.seen" }).then(fetchLong)} />}
          {longOn && <LongDials view={longView} onSet={setDial} />}
          {!awayShut && !(longOn && longView?.since && longView.since.from && now - longView.since.from >= 86_400_000) && (() => { const a = awayOf({ seen, now, rows, did, pieces }); return a && <div className="o-away-strip" role="status">
            <b>while you were away · {a.for}</b><ul>{a.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <button className="one-ghost" onClick={() => setAwayShut(true)}>got it</button></div>; })()}
          <div className="one-pieces">
            <TeamLayer />
            {!staged.length && !team.count && <div className="one-empty"><b>Nothing needs you.</b><span>{atWork ? `${atWork} session${atWork > 1 ? "s are" : " is"} at work; a piece comes here only when one needs your eye, your press, your call or your words.` : "When you ask for something, it comes back here as a piece."}</span></div>}
            {staged.map((p) => p.dial && p.state === "open" ? <div key={p.id} className="o-linepiece lg-note" data-piece={p.id}><span className="p-title">{p.say}</span>
                <PullBack kind={p.dial} onPull={() => void ask<LongView>({ type: "work.one.dial", kind: p.dial, to: "ask", piece: p.id }).then(setLongView).catch((e) => setErr(e.message))} />
                <button className="one-ghost" onClick={() => void ask({ type: "work.one.answer", id: p.id, pick: ["ok"] }).catch(() => {})}>ok</button></div>
              : p.id === lead || p.state === "sent" ? <PieceView key={p.id} p={p} now={now} rows={rows} onUndo={undo} onErr={setErr} />
              : <LinePiece key={p.id} p={p} now={now} onOpen={() => openBig(p.id)} onUndo={undo} />)}
          </div>
          {old.length > 0 && <div className="one-earlier"><button className="one-ghost" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}>{showEarlier ? "hide" : "earlier"} · {old.length}</button>
            {showEarlier && <ul>{old.map((p) => <li key={p.id}><span className={`o-chip ${p.lack}`}>{LACK_WORDS[p.lack]}</span>{p.title}<small>{p.state === "dropped" ? "put away" : p.state === "acted" ? `you said: ${(p.answer?.text ?? p.answer?.pick?.join(", ") ?? "").slice(0, 60)}` : "done"}</small></li>)}</ul>}</div>}
        </section>
      </div>
    </div>
  );
}

// the engine's words to the one session, as the person reads them: no ids, no instructions meant for the model
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const plain = (t: string) => t.replace(/\nSay in one line[\s\S]*$/, "").replace(/\nResult: (\w+)\. Say it in one line[\s\S]*$/, " · $1").replace(/\nIf a place in it needs[\s\S]*$/, "").replace(/^\S+: (\d\. )/gm, "$1").replace(/ \((each reports back here[^)]*)\)/, "").replace(/\s*\(\s*\)/g, "")
  .replace(/The engine started: ([^\n]*)/, (_, l: string) => { const n = (l.match(UUID) ?? []).length; return `started ${n} session${n > 1 ? "s" : ""}`; })
  .replace(/The engine sent it to: ([^\n]*)/, (_, l: string) => { const n = (l.match(UUID) ?? []).length; return `sent to ${n} session${n > 1 ? "s" : ""}`; })
  .replace(/^- (.+?) \(([0-9a-f-]{36})\):/gm, "$1:").replace(UUID, "a session");
// an error in its turn is shown, in plain words: a turn that failed must never read as "all quiet"
const shown = (it: Item) => it.kind === "me" || it.kind === "you" || it.kind === "error" || (it.kind === "tool" && /one_piece$/.test(String(it.tool ?? "")));
export const errWords = (t: string) => /authenticat|oauth|log ?in|401/i.test(t) ? "it could not sign in to Claude, so nothing it was asked was done. Sign in again in Settings, then say it again."
  : /overloaded|529|rate.?limit|429/i.test(t) ? "Claude is busy right now; nothing was done. Say it again in a minute."
  : `its turn failed, nothing was done: ${t.slice(0, 160)}`;
function TalkLine({ it, onPiece }: { it: Item; onPiece: (title: string) => void }) {
  if (it.kind === "error") return <p className="one-line err" role="alert"><span>did not go</span> {errWords(String(it.text ?? ""))}</p>;
  if (it.kind === "tool") { const title = String(it.input?.title ?? ""); return <p className="one-line chipline"><button className="chip-piece" onClick={() => onPiece(title)} title="open it on the stage">▢ {title ? `“${title.slice(0, 48)}”, on the stage` : "a piece, on the stage"}</button></p>; }
  const t = String(it.text ?? "");
  const m = /^<(piece answered|the person took back|the person put away|the person pulled you back|reports from your sessions|message from|a built row ran|a row was built)[^>]*>\n?([\s\S]*)$/.exec(t);
  if (it.kind === "me" && m) return <p className="one-line sys"><span>{m[1] === "reports from your sessions" ? "reports came in" : m[1] === "piece answered" ? "your answer went" : m[1] === "the person took back" ? "you took it back" : m[1] === "the person put away" ? "you put it away" : m[1] === "the person pulled you back" ? "you pulled it back" : m[1] === "a built row ran" ? "a row you built ran" : m[1] === "a row was built" ? "you built a row; it looks where your hand belongs" : m[1]}</span> {plain(m[2]).slice(0, 220)}</p>;
  if (it.kind === "me" && t.startsWith("You are the one session")) return <p className="one-line sys"><span>the project's session was made</span> kept from now on, across restarts</p>;
  return <p className={`one-line ${it.kind}`}>{it.kind === "you" ? bold(t) : t}</p>;
}

// its words as the person reads them: **this** is bold, `this` is plain; nothing else of markdown is drawn
function bold(t: string) {
  return t.replace(/`([^`\n]+)`/g, "$1").split(/\*\*([^*\n]+)\*\*/).map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));
}

// a piece drawn small: one line, its title, what it lacks from the person, and (once it went) its undo; a press opens it
function LinePiece({ p, now, onOpen, onUndo }: { p: Piece; now: number; onOpen: () => void; onUndo: (id: string) => void }) {
  return <div className={`o-linepiece ${p.state} lack-${p.lack}`} data-line={p.id}>
    <button className="o-lp-open" onClick={onOpen} aria-label={`${p.title}: needs ${LACK_WORDS[p.lack]}. Open it`}>
      <span className="p-title">{p.title}</span>
      {p.state === "open" ? <span className={`o-chip ${p.lack}`}>{LACK_WORDS[p.lack]}</span> : <span className="o-going">{goingOf(p, now)}</span>}
    </button>
    {p.state === "acted" && <button className="o-undo small" onClick={() => onUndo(p.id)}>undo</button>}
  </div>;
}

function Jelly({ busy, size = 34 }: { busy: boolean; size?: number }) {
  return <span className={`o-jelly ${busy ? "busy" : ""}`} style={{ width: size, height: size }} aria-hidden><i /><i /></span>;
}

// the sessions the one runs, as one picture: the jelly, a thread to each; pink waits on you, green works, grey rests
function Picture({ rows, busy, now, onPick }: { rows: Row[]; busy: boolean; now: number; onPick: (r: Row) => void }) {
  const lines = byGoal(rows), H = Math.max(120, lines.length * 30 + 24);
  const machines = [...new Set(rows.filter((r) => r.state === "working" || r.mine).map((r) => r.machine).filter(Boolean))];
  return (
    <figure className="one-picture" aria-label="what is happening">
      <svg viewBox={`0 0 300 ${H}`} preserveAspectRatio="xMinYMid meet" style={{ height: H }}>
        {lines.map((l, i) => {
          if (!("row" in l)) return null;
          const y = 12 + (i + 0.5) * ((H - 24) / Math.max(1, lines.length));
          return <path key={l.row.id} className={`o-thread ${l.row.state}`} d={`M70 ${H / 2} C 160 ${H / 2}, 200 ${y}, 300 ${y}`} />;
        })}
      </svg>
      <div className="pic-jelly" style={{ top: H / 2 - 22 }}><Jelly busy={busy} size={44} /><small>the project, kept</small></div>
      <ol className="pic-rows" style={{ height: H }}>
        {lines.map((l) => "head" in l ? <li key={`h:${l.head}`} className="pic-head">{l.head}</li> : (
          <li key={l.row.id}><button className={`pic-row ${l.row.state}`} onClick={() => onPick(l.row)} title={`${l.row.title}\ndoing: ${l.row.doing}\nwaits on: ${l.row.waits}\n(click: ask the project's session about it)`}>
            <i className={`o-dot ${l.row.state}`} /><span className="t">{titleOf(l.row.title)}</span>
            <span className="w">{rowLine(l.row, now)}</span>{l.row.state === "working" && <span className="o-work" aria-hidden><i /></span>}{l.row.mine && <span className="o-mine">yours</span>}
          </button></li>))}
        {!rows.length && <li className="pic-none">no other sessions yet</li>}
      </ol>
      {rows.some((r) => r.page) && <div className="pic-making" aria-label="what they are making, live">
        {rows.filter((r) => r.page).slice(0, 3).map((r) => <button key={r.id} className={`pic-thumb ${r.state}`} onClick={() => onPick(r)} title={`${r.title}: what it is making (click: ask about it)`}>
          <span className="pic-thumb-in"><PageView path={r.page!} thumb k={r.updatedAt} /></span><small>{r.state === "working" ? <><i className="o-dot working" /> making it now</> : titleOf(r.title)}</small></button>)}
      </div>}
      {machines.length > 0 && <figcaption className="pic-where">{`runs on ${machines.join(", ")}`}{HERE ? " · this computer" : " · your computer is free"}</figcaption>}
    </figure>
  );
}

function PieceView({ p, now, rows, onUndo, onErr }: { p: Piece; now: number; rows: Row[]; onUndo: (id: string) => void; onErr: (s: string) => void }) {
  const [d, setD] = useState<Draft>(() => draftOf(p, drafts.get(p.id)));
  const [hold, setHold] = useState(0);
  const holdT = useRef<number | undefined>(undefined);
  useEffect(() => { if (p.state === "open" && !drafts.has(p.id)) setD(draftOf(p)); }, [p.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = (x: Draft) => { drafts.set(p.id, x); setD(x); };
  const open = p.state === "open";
  const s = sendOf(p, d);
  const send = () => {
    if (!open || !s.ok) return;
    void ask({ type: "work.one.answer", id: p.id, ...answerOf(p, d) }).then(() => { setTimeout(() => document.querySelector<HTMLElement>(`[data-piece="${p.id}"] .o-undo`)?.focus(), 30); }).catch((e) => onErr(e.message));
  };
  const drop = () => void ask({ type: "work.one.drop", id: p.id }).catch((e) => onErr(e.message));
  const keys = (e: RKey) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } };
  // hold to go ahead: by pointer, or by Space or Enter held
  const holdOn = () => { if (!open || !s.ok || holdT.current) return; const t0 = Date.now(); holdT.current = window.setInterval(() => { const f = Math.min(1, (Date.now() - t0) / 700); setHold(f); if (f >= 1) { holdOff(); send(); } }, 30); };
  const holdOff = () => { clearInterval(holdT.current); holdT.current = undefined; setHold(0); };
  const rowOf = (sid?: string) => rows.find((r) => r.id === sid);
  // the first focus never lands where one key commits (detail.md): on a picture that takes marks, it is "mark a place"
  let first = open && ((!!p.shows?.marks && (p.shows.form === "thing" || p.shows.form === "two")) || !!p.shows?.futures);
  const firstMark = () => (first ? {} : ((first = true), { "data-first": "" }));
  return (
    <article className={`o-piece ${p.state} lack-${p.lack}`} data-piece={p.id} onKeyDown={keys} aria-label={`${p.title}: needs ${LACK_WORDS[p.lack]}`}>
      <header><span className="p-title">{p.title}</span>{p.decided && <span className="lg-tag decided" title="your dial for these says I decide; undo takes it back">I decided</span>}{p.early && p.state === "open" && <span className="lg-tag early" title="your answers changed these before: asked first">your answer counts here</span>}<span className={`o-chip ${p.lack}`}>{LACK_WORDS[p.lack]}</span></header>
      <div className="p-say"><Jelly busy={false} size={22} /><p>{p.say}</p></div>
      {p.shows && <ShowsView s={p.shows} order={isOrder(p) ? d.pick : undefined} open={open} onMove={(i, by) => put(moveStep(d, i, by))} onDrag={(i, j) => put(moveTo(d, i, j))} first={firstMark}
        pick={d.pick[0]} onPick={(k) => put(pressPick(p, d, k))} marks={d.marks ?? []} onMark={(m) => put(putMark(d, m))} onNote={(i, t) => put(noteMark(d, i, t))} />}
      {p.shows && (p.shows.may || p.shows.mayNot || p.shows.willExist) && <div className="o-reins" aria-label="what it may do while you are away">
        {p.shows.willExist && <p className="o-will"><small>when you are back</small>{p.shows.willExist}</p>}
        {p.shows.may && <ul className="o-may"><li className="o-cap">it may</li>{p.shows.may.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {p.shows.mayNot && <ul className="o-may not"><li className="o-cap">it may not</li>{p.shows.mayNot.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </div>}
      {p.shows && (p.shows.why || p.shows.cost || p.shows.risk) && <dl className="o-meta">
        {p.shows.why && <><dt>why</dt><dd>{p.shows.why}</dd></>}{p.shows.cost && <><dt>cost</dt><dd>{p.shows.cost}</dd></>}{p.shows.risk && <><dt>risk</dt><dd>{p.shows.risk}</dd></>}</dl>}
      {p.kind === "split" && <ul className="o-parts" role="group" aria-label="the parts: each one session's work">
        {(p.parts ?? []).map((x) => {
          const on = d.pick.includes(x.id), to = rowOf(x.reuse);
          return <li key={x.id}><button {...firstMark()} className={`o-part ${on ? "on" : ""}`} role="checkbox" aria-checked={on} disabled={!open} onClick={() => put(pressPick(p, d, x.id))}>
            <i className="o-box">{on ? "✓" : ""}</i><span className="pt">{x.title}</span><span className="pw">{x.reuse ? `goes to “${titleOf(to?.title ?? "its session")}”` : "a new session"}</span>
            <span className="pp">{x.prompt.split("\n")[0].replace(/\/(home|Users)\/[^/\s]+/g, "~").slice(0, 140)}</span></button></li>;
        })}
      </ul>}
      {p.kind === "split" && d.pick.length > 0 && <div className="o-free" role="radiogroup" aria-label="while they work">
        <span>while {(p.parts?.length ?? 0) > 1 ? "they work" : "it works"}</span>
        {([["edits", "changes files on its own", "in its folder; a command still asks you"], ["ask", "asks me each step", "every file and command waits on your allow"]] as const).map(([k, l, t]) =>
          <button key={k} role="radio" aria-checked={(d.free ?? "edits") === k} className={`o-choice ${(d.free ?? "edits") === k ? "on" : ""}`} disabled={!open} title={t} onClick={() => put({ ...d, free: k })}>{l}</button>)}
      </div>}
      {(p.kind === "call" || p.kind === "eye" || (p.kind === "needs" && !!p.choices?.length)) && !p.shows?.futures && <div className="o-choices" role="radiogroup" aria-label="choices">
        {(p.choices ?? (p.kind === "eye" ? ["looks right", "not right"] : [])).map((c) =>
          <button key={c} {...firstMark()} role="radio" aria-checked={d.pick[0] === c} className={`o-choice ${d.pick[0] === c ? "on" : ""}`} disabled={!open} onClick={() => put(pressPick(p, d, c))}>{c}</button>)}
      </div>}
      {p.kind === "needs" && p.session && <p className="p-who">from <b>{titleOf(rowOf(p.session)?.title ?? "its session")}</b>{rowOf(p.session)?.doing && rowOf(p.session)!.doing !== "nothing said yet" ? `: “${rowOf(p.session)!.doing.slice(0, 160)}”` : ""}</p>}
      <footer>
        {(p.kind === "goal" || p.kind === "needs" || p.kind === "split" || p.kind === "call" || p.kind === "eye") &&
          <input {...((p.kind === "goal" || p.kind === "needs") && !p.choices?.length ? firstMark() : {})} className={`p-box ${!d.text && p.guess ? "guess" : ""}`} disabled={!open} value={d.text}
            placeholder={(p.kind === "goal" || p.kind === "needs") && !p.choices?.length ? (p.guess ? `its guess: ${p.guess}` : "your words") : "but… (optional) · enter sends"}
            aria-label={p.kind === "goal" ? "your words: keep its guess or write yours" : "your words"}
            onChange={(e) => put({ ...d, text: e.target.value, typed: true })}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (d.text.trim() || p.kind !== "goal") send(); } if (e.key === "Escape") (e.target as HTMLElement).blur(); }} />}
        {open && p.kind === "press" && <button {...firstMark()} className="o-send o-hold" style={{ ["--f" as any]: hold }} onPointerDown={holdOn} onPointerUp={holdOff} onPointerLeave={holdOff}
          onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); holdOn(); } }} onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") holdOff(); }}>
          {hold > 0 ? "keep holding" : s.label}</button>}
        {open && p.kind !== "press" && <button {...firstMark()} className="o-send" disabled={!s.ok} onClick={send} title="⌘↵ sends from anywhere in the piece">{s.label}</button>}
        {open && <button className="o-drop" onClick={drop} title="put it away without answering">put away</button>}
        {(p.state === "sent" || p.state === "acted") && <><span className="o-going" aria-live="polite">{goingOf(p, now)}</span><button className="o-undo" onClick={() => onUndo(p.id)}>undo</button></>}
      </footer>
    </article>
  );
}

const pic = (path: string) => `${ENGINE_HTTP}/pane-image?path=${encodeURIComponent(path.trim())}`;
// what a piece shows, beside its sentence: the thing, two states with a wipe, an order to rearrange, proof, while away
type ShowsProps = { s: Shows; order?: string[]; open: boolean; onMove: (i: number, by: -1 | 1) => void; onDrag: (i: number, j: number) => void; first: () => object;
  pick?: string; onPick: (k: string) => void; marks: Mark[]; onMark: (m: Mark) => void; onNote: (i: number, t: string) => void };
function ShowsView({ s, order, open, onMove, onDrag, first, pick, onPick, marks, onMark, onNote }: ShowsProps) {
  const [wipe, setWipe] = useState(50);
  const [dragging, setDragging] = useState<number | null>(null);
  // marks: a click on the picture puts a numbered mark there; by keys, "mark a place" aims in the middle, arrows move, Enter marks
  const [aim, setAim] = useState<Mark | null>(null);
  const canMark = !!s.marks && open;
  const at = (e: RMouse<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10 }; };
  const aimKeys = (e: RKey) => {
    if (!aim) return; const st = e.shiftKey ? 12 : 4;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
    if (mv[e.key]) { e.preventDefault(); setAim({ x: Math.max(0, Math.min(100, aim.x + mv[e.key][0])), y: Math.max(0, Math.min(100, aim.y + mv[e.key][1])) }); }
    if (e.key === "Enter") { e.preventDefault(); onMark(aim); setAim(null); setTimeout(() => document.querySelector<HTMLInputElement>(".o-mark-notes li:last-child input")?.focus(), 30); }
    if (e.key === "Escape") { e.preventDefault(); setAim(null); }
  };
  const pins = (s.marks || marks.length > 0) && <>
    {marks.map((m, i) => <i key={i} className="o-pin" style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</i>)}
    {aim && <i className="o-pin aim" style={{ left: `${aim.x}%`, top: `${aim.y}%` }} />}
  </>;
  const markBar = s.marks && <div className="o-markbar">
    {canMark && <button data-first="" className="o-ghost-s" onClick={() => setAim(aim ? null : { x: 50, y: 50 })} onKeyDown={aimKeys} aria-pressed={!!aim}>{aim ? "arrows move · enter marks · esc stops" : "mark a place"}</button>}
    {!aim && <small>{marks.length ? "a mark: say why beside it · press it again on the picture to take it away" : "press on the picture where something is off"}</small>}
    {marks.length > 0 && <ol className="o-mark-notes">{marks.map((m, i) => <li key={i}><b>{i + 1}</b><input disabled={!open} value={m.note ?? ""} placeholder="why here (optional)" aria-label={`mark ${i + 1}: why here`} onChange={(e) => onNote(i, e.target.value)} /></li>)}</ol>}
  </div>;
  if (s.form === "thing" && s.page) return <><figure className="o-thing o-page"><PageView path={s.page} />
    {canMark && aim !== null && <div className="o-page-veil markable" onClick={(e) => onMark(at(e))} aria-hidden />}{pins}</figure>
    {markBar}</>;
  if (s.form === "thing" && isPicture(s.image)) return <><figure className={`o-thing ${canMark ? "markable" : ""}`} onClick={(e) => canMark && onMark(at(e))}><img src={pic(s.image!)} alt="the thing itself" />{pins}</figure>{markBar}</>;
  if (s.form === "futures" && s.futures) return <FuturesView fs={s.futures} pick={pick} open={open} onPick={onPick} />;
  // two takes in the real thing: two pages a session wrote, live side by side, named; the pick is which one
  const isPage = (v?: string) => !!v && /^\/.+\.html?$/i.test(v.trim());
  if (s.form === "two" && isPage(s.before) && isPage(s.after)) return (
    <div className="o-takes" aria-label="two takes, live, side by side">
      {[s.before!, s.after!].map((path, i) => <figure key={path} className={`o-take ${pick && pick === (s.names?.[i] ?? (i ? "after" : "before")) ? "on" : ""}`}>
        <div className="o-take-in"><PageView path={path} /></div><figcaption>{s.names?.[i] ?? (i ? "after" : "before")}</figcaption></figure>)}
    </div>);
  if (s.form === "two" && isPicture(s.before) && isPicture(s.after)) return (<>
    <figure className={`o-two ${canMark ? "markable" : ""}`} aria-label="before and after" onClick={(e) => { if (canMark && !(e.target as HTMLElement).closest("input")) onMark(at(e)); }}>{pins}
      <img src={pic(s.before!)} alt="before" />
      <img src={pic(s.after!)} alt="after" style={{ clipPath: `inset(0 0 0 ${wipe}%)` }} />
      <i className="o-wipe-line" style={{ left: `${wipe}%` }} />
      <span className="o-tag l">{s.names?.[0] ?? "before"}</span><span className="o-tag r">{s.names?.[1] ?? "after"}</span>
      <input className="o-wipe" type="range" min={0} max={100} value={wipe} onChange={(e) => setWipe(Number(e.target.value))} aria-label={`wipe between ${s.names?.[0] ?? "before"} and ${s.names?.[1] ?? "after"} (arrow keys)`} />
    </figure>{markBar}</>);
  if (s.form === "two") return <div className="o-two-words"><div><small>{s.names?.[0] ?? "before"}</small><p>{s.before}</p></div><div><small>{s.names?.[1] ?? "after"}</small><p>{s.after}</p></div></div>;
  if (s.form === "order" && order) { const before = s.steps ?? [], moved = order.join("\n") !== before.join("\n"); return (<div className={`o-order-wrap ${moved ? "moved" : ""}`}>
    <ol className="o-order" aria-label="the order: move a step with its arrows, or Alt and the arrow keys">
      {order.map((x, i) => <li key={x} draggable={open} className={dragging === i ? "dragging" : ""}
        onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", x); }} onDragEnd={() => setDragging(null)}
        onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (dragging !== null) onDrag(dragging, i); setDragging(null); }}>
        <i className="o-grip" aria-hidden title="drag to move">⋮⋮</i><span className="o-n">{i + 1}</span><span className="o-st">{x}</span>
        <button {...(i === 0 ? first() : {})} disabled={!open || i === 0} aria-label={`move “${x}” up`} onClick={() => onMove(i, -1)}
          onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); onMove(i, e.key === "ArrowUp" ? -1 : 1); } }}>↑</button>
        <button disabled={!open || i === order.length - 1} aria-label={`move “${x}” down`} onClick={() => onMove(i, 1)}>↓</button>
        {moved && before.indexOf(x) !== i && <small className="o-was">was {before.indexOf(x) + 1}</small>}</li>)}
    </ol>
    {moved && <ol className="o-order before" aria-label="as it was"><li className="o-cap">as it was</li>{before.map((x, i) => <li key={x}><span className="o-n">{i + 1}</span><span className="o-st">{x}</span></li>)}</ol>}
  </div>); }
  if (s.form === "order") return <ol className="o-order">{(s.steps ?? []).map((x, i) => <li key={x}><span className="o-n">{i + 1}</span><span className="o-st">{x}</span></li>)}</ol>;
  if (s.form === "proof" && s.checks?.length) return (
    <div className="o-proof" aria-label={`proof: ${proofLine(s.checks)}`}>
      <div className="o-checks">{s.checks.map((c, i) => <i key={i} className={`o-check ${c.state}`} title={`${c.name}: ${c.state}`} />)}</div>
      <small>{proofLine(s.checks)}</small>
    </div>);
  const grid = s.form === "away" && s.lines?.length ? gridOf(s.lines) : null;
  if (grid) { const cols = STATES.filter((c) => grid.threads.some((t) => t.cells[c]?.length)); return (
    <div className="o-grid" role="table" aria-label="where we are: a row per thread" style={{ gridTemplateColumns: `minmax(120px, auto) repeat(${cols.length}, minmax(0, 1fr))` }}>
      <span role="columnheader" />{cols.map((c) => <span key={c} role="columnheader" className={`o-gh ${c.replace(" ", "-")}`}>{c}</span>)}
      {grid.threads.map((t) => <div key={t.name} role="row" className="o-grow"><b role="rowheader">{t.name}</b>
        {cols.map((c) => <span key={c} role="cell" className={`o-gc ${c.replace(" ", "-")}`}>{(t.cells[c] ?? []).map((x, i) => <i key={i}>{x}</i>)}</span>)}</div>)}
      {grid.rest.length > 0 && <p className="o-grest">{grid.rest.join(" · ")}</p>}
    </div>); }
  const secs = s.form === "away" && s.lines?.length && !grid ? sectionsOf(s.lines) : null;
  if (secs) return <div className="o-reins">{secs.map((x, i) => x.kind === "will" || x.kind === "plain"
    ? <div key={i} className="o-will"><small>{x.head}</small><ul className="o-will-list">{x.items.map((y, k) => <li key={k}>{y}</li>)}</ul></div>
    : <ul key={i} className={`o-may ${x.kind === "not" ? "not" : ""}`}><li className="o-cap">{x.head}</li>{x.items.map((y, k) => <li key={k}>{y}</li>)}</ul>)}</div>;
  if (s.form === "away" && s.lines?.length) return <ul className="o-away">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>;
  return null;
}

// futures: two or three ways it could go, side by side; each a line of what follows, and what it costs. The way is the pick.
function FuturesView({ fs, pick, open, onPick }: { fs: Future[]; pick?: string; open: boolean; onPick: (k: string) => void }) {
  const i0 = Math.max(0, fs.findIndex((f) => f.name === pick));
  const keys = (e: RKey, i: number) => {
    const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % fs.length : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + fs.length) % fs.length : -1;
    // the group is read now: after the event, its target is gone and focus would stay behind the pick
    if (j >= 0) { e.preventDefault(); const group = e.currentTarget.parentElement; onPick(fs[j].name); setTimeout(() => (group?.children[j] as HTMLElement | undefined)?.focus(), 0); }
  };
  return <div className="o-futures" role="radiogroup" aria-label="the ways it could go: pick one">
    {fs.map((f, i) => <button key={f.name} {...(i === i0 && open ? { "data-first": "" } : {})} role="radio" aria-checked={pick === f.name} tabIndex={i === i0 ? 0 : -1} disabled={!open}
      className={`o-future ${pick === f.name ? "on" : pick ? "off" : ""}`} onClick={() => onPick(f.name)} onKeyDown={(e) => keys(e, i)}>
      <b>{f.name}</b>{f.says && <span className="o-fs">{f.says}</span>}
      {!!f.ticks?.length && <span className="o-line" aria-hidden><i className="o-now" />{f.ticks.map((t, k) => <span key={k} className={`o-tick ${t.at <= 12 ? "l" : t.at >= 88 ? "r" : ""}`} style={{ left: `${t.at}%` }}><i /><em title={t.label}>{t.label}</em></span>)}</span>}
      {f.cost && <span className="o-fcost">{f.cost}</span>}
    </button>)}
  </div>;
}

// the thing itself, live: a page a session wrote, served by the engine as the page pane serves it (work/page.ts), so it
// can be used right on the piece (press its buttons); "mark a place" lays a veil over it to mark instead
function PageView({ path, thumb, k }: { path: string; thumb?: boolean; k?: number }) {
  const [src, setSrc] = useState(""), [err, setErr] = useState("");
  useEffect(() => {
    const i = path.lastIndexOf("/"), dir = path.slice(0, i) || "/", file = path.slice(i + 1);
    void ask<{ assetKey?: string; error?: string }>({ type: "work.read", cwd: dir, path: file }).then((r) => {
      if (r.error || !r.assetKey) { setErr(r.error ?? "it could not be read"); return; }
      setSrc(`${ENGINE_HTTP}/pane-asset/k.${r.assetKey}/${encodeURIComponent(dir)}/${encodeURIComponent(file)}`);
    }).catch((e) => setErr(String(e.message ?? e)));
  }, [path, k]);
  if (err) return <p className="o-page-err">the page could not be shown: {err}</p>;
  if (thumb) return src ? <iframe className="pic-thumb-frame" src={`${src}?v=${k ?? 0}`} title="what it is making" sandbox="allow-scripts" tabIndex={-1} aria-hidden /> : null;
  return src ? <iframe className="o-page-frame" src={src} title="the page itself" sandbox="allow-scripts allow-forms" /> : <div className="o-page-frame wait">opening the page…</div>;
}
