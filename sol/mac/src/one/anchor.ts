// The anchor (2026-11-12, Frank: "a normal chat box with a stage, except everything can run permanently on one
// session"), back beside the orchestration sessions (#1469 follow-up, 2026-11-19): the kept session opened as any Build
// session, in the same talk, bar and stage. The engine keeps it (one.ts openAnchor, an Orch with `anchor`): across
// restarts, renewed from its own handover when its talk fills, its stage carried along; the anchor of before #1469
// reconnects as it was. This file is the face's whole part: ask the engine for it, open it, and follow it when a
// renewal moves its id.
import { useCallback, useEffect, useRef, useState } from "react";
import { link } from "../socket";
import { ENGINE } from "../engine";

const L = typeof WebSocket === "undefined" ? null : link(ENGINE);
let rid = 0;
function ask<T = any>(o: object, ms = 60000): Promise<T> {
  const r = `anchor-${++rid}`;
  return new Promise((res, rej) => {
    const off = L?.on((m: any) => { if (m?.rid === r) { off?.(); clearTimeout(t); if (m.error) rej(new Error(m.error)); else res(m); } });
    const t = setTimeout(() => { off?.(); rej(new Error("the engine did not answer")); }, ms);
    if (!L?.send({ ...o, rid: r })) { off?.(); clearTimeout(t); rej(new Error("the engine is not there")); }
  });
}
const KEY = "sol.anchor.id";
const kept = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
/** the anchor's id as this window last heard it */
export const anchorId = kept;
const keep = (id: string | null) => { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* private mode */ } };

/** `on`: the session in view is the anchor · `go`: open it (made on the first press, in `cwd`) · `busy`: being made */
export function useAnchor(live: string | null, open: (id: string) => void, flash: (words: string) => void, cwd?: string) {
  const [id, setId] = useState<string | null>(kept);
  const [busy, setBusy] = useState(false);
  const at = useRef({ id, live, open }); at.current = { id, live, open };
  const set = (v: string | null) => { keep(v); setId(v); };
  useEffect(() => {
    let gone = false;
    const hear = (m: any) => {
      if (gone || m?.type !== "work.one.kept" || !("anchor" in (m ?? {}))) return;
      const now: string | null = typeof m.anchor === "string" ? m.anchor : null;
      const was = at.current.id;
      set(now);
      // a renewal moved it while the person was in it: the fresh copy takes its place in view
      if (now && was && was !== now && at.current.live === was) at.current.open(now);
    };
    const off = L?.on(hear);
    void ask({ type: "work.one.kept" }, 20000).catch(() => {});
    return () => { gone = true; off?.(); };
  }, []);
  const go = useCallback(() => {
    if (busy) return;
    setBusy(true);
    ask<{ sessionId?: string }>({ type: "work.one.open", ...(cwd ? { cwd } : {}) })
      .then((r) => { if (!r.sessionId) return flash("the anchor did not open"); set(r.sessionId); at.current.open(r.sessionId); })
      .catch((e) => flash(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [busy, cwd, flash]);
  return { on: !!id && live === id, go, busy };
}
