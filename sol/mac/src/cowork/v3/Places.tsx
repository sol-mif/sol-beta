// Cowork v3, slice 4 (fr-30, #557; the PRD path 5): Places, one picture. The project in the middle, each place around
// it with its own mark, what it holds and the kinds of new things routed to it as chips; drag a chip to another place
// and new ones of that kind go there (the others agree first, on a card). A place opens its card: the reach (what Sol
// reads, writes, never) and Revoke, one press. A red place carries Sign in again. Connecting shows the reach before
// the grant and the same picture after it. Let in: each place grants it here or says who to ask. The record's
// fullness is a ring on its disc, and an arc says where files go when it is full.
// The engine is the one source (team.v3.places.*, answered as work.v3.places.* with the whole picture); signing in is
// today's own flows (team.github.connect, team.drive.connect). Loaded only with the switch on (CoworkApp.tsx).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Team } from "../useTeam";
import { openUrl } from "../util";
import { askV3 } from "./ask";
import "./places.css";

type PlaceKind = "record" | "github" | "drive" | "calendar" | "folder";
type Reach = { root: string; reads: string[]; writes: string[]; never: string[] };
type Place = { id: string; kind: PlaceKind; label: string; name: string; by?: string; state: "ok" | "red" | "revoked"; line: string;
  signIn?: "github" | "google"; touched?: number; count?: { n: number; unit: string }; kinds: { kind: string; label: string; n?: number }[]; reach: Reach };
type View = { project: string; name: string; me: string; guest: boolean; places: Place[]; routing: Record<string, string>;
  record: { used: number; of: number; unit: string; high: boolean; full: boolean; overflow: string; line: string } | null; next: Record<string, string>; open: PlaceKind[] };
type Ans = { error?: string; view?: View; token?: string; until?: number; line?: string; ask?: string[]; signIn?: "github" | "google";
  reach?: Reach; signedIn?: boolean; place?: { kind: PlaceKind; name: string; label: string }; access?: Access[]; person?: string };
type Access = { place: string; name: string; label: string; can: "in" | "grant" | "ask"; ask?: string; line: string };

// each place's own mark, monochrome (the prototype's marks; a folder is the machine it lives on)
const MARK: Record<string, [string, string]> = {
  drive: ["0 0 24 24", '<path d="M8.2 3h7.6l6.7 11.4h-7.6z" fill="currentColor" opacity=".45"/><path d="M8.2 3 1.5 14.4l3.8 6.5 6.7-11.4z" fill="currentColor"/><path d="M5.3 20.9h13.4l3.8-6.5H9.1z" fill="currentColor" opacity=".72"/>'],
  github: ["0 0 16 16", '<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>'],
  calendar: ["0 0 24 24", '<rect x="3" y="4" width="18" height="17" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9.5h18" stroke="currentColor" stroke-width="1.6"/><path d="M3 7.5A3.5 3.5 0 0 1 6.5 4h11A3.5 3.5 0 0 1 21 7.5v2H3z" fill="currentColor"/><text x="12" y="18.6" text-anchor="middle" font-size="8.5" font-weight="600" fill="currentColor" font-family="-apple-system,Helvetica,Arial">2</text>'],
  record: ["0 0 24 24", '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>'],
  folder: ["0 0 24 24", '<rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.6"/>'],
};
const KIND_GLYPH: Record<string, string> = {
  code: '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  documents: '<path d="M4 1.8h5.5L12.5 5v9.2H4z M9.3 1.8V5h3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
  dates: '<rect x="2.2" y="3" width="11.6" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.2 6.5h11.6M5.3 1.6v2.6M10.7 1.6v2.6" stroke="currentColor" stroke-width="1.3"/>',
  items: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/>',
};
const Mark = ({ kind, size = 24 }: { kind: string; size?: number }) => {
  const m = MARK[kind] ?? MARK.record;
  return <span className="v3-pl-mark" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: `<svg viewBox="${m[0]}">${m[1]}</svg>` }} />;
};
const Glyph = ({ kind }: { kind: string }) => <span className="glyph" dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 16 16">${KIND_GLYPH[kind] ?? KIND_GLYPH.items}</svg>` }} />;
const Face = ({ who, me }: { who: string; me: string }) => <span className={`v3-pl-face ${who.toLowerCase() === me.toLowerCase() ? "v3-pl-me" : ""}`} title={who.toLowerCase() === me.toLowerCase() ? "on your sign-in" : `on ${who}'s sign-in`}>{who.slice(0, 1).toUpperCase()}</span>;
const NAME: Record<string, string> = { github: "GitHub", drive: "Google Drive", calendar: "Calendar", folder: "A folder", record: "Sol's record" };
const SIGN: Record<string, string> = { github: "GitHub", google: "Google" };

// the picture's geometry: an ellipse around the project, the empty seat (connect a place) last
const W = 1000, H = 520, CX = 500, CY = 250, RX = 360, RY = 180;
const posOf = (i: number, n: number) => { const a = (-90 + (360 * (i + 0.5)) / n + 18) * Math.PI / 180; return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) }; };

export function Places({ team, project, name }: { team: Team; project: string; name: string }) {
  const [view, setView] = useState<View | null>(null);
  const [say, setSay] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [fan, setFan] = useState(false);
  const [undo, setUndo] = useState<{ token: string; line: string; until: number } | null>(null);
  const [agree, setAgree] = useState<{ kind: string; to: string; line: string; ask: string[] } | null>(null);
  const [connect, setConnect] = useState<{ kind: PlaceKind; again?: boolean } | null>(null);
  const [fresh, setFresh] = useState("");
  const ask = useCallback((type: string, body: object = {}, wait?: number) => askV3<Ans>(`team.v3.places.${type}`, { project, ...body }, wait), [project]);
  const took = useCallback((r: Ans) => { if (r.view) setView(r.view); if (r.error) setSay(r.error); else setSay(""); return r; }, []);
  useEffect(() => { void ask("read").then(took); const t = window.setInterval(() => void ask("read").then((r) => r.view && setView(r.view)), 20_000); return () => window.clearInterval(t); }, [ask, took]);

  const reroute = async (kind: string, to: string, agreed = false) => {
    const r = took(await ask("reroute", { kind, place: to, agreed }));
    if (r.ask?.length) { setAgree({ kind, to, line: r.line ?? "", ask: r.ask }); return; }
    setAgree(null);
    if (r.token && r.until) { setUndo({ token: r.token, line: r.line ?? "", until: r.until }); setFresh(kind); }
  };
  const revoke = async (id: string) => {
    const r = took(await ask("revoke", { place: id }));
    if (r.token && r.until) setUndo({ token: r.token, line: r.line ?? "", until: r.until });
    setFocus(null);
  };
  const takeBack = async () => { if (!undo) return; const u = undo; setUndo(null); took(await ask("undo", { token: u.token })); };

  if (!view) return <div className="v3-pl"><Head name={name} guest={false} /><div className="v3-pl-sky v3-pl-wait">{say || "reading the places…"}</div></div>;
  const guest = view.guest;
  const seats = view.places.length + (view.open.length && !guest ? 1 : 0);
  const at: Record<string, { x: number; y: number }> = {};
  view.places.forEach((p, i) => { at[p.id] = posOf(i, seats); });
  const add = posOf(view.places.length, seats);
  const focused = view.places.find((p) => p.id === focus) ?? null;

  return (
    <div className="v3-pl">
      <Head name={view.name || name} guest={guest} />
      <Sky view={view} at={at} add={view.open.length && !guest ? add : null} focus={focus} fresh={fresh} fan={fan}
        onFocus={(id) => { setFan(false); const p = view.places.find((x) => x.id === id); if (p?.state === "revoked" && !guest) setConnect({ kind: p.kind }); else setFocus((f) => (f === id ? null : id)); }}
        onFan={() => setFan((f) => !f)} onConnect={(k) => { setFan(false); setConnect({ kind: k }); }}
        onSignIn={(p) => setConnect({ kind: p.kind, again: true })} onDrop={(kind, to) => void reroute(kind, to)} />
      <div className="v3-pl-under">
        {say && <p className="v3-pl-say" role="status">{say}</p>}
        {undo && <UndoLine u={undo} onUndo={takeBack} onGone={() => setUndo(null)} />}
        {agree && <div className="v3-pl-agree" role="group" aria-label="the others agree first">
          <span className="faces">{agree.ask.map((w) => <Face key={w} who={w} me={view.me} />)}</span>
          <span className="t">{agree.line}</span>
          <button className="v3-pl-press ink" onClick={() => void reroute(agree.kind, agree.to, true)}>They agree, change it</button>
          <button className="v3-pl-press ghost" onClick={() => setAgree(null)}>Not now</button>
        </div>}
        {focused && <PlaceCard p={focused} view={view} onRevoke={() => void revoke(focused.id)} onSignIn={() => setConnect({ kind: focused.kind, again: true })}
          onOverflow={(id) => void ask("overflow", { place: id }).then((r) => { took(r); if (r.token && r.until) setUndo({ token: r.token, line: r.line ?? "", until: r.until }); })} />}
        {!guest && <LetIn ask={ask} me={view.me} />}
      </div>
      {connect && <Connect team={team} kind={connect.kind} again={!!connect.again} had={view.places.find((p) => p.kind === connect.kind)} ask={ask}
        onView={(v) => setView(v)} onRevoke={(id) => { setConnect(null); void revoke(id); }} onClose={() => setConnect(null)} />}
    </div>
  );
}

function Head({ name, guest }: { name: string; guest: boolean }) {
  return (
    <header className="v3-pl-head">
      <span className="v3-pl-kicker">places<i className="v3-pl-tabline" /></span>
      <h1>Where {name} lives</h1>
      <p>{guest ? "Links, not copies. Set by the members." : "Links, not copies. Each place carries what goes to it: drag a kind to another place to change where new ones go."}</p>
    </header>
  );
}

function Sky({ view, at, add, focus, fresh, fan, onFocus, onFan, onConnect, onSignIn, onDrop }: {
  view: View; at: Record<string, { x: number; y: number }>; add: { x: number; y: number } | null; focus: string | null; fresh: string; fan: boolean;
  onFocus: (id: string) => void; onFan: () => void; onConnect: (k: PlaceKind) => void; onSignIn: (p: Place) => void; onDrop: (kind: string, to: string) => void;
}) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<{ kind: string; label: string; x: number; y: number; ox: number; oy: number; hot: string | null } | null>(null);
  const lift = (e: React.PointerEvent, k: { kind: string; label: string }) => {
    if (view.guest) return;
    e.preventDefault(); e.stopPropagation();
    const r0 = (e.currentTarget as HTMLElement).getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    let moved = false, hot: string | null = null;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true; hot = null;
      for (const [id, el] of nodes.current) {
        const p = view.places.find((x) => x.id === id), b = el.getBoundingClientRect();
        if (p && p.state !== "revoked" && ev.clientX > b.left - 10 && ev.clientX < b.right + 10 && ev.clientY > b.top - 16 && ev.clientY < b.bottom + 10) hot = id;
      }
      setDrag({ ...k, x: ev.clientX, y: ev.clientY, ox: sx - r0.left, oy: sy - r0.top, hot: hot && hot !== view.routing[k.kind] ? hot : null });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved && hot && hot !== view.routing[k.kind]) onDrop(k.kind, hot);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const rec = view.record, from = at.record, to = rec?.overflow ? at[rec.overflow] : undefined;
  let over: { d: string; tx: number; ty: number } | null = null;
  if (rec && from && to) {
    let ox = (from.x + to.x) / 2 - CX, oy = ((from.y + to.y) / 2 - CY) * (RX / RY), ol = Math.hypot(ox, oy) || 1;
    const across = ol < 90;
    if (across) { ox = -(to.y - from.y); oy = to.x - from.x; if (oy > 0) { ox = -ox; oy = -oy; } ol = Math.hypot(ox, oy) || 1; }
    const mx = (from.x + to.x) / 2 + (ox / ol) * 130, my = (from.y + to.y) / 2 + (oy / ol) * 130 * (RY / RX);
    over = { d: `M${from.x} ${from.y} Q${mx} ${my} ${to.x} ${to.y}`, tx: across ? from.x : (from.x + 2 * mx + to.x) / 4, ty: across ? Math.min(H - 14, from.y + 120) : (from.y + 2 * my + to.y) / 4 };
  }
  return (
    <div className={`v3-pl-sky ${drag ? "routing" : ""} ${focus ? "focusing" : ""}`}>
      <svg className="v3-pl-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {view.places.map((p, i) => <g key={p.id}>
          <line x1={CX} y1={CY} x2={at[p.id].x} y2={at[p.id].y} className={`v3-pl-line ${p.state}`} vectorEffect="non-scaling-stroke" />
          {p.state === "ok" && <circle r="3.2" className="v3-pl-flow" style={{ offsetPath: `path("M${at[p.id].x} ${at[p.id].y} L${CX} ${CY}")`, animationDelay: `${0.4 + i * 0.7}s` }} />}
        </g>)}
        {add && <line x1={CX} y1={CY} x2={add.x} y2={add.y} className="v3-pl-line new" vectorEffect="non-scaling-stroke" />}
        {over && <path d={over.d} className="v3-pl-over" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="v3-pl-core" style={{ left: "50%", top: `${(CY / H) * 100}%` }}>
        <span className="pm">{(view.name || "?").slice(0, 1).toUpperCase()}</span><span>{view.name}</span>
      </div>
      {view.places.map((p) => {
        const q = at[p.id], isRec = p.kind === "record" && !!rec;
        const f = isRec ? Math.min(1, rec!.used / (rec!.of || 1)) : 0, C = 2 * Math.PI * 31;
        return (
          <div key={p.id} ref={(el) => { if (el) nodes.current.set(p.id, el); else nodes.current.delete(p.id); }}
            className={`v3-pl-node ${p.state} ${focus === p.id ? "focus" : ""} ${drag?.hot === p.id ? "hot" : ""}`} data-place={p.id}
            style={{ left: `${q.x / 10}%`, top: `${(q.y / H) * 100}%` }} role="button" tabIndex={0} title={p.name}
            onClick={() => onFocus(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFocus(p.id); } }}>
            <span className="disc"><Mark kind={p.kind} />
              {p.state === "red" && <span className="v3-pl-reddot" />}
              {isRec && <span className={`v3-pl-fill ${rec!.high ? "high" : ""}`} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 66 66"><circle cx="33" cy="33" r="31" class="bg"/><circle cx="33" cy="33" r="31" class="fg" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 33 33)"/></svg>` }} />}
            </span>
            <span className="l">{p.kind === "record" ? p.name : p.label}</span>
            <span className="t">{p.by && <Face who={p.by} me={view.me} />}{isRec ? `${rec!.used} of ${rec!.of} ${rec!.unit}` : p.line}</span>
            {p.kinds.length > 0 && <span className="kinds">{p.kinds.map((k) => (
              <span key={k.kind} className={`v3-pl-kind ${fresh === k.kind ? "fresh" : ""} ${drag?.kind === k.kind ? "lifted" : ""} ${view.guest ? "still" : ""}`} data-kind={k.kind}
                title={view.guest ? `New ${k.label} go here` : `New ${k.label} go here. Drag to another place to change it.`}
                onPointerDown={(e) => lift(e, k)} onClick={(e) => e.stopPropagation()}>
                <Glyph kind={k.kind} /><span>{k.label}</span>{k.n !== undefined && <span className="n">{k.n}</span>}
              </span>))}</span>}
            {p.state === "red" && !view.guest && <button className="v3-pl-press ink v3-pl-fix" onClick={(e) => { e.stopPropagation(); onSignIn(p); }}>Sign in again</button>}
          </div>
        );
      })}
      {over && rec && <span className="v3-pl-over-l" style={{ left: `${over.tx / 10}%`, top: `${(over.ty / H) * 100}%` }}>{rec.line}</span>}
      {add && <div className="v3-pl-node add" style={{ left: `${add.x / 10}%`, top: `${(add.y / H) * 100}%` }}>
        <button className="disc" onClick={onFan} aria-expanded={fan} title="connect a place">
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg></button>
        <span className="l">Connect a place</span>
        {fan && <span className="v3-pl-fan">{view.open.map((k) => <button key={k} className="v3-pl-fan-i" title={NAME[k]} onClick={() => onConnect(k)}><Mark kind={k} size={16} /></button>)}</span>}
      </div>}
      {drag && <span className="v3-pl-kind v3-pl-ghost" style={{ left: drag.x - drag.ox, top: drag.y - drag.oy }}><Glyph kind={drag.kind} /><span>{drag.label}</span></span>}
    </div>
  );
}

function UndoLine({ u, onUndo, onGone }: { u: { token: string; line: string; until: number }; onUndo: () => void; onGone: () => void }) {
  const [left, setLeft] = useState(Math.max(0, u.until - Date.now()));
  useEffect(() => { const t = window.setInterval(() => { const l = Math.max(0, u.until - Date.now()); setLeft(l); if (!l) onGone(); }, 200); return () => window.clearInterval(t); }, [u, onGone]);
  const C = 2 * Math.PI * 7;
  return (
    <div className="v3-pl-undo" role="status">
      <svg className="ring" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" className="bg" /><circle cx="9" cy="9" r="7" className="fg" strokeDasharray={`${(C * left) / 8000} ${C}`} /></svg>
      <span className="t">{u.line}</span>
      <button className="v3-pl-press" onClick={onUndo}>Undo</button>
    </div>
  );
}

/** the reach picture: Sol on the left, a line to each thing it reads or writes; never, crossed, under a rule.
 *  before: dashed and quiet; after: drawn in, a dot running along each line */
function ReachPic({ reach, kind, mode }: { reach: Reach; kind: PlaceKind; mode: "before" | "after" }) {
  const rows = [...reach.reads.map((t) => ({ t, k: "read" as const })), ...reach.writes.map((t) => ({ t, k: "write" as const }))];
  const RH = 30, top = 34, h = top + rows.length * RH + 6, sx = 64, sy = h / 2;
  return (
    <div className={`v3-pl-reach ${mode}`}>
      <svg className="v3-pl-reach-svg" width="150" height={h} aria-hidden="true">
        {rows.map((r, i) => { const y = top + i * RH + RH / 2, d = `M${sx} ${sy} C${sx + 40} ${sy} ${150 - 40} ${y} 148 ${y}`;
          return <g key={i}><path d={d} className={`v3-pl-rl ${r.k}`} style={{ animationDelay: `${0.08 * i}s` }} pathLength={1} />
            {mode === "after" && <circle r="2.4" className="v3-pl-rdot" style={{ offsetPath: `path("${d}")`, animationDelay: `${1 + i * 0.35}s`, animationDirection: r.k === "read" ? "reverse" : "normal" }} />}</g>; })}
      </svg>
      <div className="v3-pl-reach-sol" style={{ top: sy - 30 }}><span className="disc">S</span><span className="l">Sol</span></div>
      <div className="v3-pl-reach-box">
        <div className="root"><Mark kind={kind} size={16} /><span>{reach.root}</span></div>
        {rows.map((r, i) => <div key={i} className={`v3-pl-rr ${r.k}`}><span className="tag">{r.k === "read" ? "reads" : "writes"}</span><span className="t">{r.k === "write" ? "+ " : ""}{r.t}</span></div>)}
        {reach.never.length > 0 && <div className="sep" />}
        {reach.never.map((t, i) => <div key={i} className="v3-pl-rr never"><span className="tag">never</span><span className="t">{t}</span></div>)}
      </div>
    </div>
  );
}

function PlaceCard({ p, view, onRevoke, onSignIn, onOverflow }: { p: Place; view: View; onRevoke: () => void; onSignIn: () => void; onOverflow: (id: string) => void }) {
  const red = p.state === "red", rec = p.kind === "record";
  const sub = red ? `Sign-in expired. ${p.line.replace(/^sign-in expired · |^signed out · /, "")[0].toUpperCase()}${p.line.replace(/^sign-in expired · |^signed out · /, "").slice(1)}. It catches up when you sign in again, on ${SIGN[p.signIn ?? ""] ?? "the place"} itself.`
    : rec ? `Sol's own. It never waits on the network.${view.record ? ` ${view.record.line[0].toUpperCase()}${view.record.line.slice(1)}.` : ""}`
    : `Connected${p.by ? ` by ${p.by.toLowerCase() === view.me.toLowerCase() ? "you" : p.by}` : ""}${p.touched ? ` · ${p.line}` : ""}`;
  const can = view.places.filter((x) => x.id !== "record" && x.state !== "revoked");
  return (
    <section className="v3-pl-card" aria-label={p.name}>
      <div className="top"><span className="cm"><Mark kind={p.kind} size={28} /></span>
        <div><div className="cn">{p.name}{rec ? "" : ` · ${p.label}`}</div><div className={`cs ${red ? "red" : ""}`}>{sub}</div></div></div>
      <ReachPic reach={p.reach} kind={p.kind} mode={red ? "before" : "after"} />
      {rec && view.record && !view.guest && can.length > 1 && <div className="v3-pl-ofl"><span className="q">when full, files go to</span>
        {can.map((x) => <button key={x.id} className={`v3-pl-chip ${view.record!.overflow === x.id ? "on" : ""}`} onClick={() => onOverflow(x.id)}><Mark kind={x.kind} size={13} />{x.name}</button>)}</div>}
      <div className="acts">
        {red && !view.guest && <button className="v3-pl-press ink" onClick={onSignIn}>Sign in again</button>}
        {!rec && !red && !view.guest && <button className="v3-pl-press" onClick={onRevoke}>Revoke</button>}
        <span className="q">{view.guest ? "Connected by the members. Guest." : rec ? "It cannot be revoked; it is the project." : red ? "The routing stays. Nothing is lost." : "One press. The files stay where they are."}</span>
      </div>
    </section>
  );
}

/** a place's own sign-in again, from outside the room (Running's red line): the same card as the room's Sign in again */
export function SignInAgain({ team, project, kind, onClose }: { team: Team; project: string; kind: string; onClose: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const ask = useCallback((type: string, body: object = {}, wait?: number) => askV3<Ans>(`team.v3.places.${type}`, { project, ...body }, wait), [project]);
  useEffect(() => { void ask("read").then((r) => r.view && setView(r.view)); }, [ask]);
  if (!view) return null;
  return <Connect team={team} kind={kind as PlaceKind} again had={view.places.find((p) => p.kind === kind)} ask={ask}
    onView={setView} onRevoke={() => onClose()} onClose={onClose} />;
}

function Connect({ team, kind, again, had, ask, onView, onRevoke, onClose }: {
  team: Team; kind: PlaceKind; again: boolean; had?: Place; ask: (t: string, b?: object, w?: number) => Promise<Ans>;
  onView: (v: View) => void; onRevoke: (id: string) => void; onClose: () => void;
}) {
  const [step, setStep] = useState<"look" | "signin" | "code" | "before" | "after">("look");
  const [label, setLabel] = useState(had?.label ?? "");
  const [reach, setReach] = useState<Reach | null>(null);
  const [sign, setSign] = useState<"github" | "google" | null>(null);
  const [code, setCode] = useState<{ code: string; url: string } | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const look = useCallback(async (l = label) => {
    const r = await ask("reach", { kind, label: l });
    if (r.error) { setSaid(r.error); return null; }
    setReach(r.reach ?? null); setSign(r.signIn ?? null);
    if (!label && r.place?.label && (kind === "calendar")) setLabel(r.place.label);
    return r;
  }, [ask, kind, label]);
  useEffect(() => { void look().then((r) => { if (r) setStep(r.signedIn ? "before" : "signin"); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // after GitHub's code: look again every 3 s until the sign-in is there
  useEffect(() => {
    if (step !== "code") return;
    const t = window.setInterval(() => void look().then((r) => { if (r?.signedIn) setStep("before"); }), 3000);
    return () => window.clearInterval(t);
  }, [step, look]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [onClose]);
  const signIn = async () => {
    setBusy(true); setSaid("");
    if (sign === "github") {
      const r = await team.ask<{ code?: string; url?: string; error?: string }>("team.github.connect", {}, 30_000);
      setBusy(false);
      if (r.code && r.url) { setCode({ code: r.code, url: r.url }); setStep("code"); openUrl(r.url); } else setSaid(r.error ?? "GitHub did not answer");
    } else {
      const r = await team.ask<{ ok?: boolean; error?: string }>("team.drive.connect", {}, 11 * 60_000);
      setBusy(false);
      if (r.ok) { await look(); setStep("before"); } else setSaid(r.error ?? "Google was not connected");
    }
  };
  const grant = async () => {
    setBusy(true); setSaid("");
    const r = await ask("connect", { kind, label });
    setBusy(false);
    if (r.view) onView(r.view);
    if (r.signIn) { setSign(r.signIn); setStep("signin"); return; }
    if (r.error) { setSaid(r.error); return; }
    if (r.reach) setReach(r.reach);
    setStep("after");
  };
  const name = NAME[kind] ?? kind;
  const sub = step === "after" ? "Connected · last touched just now"
    : step === "before" ? "Before you grant: exactly this, nothing more."
    : again ? `The sign-in for ${had?.label ?? name} expired. Sign in again, nothing else changes.`
    : `Connect it to this project. You sign in on ${SIGN[sign ?? ""] ?? name}'s own page.`;
  return (
    <div className="v3-pl-veil" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v3-pl-connect" role="dialog" aria-label={`connect ${name}`}>
        <button className="x" onClick={onClose} title="Close">×</button>
        <div className="top"><span className="cm"><Mark kind={kind} size={28} />{step === "after" && <span className="tick">✓</span>}</span>
          <div><div className="cn">{name}</div><div className="cs">{sub}</div></div></div>
        {step === "look" && <p className="q">…</p>}
        {step === "signin" && <div className="v3-pl-signin">
          <p className="q">Sol opens {SIGN[sign ?? ""] ?? name}'s own sign-in. Sol never sees your password, and no token goes in the record.</p>
          <button className="v3-pl-press ink lg" disabled={busy} onClick={() => void signIn()}>{busy ? "waiting for you to sign in…" : `Sign in to ${SIGN[sign ?? ""] ?? name}`}</button>
        </div>}
        {step === "code" && code && <div className="v3-pl-signin">
          <p className="q">Type this code on GitHub's page. This card goes on by itself once you are in.</p>
          <code className="v3-pl-code">{code.code}</code>
          <button className="v3-pl-press" onClick={() => openUrl(code.url)}>Open GitHub again</button>
        </div>}
        {step === "before" && reach && <>
          {(kind === "github" || kind === "drive") && <label className="v3-pl-label"><span className="q">{kind === "github" ? "the repository" : "the folder, as you call it"}</span>
            <input value={label} placeholder={kind === "github" ? "owner/name" : "Shared folder"} spellCheck={false}
              onChange={(e) => setLabel(e.target.value)} onBlur={() => void look(label)} /></label>}
          <ReachPic reach={reach} kind={kind} mode="before" />
          <div className="acts"><button className="v3-pl-press ink lg" disabled={busy} onClick={() => void grant()}>Grant</button>
            <button className="v3-pl-press ghost" onClick={onClose}>Not now</button></div>
        </>}
        {step === "after" && reach && <>
          <ReachPic reach={reach} kind={kind} mode="after" />
          <div className="acts"><button className="v3-pl-press ink lg" onClick={onClose}>Done</button>
            <button className="v3-pl-press ghost" onClick={() => onRevoke(kind)}>Revoke</button></div>
        </>}
        {said && <p className="v3-pl-say" role="status">{said}</p>}
      </div>
    </div>
  );
}

function LetIn({ ask, me }: { ask: (t: string, b?: object, w?: number) => Promise<Ans>; me: string }) {
  const [who, setWho] = useState("");
  const [list, setList] = useState<{ person: string; access: Access[] } | null>(null);
  const [said, setSaid] = useState("");
  const [done, setDone] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (list) box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [list]);
  const go = async () => {
    const r = await ask("letin", { person: who.trim() });
    if (r.error) { setSaid(r.error); return; }
    setSaid(""); setDone({}); setList({ person: r.person ?? who.trim(), access: r.access ?? [] });
  };
  const give = async (a: Access) => {
    const r = await ask("grant", { place: a.place, person: list!.person }, 60_000);
    setDone((d) => ({ ...d, [a.place]: r.error ?? r.line ?? "let in" }));
  };
  return (
    <div className="v3-pl-letin" ref={box}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (who.trim()) void go(); }}>
        <span className="q">Let someone in</span>
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="their GitHub name" spellCheck={false} />
        <button className="v3-pl-press" disabled={!who.trim()}>Show what they get</button>
      </form>
      <p className="q small">Joining is not access: each place says it.</p>
      {said && <p className="v3-pl-say">{said}</p>}
      {list && <ul>{list.access.map((a) => <li key={a.place}>
        <Mark kind={a.place} size={16} /><span className="n">{a.name}</span><span className="q">{done[a.place] ?? a.line}</span>
        {a.can === "grant" && !done[a.place] && <button className="v3-pl-press ink" onClick={() => void give(a)}>Let {list.person} in</button>}
        {a.can === "ask" && a.ask && a.ask.toLowerCase() !== me.toLowerCase() && <span className="v3-pl-face">{a.ask.slice(0, 1).toUpperCase()}</span>}
      </li>)}</ul>}
    </div>
  );
}
