// The bench in the one session (#1024, build.snap): its pieces from what really exists (the sessions the one session
// sees, the folders they work in, the checks and times it can run, your hand); the table kept by the engine
// (work/snap.ts) across restarts; a pressed row run there, its charge drawn from the engine's word (work.snap.run).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";
import { Bench, type Charge, type RunView } from "./Bench";
import type { Brick, Section } from "./fit";
import { titleOf, type Row } from "../one/model";

const short = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

/** the pieces the bin offers, from the roster and the folder the one session is in (pure) */
export function catalogOf(rows: Row[], folder?: string, kept: string[] = [], near: string[] = []): Brick[] {
  // the sessions in a folder already on the table come first (what you are building with), then those offered before
  // (the roster's order moves; the bin must not), then the newest
  const at = rows.filter((r) => near.includes(r.cwd));
  const pick = [...new Set([...at, ...rows.filter((r) => kept.includes(r.id)), ...rows])].slice(0, Math.min(9, Math.max(6, at.length + kept.filter((k) => rows.some((r) => r.id === k)).length)));
  const jobs: Brick[] = pick.map((r) => ({ id: `job:${r.id}`, kind: "job", label: titleOf(r.title), ref: r.id, hint: `a session: ${(r.doing || r.title).slice(0, 70)}` }));
  const dirs = [...new Set([folder, ...pick.map((r) => r.cwd), ...rows.map((r) => r.cwd)].filter((x): x is string => !!x))].slice(0, 4);
  const sources: Brick[] = dirs.map((d) => ({ id: `src:${d}`, kind: "source", label: base(d), ref: d, hint: `a folder it reads: ${short(d)}` }));
  return [
    { id: "when:now", kind: "when", label: "now", ref: "now", hint: "a time: the row runs when you press it" },
    { id: "when:morning", kind: "when", label: "each morning", ref: "morning", hint: "a time: the row runs at 9 each morning" },
    ...sources, ...jobs,
    { id: "check:tests", kind: "check", label: "the tests", ref: "tests", hint: "a check: the folder's tests, green or red" },
    { id: "check:read", kind: "check", label: "a second read", ref: "read", hint: "a check: another agent reads the change" },
    { id: "hand", kind: "hand", label: "your hand", ref: "hand", hint: "your hand: the row stops here and asks you" },
  ];
}

type EngineRun = { id: string; section: string; states: Record<string, Charge>; ended?: number; result?: string; lines: string[] };
const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
function ask<T = any>(o: object): Promise<T> {
  const r = `snap-${++rid}`;
  return new Promise((res, rej) => {
    const off = L?.on((m: any) => { if (m?.rid === r) { off?.(); clearTimeout(t); if (m.error) rej(new Error(m.error)); else res(m); } });
    const t = setTimeout(() => { off?.(); rej(new Error("the engine did not answer")); }, 20000);
    if (!L?.send({ ...o, rid: r })) { off?.(); clearTimeout(t); rej(new Error("the engine is not there")); }
  });
}

export function SnapBench({ rows, folder }: { rows: Row[]; folder: string }) {
  const kept = useRef<string[]>([]);
  const [table, setTableS] = useState<Section[]>([]);
  const near = useMemo(() => [...new Set(table.flatMap((s) => s.bricks.filter((b) => b.kind === "source").map((b) => b.ref)))].join("\n"), [table]);
  const catalog = useMemo(() => { const c = catalogOf(rows, folder, kept.current, near ? near.split("\n") : []); kept.current = c.filter((b) => b.kind === "job").map((b) => b.ref); return c; }, [rows, folder, near]);
  const [runs, setRuns] = useState<Record<string, EngineRun>>({});
  const [err, setErr] = useState("");
  const live = useRef<HTMLParagraphElement>(null);
  const say = useCallback((s: string) => { if (live.current) live.current.textContent = s; }, []);
  const putting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mine = useRef(0);   // the face's own puts not yet answered: the engine's echo of an older table must not undo a newer move

  useEffect(() => {
    const load = () => ask<{ sections: Section[]; runs: EngineRun[] }>({ type: "work.snap.get" }).then((m) => { setTableS(m.sections ?? []); setRuns(Object.fromEntries((m.runs ?? []).map((r) => [r.section, r]))); setErr(""); }).catch((e) => setErr(e.message));
    const off = L?.on((m: any) => {
      if (m?.type === "work.snap.table" && !m.rid && !mine.current && !putting.current) setTableS(m.sections ?? []);
      if (m?.type === "work.snap.run" && !m.rid && m.run) setRuns((r) => ({ ...r, [m.run.section]: m.run }));
    });
    const up = L?.onLink((u: boolean) => { if (u) void load(); });
    return () => { off?.(); up?.(); };
  }, []);
  const setTable = useCallback((t: Section[]) => {
    setTableS(t);
    clearTimeout(putting.current);
    putting.current = setTimeout(() => { putting.current = undefined; mine.current++; void ask({ type: "work.snap.put", sections: t }).catch((e) => setErr(e.message)).finally(() => { mine.current--; }); }, 150);
  }, []);
  const onRun = useCallback((id: string) => { setErr(""); void ask({ type: "work.snap.run", id }).then((m) => m.run && setRuns((r) => ({ ...r, [id]: m.run }))).catch((e) => setErr(e.message)); }, []);
  const onHand = useCallback((section: string, brick: string, go: boolean) => {
    const r = runs[section]; if (!r) return;
    void ask({ type: "work.snap.hand", run: r.id, brick, go }).then((m) => m.run && setRuns((x) => ({ ...x, [section]: m.run }))).catch((e) => setErr(e.message));
  }, [runs]);
  // the run drawn: the one going, else the last one for a few seconds after it ended (its pieces stay lit a moment)
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const run: RunView | null = useMemo(() => {
    const all = Object.values(runs);
    const going = all.find((r) => !r.ended) ?? all.filter((r) => r.ended && now - r.ended < 8000).sort((a, b) => (b.ended ?? 0) - (a.ended ?? 0))[0];
    return going ? { section: going.section, states: going.states, ended: !!going.ended } : null;
  }, [runs, now]);
  return (
    <section className="snap-wrap" aria-label="pieces that snap">
      <Bench catalog={catalog} table={table} setTable={setTable} run={run} onRun={onRun} onHand={onHand} say={say} />
      {err && <p className="snap-err" role="alert">{err}</p>}
      <p ref={live} className="snap-live" aria-live="polite" />
    </section>
  );
}
