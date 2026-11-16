// Cowork v3, slice 5 (fr-30, #558): setup by conversation. The agent at hand, large, asks "tell me about your project"
// with four starts; then where the files live; then it proposes each piece (rooms, places, what starts running) as a
// card, Yes or Not this. Nothing is set until a Yes: each Yes writes that piece of the project's shape as events on the
// trail (team.v3.setup.yes). "Start like" copies another project's shape, never its things. Behaviour copied from the
// prototype's setupConvo (cowork-proto/rooms-people.js) and walk.js "Two founders".
import { useEffect, useRef, useState } from "react";
import { composing } from "../../ime";
import { Mark } from "../../Mark";
import { Who } from "../bits";
import { ask5, plain } from "./ask5";

type Card = { id: string; kind: "room" | "place" | "automation"; name: string; why: string; state?: "in" | "not" };
type Press = { label: string; words?: string; act?: "yesAll" | "change" };
type Turn = { step: number; say: string; presses: Press[]; cards?: Card[] };
type Open = { name: string; role: "owner" | "editor" | "guest" | null; turn: Turn; likes: { id: string; name: string }[]; now: { rooms: string[] } };
type Said = { who: "sol" | "me"; text: string; presses?: Press[] };
const GROUP: Record<Card["kind"], string> = { room: "Rooms", place: "Places", automation: "Starts running" };

export function Setup({ me, project, flash }: { me: string; project: string; flash: (s: string) => void }) {
  const [said, setSaid] = useState<string[]>([]);
  const [like, setLike] = useState("");
  const [o, setO] = useState<Open | null>(null);
  const [log, setLog] = useState<Said[]>([]);
  const [nots, setNots] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [bad, setBad] = useState("");
  const input = useRef<HTMLInputElement>(null), end = useRef<HTMLDivElement>(null);

  const talk = async (words: string[], l = like, quiet = false) => {
    const r = await ask5<Open>("setup", words.length ? "answer" : "open", { project, said: words, ...(l ? { like: l } : {}) });
    if (r.error) { setBad(plain(r.error)); return; }
    setBad(""); setO(r);
    if (!quiet) setLog((g) => [...g, { who: "sol", text: r.turn.say, presses: r.turn.presses }]);
    // words that put a card back take it off "Not this"; words that drop one put it there
    if (r.turn.cards) setNots((n) => { const x = new Set(n); for (const c of r.turn.cards!) { if (c.state === "not") x.add(c.id); } return x; });
  };
  useEffect(() => { setSaid([]); setLog([]); setNots(new Set()); void talk([]); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log.length]);

  const answer = (v: string) => {
    const w = v.trim(); if (!w) return;
    setLog((g) => [...g, { who: "me", text: w }]);
    const next = [...said, w]; setSaid(next); setText("");
    void talk(next);
  };
  const cards = o?.turn.cards ?? [];
  const yes = async (ids: string[]) => {
    if (!ids.length) return;
    const r = await ask5<{ events: number }>("setup", "yes", ids.length === 1 ? { project, card: ids[0] } : { project, cards: ids });
    if (r.error) { flash(plain(r.error)); return; }
    await talk(said, like, true);
    if (ids.length > 1) setLog((g) => [...g, { who: "sol", text: `Done. ${o?.name ?? "The project"} is set up${r.events ? "" : ": it already was"}. Places come in as "to connect": sign in on each one's own page.` }]);
  };
  const press = (p: Press) => {
    if (p.words) answer(p.words);
    else if (p.act === "yesAll") void yes(cards.filter((c) => c.state !== "in" && !nots.has(c.id)).map((c) => c.id));
    else if (p.act === "change") { setLog((g) => [...g, { who: "sol", text: "Say Not this on a card, or tell me what to add." }]); input.current?.focus(); }
  };
  const startLike = async (id: string, name: string) => {
    const r = await ask5<{ events: number }>("setup", "like", { project, like: id });
    if (r.error) { flash(plain(r.error)); return; }
    setLike(id);
    setLog((g) => [...g, { who: "sol", text: `Copied ${name}'s shape: its rooms, its places (to connect again), where things go, its automations (off until you turn them on). None of its things came along.` }]);
    void talk(said, id);
  };

  const owner = o?.role === "owner" || o?.role === null;
  const last = log.length - 1;
  return (
    <div className={`v5-setup ${cards.length ? "has-cards" : ""}`} data-v3-room="setup">
      {cards.length > 0 && (
        <div className="v5-cards">
          {(["room", "place", "automation"] as const).map((k) => {
            const list = cards.filter((c) => c.kind === k);
            return list.length ? (
              <div key={k} className="v5-cg"><div className="v5-cg-k">{GROUP[k]}</div>
                {list.map((c) => {
                  const st = c.state === "in" ? "in" : nots.has(c.id) ? "not" : "";
                  return (
                    <div key={c.id} className={`v5-card ${st}`}>
                      <Who login={me} size={18} title="yours: you say yes" />
                      <div className="v5-card-t"><b>{c.name}</b><small>{c.why}</small></div>
                      <div className="v5-card-acts">
                        {st === "in" ? <span className="v5-in">in</span>
                          : st === "not" ? <button className="wbtn ghost" onClick={() => setNots((n) => { const x = new Set(n); x.delete(c.id); return x; })}>Put it back</button>
                          : owner ? <>
                            <button className="wbtn" onClick={() => void yes([c.id])}>Yes</button>
                            <button className="wbtn ghost" onClick={() => setNots((n) => new Set(n).add(c.id))}>Not this</button>
                          </> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null;
          })}
          <p className="v5-core">Always there: Plan, Talk, People.</p>
        </div>
      )}
      <div className="v5-convo-big">
        <div className="v5-agent"><Mark size={44} live /><div><b>Your agent</b><small>{like ? `shaped like ${o?.likes.find((x) => x.id === like)?.name ?? like} · ` : "listens first · "}nothing is set until you say yes</small></div></div>
        {bad && <p className="v5-bad">{bad}</p>}
        {!owner && o && <p className="v5-quiet">Only an owner changes the setup. What {o.name} is, and its rooms, are on its page.</p>}
        <div className="v5-log">
          {log.map((m, i) => (
            <div key={i} className={`v5-msg ${m.who}`}>
              <p>{m.text}</p>
              {m.who === "sol" && i === last && owner && m.presses && m.presses.length > 0 && (
                <div className={`v5-presses ${m.presses.length > 2 ? "four" : ""}`}>{m.presses.map((p) => <button key={p.label} className="wbtn ghost" onClick={() => press(p)}>{p.label}</button>)}</div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        {owner && o?.turn.step === 0 && (o?.likes.length ?? 0) > 0 && !like && (
          <div className="v5-like"><small>Start like</small>{o!.likes.map((p) => <button key={p.id} className="wbtn ghost" onClick={() => void startLike(p.id, p.name)} title={`copy ${p.name}'s rooms, places and where things go; none of its things`}>{p.name}</button>)}</div>
        )}
        {owner && (
          <form className="v5-box" onSubmit={(ev) => { ev.preventDefault(); answer(text); }}>
            <input ref={input} type="text" value={text} placeholder="Tell it in your own words" spellCheck={false}
              onChange={(ev) => setText(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter" && composing(ev)) ev.preventDefault(); }} />
            <button className="wbtn" disabled={!text.trim()}>send</button>
          </form>
        )}
      </div>
    </div>
  );
}
