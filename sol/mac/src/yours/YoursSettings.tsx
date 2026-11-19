// Build becomes yours (#1089): its two places in Build's own settings. The switch, one row under Build settings ›
// switches (Marco, 2026-11-12: a switch for one mode lives in that mode's settings). And "yours", its own section:
// every thing kept, newest first, each with where it came from, its ceiling and undo; under them, the offers passed
// with "not now", each one press from being said again.
import { useCallback, useEffect, useRef, useState } from "react";
import { Switch, useShell } from "../settingsShell";
import type { Metas } from "../home/meta";
import { ask, openSession, setBuildYours, useBuildYours } from "./live";
import { sinceOf, type Kept } from "./model";
import { Chip } from "./Chip";
import { FoundRows, Reading, type FoundRow } from "./Found";
import { askChange, askOffer, slotsOf } from "./Offer";
import { LayPick, laysOf, tryLay } from "./Look";
import "./yours.css";

export const meta = {
  YoursRow: {
    job: "Build becomes yours' switch, one row in Build settings › switches",
    flow: "mine",
    states: ["off", "on"],
    keys: [{ press: "click the switch", does: "Build notices what you repeat and offers to keep it, or stops" }],
    listens: ["build.yours (yours/live.ts)", "the Settings section shown"],
  },
  YoursList: {
    job: "every thing kept from an offer, with where it came from and undo; the offers passed",
    flow: "mine",
    states: ["switch off", "nothing kept yet", "kept things", "an undone one"],
    keys: [{ press: "undo", does: "takes the kept thing off the stage; it stays listed as undone" }, { press: "bring it back", does: "puts it back on the stage" }, { press: "forget", does: "an undone thing gone for good, after 8 s that undo can stop" }, { press: "change", does: "settings closes; the kept thing alone, to change by presses or words" }, { press: "say it again", does: "the passed offer may come back above the box" }],
    listens: ["work.yours.list (engine work/yoursKeep.ts)", "the Settings section shown"],
  },
} satisfies Metas;

export function YoursRow() {
  const sh = useShell();
  const on = useBuildYours();
  // 1 s after it goes on: how many it found, left of the switch (the first read may still be running: asked again)
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!on) { setN(null); return; }
    let t: number | undefined, live = true;
    const look = () => void ask<{ reading?: boolean; found?: unknown[] }>({ type: "work.yours.list", sessionId: openSession() }).then((m) => { if (!live) return; if (m.reading) t = window.setTimeout(look, 1500); else setN(((m.found ?? []) as { count?: number }[]).filter((o) => (o.count ?? 0) > 1).length); }).catch(() => {});
    t = window.setTimeout(look, 1000);
    return () => { live = false; clearTimeout(t); };
  }, [on]);
  if (!sh || sh.sel !== "switches") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>yours</span>
          {/* always seen, never folded by "show, don't say": what leaves the machine is said where it is switched on */}
          <span className="yo-told" title="Jev is told: how many times, in how many sessions, over how many days, the most in one day, how alike (a percent), how many blanks, each one's kind and how many values, how long (in words), how many things are kept.">Offers what you repeat. Jev is told numbers and kinds only. Never your words.</span></div>
        {on && !!n && <span className="yo-found">{n} found</span>}
        <Switch on={on} set={setBuildYours} label="yours" />
      </div>
    </div>
  );
}

type Found = { id: string; title: string; count: number; first: number; sentence: string; blanks: { name: string; value: string }[]; since?: string; opening?: string };
type Passed = { id: string; how: string; at: number; sentence: string; title: string };
export function YoursList() {
  const sh = useShell();
  const on = useBuildYours();
  const [kept, setKept] = useState<Kept[] | null>(null);
  const [passed, setPassed] = useState<Passed[]>([]);
  const [noticed, setNoticed] = useState<Passed[]>([]);
  // a change just kept: "changed · undo" for 8 s, then the row is "change · undo" again
  const [changed, setChanged] = useState<string | null>(null);
  // forgotten: "forgotten · undo" for 8 s, then it is gone from the list, the folder and yours.json
  const [forgot, setForgot] = useState<string | null>(null);
  const forgetTimer = useRef<number | undefined>(undefined);
  const [err, setErr] = useState("");
  // the first minute (the designer, NOW 04:12 1): while the first read runs, "reading 30 days"; then what they repeat
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  // after 5 s of the first read, how many asks it has read so far (a long first read is not a still pearl)
  const [read, setRead] = useState(0);
  // the record cannot be saved (yours.json could not be read nor set aside): said once, at the top
  const [stuck, setStuck] = useState(false);
  const openedAt = useRef(Date.now());
  const load = useCallback(() => ask<{ kept: Kept[]; passed: Passed[]; noticed?: Passed[]; reading?: boolean; found?: Found[]; read?: number; stuck?: boolean }>({ type: "work.yours.list", sessionId: openSession() }).then((m) => { setStuck(!!m.stuck); setRead(m.read ?? 0); setKept(m.kept); setPassed(m.passed); setNoticed(m.noticed ?? []); setReading(!!m.reading); setFound(m.found ?? []); setErr(""); }).catch((e) => setErr(e.message)), []);
  const shown = !!sh && sh.sel === "yours";
  useEffect(() => { if (shown && on) { openedAt.current = Date.now(); void load(); } }, [shown, on, load]);
  useEffect(() => { if (!shown || !on || !reading) return; const t = setTimeout(() => void load(), 1500); return () => clearTimeout(t); }, [shown, on, reading, load]);
  if (!shown) return null;
  if (!on) return <p className="hint-line">Turn on “yours” in Build settings › switches, and Build starts noticing what you ask again and again.</p>;
  const undo = (id: string) => ask({ type: "work.yours.undo", id }).then(load).catch((e) => setErr(e.message));
  const forget = (id: string) => {
    if (forgot && forgot !== id) void ask({ type: "work.yours.forget", id: forgot }).catch(() => {});
    setForgot(id); clearTimeout(forgetTimer.current);
    forgetTimer.current = window.setTimeout(() => { setForgot(null); void ask({ type: "work.yours.forget", id }).then(load).catch((e) => setErr(e.message)); }, 8000);
  };
  // the change stands over the session, not over the open panel: settings closes first, the line opens it
  // a row pressed: settings closes, and its versions stand over the session at once (as "change" does)
  const open = (id: string) => { document.querySelector<HTMLButtonElement>(".settings-x")?.click(); askOffer(id); };
  const change = (k: Kept) => {
    document.querySelector<HTMLButtonElement>(".settings-x")?.click();
    askChange(k, (n) => { if (n.before) { setChanged(n.id); window.setTimeout(() => setChanged((c) => (c === n.id ? null : c)), 8000); } });
  };
  return (
    <div className="yo-list" data-yours="list">
      {err && <p className="hint-line stale">{err}</p>}
      {stuck && <p className="hint-line stale" data-yours="stuck">Can't save here right now. What you keep won't stay.</p>}
      {reading && <div data-yours="reading"><Reading read={read >= 1 && Date.now() - openedAt.current > 5000 ? read : undefined} /></div>}
      {/* three groups read alike: yours · you repeat · you asked (the designer, NOW 05:56 2) */}
      {!!kept?.length && <div className="yo-passed" data-yours="kept"><p className="hint-line">yours</p>{kept.map((k) => (
        <div key={k.id} className="yo-krow" data-kept={k.id}>
          {k.spec.shape === "layout" && k.spec.lay && !k.undone
            ? (() => { const v = laysOf(k.spec.lay); const at = Math.max(0, v.findIndex((x) => JSON.stringify(x.lay) === JSON.stringify(k.spec.lay)));
                return <LayPick versions={v} kept={at} onTry={(i) => tryLay(i === null ? null : v[i].lay)} onKeep={(i) => { tryLay(null); void ask({ type: "work.yours.lay", id: k.id, lay: v[i].lay }).then(load).catch((e) => setErr(e.message)); }} />; })()
            : <Chip title={k.title} blanks={slotsOf(k.spec)} kept undone={!!k.undone} label={`${k.title}, ${k.undone ? "undone" : "yours"}`} />}
          <span className="yo-kfrom">{k.from.count > 99 ? "99+" : k.from.count} {k.from.count === 1 ? "ask" : k.from.kind === "correction" ? "corrections" : k.from.kind === "closed" ? "closes" : k.from.kind === "arrangement" ? "sessions" : "asks"} · since {new Date(k.from.first).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          {forgot === k.id
            ? <><span className="yo-kfrom">{k.stays ? "forgotten · your file stays" : "forgotten"}</span><button className="yo-quiet" onClick={() => { clearTimeout(forgetTimer.current); setForgot(null); }}>undo</button></>
            : changed === k.id && k.before
            ? <><span className="yo-kfrom">{k.stays ? "changed · your file stays" : "changed"}</span><button className="yo-quiet" onClick={() => void ask({ type: "work.yours.unchange", id: k.id }).then(() => { setChanged(null); return load(); }).catch((e) => setErr(e.message))}>undo</button></>
            : <>
              {!k.undone && k.spec.shape !== "layout" && <button className="yo-quiet" onClick={() => change(k)}>change</button>}
              {k.undone && k.stays && <span className="yo-kfrom">your file stays</span>}
              <button className="yo-quiet" onClick={() => void undo(k.id)}>{k.undone ? "bring it back" : "undo"}</button>
              {k.undone && <button className="yo-quiet" onClick={() => forget(k.id)}>forget</button>}
            </>}
        </div>
      ))}</div>}
      {!reading && kept !== null && (() => {
        // the first minute (the designer, NOW 05:35 1): what they repeat, then (fewer than three) the asks sent once
        const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        const row = (o: Found): FoundRow => ({ id: o.id, title: o.title, blanks: o.blanks, count: o.count, since: o.since ?? day(o.first), opening: o.opening });
        const rep = found.filter((o) => o.count > 1), once = found.filter((o) => o.count < 2);
        return <div className="yo-passed" data-yours="found">
          {rep.length > 0 && <><p className="hint-line">you repeat</p><FoundRows rows={rep.map(row)} onOpen={open} /></>}
          {once.length > 0 && <><p className="hint-line">you asked</p><FoundRows rows={once.map(row)} onOpen={open} /></>}
          {found.length === 0 && <div className="yo-krow" data-yours-none><span className="yo-none" /><span className="yo-kfrom">Nothing yet. Your next ask shows here.</span></div>}
        </div>;
      })()}
      {noticed.length > 0 && <div className="yo-passed">
        <p className="hint-line">noticed</p>
        {noticed.map((p) => (
          <div key={p.id} role="button" tabIndex={0} className="yo-krow yo-press" title={p.sentence} onClick={() => open(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(p.id); } }}>
            <Chip title={p.title || "something you repeat"} />
            <span className="yo-kfrom">{sinceOf(p.at)}</span>
          </div>
        ))}
      </div>}
      {passed.length > 0 && <div className="yo-passed">
        <p className="hint-line">passed</p>
        {passed.map((p) => (
          <div key={p.id} role="button" tabIndex={0} className="yo-krow yo-press" title={p.sentence} onClick={() => open(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(p.id); } }}>
            <Chip title={p.title || "an offer"} />
            <span className="yo-kfrom">{sinceOf(p.at)}</span>
          </div>
        ))}
      </div>}
    </div>
  );
}
