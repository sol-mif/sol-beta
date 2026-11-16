// The frame on Home (#630, freeform #629), behind its switch (frameFlag.ts): Home declares the card place, and each thing
// from the home that asks for it stands in a frame. The frame owns the chrome and the state (frameRules.ts says the rules);
// the thing owns only the inside, a sandboxed document that cannot reach the face. A thing that fails to render shows
// broken in its frame, with the error and its line. Loaded only when the switch is on (Home.tsx, lazily), so with it
// off not a byte of this, its css or the generated tokens reaches the face.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ENGINE_HTTP } from "../engine";
import { declarePlace, declared, onPlaces, loadThings, htmlFault, srcdoc, stateOf, flip, ordered, engineFault, canUndo, wroteNow, releaseLines, pressRelease, type Fault, type Loaded, type Refused, type ReleaseWire, type ThingWire } from "./frameRules";
import "../tokens.css";
import tokensCss from "../tokens.css?raw";
import paletteCss from "../palette.css?raw";
import "./frame.css";
import type { Metas } from "./meta";

export const meta = {
  Things: {
    job: "the things a person's AI made, each in a card on Home, the card place declared here (sol.frame)",
    flow: "mine",
    states: ["none", "cards", "a thing refused at load", "a thing closed", "an undo refused", "the engine did not answer"],
    keys: [
      { press: "click bring back", does: "the closed things come back", goal: "mine", faster: true },
      { press: "come back to the window", does: "reads the home's things again" },
    ],
    listens: ["GET /things (the home's things/)", "GET /log?since= (a step on the log reads them again)", "sol.frame.pins, sol.frame.closed", "the window's focus"],
  },
  // the after-release card, issue 634 (a number in a meta string reads as a colour to the look lint)
  AfterRelease: {
    job: "the one card at the first start after a release: what moved to the new contract, what is marked remake, and one undo for the whole pass",
    flow: "mine",
    states: ["shown", "undoing", "refused, with the engine's reason"],
    keys: [
      { press: "click undo", does: "puts every thing the pass touched back as it was, in one step; the card goes", goal: "mine", faster: true },
      { press: "click ×", does: "lets the card go; the things stay as the pass left them" },
    ],
    listens: ["GET /things (release)"],
  },
  Frame: {
    job: "the frame around one thing: its edges, title row, close, pin, its state, its arrival and exit",
    flow: "mine",
    states: ["loading", "shown", "pinned", "stale", "remake", "broken", "engine half broken", "a write shown", "leaving"],
    keys: [
      { press: "click pin", does: "keeps it first on Home, or lets it go back in line: arranging Home on the thing itself", goal: "mine", faster: true },
      { press: "click ×", does: "closes it, with its exit; bring back undoes it" },
      { press: "click undo", does: "winds the thing back one version, at once, no confirm" },
    ],
    listens: ["the thing's own errors, from its sandbox", "the contract number", "its engine half: broken, its last write (GET /things)"],
  },
} satisfies Metas;

const PINS = "sol.frame.pins", CLOSED = "sol.frame.closed";
const LOG_MS = 2000;   // how often the frame asks the log what happened (#633): a poll, not motion
const keptList = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const keepList = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } };
const CSS = `${paletteCss}\n${tokensCss}`;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** the things on Home: declares the card place while it stands, reads the home's things, loads them against it */
export function Things() {
  const [wire, setWire] = useState<{ contract: number | null; things: ThingWire[]; release?: ReleaseWire | null } | null>(null);
  const [again, setAgain] = useState(0);
  const [down, setDown] = useState<string | null>(null);
  const [pins, setPins] = useState(() => keptList(PINS));
  const [closed, setClosed] = useState(() => keptList(CLOSED));
  const [said, setSaid] = useState<string | null>(null);   // an undo the engine refused, with its reason
  const [now, setNow] = useState(Date.now);
  const places = useSyncExternalStore(onPlaces, () => declared().join(","));
  const readRef = useRef<() => void>(() => {});
  useEffect(() => declarePlace("card", "Home"), []);
  useEffect(() => {
    let live = true, last = -1;
    const read = () => fetch(`${ENGINE_HTTP}/things`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the engine answered ${r.status}`))))
      .then((j) => { if (live) { setWire(j); setDown(null); setNow(Date.now()); } }, (e: Error) => { if (live) setDown(e.message || "no answer"); });
    readRef.current = read;
    read();
    const again = () => { if (document.visibilityState === "visible") read(); };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    // the log (#633): a step since the last look reads the things again, so a load, a break, an undo or a write shows
    // as it happens; an engine with the frame off (or older) says so once and is not asked again
    const look = window.setInterval(() => {
      if (document.visibilityState !== "visible" || last === -2) return;
      fetch(`${ENGINE_HTTP}/log?since=${Math.max(0, last)}`).then((r) => (r.ok ? r.json() : null)).then((j: { off?: boolean; last?: number } | null) => {
        if (!live) return;
        if (!j || j.off) { last = -2; return; }
        if (last >= 0 && (j.last ?? 0) > last) read();
        last = j.last ?? 0;
        setNow(Date.now());
      }, () => {});
    }, LOG_MS);
    return () => { live = false; window.clearInterval(look); window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, [again]);
  const { loaded, refused } = useMemo(() => loadThings(wire?.things ?? [], places ? (places.split(",") as ReturnType<typeof declared>) : []), [wire, places]);
  const shown = ordered(loaded.filter((t) => !closed.includes(t.record.id)), pins);
  const gone = loaded.length - shown.length;
  const pin = (id: string) => setPins((p) => { const n = flip(p, id); keepList(PINS, n); return n; });
  const close = (id: string) => setClosed((c) => { const n = [...c.filter((x) => x !== id), id]; keepList(CLOSED, n); return n; });
  const back = () => { setClosed([]); keepList(CLOSED, []); };
  const undo = (id: string) => {
    setSaid(null);
    fetch(`${ENGINE_HTTP}/things/${encodeURIComponent(id)}/undo`, { method: "POST" })
      .then((r) => r.json().catch(() => ({ ok: false, why: `the engine answered ${r.status}` })))
      .then((j: { ok?: boolean; why?: string }) => { if (!j.ok) setSaid(`${id}: undo refused, ${j.why ?? "no reason"}`); readRef.current(); }, (e: Error) => setSaid(`${id}: undo, ${e.message}`));
  };
  if (down) return <div className="fr-note" role="status">things: the engine did not answer ({down})</div>;
  const release = wire?.release ?? null;
  // the card's two presses: the engine does the step, then the home is read again (the card goes with its pass); a
  // refusal stays on the card with its reason, and nothing is read again as if it worked
  const press = (what: "undo" | "close") => pressRelease(what, ENGINE_HTTP).then((o) => { if (o.ok) setAgain((n) => n + 1); return o; });
  if (!wire || (!loaded.length && !refused.length && !release)) return null;
  return (
    <div className="fr-things" data-place-host="card">
      {release && <AfterRelease p={release} onUndo={() => press("undo")} onClose={() => press("close")} />}
      {shown.map((t) => <Frame key={`${t.record.id}:${t.record.current}:${t.html.length}:${hash(t.html)}`} t={t} contract={wire.contract} pinned={pins.includes(t.record.id)} onPin={() => pin(t.record.id)} onClose={() => close(t.record.id)}
        onUndo={t.engine && canUndo(t.record) ? () => undo(t.record.id) : null} wrote={wroteNow(t.engine, now)} />)}
      {(gone > 0 || refused.length > 0 || said) && (
        <div className="fr-note">
          {said && <span role="status">{said}</span>}
          {gone > 0 && <span>{gone} closed <button onClick={back}>bring back</button></span>}
          {refused.map((r: Refused) => <span key={r.id} title={r.why}>{r.id}: refused at load, {r.why}</span>)}
        </div>
      )}
    </div>
  );
}

/** the one card after a release (#634): the face's own, drawn from the pass on GET /things; undo is one step for all */
type Pressed = { ok: true } | { ok: false; why: string };
export function AfterRelease({ p, onUndo, onClose }: { p: ReleaseWire; onUndo: () => Promise<Pressed>; onClose: () => Promise<Pressed> }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);   // a press the engine refused, with its reason, as the kernel's undo shows it
  const l = releaseLines(p);
  const run = (what: "undo" | "close", f: () => Promise<Pressed>) => {
    setBusy(true); setSaid(null);
    void f().then((o) => { if (!o.ok) setSaid(`${what} refused, ${o.why}`); }, (e: Error) => setSaid(`${what}, ${e.message || "no answer"}`)).finally(() => setBusy(false));
  };
  return (
    <section className="fr-release" role="status" aria-label={l.head} data-busy={busy || undefined}>
      <header className="fr-head">
        <span className="fr-title">{l.head}</span>
        <button className="fr-key" disabled={busy} onClick={() => run("undo", onUndo)} title="put every thing back as it was before the update, in one step">undo</button>
        <button className="fr-key" disabled={busy} onClick={() => run("close", onClose)} aria-label="close the update's card" title="close">×</button>
      </header>
      <ul className="fr-release-list">
        {l.moved && <li>{l.moved}</li>}
        {l.marked.map((m) => <li key={m} data-marked>{m}</li>)}
        {said && <li data-refused role="alert">{said}</li>}
      </ul>
    </section>
  );
}

// a short fingerprint of the html, so an edit in the home makes a fresh frame (its state starts again)
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** one thing in its frame: the chrome and the state are the frame's, the inside is the thing's */
export function Frame({ t, contract, pinned, onPin, onClose, onUndo = null, wrote = null }: { t: Loaded; contract: number | null; pinned: boolean; onPin: () => void; onClose: () => void; onUndo?: (() => void) | null; wrote?: string | null }) {
  const r = t.record, made = r.versions.find((v) => v.v === r.current) ?? r.versions[r.versions.length - 1];
  const [loaded, setLoaded] = useState(false);
  const [ran, setRan] = useState<Fault | null>(null);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  const htmlBreak = useMemo(() => htmlFault(t.html), [t.html]);
  const fault = engineFault(t.engine) ?? htmlBreak ?? ran;
  useEffect(() => {
    const hear = (ev: MessageEvent) => {
      const d = ev.data as { solThing?: unknown; why?: unknown; line?: unknown } | null;
      if (ev.source !== ref.current?.contentWindow || d?.solThing !== r.id) return;
      setRan({ why: String(d.why ?? "it threw"), line: typeof d.line === "number" ? d.line : null });
    };
    window.addEventListener("message", hear);
    return () => window.removeEventListener("message", hear);
  }, [r.id]);
  const state = stateOf({ fault, loaded, made: made.contract, contract, remake: !!r.remake });
  const shut = () => (still() ? onClose() : setLeaving(true));
  // the exit never strands a card: when no animation runs (Home hidden mid-exit, motion turned off) it closes at once
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!leaving) return;
    const el = box.current;
    const cancel = (ev: AnimationEvent) => { if (ev.target === el) onClose(); };
    el?.addEventListener("animationcancel", cancel);
    const f = requestAnimationFrame(() => { if (!el || !el.getAnimations().some((a) => a.playState === "running")) onClose(); });
    return () => { cancelAnimationFrame(f); el?.removeEventListener("animationcancel", cancel); };
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <article ref={box} className="fr-frame" data-place="card" data-state={state} data-pinned={pinned || undefined} data-leaving={leaving || undefined}
      onAnimationEnd={(ev) => { if (leaving && ev.target === ev.currentTarget) onClose(); }} aria-label={r.title}>
      <header className="fr-head">
        <span className="fr-title" title={r.ask}>{r.title}</span>
        {state === "stale" && <small className="fr-stale">made under contract {made.contract}, now {contract}</small>}
        {state === "remake" && r.remake && <small className="fr-stale" title={r.remake.why}>remake: {r.remake.why}</small>}
        {wrote && <small className="fr-wrote" role="status">wrote {wrote}</small>}
        {onUndo && <button className="fr-key" onClick={onUndo} title={`undo: back to version ${Math.max(...r.versions.map((v) => v.v).filter((v) => v < r.current))}`}>undo</button>}
        <button className="fr-key" aria-pressed={pinned} onClick={onPin} title={pinned ? "pinned: first on Home" : "pin: keep it first on Home"}>{pinned ? "pinned" : "pin"}</button>
        <button className="fr-key" onClick={shut} aria-label={`close ${r.title}`} title="close">×</button>
      </header>
      <div className="fr-in">
        {fault ? (
          <div className="fr-broken" role="alert">
            <b>broken{fault.line !== null ? ` at line ${fault.line}` : ""}</b>
            <span>{fault.why}</span>
            <small>things/{r.id}/{t.engine?.state === "broken" ? (made.engine ?? "engine.ts or engine.js") : made.file}</small>
          </div>
        ) : (
          <iframe ref={ref} title={r.title} sandbox="allow-scripts" srcDoc={srcdoc(t.html, CSS, r.id)} onLoad={() => setLoaded(true)} />
        )}
        {state === "loading" && <div className="fr-loading" aria-hidden>loading</div>}
      </div>
    </article>
  );
}
