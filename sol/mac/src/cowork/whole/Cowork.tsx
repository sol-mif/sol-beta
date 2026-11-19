// Cowork, whole (#1173): what opens when a person opens Cowork. The new shell (Shell.tsx) unless "old Cowork" is on in
// Cowork's settings (old.ts), for one release; then CoworkApp and this choice are deleted (#1169).
// The way in (#1537, step 1 of #1461): the shell is the team's; a Sol on the team (a room kept in a GitHub org, or the
// team's own checkout running as concept) opens it, and everyone else opens their own groups home (groups/Home.tsx),
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

const Shell = lazy(() => import("./Shell").then((m) => ({ default: m.Shell })));
const GroupsHome = lazy(() => import("../groups/Home").then((m) => ({ default: m.GroupsHome })));

const versionNow = () => { try { return localStorage.getItem(VERSION_KEY); } catch { return null; } };

/** the rooms as the engine last said them (team.state), kept across mode switches; null until it has said them once */
let seenRooms: { org?: string }[] | null = null;
function useRooms() {
  const [rooms, setRooms] = useState(seenRooms);
  useEffect(() => {
    const L = link(ENGINE);
    const off = L?.on((m: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      if (m?.type !== "team.state" || !Array.isArray(m.settings?.rooms)) return;
      seenRooms = m.settings.rooms;
      setRooms(seenRooms);
    });
    L?.send({ type: "team.hello" });
    return () => { off?.(); };
  }, []);
  return rooms;
}

export function Cowork({ e, onMode }: { e: ReturnType<typeof useEngine>; onMode: (m: AppMode) => void }) {
  const old = useOldCowork();
  const rooms = useRooms();
  if (old) return <CoworkApp e={e} onMode={onMode} />;
  // until the engine has said the rooms once, nothing: neither the shell nor the home flashes for someone it is not for
  if (!rooms) return null;
  if (opensShell(rooms, versionNow())) return <Suspense fallback={null}><Shell e={e} /></Suspense>;
  return <Suspense fallback={null}><GroupsHome e={e} /></Suspense>;
}
