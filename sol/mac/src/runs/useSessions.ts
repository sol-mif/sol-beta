// The session list as the runs view reads it (#906): the same `work.sessions` message the side list draws (and the
// pings read, work/pings.ts), asked for once with `work.list`, then kept up to date by the engine's `work.run` and
// `work.closed`. Read only: the side list's own store (work/useWork.ts) is not touched.
import { useEffect, useState } from "react";
import type { RunIn, SessionIn } from "./sessions";

export interface Engine { up: boolean; send: (o: object) => boolean | void; subscribe: (f: (m: any) => void) => () => void }   // eslint-disable-line @typescript-eslint/no-explicit-any

export function useSessions(e: Engine | undefined): { sessions: SessionIn[]; runs: RunIn[] } {
  const [sessions, setSessions] = useState<SessionIn[]>([]);
  const [runs, setRuns] = useState<Record<string, RunIn>>({});
  useEffect(() => e?.subscribe((m) => {
    if (m?.type === "work.sessions") {
      setSessions(Array.isArray(m.sessions) ? m.sessions : []);
      setRuns(Object.fromEntries((Array.isArray(m.runs) ? m.runs : []).map((r: RunIn) => [r.sessionId, r])));
    } else if (m?.type === "work.run" && m.sessionId) {
      const { type: _t, ended: _e, ...info } = m;
      setRuns((r) => ({ ...r, [m.sessionId]: info as RunIn }));
    } else if (m?.type === "work.closed" && m.sessionId) {
      setRuns((r) => { const n = { ...r }; delete n[m.sessionId]; return n; });
    }
  }), [e?.subscribe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (e?.up) e.send({ type: "work.list" }); }, [e?.up]); // eslint-disable-line react-hooks/exhaustive-deps
  return { sessions, runs: Object.values(runs) };
}

/** a session opened the way the side list opens one: Build's talk (WorkApp, Home) listens for this (App.tsx does the same for a ping) */
export const openSession = (id: string) => window.dispatchEvent(new CustomEvent("sol:open-work", { detail: id }));
