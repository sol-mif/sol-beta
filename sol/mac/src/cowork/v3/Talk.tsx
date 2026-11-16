// Cowork v3, slice 5 (fr-30, #558): Talk per thing. A thin layer over today's Talk (../Talk.tsx, through its `via`): the
// project's threads stand beside it, general first, then one per item, loose thing and artifact, each with its two marks
// (whose face, where it lives). A line becomes a loose thing with one press beside it; @name is an ask, and an ask to me
// lights the thread in ember until I speak there or press "done". Read and written through team.v3.talk.* (ask5.ts).
import { useEffect, useMemo, useState } from "react";
import { Talk as Today, type TalkLine, type TalkVia } from "../Talk";
import type { Team } from "../useTeam";
import { Who, since } from "../bits";
import { ask5, onPush, plain } from "./ask5";

type Line = { id: string; thread: string; from: string; agent?: string; at: number; text: string; asks: string[]; loose?: string };
type Thread = { id: string; kind: string; title: string; whose?: string; place?: string; state?: string; lines: number; last?: Line; asksMe: number };
type Ask = { id: string; from: string; to: string; text: string; about: string; line: string; at: number };
type Threads = { me: string; role: "owner" | "editor" | "guest" | null; threads: Thread[]; names: string[] };
const PLACE: Record<string, string> = { record: "Sol's record", drive: "Drive", calendar: "Calendar", email: "Email", chat: "Discord", figma: "Figma", github: "GitHub" };
const placeOf = (p?: string) => (p ? PLACE[p] ?? p : "Sol's record");

/** the engine's line, as today's Talk draws one: an agent wears its person's mark */
const toLine = (l: Line): TalkLine => ({ id: l.id, thread: l.thread, from: l.agent ? `${l.from}'s agent` : l.from, at: l.at, text: l.text, source: "relay", ...(l.agent ? { agent: true } : {}) });

export function TalkV3({ team, project, flash }: { team: Team; project: string; flash: (s: string) => void }) {
  const [t, setT] = useState<Threads | null>(null);
  const [bad, setBad] = useState("");
  const [thread, setThread] = useState("general");
  const [loose, setLoose] = useState<Record<string, string>>({});   // line id → its loose thing, as made here or read
  const [asks, setAsks] = useState<Ask[]>([]);
  const read = () => void ask5<Threads>("talk", "threads", { project }).then((r) => { if (r.error) setBad(plain(r.error)); else { setBad(""); setT(r); } });
  useEffect(() => {
    read();
    return onPush((m) => { if (m.project === project && m.type === "work.v3.talk.line") read(); else if (m.type === "work.v3.talk.asked" && m.project === project) read(); });
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = t?.threads.find((x) => x.id === thread);
  const toLoose = async (l: TalkLine) => {
    const r = await ask5<{ loose: string; already?: boolean }>("talk", "loose", { project, line: l.id });
    if (r.error) { flash(plain(r.error)); return; }
    setLoose((m) => ({ ...m, [l.id]: r.loose }));
    flash(r.already ? "that line is a loose thing already" : "a loose thing now, in Sol's record: it waits in the plan's loose things");
    read();
  };
  const done = async (a: Ask) => {
    const r = await ask5("talk", "answer", { project, ask: a.id });
    if (r.error) flash(plain(r.error)); else { setAsks((x) => x.filter((y) => y.id !== a.id)); read(); }
  };
  const via: TalkVia = useMemo(() => ({
    thread,
    about: thread === "general" ? "general · everyone" : here?.title ?? thread,
    names: t?.names ?? [],
    ...(t?.role === "guest" ? { readOnly: "view only: a guest reads Talk and writes nothing here" } : {}),
    history: async (th) => {
      const r = await ask5<{ lines: Line[]; asks: Ask[] }>("talk", "thread", { project, thread: th });
      if (r.error) return { error: r.error };
      setAsks(r.asks ?? []);
      setLoose((m) => ({ ...m, ...Object.fromEntries(r.lines.filter((l) => l.loose).map((l) => [l.id, l.loose!])) }));
      return { thread: th, lines: r.lines.map(toLine) };
    },
    say: async (th, text) => {
      const r = await ask5<{ line: Line; asks: Ask[] }>("talk", "say", { project, thread: th, text });
      if (r.error) return { ok: false, error: r.error };
      if (r.asks?.length) flash(`asked ${r.asks.map((a) => a.to).join(", ")}: it waits in their "needs me"`);
      return { ok: true, id: r.line.id, sent: true };
    },
    line: (m) => (m?.type === "work.v3.talk.line" && m.project === project && typeof m.id === "string" ? toLine(m as Line) : null),
    end: (l) => loose[l.id]
      ? <span className="v5-loosed" title="this line is a loose thing in the plan">loose thing</span>
      : t?.role && t.role !== "guest" ? <button className="v5-toloose" onClick={() => void toLoose(l)} title="make this line a loose thing: it waits in the plan, its words and who said it come along">make it a loose thing</button> : null,
  }), [thread, project, t, here?.title, loose]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="v5-talk" data-v3-room="talk">
      <nav className="v5-threads" aria-label="threads">
        {bad && <p className="v5-bad">{bad}</p>}
        {(t?.threads ?? [{ id: "general", kind: "general", title: "general", lines: 0, asksMe: 0 } as Thread]).map((x) => (
          <button key={x.id} className={`v5-th ${x.id === thread ? "on" : ""} ${x.asksMe ? "asks" : ""}`} onClick={() => setThread(x.id)} aria-current={x.id === thread}
            title={x.asksMe ? `${x.asksMe} ask${x.asksMe > 1 ? "s" : ""} to you here` : x.title}>
            {x.kind === "general" ? <span className="v5-gen" aria-hidden>#</span> : <Who login={x.whose ?? ""} size={18} />}
            <span className="v5-th-t">
              <b>{x.title}</b>
              <small>{x.kind === "general" ? "everyone" : `${x.kind} · ${placeOf(x.place)}`}{x.last ? ` · ${since(x.last.at)}` : ""}</small>
            </span>
            {x.asksMe > 0 && <span className="v5-ember" aria-label="asks you">{x.asksMe}</span>}
          </button>
        ))}
      </nav>
      <div className="v5-convo">
        {asks.map((a) => (
          <div key={a.id} className="v5-ask" role="status">
            <Who login={a.from} size={18} />
            <span className="v5-ask-t"><b>{a.from} asked you</b> {a.text}</span>
            <button className="wbtn ghost" onClick={() => void done(a)} title="answered elsewhere: it leaves your needs me">done</button>
          </div>
        ))}
        <Today key={project} team={team} flash={flash} via={via} />
      </div>
    </div>
  );
}
