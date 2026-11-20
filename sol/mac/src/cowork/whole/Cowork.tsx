// Cowork, whole (#1173): what opens when a person opens Cowork. The new shell (Shell.tsx) unless "old Cowork" is on in
// Cowork's settings (old.ts), for one release; then CoworkApp and this choice are deleted (#1169).
// The way in (#1537, step 1 of #1461): the shell is the team's; only the team's own checkout running as concept opens
// it (a room kept in a GitHub org no longer does: gate one q1), and everyone else opens their own groups home (groups/Home.tsx),
// one table per group, each opening as its own page. To undo: opensShell always true.
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

const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
const GroupsHome = lazy(() => import("../groups/Home").then((m) => ({ default: m.GroupsHome })));

const versionNow = () => { try { return localStorage.getItem(VERSION_KEY); } catch { return null; } };

/** the rooms as the engine last said them (team.state), kept across mode switches; null until it has said them once */
let seenRooms: Rooms | null = null;
function useRooms() {
  const [rooms, setRooms] = useState(seenRooms);
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const L = link(ENGINE);
    if (!L) { setQuiet(true); return; }
    return askRooms(L, (r) => { seenRooms = r; setRooms(r); }, setQuiet, () => !!seenRooms);
  }, []);
  return { rooms, quiet };
}

export function Cowork({ e, onMode }: { e: ReturnType<typeof useEngine>; onMode: (m: AppMode) => void }) {
  // the old Cowork is the team's (gate one q1): on anyone else's Sol its switch is not offered and does nothing
  const old = useOldCowork() && versionNow() === "concept";
  const { rooms, quiet } = useRooms();
  if (old) return <CoworkApp e={e} onMode={onMode} />;
  // until the engine has said the rooms once, one line: neither the shell nor the home flashes for someone it is not for
  if (!rooms) return <Reading quiet={quiet} />;
  if (opensShell(rooms, versionNow())) return <Suspense fallback={<Reading />}><Shell e={e} /></Suspense>;
  return <Suspense fallback={<Reading />}><GroupsHome e={e} /></Suspense>;
}

/** what Cowork shows while the engine has not said the rooms yet (gate one, #1676): a line, never a blank page; when the
 *  engine is down or silent, it says so, and the tables come in by themselves once it answers (gate one q7) */
const Reading = ({ quiet = false }: { quiet?: boolean }) => (
  <p data-place="cowork-reading" data-quiet={quiet || undefined} role="status" style={{ margin: 0, padding: "32px 28px", color: "var(--dim, #8a8a90)", fontSize: 14 }}>
    {quiet ? "can't reach this Mac's engine yet; your tables show here as soon as it answers" : "reading your tables…"}
  </p>
);
