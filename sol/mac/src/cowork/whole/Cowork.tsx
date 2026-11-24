// Cowork, whole (#1173): what opens when a person opens Cowork. The new shell (Shell.tsx) unless "old Cowork" is on in
// Cowork's settings (old.ts), for one release; then CoworkApp and this choice are deleted (#1169).
// The way in (#1537, step 1 of #1461): the shell is the team's; the team's own checkout running as concept opens it, and
// so does a Sol whose own gh sign-in GitHub says is a member of the team's own org (`onTeam` in team.state, #1541). A
// room kept in any other org does not (gate one q1); everyone else opens their own groups home (groups/Home.tsx), one
// table per group, each opening as its own page. To undo: opensShell always true.
import { lazy, Suspense, useEffect, useState } from "react";
import type { useEngine } from "../../useEngine";
import type { AppMode } from "../../ModeSwitch";
import { VERSION_KEY } from "../../flag";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { CoworkApp } from "../CoworkApp";
import { opensShell } from "../groups/view";
import { useOldCowork } from "./old";
import { askRooms, type Rooms } from "./askRooms";
import { roomOn } from "./roomSwitch";

const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
const GroupsHome = lazy(() => import("../groups/Home").then((m) => ({ default: m.GroupsHome })));

const versionNow = () => { try { return localStorage.getItem(VERSION_KEY); } catch { return null; } };

/** the rooms as the engine last said them (team.state), kept across mode switches; null until it has said them once */
let seenRooms: Rooms | null = null;
/** on the team as the engine last said it (team.state `onTeam`): null while it is still asking GitHub */
let seenOnTeam: boolean | null = null;
function useRooms() {
  const [rooms, setRooms] = useState(seenRooms);
  const [onTeam, setOnTeam] = useState(seenOnTeam);
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const L = link(ENGINE);
    if (!L) { setQuiet(true); return; }
    return askRooms(L, (r, t) => { seenRooms = r; seenOnTeam = t; setRooms(r); setOnTeam(t); }, setQuiet, () => !!seenRooms);
  }, []);
  return { rooms, onTeam, quiet };
}

export function Cowork({ e, onMode }: { e: ReturnType<typeof useEngine>; onMode: (m: AppMode) => void }) {
  // the old Cowork is the team's (gate one q1): on anyone else's Sol its switch is not offered and does nothing
  const old = useOldCowork() && versionNow() === "concept";
  roomOn(e.settings);   // the Agents' room's switch as the engine reads it (gate one q6, #1740): its parts follow it
  const { rooms, onTeam, quiet } = useRooms();
  if (old) return <CoworkApp e={e} onMode={onMode} />;
  // until the engine has said the rooms once, and while it still asks GitHub whether I am on the team, one line: neither
  // the shell nor the home flashes for someone it is not for
  const version = versionNow();
  if (!rooms || (onTeam === null && version !== "concept")) return <Reading quiet={quiet} />;
  if (opensShell(onTeam, version)) return <Suspense fallback={<Reading />}><Shell e={e} /></Suspense>;
  return <Suspense fallback={<Reading />}><GroupsHome e={e} /></Suspense>;
}

/** what Cowork shows while the engine has not said the rooms yet (gate one, #1676): a line, never a blank page; when the
 *  engine is down or silent, it says so, and the tables come in by themselves once it answers (gate one q7) */
const Reading = ({ quiet = false }: { quiet?: boolean }) => (
  <p data-place="cowork-reading" data-quiet={quiet || undefined} role="status" style={{ margin: 0, padding: "32px 28px", color: "var(--dim, #8a8a90)", fontSize: 14 }}>
    {quiet ? "can't reach this Mac's engine yet; your tables show here as soon as it answers" : "reading your tables…"}
  </p>
);
