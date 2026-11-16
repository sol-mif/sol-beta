// Cowork v3, one way around (fr-30, #573): the side's rows for the project in use, in the prototype's one order
// (cowork-proto/core.js roomsOf, ROOM_NAMES): Space and Plan, Talk and People always; Running, Automations, Places and
// Artifacts once they hold something; then the project's sessions (what the side passes as children); then Setup, or
// About for someone who is not its owner, as a quiet link at the end. Every row carries data-v3-room, so a crossing
// finds its landing spot. Loaded only with the switch on (CoworkSidebar lazy-imports it).
import { useEffect, useState, type ReactNode } from "react";
import type { Team } from "../useTeam";
import { useV3 } from "./front-store";
import { useCounts } from "./studioApi";
import { askV3 } from "./ask";
import type { RunningAnswer } from "./peopleTypes";
import "./nav.css";

export type RoomId = "plan" | "talk" | "people" | "running" | "automations" | "places" | "artifacts" | "setup";
/** the rooms in their one order, written as the prototype writes them */
export const ROOMS: { id: Exclude<RoomId, "setup">; name: string; core?: true; title: string }[] = [
  { id: "plan", name: "Space and Plan", core: true, title: "loose things on the left, dated things on the right" },
  { id: "talk", name: "Talk", core: true, title: "one general thread, and one beside each thing" },
  { id: "people", name: "People", core: true, title: "who is on what, your window, and letting someone in" },
  { id: "running", name: "Running", title: "what is red, what runs now, what comes next" },
  { id: "automations", name: "Automations", title: "the project's nights and the rest, as steps you can read" },
  { id: "places", name: "Places", title: "where the files really live, as a map" },
  { id: "artifacts", name: "Artifacts", title: "what was made here that stays, versioned" },
];
export const roomName = (r: RoomId, owner = true) => (r === "setup" ? (owner ? "Setup" : "About") : ROOMS.find((x) => x.id === r)?.name ?? r);

/** which of the optional rooms hold something for a project: read from the engine's own v3 answers, again every 30 s */
export function useHeld(team: Team, project: string, hasRepos: boolean): { held: Set<RoomId>; owner: boolean } {
  const counts = useCounts();
  const [got, setGot] = useState<{ running: boolean; places: boolean; artifacts: boolean; owner: boolean }>({ running: false, places: false, artifacts: false, owner: true });
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const [run, pl, art] = await Promise.all([
        team.ask<RunningAnswer>("team.v3.running", {}),
        askV3<{ view?: { places: { kind: string; state: string }[] } }>("team.v3.places.read", { project }),
        askV3<{ artifacts?: unknown[] }>("team.v3.artifacts.list", { project }),
      ]);
      if (!alive) return;
      const l = run && !run.error ? run.line : null;
      setGot({
        running: !!(run && !run.error && (run.dev || (l && (l.red.length || l.running.length || l.next)))),
        places: !!pl.view?.places.some((p) => p.kind !== "record" && p.state !== "revoked"),
        artifacts: (art.artifacts?.length ?? 0) > 0,
        owner: !run || !!run.error || run.role !== "editor" && run.role !== "guest",   // the engine's word on my role here
      });
    };
    void read();
    const t = window.setInterval(() => void read(), 30_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = new Set<RoomId>(["plan", "talk", "people"]);
  if (got.running) held.add("running");
  if ((counts[project] ?? 0) > 0) held.add("automations");
  if (got.places) held.add("places");
  if (got.artifacts || hasRepos) held.add("artifacts");   // the repositories' memory and designs are shown there
  return { held, owner: got.owner };
}

/** my role in the project in use, as Running's answer says it: Setup for an owner, About for everyone else */
export function useOwner(team: Team): boolean {
  const [owner, setOwner] = useState(true);
  useEffect(() => { void team.ask<RunningAnswer>("team.v3.running", {}).then((r) => setOwner(!r || !!r.error || (r.role !== "editor" && r.role !== "guest"))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return owner;
}

/** a project's rows under it in the side: its rooms in order, its sessions, Setup / About last and quiet */
export function ProjectRooms({ team, project, hasRepos, on, onOpen, children }: {
  team: Team; project: string; hasRepos: boolean; on: RoomId | null; onOpen: (r: RoomId) => void; children?: ReactNode;
}) {
  const { held, owner } = useHeld(team, project, hasRepos);
  const counts = useCounts();
  return (
    <div className="v3n" data-v3-project={project}>
      {ROOMS.filter((r) => held.has(r.id) || on === r.id).map((r) => (
        <div key={r.id} className={`row crow gs-sess v3n-room ${on === r.id ? "on" : ""}`} data-s data-v3-room={r.id} data-v3-nav={r.id}
          onClick={(ev) => { ev.stopPropagation(); onOpen(r.id); }} title={r.title}>
          <i className="v3n-dot" aria-hidden="true" />
          <span className="t">{r.name}</span>
          {r.id === "automations" && (counts[project] ?? 0) > 0 && <small className="gs-when">{counts[project]}</small>}
        </div>
      ))}
      {children}
      <div className={`row crow gs-sess v3n-room v3n-quiet ${on === "setup" ? "on" : ""}`} data-s data-v3-room="setup" data-v3-nav="setup"
        onClick={(ev) => { ev.stopPropagation(); onOpen("setup"); }} title={owner ? "set the project up by talking" : "what this project is"}>
        <span className="t">{roomName("setup", owner)}</span>
      </div>
    </div>
  );
}

/** a project's count of what wants me, beside its name in the side (the front's own tiles: one count everywhere) */
export function ProjectCount({ team, project }: { team: Team; project: string }) {
  const { front } = useV3(team.ask);
  const n = front?.tiles.find((t) => t.project === project)?.count ?? 0;
  return n > 0 ? <small className="v3n-count" title={`${n} for you here`}>{n}</small> : null;
}
