// The one session at team size (#1002, team.html), behind `build.one.team`: the team in one person's window, in the one
// session's own grammar. A hand to me is a piece with my hands on it; what I give crosses into their window as their
// piece, and my line says where it went, with pull back until they act; what passes between two others is one quiet
// line. No board of people, no feed, no inbox: only what needs me, and six lines at most. The record is the issues'
// hands lines (cowork/handed.ts, engine hand.ts); nothing here keeps a second copy.
// Keys: in a hand's piece, Enter takes it (or passes it back when a line is typed), Escape puts it off till later;
// g (outside a field) opens the give piece, its picks by arrows and Enter; on a sent line, Enter on "pull back".
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as RKey } from "react";
import { buildSwitch } from "../flag";
import { useHands, take, justTake, pass, later, handTo, type Handed } from "../cowork/handed";
import { useTeam } from "../cowork/useTeam";
import { teamAsk } from "../cowork/stable";
import { TEAM_FLAG, SETTING_WORDS, piecesOf, linesOf, whoFor, givable, canPullBack, gist, initial, type Setting, type TeamPiece, type TeamLine } from "./team";
import type { Metas } from "../home/meta";
import "./team.css";

const sw = buildSwitch(TEAM_FLAG);
export const useBuildOneTeam = () => useSyncExternalStore(sw.sub, sw.get);
export const setBuildOneTeam = (v: boolean) => sw.set(v);

const SETTING_KEY = "sol.one.team.setting";
const settingNow = (): Setting => { try { const v = localStorage.getItem(SETTING_KEY); return v === "tells" || v === "does" ? v : "asks"; } catch { return "asks"; } };

export const meta = {
  TeamLayer: {
    job: "the team in the one session's window: a hand to me is a piece, what I give is a line with pull back, a teammate's is a quiet line",
    flow: "team",
    states: ["nothing from the team", "a hand to me (a piece)", "giving (pick what, pick who)", "a send untaken (pull back)", "taken"],
    keys: [
      { press: "Enter in a hand's piece", does: "takes it, or passes it back when a line is typed" },
      { press: "Escape in a hand's piece", does: "later: it stays handed to you, off the stage" },
      { press: "g", does: "opens the give piece: what, then who (the area's lead first)" },
      { press: "Enter on pull back", does: "takes a hand of yours back while they have not acted" },
    ],
    listens: ["team.hands (cowork/handed.ts)", "the board's leads (useTeam)", "build.one.team"],
  },
} satisfies Metas;

// what I just did with the team, for the glance's "what did I just do": the last deed, and its undo while it has one
// (a give: pull back, until they act)
export type TeamDid = { at: number; words: string; back?: { repo: string; issue: number } };
let did: TeamDid | null = null;
const didSubs = new Set<() => void>();
const setDid = (d: TeamDid | null) => { did = d; didSubs.forEach((f) => f()); };
export const useTeamDid = () => useSyncExternalStore((f) => { didSubs.add(f); return () => { didSubs.delete(f); }; }, () => did);
/** undo the last team deed: a give is pulled back (the engine refuses once they acted, and says who) */
export async function undoTeamDid(): Promise<{ error?: string }> {
  const d = did;
  if (!d?.back) return { error: "nothing to undo" };
  const r = await teamAsk<{ ok?: boolean }>("team.hand.back", d.back, 60_000);
  if (r.error || !r.ok) return { error: r.error || "no reason given" };
  setDid({ at: Date.now(), words: `pulled #${d.back.issue} back` });
  return {};
}

/** what needs me from the team, for the glance: how many hands wait on me, and the newest one's words */
export function useTeamNeeds(): { count: number; first: string } {
  const on = useBuildOneTeam();
  const h = useHands();
  const p = on ? piecesOf(h.pending, h.laterOf, h.hands) : [];
  return { count: p.length, first: p[0] ? `${p[0].from} gave you #${p[0].issue}` : "" };
}

export function TeamLayer() {
  const on = useBuildOneTeam();
  return on ? <Team /> : null;
}

function Team() {
  const h = useHands();
  const t = useTeam();
  const me = t.state?.me.login ?? "";
  const [setting, setSettingS] = useState<Setting>(settingNow);
  const [giving, setGiving] = useState(false);
  const [msg, setMsg] = useState("");
  const pieces = useMemo(() => piecesOf(h.pending, h.laterOf, h.hands), [h.pending, h.hands, h.laterOf]);
  const lines = useMemo(() => linesOf(me, h.hands), [me, h.hands]);
  const auto = useRef(new Set<string>());

  // the record, read again while the window is open: a hand crosses at the receiver's next read (the relay is faster)
  useEffect(() => { const i = window.setInterval(() => { if (!document.hidden) void teamAsk("team.hands.get", { refresh: true }, 60_000); }, 15_000); return () => clearInterval(i); }, []);
  // g opens the give piece, from anywhere outside a field
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "g" || e.metaKey || e.ctrlKey || e.altKey || (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))) return;
      e.preventDefault(); setGiving(true);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  // my setting, does then tells or does: my agent takes a hand to me itself and starts its session; a line says so.
  // Once per hand, on this window only; asks first leaves it a piece
  useEffect(() => {
    if (setting === "asks") return;
    for (const p of pieces) if (!auto.current.has(p.id) && !p.passedBack) { auto.current.add(p.id); void take(p).then((r) => setMsg(r.error ? `your agent could not take #${p.issue}: ${r.error}` : `your agent took #${p.issue} from ${p.from} and started it`)); }
  }, [pieces, setting]);

  const setSetting = (s: Setting) => { try { localStorage.setItem(SETTING_KEY, s); } catch { /* private */ } setSettingS(s); };
  const shown = setting === "asks" ? pieces : pieces.filter((p) => p.passedBack);
  const quietOnes = setting === "does" ? lines.filter((l) => l.kind !== "mine-took") : lines;

  return (
    <section className="one-team" aria-label="the team">
      {shown.map((p) => <HandPiece key={p.id} p={p} />)}
      {giving && <GivePiece me={me} t={t} onClose={(said) => { setGiving(false); if (said) setMsg(said); }} />}
      {(quietOnes.length > 0 || msg) && <ul className="t-lines" aria-label="the team, one line each">
        {msg && <li className="t-line"><i className="t-who t-me">{initial(me || "you")}</i><span>{msg}</span></li>}
        {quietOnes.map((l) => <Line key={l.id + l.at} l={l} onErr={setMsg} />)}
      </ul>}
      <div className="t-foot">
        <button className="one-ghost" onClick={() => setGiving((v) => !v)} aria-expanded={giving} title="g">give to a teammate <kbd>g</kbd></button>
        <span className="t-set" role="radiogroup" aria-label="a hand to me">
          <small>a hand to me:</small>
          {(Object.keys(SETTING_WORDS) as Setting[]).map((s) => <button key={s} role="radio" aria-checked={setting === s} className={`t-opt ${setting === s ? "on" : ""}`} onClick={() => setSetting(s)}>{SETTING_WORDS[s]}</button>)}
        </span>
      </div>
    </section>
  );
}

// a hand to me: the piece. Its whose mark is the sender's initial; my hands are on it
function HandPiece({ p }: { p: TeamPiece & { doing?: { said: string; failed?: boolean } } }) {
  const h = useHands();
  const doing = h.doingOf(p.id);
  const busy = !!doing?.said && !doing.failed;   // being written, or done and leaving
  const [line, setLine] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const go = () => {
    if (line.trim()) void pass(p, line.trim()).then(() => setDid({ at: Date.now(), words: `passed #${p.issue} back to ${p.from}` }));
    else void take(p).then((r) => { if (!r.error) setDid({ at: Date.now(), words: `took #${p.issue} from ${p.from}` }); });
  };
  const putOff = () => { later(p); setDid({ at: Date.now(), words: `put #${p.issue} off till later` }); };
  const keys = (e: RKey) => {
    if (e.key === "Escape") { e.preventDefault(); putOff(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); go(); }
  };
  const brief = String(p.brief ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4);
  return (
    <article className="o-piece open lack-call t-hand" data-hand={p.id} onKeyDown={keys} aria-label={`${p.from} gave you #${p.issue}: needs your call`}>
      <header>
        <span className="p-title"><i className="t-who">{initial(p.from)}</i>{p.passedBack ? `${p.from} passed #${p.issue} back to you` : `${p.from} gave you #${p.issue}`}</span>
        <span className="o-chip call">your call</span>
      </header>
      <div className="p-say t-say"><p>{gist(p)}</p></div>
      {brief.length > 1 && <ul className="t-brief">{brief.slice(p.title ? 0 : 1).map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {p.branch && <p className="p-who">on <b>{p.branch}</b></p>}
      <footer>
        <input ref={box} className="p-box" value={line} disabled={busy} placeholder={`take it, or say why and it goes back to ${p.from}`}
          aria-label={`a line, if you pass it back to ${p.from}`} onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(); } }} />
        {busy ? <span className="o-going" aria-live="polite">{doing!.said}</span> : <>
          <button className="o-send" onClick={go} title="Enter">{line.trim() ? `pass back to ${p.from}` : "take it"}</button>
          {doing?.failed && !line.trim() && <button className="o-undo" onClick={() => void justTake(p).then((r) => { if (!r.error) setDid({ at: Date.now(), words: `took #${p.issue} from ${p.from}, no session yet` }); })} title="the take is written on the issue; no session starts">take it, no session yet</button>}
          <button className="o-drop" onClick={putOff} title="Escape: it stays handed to you, off the stage">later</button>
        </>}
      </footer>
      {doing?.failed && <p className="p-who t-bad" role="alert">{doing.said}</p>}
    </article>
  );
}

// giving: what (my open issues), then who (the area's lead first); it crosses into their window as their piece
function GivePiece({ me, t, onClose }: { me: string; t: ReturnType<typeof useTeam>; onClose: (said?: string) => void }) {
  const cards = givable(t.board?.cards ?? [], me);
  const [what, setWhat] = useState(0);
  const [who, setWho] = useState(0);
  const [busy, setBusy] = useState(false);
  const card = cards[what] ?? null;
  // the team's people: its members, the humans on its line, and every lead of its areas (a member list may be unread)
  const leads = Object.values(t.board?.leads ?? {}).flatMap((byLabel) => Object.values(byLabel).flat());
  const known = [...(t.state?.members ?? []), ...(t.state?.roster ?? []).filter((m) => !m.agent).map((m) => m.who), ...leads];
  const people = whoFor(card, t.board ?? null, [...new Set(known)], me);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => { setWho(0); }, [what]);
  const give = async () => {
    if (!card || !people[who] || busy) return;
    setBusy(true);
    const r = await handTo({ repo: card.repo, issue: card.number, to: people[who].login });
    setBusy(false);
    if (!r.error) setDid({ at: Date.now(), words: `gave #${card.number} to ${people[who].login}`, back: { repo: card.repo, issue: card.number } });
    onClose(r.error ? `not given: ${r.error}` : undefined);
  };
  const arrows = (n: number, set: (f: (i: number) => number) => void) => (e: RKey) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); set((i) => Math.min(n - 1, i + 1)); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); set((i) => Math.max(0, i - 1)); }
  };
  return (
    <article className="o-piece open lack-call t-give" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void give(); } }} aria-label="give to a teammate">
      <header><span className="p-title">give to a teammate</span><span className="o-chip call">your call</span></header>
      {!cards.length ? <p className="p-who">Nothing of yours is open on the board to give. An issue you hold shows here.</p> : <>
        <ul className="o-parts" role="radiogroup" aria-label="what to give" onKeyDown={arrows(cards.length, setWhat)}>
          {cards.map((c, i) => <li key={`${c.repo}#${c.number}`}><button ref={i === 0 ? first : undefined} role="radio" aria-checked={i === what} tabIndex={i === what ? 0 : -1}
            className={`o-part ${i === what ? "on" : ""}`} onClick={() => setWhat(i)}><i className="o-box">{i === what ? "✓" : ""}</i><span className="pt">#{c.number} {c.title}</span><span className="pw">{c.labels.join(" · ")}</span></button></li>)}
        </ul>
        <div className="o-choices" role="radiogroup" aria-label="to whom" onKeyDown={arrows(people.length, setWho)}>
          {people.map((p, i) => <button key={p.login} role="radio" aria-checked={i === who} tabIndex={i === who ? 0 : -1} className={`o-choice ${i === who ? "on" : ""}`} onClick={() => setWho(i)}>
            <i className="t-who">{initial(p.login)}</i>{p.login}{p.leads ? <small> · leads {p.leads}</small> : null}</button>)}
        </div>
      </>}
      <footer>
        <span className="o-going">{card && people[who] ? `#${card.number} goes into ${people[who].login}’s window as theirs; pull back until they act` : ""}</span>
        <button className="o-send" disabled={!card || !people[who] || busy} onClick={() => void give()} title="⌘↵">{busy ? "giving…" : people[who] ? `give to ${people[who].login}` : "give"}</button>
        <button className="o-drop" onClick={() => onClose()} title="Escape">not now</button>
      </footer>
    </article>
  );
}

function Line({ l, onErr }: { l: TeamLine; onErr: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const back = async () => {
    setBusy(true);
    const r = await teamAsk<{ ok?: boolean }>("team.hand.back", { repo: l.repo, issue: l.issue }, 60_000);
    setBusy(false);
    if (r.error || !r.ok) onErr(`not pulled back: ${r.error || "no reason given"}`);
    else setDid({ at: Date.now(), words: `pulled #${l.issue} back from ${l.who}` });
  };
  return (
    <li className={`t-line ${l.quiet ? "quiet" : ""} k-${l.kind}`}>
      <i className={`t-who ${l.kind === "theirs" ? "dim" : ""}`}>{initial(l.who)}</i><span>{l.text}</span>
      {canPullBack(l) && <button className="o-undo" disabled={busy} onClick={() => void back()} title="until they act">{busy ? "pulling back…" : "pull back"}</button>}
    </li>
  );
}

export type { Handed };
