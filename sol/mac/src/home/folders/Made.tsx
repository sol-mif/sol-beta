// A made thing on screen (#1490, made.ts): a dark card with its maker's small jelly, clipped under the sticky it was for;
// "new" until opened. Opened, a sheet: who made it and where, the line the run wrote, and the file it names as the
// engine reads it (work.read in the place's folder), never a path standing in for the thing.
// The trust gate (#1497): a draft or an ask still waiting says so on its card ("ready · not sent", its act); opened, the
// whole of it shows above its one act (Send, Pay …), so what leaves the person is seen before its button.
import { useCallback, useEffect, useRef, useState } from "react";
import { Jelly } from "../../agents/Jelly";
import { isNew, madeWhen, markSeen, readSeen, type MadeThing } from "./madeLines";
import "./made.css";

type Ask = <T>(o: object, ms: number) => Promise<T | null>;
/** who made it: the place's agent (its name and jelly turn), else Sol */
export type Maker = { name: string; turn: number };
export const SOL: Maker = { name: "Sol", turn: 0 };

/** an open told to the engine, to be counted (track.ts: by its kind today; its fields once fr-24's table takes them):
 *  whether it was new, whether it names a file, where it was opened, its age in hours; never its words or its file */
export const tellOpened = (ask: Ask, x: MadeThing, fresh: boolean, from: "place" | "made" | "pile") =>
  void ask({ type: "agent.made.open", fresh, file: !!x.file, from, ageH: x.at === null ? -1 : Math.round((Date.now() - x.at) / 3_600_000) }, 3000);

/** the made things opened on this computer, and the one press that opens one */
export function useSeen() {
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  useEffect(() => { const f = (ev: StorageEvent) => { if (ev.key === null || ev.key.startsWith("sol.home.made")) setSeen(readSeen()); }; window.addEventListener("storage", f); return () => window.removeEventListener("storage", f); }, []);
  const see = useCallback((key: string) => setSeen(markSeen(key)), []);
  return { seen, see };
}

/** what a waiting one says it is (the trust gate, #1497): Sol made it ready and did nothing that leaves the person */
export const WAITS_WORD = { draft: "ready · not sent", ask: "ready · waits for your yes" } as const;

export function MadeCard({ x, maker, seen, onOpen, lip, clipped, now = Date.now() }: { x: MadeThing; maker: Maker; seen: ReadonlySet<string>; onOpen: (x: MadeThing) => void; lip?: string; clipped?: boolean; now?: number }) {
  const fresh = isNew(x, seen, now);
  return (
    <button type="button" className={`fh-made ${fresh ? "fresh" : ""} ${clipped ? "clipped" : ""} ${x.waiting ? "waiting" : ""}`} onClick={() => onOpen(x)} data-made={x.t} data-made-new={fresh ? "" : undefined} data-made-waits={x.waiting ? x.waits : undefined} title={x.waiting ? `${maker.name} made this ready · open it to ${x.act?.toLowerCase()}` : `${maker.name} made this · open it`}>
      {lip && <span className="fh-made-lip">{lip}</span>}
      <span className="by"><Jelly size={20} turn={maker.turn} /><span className="who">{maker.name}</span><span className="when">{madeWhen(x.at, now)}</span>{fresh && <span className="new">new</span>}</span>
      <span className="mt">{x.t}</span>
      {x.line && <span className="ml">{x.line}</span>}
      {x.waiting && x.waits && <span className="wt" data-made-wait>{WAITS_WORD[x.waits]}<b>{x.act}</b></span>}
    </button>
  );
}

/** the person's yes on a waiting one (#1497): held for the undo's seconds, said with its undo, then the engine runs that
 *  one step (agent.press with `yes`) and ticks its sticky done when it ends well. `folder`: the place's folder */
export function useYes(ask: Ask, say: (text: string, undo?: () => void) => void, hold: number) {
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => { for (const t of timers.current.values()) window.clearTimeout(t); }, []);
  return useCallback((folder: string, x: MadeThing) => {
    if (!x.act || timers.current.has(x.key)) return;
    const go = window.setTimeout(() => {
      timers.current.delete(x.key);
      void ask<{ ok?: boolean; why?: string }>({ type: "agent.press", folder, key: x.sticky, yes: x.did, act: x.act, waits: x.waits }, 20 * 60_000).then((r) =>
        say(r?.ok ? `${x.act}: done for “${x.sticky}”, and it is ticked done.` : `Not done: ${r?.why ?? "the engine did not answer"}. It still waits for you.`));
    }, hold);
    timers.current.set(x.key, go);
    say(`${x.act}: “${x.sticky}” in a moment.`, () => { window.clearTimeout(go); timers.current.delete(x.key); });
  }, [ask, say, hold]);
}

/** the open made thing: its file read in the place's folder (`dir`, absolute); a file that cannot be read is named */
export function MadeSheet({ ask, dir, x, maker, where, onClose, onYes }: { ask: Ask; dir: string | null; x: MadeThing; maker: Maker; where: string; onClose: () => void; onYes?: (x: MadeThing) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null); setWhy(null);
    if (!x.file) return;
    if (!dir) { setWhy(`${x.file} is in ${where}; its folder could not be reached`); return; }
    void ask<{ text?: string; error?: string }>({ type: "work.read", cwd: dir, path: x.file }, 8000).then((r) => {
      if (!alive) return;
      if (!r || r.error || typeof r.text !== "string") setWhy(`${x.file} could not be read (${r?.error ?? "the engine did not answer"})`);
      else setText(r.text);
    });
    return () => { alive = false; };
  }, [ask, dir, x.file, where]);
  useEffect(() => { const f = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onClose(); } }; window.addEventListener("keydown", f, true); return () => window.removeEventListener("keydown", f, true); }, [onClose]);
  return (
    <div className="fh-made-veil" onClick={onClose} data-made-sheet={x.t}>
      <div className="fh-made-sheet" onClick={(ev) => ev.stopPropagation()}>
        <div className="head"><Jelly size={44} turn={maker.turn} /><div><div className="who">{maker.name} made this · {where}</div><div className="nm">{x.t}</div></div></div>
        <div className="for">for “{x.sticky}”{x.line ? ` · ${x.line}` : ""}</div>
        {x.file && <pre className="body" data-made-text>{text ?? why ?? "reading…"}</pre>}
        {x.waiting && x.waits && <div className="wt" data-made-wait>{x.waits === "draft" ? "Nothing has been sent. It goes when you press." : "Nothing is paid, submitted or deleted until you press."}</div>}
        <div className="acts">
          {x.waiting && onYes && <button type="button" className="ob1-btn pearl" onClick={() => { onYes(x); onClose(); }} data-made-yes={x.act}>{x.act}</button>}
          <button type="button" className="ob1-btn" onClick={onClose}>{x.waiting ? "not now" : "close"}</button>
        </div>
      </div>
    </div>
  );
}

/** a place's made pile: everything made here, newest first; one press opens it */
export function MadePile({ list, seen, onOpen }: { list: MadeThing[]; seen: ReadonlySet<string>; onOpen: () => void }) {
  const fresh = list.filter((x) => isNew(x, seen)).length;
  return (
    <button type="button" className={`fh-pile made ${list.length ? "" : "empty"}`} onClick={onOpen} disabled={!list.length} data-made-pile={list.length}>
      <span className="sheets"><i /><i /><i /></span>made{list.length ? ` · ${list.length}` : ""}{fresh ? `, ${fresh} new` : ""}
    </button>
  );
}
