// Cowork v3 slice 3 (fr-30 F5, F8, #556): People. Everyone in the project by what each is on, the people on one thing
// side by side, their agent a hollow ring beside them (never beside a guest). Under them, roles and the three layers as
// one picture: who is owner, editor, guest, and each setting as team, project, me, the one that counts lit. A press on a
// face opens its small card in place: their window, and, for an owner or for myself, what leaving would leave behind.
// An item dropped on a face is a hand: a card asks Send or Keep, nothing is written before Send, Undo after.
import { useEffect, useState } from "react";
import type { Team } from "../useTeam";
import { Body } from "../bits";
import { UndoLine } from "./Window";
import type { PeopleAnswer, Role, Station } from "./peopleTypes";
import { Leave } from "./Leave";   // the one leaving card, slice 7's
import { askV3 } from "./ask";
import type { Floor } from "./seven";

const ROLE_WORD: Record<Role, string> = { owner: "Owners", editor: "Editors", guest: "Guests" };
const ROLE_RULE: Record<Role, string> = { owner: "set the team's defaults, let people in and out", editor: "write, press, and have an agent", guest: "read only: no composer, no presses, no agent" };
const LAYER_WORD = { team: "Team", project: "Project", me: "Me" } as const;
type Hand = { kind: "hand"; item: string; title: string; to: string; foot: string };

export function People({ team, onWindow }: { team: Team; onWindow: (who: string) => void }) {
  const [a, setA] = useState<PeopleAnswer | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [leave, setLeave] = useState<NonNullable<Floor["leave"]> | null>(null);
  const [hand, setHand] = useState<Hand | null>(null);
  const [undo, setUndo] = useState<{ text: string; token: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const read = () => void team.ask<PeopleAnswer>("team.v3.people", {}).then((r) => { if (r.error) setErr(r.error); else { setErr(""); setA(r); } });
  useEffect(read, []); // eslint-disable-line react-hooks/exhaustive-deps
  const write = async (body: object) => {
    const r = await team.ask<{ ok?: true; error?: string }>("team.v3.people", body);
    if (r.error) setErr(r.error); else read();
    return r;
  };

  const owner = a?.role === "owner";
  const press = (s: Station) => { setLeave(null); setOpen(open === s.who ? null : s.who); };
  const askLeave = async (who: string) => {
    const r = await askV3<Floor>("team.v3.floor.get", { project: a?.project, who });
    if (r.error) setErr(r.error); else setLeave(r.leave ?? null);
  };
  // a hand: an item dropped on a face (a session row, a card) carries its id and title
  const drop = (to: string) => async (ev: React.DragEvent) => {
    ev.preventDefault(); setOver(null);
    const raw = ev.dataTransfer.getData("application/x-sol-item") || ev.dataTransfer.getData("text/plain");
    let item: { id?: string; title?: string } = {};
    try { item = JSON.parse(raw); } catch { item = { id: raw.slice(0, 80), title: raw.slice(0, 80) }; }
    if (!item.id) return;
    const r = await team.ask<Hand & { error?: string }>("team.v3.people", { op: "hand", item: item.id, title: item.title ?? item.id, to });
    if (r.error) setErr(r.error); else { setErr(""); setHand(r); }
  };
  const send = async () => {
    if (!hand) return;
    const r = await team.ask<{ ok?: true; undo?: string; error?: string }>("team.v3.people", { op: "hand.send", card: hand });
    if (r.error) { setErr(r.error); return; }
    setUndo({ text: `${hand.title} is ${hand.to}’s now.`, token: r.undo ?? "" }); setHand(null);
  };

  if (!a) return <div className="v3-room v3-people"><p className="v3-hint">{err || "reading who is here…"}</p></div>;
  return (
    <div className="v3-room v3-people">
      <section className="v3-stations">
        {a.groups.map((g) => (
          <div key={g.on} className={`v3-on ${g.on === "nothing open" ? "quiet" : ""}`}>
            <div className="v3-k"><span className="v3-where">{g.on}</span><span className="dim"> · {g.people.length}</span></div>
            <div className="v3-row">
              {g.people.map((s) => (
                <div key={s.who} className={`v3-station ${s.you ? "you" : ""} ${s.here} ${over === s.who ? "over" : ""} ${open === s.who ? "open" : ""}`}
                  onDragOver={(ev) => { if (a.can.presses && !s.you && s.role !== "guest") { ev.preventDefault(); setOver(s.who); } }} onDragLeave={() => setOver(null)} onDrop={drop(s.who)}>
                  <button className="v3-face" onClick={() => press(s)} title={`${s.who} · ${s.role}${s.here === "away" ? " · away" : ""}`}>
                    <span className="v3-seat"><Body login={s.who} size={40} away={s.here === "away"} /></span>
                    {s.agent && <span className={`v3-agent ${s.agent.busy ? "busy" : ""}`} title={`${s.agent.whose}’s agent${s.agent.busy ? ", working" : ""}`}><Body login={s.agent.whose} size={22} agent /></span>}
                  </button>
                  <div className="v3-name"><b>{s.you ? "you" : s.who}</b><span className={`v3-role r-${s.role}`}>{s.role}</span></div>
                  {open === s.who && (
                    <div className="v3-card">
                      <button className="v3-press" onClick={() => onWindow(s.who)}>{s.you ? "My window" : `What I see of ${s.who}`}</button>
                      {(owner || s.you) && <button className="v3-press ghost" onClick={() => void askLeave(s.who)}>{s.you ? "If I leave" : `If ${s.who} leaves`}</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {hand && (
        <div className="v3-hand" role="dialog">
          <span className="from">hand</span>
          <span className="t"><b>{hand.title}</b> to <Body login={hand.to} size={18} /> {hand.to}<small>{hand.foot}</small></span>
          <button className="v3-press" onClick={() => void send()}>Send</button>
          <button className="v3-press ghost" onClick={() => setHand(null)}>Keep</button>
        </div>
      )}
      {undo && <UndoLine key={undo.token} text={undo.text} onUndo={undo.token ? () => void write({ op: "hand.undo", undo: undo.token }) : undefined} onGone={() => setUndo(null)} />}

      {leave && (
        <div className="v3-leave" role="dialog">
          <Leave card={leave} me={a.me} onPress={a.can.presses ? (l) => void askV3<Floor>("team.v3.floor.leave", { project: a.project, who: leave.who, act: l.act, kind: l.kind, id: l.id })
            .then((r) => { if (r.error) setErr(r.error); else setLeave(r.leave ?? null); }) : undefined} />
          <div className="v3-presses">
            {(owner || leave.who === a.me) && <button className="v3-press needs" onClick={() => void write({ op: "leave", who: leave.who }).then((r) => { if (!r.error) setLeave(null); })}>{leave.who === a.me ? "Leave the project" : `Let ${leave.who} go`}</button>}
            <button className="v3-press ghost" onClick={() => setLeave(null)}>Not now</button>
          </div>
        </div>
      )}

      <section className="v3-picture">
        <div className="v3-roles">
          {(["owner", "editor", "guest"] as Role[]).map((r) => (
            <div key={r} className={`v3-rcol r-${r}`}>
              <div className="v3-k">{ROLE_WORD[r]}</div>
              <div className="v3-rfaces">
                {a.roles[r].map((p) => (
                  <span key={p} className="v3-rface" title={p}>
                    <Body login={p} size={24} />
                    {a.agents.includes(p) && <span className="v3-agent mini"><Body login={p} size={13} agent /></span>}
                    {owner && p !== a.me && <select className="v3-rpick" value={r} aria-label={`${p}'s role`} onChange={(ev) => void write({ op: "role", who: p, role: ev.target.value })}>
                      {(["owner", "editor", "guest"] as Role[]).map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>}
                  </span>
                ))}
                {!a.roles[r].length && <span className="dim">nobody</span>}
              </div>
              <small className="dim">{ROLE_RULE[r]}</small>
            </div>
          ))}
        </div>
        <div className="v3-layers">
          <div className="v3-lrow head"><span /><span>{LAYER_WORD.team}</span><span>{LAYER_WORD.project}</span><span>{LAYER_WORD.me}</span></div>
          {a.layers.map((l) => (
            <div key={l.k} className="v3-lrow">
              <span className="n">{l.name}</span>
              {(["team", "project", "me"] as const).map((layer) => {
                const v = l[layer], lit = l.from === layer, may = a.can.presses && (layer !== "team" || owner);
                const next = () => { const i = v === undefined ? 0 : l.opts.indexOf(v) + 1; void write({ op: "layer", layer, key: l.k, value: i >= l.opts.length ? null : l.opts[i] }); };
                return (
                  <button key={layer} className={`v3-cell ${lit ? "lit" : ""} ${v === undefined ? "none" : ""}`} disabled={!may} onClick={next}
                    title={may ? (v === undefined ? `set ${l.name} for ${layer === "me" ? "you" : `the ${layer}`}` : "press for the next; past the last it is pulled back") : layer === "team" ? "the team's default is an owner's" : "a guest reads this"}>
                    {v ?? (lit ? l.value : "·")}
                  </button>
                );
              })}
            </div>
          ))}
          <small className="dim">Set once at the top, inherited below; the lit one counts.</small>
        </div>
      </section>
      {err && <p className="v3-err">{err}</p>}
    </div>
  );
}
