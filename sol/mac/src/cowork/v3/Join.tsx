// Cowork v3, slice 5 (fr-30, #558): joining. An owner makes the project's link (it expires in a week; editor or guest);
// a person who opens it waits until an owner lets them in with one press, on a black card like the notch's; then their
// arrival is their role's: an owner sees the setup, an editor three things, a guest what it is, view only. The three
// arrivals stand as stills, yours lifted. Read and written through team.v3.join.* (ask5.ts).
import { useEffect, useState } from "react";
import { Who } from "../bits";
import { ask5, onPush, plain } from "./ask5";

type Role = "owner" | "editor" | "guest";
type Arrival =
  | { role: "owner"; title: string; rooms: string[]; presses: string[] }
  | { role: "editor"; title: string; three: { k: string; v: string; marks?: string[] }[] }
  | { role: "guest"; title: string; what: string; faces: string[]; line: string }
  | { role: null; title: string; line: string };
type Arrivals = { you: Arrival; stills: Arrival[]; members: { who: string; role: Role }[] };
type Waiting = { who: string; role: Role; name?: string; at: number };
const PLACE: Record<string, string> = { drive: "Drive", calendar: "Calendar", email: "Email", chat: "Discord", figma: "Figma", github: "GitHub" };
const ROLE: Record<Role, [string, string]> = { owner: ["Owner", "sees the setup"], editor: ["Editor", "three things"], guest: ["Guest", "what it is"] };

export function Join({ project, flash }: { project: string; flash: (s: string) => void }) {
  const [a, setA] = useState<Arrivals | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [made, setMade] = useState<{ url: string; until: number; role: Role } | null>(null);
  const [paste, setPaste] = useState("");
  const [said, setSaid] = useState("");
  const read = () => {
    void ask5<Arrivals>("join", "arrival", { project }).then((r) => { if (!r.error) setA(r); });
    void ask5<{ waiting: Waiting[] }>("join", "waiting", { project }).then((r) => { if (!r.error) setWaiting(r.waiting); });
  };
  useEffect(() => { setMade(null); read(); return onPush((m) => { if (m.project === project && /^work\.v3\.join\.(waiting|in)$/.test(m.type)) read(); }); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = a?.you.role === "owner" || (a && a.members.length === 0);

  const link = async (role: Role) => {
    const r = await ask5<{ url: string; until: number; role: Role }>("join", "link", { project, role });
    if (r.error) { flash(plain(r.error)); return; }
    setMade(r); read();
    try { await navigator.clipboard.writeText(r.url); flash("the link is copied: it works for a week"); } catch { /* shown below to copy by hand */ }
  };
  const letIn = async (w: Waiting) => {
    const r = await ask5<{ count: number }>("join", "letin", { project, who: w.who });
    if (r.error) { flash(plain(r.error)); return; }
    flash(`${w.name ?? w.who} is in, as ${w.role}: ${r.count} in the project now`); read();
  };
  const open = async () => {
    const r = await ask5<{ asked?: boolean; already?: Role; name: string; owner?: string }>("join", "open", { url: paste.trim() });
    setPaste("");
    setSaid(r.error ? plain(r.error) : r.already ? `you are in ${r.name} already, as ${r.already}` : `asked into ${r.name}: you are in once an owner lets you in`);
  };

  return (
    <div className="v5-join" data-v3-room="join">
      {waiting.length > 0 && owner && (
        <div className="v5-letins">{waiting.map((w) => (
          <div key={w.who} className="v5-letin" role="status">
            <Who login={w.who} size={22} />
            <span className="v5-letin-t"><b>{w.name ?? w.who} wants in</b><small>as {w.role} · by the project's link</small></span>
            <button className="v5-pearl" onClick={() => void letIn(w)}>let in</button>
          </div>
        ))}</div>
      )}
      {owner && (
        <section className="v5-invite">
          <h3>Bring someone in</h3>
          <div className="v5-presses">
            <button className="wbtn" onClick={() => void link("editor")}>a link for an editor</button>
            <button className="wbtn ghost" onClick={() => void link("guest")}>for a guest</button>
          </div>
          {made && <p className="v5-link"><code>{made.url}</code><small>{made.role} · works until {new Date(made.until).toLocaleDateString()} · opening it is not access: you let them in</small></p>}
        </section>
      )}
      <section className="v5-arrs" aria-label="arrival, per role">
        {(a?.stills ?? []).map((s) => {
          const r = s.role as Role, you = a?.you.role === r, who = (a?.members ?? []).filter((m) => m.role === r).map((m) => m.who);
          return (
            <div key={r} className={`v5-arr ${you ? "you" : ""}`}>
              <div className="v5-arr-h"><b>{ROLE[r][0]}</b><small>{ROLE[r][1]}</small>{you ? <span className="v5-you">you</span> : <span className="v5-faces">{who.slice(0, 3).map((x) => <Who key={x} login={x} size={16} />)}</span>}</div>
              <Still a={s} />
            </div>
          );
        })}
        {a?.you.role === null && <p className="v5-quiet">{a.you.line}</p>}
      </section>
      <form className="v5-box v5-open" onSubmit={(ev) => { ev.preventDefault(); void open(); }}>
        <input type="text" value={paste} placeholder="a sol://join link someone gave you" spellCheck={false} onChange={(ev) => { setPaste(ev.target.value); setSaid(""); }} />
        <button className="wbtn" disabled={!paste.trim().startsWith("sol://join")}>open</button>
      </form>
      {said && <p className="v5-quiet" role="status">{said}</p>}
    </div>
  );
}

function Still({ a }: { a: Arrival }) {
  if (a.role === "owner") return (<div className="v5-arr-c"><p className="v5-what">{a.title}</p><p className="v5-mods">{a.rooms.map((x) => <span key={x}>{x}</span>)}</p></div>);
  if (a.role === "editor") return (<ol className="v5-arr-c v5-three">{a.three.map((x) => <li key={x.k}><small>{x.k}</small><span>{x.v}</span>{x.marks?.length ? <span className="v5-marks">{x.marks.map((m) => <i key={m}>{PLACE[m] ?? m}</i>)}</span> : null}</li>)}</ol>);
  if (a.role === "guest") return (<div className="v5-arr-c"><p className="v5-what">{a.what}</p><p className="v5-quiet">{a.line}</p></div>);
  return <p className="v5-quiet">{a.line}</p>;
}
