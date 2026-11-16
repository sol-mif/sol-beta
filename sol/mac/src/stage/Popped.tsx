// A popped block's own window (#701, pop.ts, pop.rs): index.html?block=<id>&session=<sid>. The same block: its body the
// engine's, read and written through the same store as the stage's (engineStore.ts), its kind drawn the same way. The
// head is the window's grip (drag it over Sol's window and it goes back, pop.rs); "back" returns it from here; the
// stage's chip closes this window from there. Closed any other way, the stage hears it come back.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { KINDS } from "./kinds";
import { store } from "./engineStore";
import { stateWords } from "./model";
import { onClose, tell } from "./pop";
import "./stage.css";

type E = { send: (o: object) => boolean; subscribe: (f: (m: any) => void) => () => void; flash?: (s: string) => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function Popped({ e, id, session }: { e: E; id: string; session: string }) {
  // one question to the engine, answered by rid (useWork's ask, without the sessions it loads)
  const waits = useRef(new Map<string, (m: unknown) => void>());
  useEffect(() => e.subscribe((m: { rid?: string }) => { const f = m?.rid ? waits.current.get(m.rid) : undefined; if (f) { waits.current.delete(m.rid!); f(m); } }), [e]);
  const ask = useMemo(() => <T,>(type: string, a: object, wait = 20_000) => new Promise<T>((ok) => {
    const rid = `pop-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    waits.current.set(rid, ok as (m: unknown) => void);
    if (!e.send({ type, rid, ...a })) { waits.current.delete(rid); ok({ error: "not connected" } as T); return; }
    setTimeout(() => { if (waits.current.delete(rid)) ok({ error: "the engine did not answer" } as T); }, wait);
  }), [e]);
  useEffect(() => { store.connect(ask, e.subscribe, { send: (o) => e.send(o) }); }, [ask, e]);
  const seen = useSyncExternalStore(useCallback((f: () => void) => store.subscribe(session, f), [session]), () => store.read(session));
  const b = seen.blocks.find((x) => x.id === id);
  useEffect(() => { document.title = b?.title ?? "Sol"; }, [b?.title]);
  // the stage took it back (its chip): this window goes
  useEffect(() => onClose(id, () => window.close()), [id]);
  // closed from here: the stage gets it back
  useEffect(() => { const f = () => tell({ back: id }); window.addEventListener("pagehide", f); return () => window.removeEventListener("pagehide", f); }, [id]);
  const goBack = () => { tell({ back: id }); window.close(); };
  if (!b) return <div className="st-popped" data-popped={id}><div className="st-head" data-tauri-drag-region><span className="st-t">{seen.ready === false ? "…" : "this block is not on that stage any more"}</span></div></div>;
  const Kind = KINDS[b.kind];
  return (
    <div className="st-popped" data-popped={id}>
      <div className="st-head" data-tauri-drag-region>
        <span className={`st-dot ${b.state}`} />
        <span className="st-t" title={b.title} data-tauri-drag-region>{b.title}</span>
        <span className="st-k">{b.kind}</span>
        <span className="st-st">{stateWords(b)}</span>
        <span className="st-acts"><button onClick={goBack} title="back on the stage">back</button></span>
      </div>
      <div className="st-body"><Kind b={b} body={b.body} act={(patch, line) => store.update(session, id, patch, line, "you")} session={session} /></div>
    </div>
  );
}
