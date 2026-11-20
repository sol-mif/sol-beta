// The floor (#1327; the calm pass 2026-11-17, calm.html), top to bottom: a heading that says how many need you ("Nothing
// needs you" when none); the one ask in front (every sign-in is one card, a row per site saying what each frees); "Then"
// with the queue and "N more"; with nothing blocked, "Today": each agent's runs on one axis, past ones faded, a "now" mark;
// "Your agents" as cards (jelly, name, role, its work waiting in Home as a count, its state), at most seven, past seven on
// the engine's shelves, a shelf with a blocked agent open; at the foot the routines and what Sol changed this week.
// The engine decides what is asked, in what order and how many (agents.list's asks, shelves); this draws them.
// A job Sol noticed peeks "again?" beside the cards (at most one); a dashed card takes a typed job.
// When the person's own model asked in Jev's place (no Jev key), one line under the asks says no Jev is needed: the
// cheapest model of their own AI asks instead, as many a day as they said, and that they can say fewer (#1476), until
// "Got it" (agents.noted): said once.
// Before the first visit it is the first open: "Meet your agents", the cast walking in, the pauses Sol made in one
// sentence with one undo, and one button to the top ask (AgentsView sends agents.meet once it is shown).
// Nothing yet (no agents, no routines): "None yet: they appear when your work repeats" and a one-line field for a job.
// `looking`: the late look still runs (a small jelly at work beside the label); `grouping`: the first grouping still
// runs (no agents yet), the jelly at work in place of the empty text.
import { useState, type CSSProperties } from "react";
import { Jelly, Named, Outline } from "./Jelly";
import {
  agentOfAsk, askMeta, asksIn, axisX, changedCount, changedLine, cardStatus, doingOf, emptySol, floorSub, headingOf, homeCount, joinOfAsk, meetLine, postureOf,
  regroupSend, routinesLine, shelvesRead, signinSend, siteMark, startLabel, todayOf, typedJob, type AgentRow, type Blocked, type List, type Offer,
} from "./model";
import { Go, Lock, Quiet, Surface, pressed } from "./ui";
import type { Ask } from "./useAgents";
import type { Said } from "./Desk";

/** a job Sol noticed has no agent yet, so no turn: one from its id, so the same offer keeps its face */
export const turnOf = (id: string) => [...id].reduce((k, c) => k + c.charCodeAt(0), 0) % 6;
/** the first open (before the first visit): what Sol paused, one sentence with one undo */
export type Meet = { line: string; ids: string[] } | null;
type Press = (key: string, send: { type: string } & Record<string, unknown>, what: string) => Promise<void>;

export function Floor({ list, offers, looking = false, grouping = false, meeting = false, intro = null, now, ask, onOpen, onOffer, onJoin, onMake, onSaid, onChanges, onStart }: {
  list: Pick<List, "agents" | "folderRules" | "joins" | "changes" | "asks" | "shelves" | "looking" | "jevNote">; offers: Offer[]; looking?: boolean; grouping?: boolean; meeting?: boolean; intro?: Meet; now: number; ask: Ask;
  onOpen: (id: string) => void; onOffer: (id: string) => void; onJoin?: (id: string) => void; onMake: (line: string) => void; onSaid: (s: Said) => void; onChanges?: () => void;
  /** the first open's one button when nothing is asked: leave it for the floor */
  onStart?: () => void;
}) {
  const agents = list.agents;
  const asks = asksIn(list);
  const shelves = shelvesRead(list);
  const offer = offers[0] ?? null;   // at most one lit offer on a screen
  const [busy, setBusy] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [which, setWhich] = useState(false);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<string | null>(null);   // a queued sign-in the person pressed: it takes the front
  const [noted, setNoted] = useState(false);   // the line about Jev, read: gone here at once, agents.noted ends it there
  const press: Press = async (key, send, what) => {
    setBusy(key);
    await pressed(ask, send, what, onSaid, 30_000);
    setBusy(null);
  };
  const openAsk = (q: Blocked) => {
    if (q.kind === "join") onJoin?.(q.join);
    else if (q.kind === "fix") onOpen(q.agent);
    else setPick(q.id);
  };
  const undoIntro = async () => {
    if (!intro) return;
    setBusy("intro");
    const r = await ask<{ ok: boolean; why?: string }>({ type: "agents.undo", changeIds: intro.ids }, 15_000);
    setBusy(null);
    if (r?.ok) setUndone(true);
    onSaid(r?.ok ? { ok: true, line: "They retry each hour again, and stop at the same place." } : { ok: false, line: `Undo: ${r?.why ?? "the engine did not answer"}.` });
  };
  const rules = agents.reduce((n, a) => n + a.rules.length, 0) + list.folderRules.length;
  const places = new Set([...agents.flatMap((a) => a.rules.map((r) => r.folder)), ...list.folderRules.map((r) => r.folder)]).size;
  const routines = list.folderRules;
  const foot = (
    <>
      <div className="ag-foot2">
        {routines.length > 0 && <span>{routinesLine(routines)} <button type="button" className="ag-link" onClick={() => setWhich((w) => !w)} aria-expanded={which}>which</button></span>}
        <button type="button" className="ag-link ag-right" onClick={onChanges}>{changedLine(changedCount(list.changes, now))}</button>
      </div>
      {which && <ul className="ag-routines">{routines.map((r) => <li key={`${r.folder}#${r.rule}`}><b>{r.name ?? r.folder}</b> <span className="ag-dim">{r.sentence}</span></li>)}</ul>}
    </>
  );

  if (grouping) return (
    <div className="ag-floor" data-place="talk"><div className="ag-empty" role="status" aria-label="Reading your agents…"><Jelly size={72} doing="work" turn={0} /></div></div>
  );
  if (emptySol(list, offers.length)) return (
    <div className="ag-floor" data-place="talk" data-empty>
      <div className="ag-empty">
        <Jelly size={72} doing="rest" turn={0} />
        <p className="ag-big">None yet: they appear when your work repeats.</p>
        <p className="ag-dim">An agent is work you do again and again, given to Sol whole. When a job comes back the same, its jelly peeks “again?” on the sticky in Home. Or say one here, in a line.</p>
        <Typed onMake={onMake} line />
      </div>
    </div>
  );

  // the first ask in front: the person's press on a queued sign-in moves it up; the engine's order is otherwise kept
  const ordered = [asks.front, ...asks.then].filter((q): q is Blocked => !!q);
  const lead = ordered.find((q) => q.id === pick) ?? ordered[0] ?? null;
  const queue = ordered.filter((q) => q !== lead);

  if (meeting) return (
    <div className="ag-floor ag-meet" data-calm data-place="talk">
      <h1 className="ag-title">Meet your agents</h1>
      <p className="ag-lead">{meetLine(agents.length, rules, places)}</p>
      <Cast list={list} shelves={shelves} offer={null} now={now} shut={shut} setShut={setShut} onOpen={onOpen} onOffer={onOffer} onMake={onMake} walk />
      {intro && !undone && (
        <Surface step="box" className="ag-intro" data-intro>
          <Jelly size={32} doing="rest" turn={0} />
          <p className="ag-grow">{intro.line}</p>
          <Quiet small onClick={() => { if (busy !== "intro") void undoIntro(); }}>Undo</Quiet>
        </Surface>
      )}
      {routines.length > 0 && <p className="ag-mute ag-gap">{routinesLine(routines)} <button type="button" className="ag-link" onClick={() => setWhich((w) => !w)} aria-expanded={which}>which</button></p>}
      {which && <ul className="ag-routines">{routines.map((r) => <li key={`${r.folder}#${r.rule}`}><b>{r.name ?? r.folder}</b> <span className="ag-dim">{r.sentence}</span></li>)}</ul>}
      <div className="ag-acts">
        <Go onClick={() => { if (!lead || lead.kind === "signin") onStart?.(); else openAsk(lead); }}>{startLabel(lead)}</Go>
        {asks.need > 0 && <span className="ag-mute">{headingOf(asks.need)}{lead ? `: ${lead.title.charAt(0).toLowerCase()}${lead.title.slice(1)}` : ""}</span>}
      </div>
    </div>
  );

  return (
    <div className="ag-floor" data-calm data-place="talk">
      <h1 className="ag-title">{headingOf(asks.need)}</h1>
      {floorSub(asks.need, agents) && <p className="ag-lead">{floorSub(asks.need, agents)}</p>}

      {lead && <FrontAsk q={lead} list={list} busy={busy} onPress={press} onOpen={openAsk} />}
      {queue.length > 0 && (
        <div className="ag-queue" data-queue>
          <p className="ag-lbl">Then</p>
          {queue.map((q, i) => (
            <button type="button" key={q.id} className="ag-qrow" onClick={() => openAsk(q)} data-ask={q.kind}>
              <span className="ag-num">{i + 2}</span><span className="ag-grow ag-one">{q.title}</span><small>{askMeta(q)}</small>
            </button>
          ))}
          {asks.more > 0 && <p className="ag-more" data-more>and {asks.more} more</p>}
        </div>
      )}
      {list.jevNote && !noted && (
        <p className="ag-mute ag-gap" data-jev-note>{list.jevNote} <button type="button" className="ag-link" onClick={() => { setNoted(true); void ask({ type: "agents.noted" }, 15_000); }}>Got it</button></p>
      )}

      {asks.need === 0 && agents.length > 0 && <Today agents={agents} now={now} onOpen={onOpen} />}

      <p className="ag-lbl">Your agents <small>{agents.length}</small>{looking && <Jelly size={20} doing="work" turn={0} />}</p>
      <Cast list={list} shelves={shelves} offer={offer} now={now} shut={shut} setShut={setShut} onOpen={onOpen} onOffer={onOffer} onMake={onMake} />
      {foot}
    </div>
  );
}

/** the cards (at most seven) or, past seven, the engine's shelves; the dashed card for a typed job and the offer's peek close the cards */
function Cast({ list, shelves, offer, now, shut, setShut, onOpen, onOffer, onMake, walk = false }: {
  list: Pick<List, "agents">; shelves: ReturnType<typeof shelvesRead>; offer: Offer | null; now: number; shut: Record<string, boolean>; setShut: (f: (x: Record<string, boolean>) => Record<string, boolean>) => void;
  onOpen: (id: string) => void; onOffer: (id: string) => void; onMake: (line: string) => void; walk?: boolean;
}) {
  const agents = list.agents;
  // a shelf stands its first `shown` cards (blocked first, the engine's order); "N more" stands the rest
  const [wide, setWide] = useState<Record<string, boolean>>({});
  if (shelves) return (
    <div className={`ag-shelves ${walk ? "ag-walk" : ""}`}>
      {shelves.map((s) => {
        const open = shut[s.part] === undefined ? s.open : !shut[s.part];
        const cards = wide[s.part] ? s.agents : s.agents.slice(0, s.shown), rest = s.agents.length - cards.length;
        return (
          <div key={s.part} className="ag-shelf" data-shelf={s.part} data-open={open || undefined}>
            <button type="button" className="ag-shelf-h" onClick={() => setShut((x) => ({ ...x, [s.part]: open }))} aria-expanded={open}>
              <b className="ag-one">{s.part}</b>
              <span className="ag-two">{s.agents.slice(0, 5).map((a) => <Jelly key={a.id} size={20} doing={doingOf(a.state)} turn={a.turn} />)}</span>
              <small className="ag-grow ag-one">{s.line}</small>
            </button>
            {open && <div className="ag-cast">{cards.map((a, i) => <Card key={a.id} a={a} i={i} now={now} onOpen={onOpen} />)}</div>}
            {open && rest > 0 && <button type="button" className="ag-btn ag-sm" data-shelf-more={s.part} onClick={() => setWide((x) => ({ ...x, [s.part]: true }))}>{rest} more</button>}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={`ag-cast ${walk ? "ag-walk" : ""}`}>
      {agents.map((a, i) => <Card key={a.id} a={a} i={i} now={now} onOpen={onOpen} />)}
      {offer && (
        <button type="button" className="ag-card ag-card-offer" onClick={() => onOffer(offer.id)} data-offer={offer.id}>
          <span className="ag-peekwrap"><Named name={`${offer.name}, a job Sol noticed`}><Jelly size={44} doing="needs" turn={turnOf(offer.id)} /></Named><span className="ag-sticker">again?</span></span>
          <b className="ag-one">{offer.name}</b><small className="ag-role">you did it {offer.count} times</small>
        </button>
      )}
      {!walk && <Typed onMake={onMake} />}
    </div>
  );
}

/** the one ask in front, by its kind */
function FrontAsk({ q, list, busy, onPress, onOpen }: { q: Blocked; list: Pick<List, "agents" | "joins">; busy: string | null; onPress: Press; onOpen: (q: Blocked) => void }) {
  if (q.kind === "signin") return (
    <Surface step="raised" className="ag-front1" data-ask="signin">
      <p className="ag-from">{q.sites.length} sign-in{q.sites.length === 1 ? "" : "s"} · {q.freed} wait{q.freed === 1 ? "s" : ""} on {q.sites.length === 1 ? "it" : "them"}</p>
      <p className="ag-big">Sign in once, and they pick up where they stopped</p>
      <p className="ag-dim">Each stopped at the same sign-in and waits. Nothing they made is lost.</p>
      <div className="ag-sites">
        {q.sites.map((s) => (
          <div key={s.site} className="ag-site" data-site={s.site}>
            <span className="ag-fav" aria-hidden>{siteMark(s.site)}</span>
            <span className="ag-cell"><b className="ag-one">{s.site}</b><small className="ag-one">frees {s.frees.join(", ")}</small></span>
            <Go busy={busy === `site:${s.site}`} onClick={() => void onPress(`site:${s.site}`, signinSend(s), `Sign in to ${s.site}`)}>Sign in</Go>
          </div>
        ))}
      </div>
      <p className="ag-mute">Sol never signs in for you. Each opens its own sign-in window.</p>
    </Surface>
  );
  if (q.kind === "join") {
    const j = joinOfAsk(list, q);
    return (
      <Surface step="raised" className="ag-front1" data-ask="join" data-join={q.join} {...(q.where ? { "data-in-place": "" } : {})}>
        <p className="ag-from">{q.where ? `Sol isn't sure two steps in ${q.where} are one piece of work` : "Sol isn't sure these are one job"}</p>
        <div className="ag-need-who">
          <span className="ag-two">{(j?.agents ?? []).map((a, i) => <Jelly key={`${a.id}${i}`} size={44} doing="needs" toward={[i ? -1 : 1, -0.3]} turn={a.turn} />)}</span>
          <p className="ag-big">{q.title}</p>
        </div>
        <p className="ag-dim">{q.where ? "Together: one agent does both, the second step using what the first makes. Apart: they stay as they are, and Sol won't ask again." : "Together: one agent does both, each place keeping what is its own. Apart: they stay two, and Sol won't ask again."}</p>
        <div className="ag-acts"><Go onClick={() => onOpen(q)}>See both</Go></div>
      </Surface>
    );
  }
  if (q.kind === "regroup") return (
    <Surface step="raised" className="ag-front1" data-ask="regroup">
      <p className="ag-from">An older Sol grouped your agents</p>
      <p className="ag-big">{q.title}</p>
      <p className="ag-dim">Regroup: one agent per job. Their names, pauses and joins stay as you set them, and What Sol changed can undo it. Keep as is: they stay {q.before}, and Sol won't ask again.</p>
      <div className="ag-acts">
        <Go busy={busy === "regroup:regroup"} onClick={() => void onPress("regroup:regroup", regroupSend("regroup"), "Regroup")}>Regroup</Go>
        <Quiet onClick={() => { if (!busy) void onPress("regroup:keep", regroupSend("keep"), "Keep as is"); }}>Keep as is</Quiet>
      </div>
    </Surface>
  );
  const a = agentOfAsk(list, q);
  return (
    <Surface step="raised" className="ag-front1" data-ask="fix">
      <p className="ag-from">A question about {a?.name ?? "an agent"}'s job</p>
      <p className="ag-big">{q.title}</p>
      <div className="ag-acts"><Go onClick={() => onOpen(q)}>Look</Go></div>
    </Surface>
  );
}

/** an agent's card, drawn by its posture: working; blocked (greyed, a lock); resting (dim, its next run); paused by you.
 *  Its work waiting in Home is a count. A press opens its desk. `i` is its place in the walk-in. */
function Card({ a, i, now, onOpen }: { a: AgentRow; i: number; now: number; onOpen: (id: string) => void }) {
  const p = postureOf(a);
  const home = homeCount(a);
  const grey = p === "blocked" || p === "paused";
  return (
    <button type="button" className={`ag-card ag-p-${p}`} style={{ "--i": i } as CSSProperties} onClick={() => onOpen(a.id)} data-agent={a.id} data-posture={p}>
      <span className="ag-jw">
        <Named name={a.name}><Jelly size={44} doing={p === "working" ? "work" : "rest"} turn={a.turn} className={grey ? "ag-asleep" : undefined} /></Named>
        {p === "blocked" && <Lock />}
      </span>
      <b className="ag-one">{a.name}</b>
      <small className="ag-role">{a.role || a.job}</small>
      {home && <span className="ag-home">{home}</span>}
      <span className={`ag-st ag-st-${p}`}>{cardStatus(a, now)}</span>
    </button>
  );
}

/** "Today": each agent's runs on one axis of the day, past ones faded, the next ones named, a "now" mark. Held ones (a
 *  blocked agent will not run) are grey. */
function Today({ agents, now, onOpen }: { agents: AgentRow[]; now: number; onOpen: (id: string) => void }) {
  const t = todayOf(agents, now);
  if (!t.marks.length) return null;
  return (
    <>
      <p className="ag-lbl">Today <small>what ran, what is next</small></p>
      <div className="ag-today" style={{ "--ag-lanes": t.lanes } as CSSProperties} data-today>
        <div className="ag-axis" />
        <div className="ag-axis-past" style={{ width: `${t.now}%` }} />
        {[0, 6, 12, 18, 24].map((h) => <span key={h} className="ag-hr" style={{ left: `${axisX(h * 60)}%` }}>{String(h % 24).padStart(2, "0")}:00</span>)}
        {t.marks.map((m, i) => (
          <button type="button" key={`${m.id}${m.at}${i}`} className={`ag-ev ag-ev-${m.kind} ${m.held ? "ag-ev-held" : ""}`} style={{ left: `${m.x}%`, "--ag-lane": m.lane } as CSSProperties}
            onClick={() => onOpen(m.id)} title={`${m.name}: ${m.what}`} data-mark={m.kind}>
            <Jelly size={20} doing="rest" turn={m.turn} className={m.held ? "ag-asleep" : undefined} />
            <span className="ag-one">{m.kind === "past" ? "" : m.name}</span>
          </button>
        ))}
        <div className="ag-nowmark" style={{ left: `${t.now}%` }}><span>now</span></div>
      </div>
    </>
  );
}

/** a typed job: a dashed card among the cards, or (`line`) a plain one-line field; under four words, a sticky is enough */
function Typed({ onMake, line: plain = false }: { onMake: (line: string) => void; line?: boolean }) {
  const [line, setLine] = useState("");
  const [say, setSay] = useState("");
  const go = () => { const t = typedJob(line); if (!t.ok) { setSay(t.say); return; } onMake(t.line); };
  const input = (
    <input value={line} onChange={(ev) => { setLine(ev.target.value); setSay(""); }} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); go(); } }}
      placeholder={plain ? "Say a job in one line…" : "New agent: say a job…"} aria-label="say a job for a new agent" maxLength={240} />
  );
  if (plain) return <label className="ag-typed-line">{input}<small className="ag-mute">{say || "what comes in, and what it makes"}</small></label>;
  return (
    <label className="ag-card ag-typed">
      <Outline size={44} />
      {input}
      <small className="ag-role">{say || "what comes in, and what it makes"}</small>
    </label>
  );
}
