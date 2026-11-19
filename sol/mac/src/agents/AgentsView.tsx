// Agents mode (#1327, Marco 2026-11-16): fixed, dedicated agents for the work that repeats the same, similarly or in
// the same shape ("think of it as dedicated people"). Agents are a functional use of the current jelly creature: each
// agent is the jelly put to one job (Jelly.tsx). Sol keeps them by itself (the engine's keeper); any change by hand
// happens only here. Pass 2 is play.html's flow, one action per screen, in the kit: the floor (who needs you in front),
// the offer (a job Sol noticed, opened from Home's "again?"), an agent's desk, what Sol changed, the making of one. Under
// it one line says what the last press did, with its undo. While Sol is still looking (the engine's late look, past
// LOOK_SIGN_MS), a jelly at work sits beside the floor's label (Floor.tsx); while the first grouping runs (no agents
// yet) the floor is that jelly at work, at once. The wire: useAgents.ts; the words: model.ts.
// Inside Home (Marco 2026-11-18: Agents ships inside Home, as Home's doers, not a mode): `inHome` draws the same places
// with no frame of their own; Home's side holds the shelf (OneHome.tsx) and its frame the head.
import { useCallback, useEffect, useRef, useState } from "react";
import { Frame, Head } from "../kit/Chrome";
import { Jelly } from "./Jelly";
import { Floor } from "./Floor";
import { Desk, type Said } from "./Desk";
import { OfferView } from "./Offer";
import { JoinView } from "./Join";
import { Changes } from "./Changes";
import { Make } from "./Make";
import { asksIn, doingOf, grouping, headingOf, idsIn, introOf, lookSignIn, offersStamp, postureOf, railOf, railWord, rawIn, ruleIdsOf, saidOf, type Offer } from "./model";
import type { Meet } from "./Floor";
import { useAgents, type Wire } from "./useAgents";
import { AGENT_AT, OPEN_AGENT } from "./flag";
import "./agents.css";

export type At = { k: "floor" } | { k: "desk"; id: string } | { k: "offer"; id: string } | { k: "join"; id: string } | { k: "changes" } | { k: "make"; line?: string };
const readAt = (): At => { try { const a = JSON.parse(sessionStorage.getItem(AGENT_AT) ?? "null"); if (a && typeof a.k === "string") return a; } catch { /* private */ } return { k: "floor" }; };

export function AgentsView({ e, now: fixedNow, say0, inHome }: { e: Wire; now?: number; say0?: string; inHome?: boolean }) {
  const { list, err, reload, ask } = useAgents(e);
  const [at, setAtRaw] = useState<At>(readAt);
  const setAt = (a: At) => { setAtRaw(a); try { sessionStorage.setItem(AGENT_AT, JSON.stringify(a)); } catch { /* private */ } };
  const [said, setSaid] = useState<(Said & { at: number }) | null>(null);
  const [tick, setTick] = useState(() => fixedNow ?? Date.now());
  useEffect(() => { if (fixedNow) return; const t = window.setInterval(() => setTick(Date.now()), 30_000); return () => window.clearInterval(t); }, [fixedNow]);
  const now = fixedNow ?? tick;
  // the jobs Sol noticed: read with the first list, again only when the list says the stored offers changed (#1429)
  const [offers, setOffers] = useState<Offer[]>([]);
  const readOffers = useCallback(async () => { const r = await ask<{ ok: boolean; offers?: Offer[] }>({ type: "agents.offers" }, 60_000); if (r?.ok) setOffers(r.offers ?? []); }, [ask]);
  const stamp = list ? offersStamp(list) : null;
  useEffect(() => { if (stamp !== null) void readOffers(); }, [stamp, readOffers]);
  // Home's press on a jelly (its desk) or on "again?" (the offer) while this view is already up
  useEffect(() => { const f = () => setAtRaw(readAt()); window.addEventListener(OPEN_AGENT, f); return () => window.removeEventListener(OPEN_AGENT, f); }, []);
  // the side folds and opens with ⌘\, the key every mode answers the same way (kit/Chrome.tsx)
  const [open, setOpen] = useState(() => localStorage.getItem("sol.side.agents") !== "0");
  const flip = () => setOpen((o) => { localStorage.setItem("sol.side.agents", o ? "0" : "1"); return !o; });
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.metaKey && !ev.shiftKey && ev.key === "\\") { if (inHome) return; ev.preventDefault(); flip(); }
      else if (ev.key === "Escape" && !(ev.target as HTMLElement)?.closest?.("input, textarea, select")) setAt({ k: "floor" });
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const say = (s: Said) => setSaid({ ...s, at: Date.now() });
  const undoSaid = async () => {
    if (said?.back) { const ok = await said.back(); setSaid({ ok, line: ok ? `Undone: ${said.line}` : "It could not be put back: the file changed or the engine did not answer.", at: Date.now() }); return; }
    if (!said?.undo) return;
    const r = await ask<{ ok: boolean; why?: string }>({ type: "agents.undo", changeId: said.undo }, 15_000);
    const s = saidOf(r, "undo");
    setSaid({ ok: s.ok, line: s.ok ? `Undone: ${said.line}` : s.line, at: Date.now() });
  };

  // Sol still looking (the late look in the background): after LOOK_SIGN_MS from the floor's first draw, the floor's
  // label has a jelly at work until the list comes back without `looking`. No word, no spinner: the kit's work state
  const drewAt = useRef<number | null>(null);
  if (list && drewAt.current === null) drewAt.current = Date.now();
  const signIn = lookSignIn(!!list?.looking, drewAt.current, Date.now());
  const [, kick] = useState(0);
  useEffect(() => { if (!signIn) return; const t = window.setTimeout(() => kick((k) => k + 1), signIn); return () => window.clearTimeout(t); }, [signIn, list]);
  const looking = signIn === 0;

  const agents = list?.agents ?? [];
  const agent = at.k === "desk" ? agents.find((a) => a.id === at.id) ?? null : null;
  const offer = at.k === "offer" ? offers.find((o) => o.id === at.id) ?? null : null;
  const joins = list?.joins ?? [];
  const join = at.k === "join" ? joins.find((j) => j.id === at.id) ?? null : null;
  const folders = [...new Set([...agents.flatMap((a) => a.rules.map((r) => r.folder)), ...(list?.folderRules ?? []).map((r) => r.folder)])].sort();
  const first = grouping(list);   // the first grouping still running: no agents yet, the floor's jelly at work
  // the first open (rule 6): the list said not met yet when the floor first showed its agents. It stays the first open
  // for this visit (its intro sentence with it, as it was then), and the engine hears agents.meet once
  const meet = useRef<{ on: boolean; intro: Meet } | null>(null);
  if (list && agents.length && meet.current === null) meet.current = { on: !list.met, intro: introOf(list) };
  const meeting = !!meet.current?.on && at.k === "floor";
  useEffect(() => { if (meet.current?.on && list && !list.met) void ask({ type: "agents.meet" }, 15_000); }, [list?.met, agents.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaveMeet = (a: At) => { if (meet.current) meet.current.on = false; setAt(a); };
  const need = list ? asksIn(list).need : 0;
  const rail = railOf(agents);
  const where = at.k === "floor" ? (list && !first ? headingOf(need) : "reading…")
    : at.k === "desk" ? (agent ? <>agents › <b>{agent.name}</b></> : "agents › an agent")
    : at.k === "offer" ? (offer ? <>agents › <b>a job Sol noticed</b></> : "agents › a job Sol noticed")
    : at.k === "join" ? <>agents › <b>{join?.inPlace ? "one agent for two steps?" : "one agent or two?"}</b></>
    : at.k === "changes" ? "agents › what Sol changed" : "agents › a new one";

  // Agents in use (#1327, the engine's agent/inuse.ts): once a visit for each place drawn, what it drew as numbers (the
  // floor: how long it took to stand and how many cards; any place: rule ids in its text; a desk: raw markdown)
  const opened = useRef(Date.now()), sent = useRef(new Set<string>()), coreRef = useRef<HTMLElement>(null);
  const place = !list || first ? "" : at.k === "floor" ? "floor" : at.k === "desk" && agent ? `desk:${agent.id}` : at.k === "join" && join ? `ask:${join.id}` : at.k === "changes" ? "changes" : "";
  useEffect(() => {
    if (list || sent.current.has("floor")) return;
    const t = window.setTimeout(() => { if (sent.current.has("floor")) return; sent.current.add("floor"); void ask({ type: "agents.seen", what: "floor", paintMs: 10_000 }, 5_000); }, 10_000);
    return () => window.clearTimeout(t);
  }, [list, ask]);
  useEffect(() => {
    if (!place || !list || sent.current.has(place)) return;
    const drawn = Date.now();
    const f = requestAnimationFrame(() => {
      const el = coreRef.current;
      if (!el || sent.current.has(place)) return;
      const firstDraw = sent.current.size === 0;   // the floor's time counts only when it is the first place drawn
      sent.current.add(place);
      const what = place.split(":")[0], text = el.innerText ?? el.textContent ?? "";
      const m: Record<string, unknown> = { type: "agents.seen", what, ids: idsIn(text, ruleIdsOf(list)) };
      if (what === "floor") { if (firstDraw) m.paintMs = drawn - opened.current; const shelves = [...el.querySelectorAll(".ag-shelf")]; m.cards = shelves.length ? Math.max(...shelves.map((s) => s.querySelectorAll(".ag-card[data-agent]").length)) : el.querySelectorAll(".ag-card[data-agent]").length; }   // the fullest shelf: seven is a shelf's limit (shelvesOf)
      if (what === "desk") m.raw = rawIn([...el.querySelectorAll(".ag-work")].flatMap((w) => ((w as HTMLElement).innerText ?? "").split("\n")));
      void ask(m as { type: string }, 5_000);
    });
    return () => cancelAnimationFrame(f);
  }, [place, list, ask]);

  let core;
  if (!list) core = <div className="ag-floor" data-place="talk"><div className="ag-empty">{err ? <><p>{err}</p><button type="button" className="ag-btn" onClick={() => void reload()}>ask again</button></> : <p>Reading your agents…</p>}</div></div>;
  else if (at.k === "desk") core = agent ? <Desk a={agent} changes={list.changes} now={now} ask={ask} onSaid={say} say0={say0} />
    : <div className="ag-floor" data-place="talk"><div className="ag-empty"><p>That agent is not here any more (undone, or its rules were taken out).</p><button type="button" className="ag-btn" onClick={() => setAt({ k: "floor" })}>to the floor</button></div></div>;
  else if (at.k === "offer") core = offer ? <OfferView key={offer.id} o={offer} ask={ask} onSaid={say} onKept={(id) => setAt({ k: "desk", id })} onDone={() => setAt({ k: "floor" })} />
    : <div className="ag-floor" data-place="talk"><div className="ag-empty"><p>{offers.length || list.offers === 0 ? "That job is answered already." : "Reading the job Sol noticed…"}</p><button type="button" className="ag-btn" onClick={() => setAt({ k: "floor" })}>to the floor</button></div></div>;
  else if (at.k === "join") core = join ? <JoinView key={join.id} j={join} ask={ask} onSaid={say} onTogether={(id) => setAt({ k: "desk", id })} onDone={() => setAt({ k: "floor" })} />
    : <div className="ag-floor" data-place="talk"><div className="ag-empty"><p>That one is answered already.</p><button type="button" className="ag-btn" onClick={() => setAt({ k: "floor" })}>to the floor</button></div></div>;
  else if (at.k === "changes") core = <Changes changes={list.changes} agents={agents} now={now} ask={ask} onSaid={say} onOpen={(id) => setAt({ k: "desk", id })} />;
  else if (at.k === "make") core = <Make key={at.line ?? ""} folders={folders} start={at.line} ask={ask} onSaid={say} onMade={(id) => setAt({ k: "desk", id })} />;
  else core = <Floor list={list} offers={offers} looking={looking} grouping={first} meeting={meeting} intro={meet.current?.intro ?? null} now={now} ask={ask} onSaid={say}
    onJoin={(id) => leaveMeet({ k: "join", id })} onOpen={(id) => leaveMeet({ k: "desk", id })} onOffer={(id) => leaveMeet({ k: "offer", id })} onMake={(line) => leaveMeet({ k: "make", line })} onChanges={() => leaveMeet({ k: "changes" })} onStart={() => leaveMeet({ k: "floor" })} />;

  const said_ = said && (
    <div className={`ag-said ${said.ok ? "" : "ag-bad"}`} role="status" key={said.at}>
      <span>{said.line}</span>
      {(said.undo || said.back) && <button type="button" className="ag-btn ag-sm" onClick={() => void undoSaid()}>undo</button>}
      <button type="button" className="ag-x" onClick={() => setSaid(null)} aria-label="dismiss">×</button>
    </div>
  );
  // in Home: the place's crumb on top (Home's head says "agents"), then the same core
  if (inHome) return (
    <section className="ag ag-core ag-in-home" ref={coreRef} data-agents-in-home>
      {at.k !== "floor" && <div className="ag-crumb"><button type="button" className="ag-btn ag-sm" onClick={() => setAt({ k: "floor" })} title="the floor (esc)">‹ the floor</button> <span className="ag-dim">{where}</span></div>}
      {core}
      {said_}
    </section>
  );
  return (
    <Frame className="ag" open={open}
      head={<Head side={{ open, onFlip: flip }} title="agents" where={where}>
        {at.k !== "floor" && <button type="button" className="ag-btn ag-sm" onClick={() => setAt({ k: "floor" })} title="the floor (esc)">‹ the floor</button>}
      </Head>}
      side={<div className="ag-side">
        <button type="button" className={`ag-srow ${at.k === "floor" ? "ag-on" : ""}`} onClick={() => setAt({ k: "floor" })}>
          <Jelly size={18} turn={0} /><span>the floor</span><small>{need > 0 ? `${need} need you` : agents.length}</small></button>
        {rail.rows.map((a) => (
          <button type="button" key={a.id} className={`ag-srow ag-r-${postureOf(a)} ${at.k === "desk" && at.id === a.id ? "ag-on" : ""}`} onClick={() => setAt({ k: "desk", id: a.id })} data-rail={a.id}>
            <Jelly size={18} turn={a.turn} doing={doingOf(a.state)} className={postureOf(a) === "blocked" || postureOf(a) === "paused" ? "ag-asleep" : undefined} /><span className="ag-one">{a.name}</span><small className="ag-word">{railWord(a)}</small>
          </button>
        ))}
        {rail.rest > 0 && <button type="button" className="ag-srow ag-more-row" onClick={() => setAt({ k: "floor" })}><span className="ag-dim">{rail.rest} more on the floor</span></button>}
      </div>}>
      <section className="ag-core" ref={coreRef}>
        {core}
        {said_}
      </section>
    </Frame>
  );
}
