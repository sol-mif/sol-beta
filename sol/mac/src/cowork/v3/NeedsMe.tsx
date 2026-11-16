// Cowork v3, slice 2 (fr-30, #555): the one "needs me" count as a chip, for the front, the stage's bar and a project's
// head. Asks to me, items handed to me and an owner's yes pending, counted once by the engine (plan.ts needsMe); the
// notch draws the same number by its mark. Ember only when something needs me; nothing needs me is a quiet word.
import { Droplet } from "../../creature/goo";
import { useV3 } from "./front-store";
import type { Team } from "../useTeam";
import "./front.css";

export function NeedsChip({ count, onOpen, big }: { count: number; onOpen?: () => void; big?: boolean }) {
  const on = count > 0;
  return (
    <button className={`v3-need ${on ? "on" : ""} ${big ? "big" : ""}`} onClick={onOpen} data-count={count}
      title={on ? "asks to you, items handed to you and a yes waiting on you, across every project" : "nothing waits on you"}>
      {on ? <Droplet kind="needs" size={big ? 15 : 13} seed="v3-need" /> : <span className="v3-need-rest" aria-hidden="true" />}
      <b>{count}</b><span>need you</span>
    </button>
  );
}

/** the bar's chip: reads the store itself, so the bar does not wait on the front */
export function NeedsMe({ team, onOpen }: { team: Team; onOpen: () => void }) {
  const { count } = useV3(team.ask);
  return <NeedsChip count={count} onOpen={onOpen} />;
}
