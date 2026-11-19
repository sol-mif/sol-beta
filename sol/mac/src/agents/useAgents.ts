// Agents mode's wire (#1327), the useAsk pattern of Home (home/folders/FolderHome.tsx): each ask goes with a rid and its
// answer is matched on it (model.ts asker); agents.changed from the engine asks the list again.
import { useCallback, useEffect, useRef, useState } from "react";
import { asker, listOf, type List } from "./model";

export type Wire = { send: (o: object) => boolean | void; subscribe: (f: (m: any) => void) => () => void };
export type Ask = <T>(o: { type: string } & Record<string, unknown>, ms: number) => Promise<T | null>;

export function useAgents(e: Wire) {
  const [list, setList] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);   // when the list was last read: the side says it
  const busy = useRef(false), again = useRef(false);
  const reloadRef = useRef<() => void>(() => {});
  // the asker lives as long as its effect (StrictMode mounts twice: a memo would be closed under the second mount)
  const wRef = useRef<ReturnType<typeof asker> | null>(null);
  const [gen, setGen] = useState(0);
  useEffect(() => {
    const w = asker(e.send, e.subscribe, { prefix: "ag", onChanged: () => reloadRef.current() });
    wRef.current = w; setGen((g) => g + 1);
    return () => { w.close(); if (wRef.current === w) wRef.current = null; };
  }, [e.send, e.subscribe]);
  const ask = useCallback<Ask>((o, ms) => (wRef.current ? wRef.current.ask(o, ms) : Promise.resolve(null)), []);
  const reload = useCallback(async () => {
    // one read at a time; a change heard during a read reads once more after it
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      do {
        again.current = false;
        const r = await ask<List>({ type: "agents.list" }, 15_000);
        if (!r) setErr("The engine did not answer, so the agents cannot be read right now.");
        else if (!r.ok) setErr(r.why ?? "The engine could not read the agents.");
        else { setList(listOf(r)); setErr(null); setAt(Date.now()); }
      } while (again.current);
    } finally { busy.current = false; }
  }, [ask]);
  reloadRef.current = () => void reload();
  useEffect(() => { if (gen) void reload(); }, [reload, gen]);
  return { list, err, at, reload, ask };
}
