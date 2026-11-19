// Home shows the agent on its work and suggests one (#1327). Home suggests and shows; it never manages: every change by
// hand is in Agents. With agents.mode off nothing here asks the engine or draws.
//   the doer   a folder's card, and the runs of a rule that belongs to an agent, carry that agent's small jelly, in the
//              kit's pressable look (its button's hover and press), with no caption (a first-timer did not read the
//              jelly as something to press until it looked like a control); a press opens its desk in Agents.
//   the peek   on a sticky the person has ticked done, whose did: line passed the gate (agents.offers' `on`), the job's
//              jelly peeks with "again?"; a press opens the offer in Agents. Never beside a "✓ done" right after a run
//              (read together they said "finished, or will it run twice?"), never a notification.
import { useEffect, useMemo, useState } from "react";
import { Button } from "../kit";
import { Jelly, Named } from "./Jelly";
import { agentsIn, agentsReader, asker, doingOf, peekOf, type AgentRow, type Offer } from "./model";
import { openAgent, openOffer, useAgentsOn } from "./flag";
import { turnOf } from "./Floor";
import { ROW } from "./ui";
import type { Wire } from "./useAgents";
import "./agents.css";

/** the agents, the open offers and how many need the person (the floor's own count), read for Home while the switch is on
 *  (null: off, or not read yet); again on
 *  agents.changed */
export function useHomeAgents(e: Wire): AgentRow[] | null { return useAgentsForHome(e).agents; }
export function useAgentsForHome(e: Wire): { agents: AgentRow[] | null; offers: Offer[] | null; need: number } {
  const on = useAgentsOn();
  const [got, setGot] = useState<{ agents: AgentRow[] | null; offers: Offer[] | null; need: number }>({ agents: null, offers: null, need: 0 });
  useEffect(() => {
    if (!on) { setGot({ agents: null, offers: null, need: 0 }); return; }
    let alive = true;
    // the offers read again only when the list says the stored ones changed (#1429), never on each agents.changed
    const read = agentsReader((o, ms) => w.ask(o, ms), (agents, offers, need) => { if (alive) setGot({ agents, offers, need }); });
    const w = asker(e.send, e.subscribe, { prefix: "home-ag", onChanged: () => void read() });
    void read();
    return () => { alive = false; w.close(); };
  }, [on, e.send, e.subscribe]);
  return got;
}

const stop = (f: () => void) => (ev: React.SyntheticEvent) => { ev.stopPropagation(); ev.preventDefault(); f(); };

/** one agent's small jelly, the kit's button around it; the name is for the reader of the screen and the tooltip */
export function AgentTag({ a }: { a: Pick<AgentRow, "id" | "name" | "turn" | "state"> }) {
  return (
    <span className="ag-tag" title={`${a.name} does this · press for its desk`} data-agent={a.id} onClick={stop(() => {})} onKeyDown={(ev) => ev.stopPropagation()}>
      <Button h={ROW} label={`${a.name}: its desk in Agents`} onClick={() => openAgent(a.id)}><Jelly size={28} turn={a.turn} doing={doingOf(a.state)} /></Button>
    </span>
  );
}

/** the agents that work in a folder, or only those whose rules are named (the rules of today's runs) */
export function AgentTags({ agents, folder, rules }: { agents: AgentRow[] | null; folder: string | undefined; rules?: (string | undefined)[] }) {
  const shown = useMemo(() => {
    if (!agents || !folder) return [];
    const here = agentsIn(agents, folder);
    if (!rules) return here;
    const want = new Set(rules.filter(Boolean));
    return here.filter((a) => a.rules.some((r) => r.folder === folder && want.has(r.rule)));
  }, [agents, folder, rules]);
  if (!shown.length) return null;
  return <span className="ag-tags">{shown.map((a) => <AgentTag key={a.id} a={a} />)}</span>;
}

/** "again?": the job's jelly on a sticky ticked done, when Sol noticed a job there; the board draws it only on its done
 *  stickies (Board.tsx `peek`) */
export function Again({ offers, place, sticky }: { offers: Offer[] | null; place: string | undefined; sticky: string }) {
  const o = peekOf(offers, place, sticky);
  if (!o) return null;
  return (
    <button type="button" className="ag-again" data-offer={o.id} onClick={stop(() => openOffer(o.id))} title={`${o.name}: Sol saw this job ${o.count} times. Press to see what it would do.`}>
      <Named name={`${o.name}, a job Sol noticed`}><Jelly size={48} doing="needs" toward={[-1, -0.3]} turn={turnOf(o.id)} /></Named>
      <span className="ag-sticker">again?</span>
    </button>
  );
}
