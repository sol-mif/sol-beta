// Cowork v3, slice 2 (fr-30, #555): "All projects" (the front) above the projects, with the one count. A project's own
// rows are Nav.tsx's (#573). Loaded only with the switch on.
import type { Team } from "../useTeam";
import { useV3 } from "./front-store";
import "./front.css";

export function AllProjectsRow({ team, on, onOpen }: { team: Team; on: boolean; onOpen: () => void }) {
  const { count } = useV3(team.ask);
  return (
    <div className={`row crow gs-v3all ${on ? "on" : ""}`} data-s onClick={onOpen} title="every project, and what wants you in each">
      <span className="v3-side-ic" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="t">All projects</span>
      {count > 0 && <small className="v3-side-n" style={{ color: "var(--ember, #fd302d)", fontVariantNumeric: "tabular-nums" }}>{count}</small>}
    </div>
  );
}
