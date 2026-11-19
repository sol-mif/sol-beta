// The side's sessions (2026-11-11, Marco: "a tray underneath artifacts that just shows all sessions in existence ...
// really clear cut organization of how many session i have with each project ... like a concierge for my sessions").
// The side itself shows only what is live or recent, so its counts are not the whole; this is the whole: every session
// the engine knows, counted by folder, found by a word, narrowed by state. It takes the find button's place.
// Refined the same day ("even more readable ... clear interpretation in layman's terms"): each session says in plain
// words what it is (its title made readable), where it stands and what it made; a press reads it: what was asked, what
// it did (its last wrap-up), the last thing it said. The words are sideRead.ts's; the thread is read on the press.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Card, Glass, Pill } from "../kit";
import { CURVE } from "../kit/tokens";
import { folderOf, type St } from "./sideRows";
import { ago, homePath, plainTitle, readOf, standing, twins, type Said } from "./sideRead";
import type { Art } from "./sideArts";
import type { Metas } from "./meta";

export const meta = {
  SessFoot: {
    job: "how many sessions exist, at the side's foot under the artifacts",
    flow: "pickup",
    states: ["none", "some", "open"],
    keys: [
      { press: "click it", does: "opens every session, by folder", goal: "pickup", faster: true },
      { press: "click a folder's \"N more\" on the side", does: "opens it here, at that folder", goal: "pickup", faster: true },
    ],
    listens: ["work.sessions"],
  },
  SessAll: {
    job: "every session there is, in plain words: how many in each folder, what each one is, where it stands, what it made; a press reads one: what was asked and what it did",
    flow: "pickup",
    states: ["by folder", "a folder open", "a session read", "narrowed by state", "a word typed", "nothing found"],
    keys: [
      { press: "type", does: "finds sessions by title or folder, in every folder at once", goal: "pickup", faster: true },
      { press: "click a folder", does: "opens its sessions, newest first" },
      { press: "click a session", does: "reads it: what was asked, what it did, the last thing it said", goal: "know", faster: true },
      { press: "click open (or double-click a session)", does: "opens it", goal: "pickup", faster: true },
      { press: "click a state", does: "keeps only the sessions in that state" },
      { press: "Esc or a click away", does: "closes it" },
    ],
    listens: ["work.sessions", "work.runs", "work.peek (the session read, its thread)", "the side's artifacts"],
  },
  Reading: {
    job: "one session read in plain words, under its row in every session: what was asked, what it did, the last thing it said; then open it",
    flow: "pickup",
    states: ["reading it", "nothing said yet", "read", "asked by another session"],
    keys: [
      { press: "click open it", does: "opens the session", goal: "pickup", faster: true },
    ],
    listens: ["work.peek (asked when it opens, let go when it closes: the session's thread)"],
  },
} satisfies Metas;

type Ses = { id: string; title: string; cwd: string; project: string; folder?: string; machine?: string; updatedAt: number; archived?: boolean; gone?: boolean; pinned?: boolean; done?: boolean; parent?: string };
export type SessActs = {
  st: (s: never) => St; nameOf: (key: string) => string; onOpen: (sid: string) => void;
  since?: (sid: string) => number | undefined;           // a running session's stretch began (its run's since)
  items?: (sid: string) => Said[] | undefined;           // its thread, when the face holds it
  look?: (sid: string) => () => void;                    // ask for its thread (work.peek); the answer lets it go
  mark?: (st: St) => ReactNode;                          // the side's state mark (Side.tsx Mark)
};

const ALL_W = 600, CAP = 12;
const NARROW = ["all", "needs you", "working", "not seen", "pinned", "put away"] as const;
const fits = (i: number, s: Ses, st: St) => i === 0 || (i === 1 && st === "needs") || (i === 2 && st === "running") || (i === 3 && st === "unread") || (i === 4 && !!s.pinned) || (i === 5 && !!s.archived);
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const quote = (t: string) => `“${t}”`;
const upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** a session read: what was asked, what it did, the last thing it said; then open it */
function Reading({ s, acts, asker, onOpen }: { s: Ses; acts: SessActs; asker?: string; onOpen: () => void }) {
  const items = acts.items?.(s.id);
  useEffect(() => acts.look?.(s.id), [s.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const r = readOf(items);
  const at = useRef<HTMLDivElement>(null);
  useEffect(() => { at.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [!!items]);   // eslint-disable-line react-hooks/exhaustive-deps
  const part = (label: string, text?: string) => text ? <div className="hs-part"><span className="hs-label">{label}</span><p className="hs-text">{text}</p></div> : null;
  return (
    <div className="hs-read" ref={at}>
      {!items ? <p className="hs-wait">reading it…</p>
        : !r.asked && !r.did && !r.said ? <p className="hs-wait">nothing was said in it yet</p>
        : <>
          {part(asker ? `asked by ${asker}` : "you asked", r.asked)}
          {part("what it did", r.did)}
          {part(r.did ? "the last thing it said" : "where it ended", r.did && r.said === r.did ? undefined : r.said)}
        </>}
      <div className="hs-go"><Button h={32} onClick={onOpen}>open it</Button></div>
    </div>
  );
}

function SessAll({ sessions, acts, arts, live, start, onClose }: { sessions: Ses[]; acts: SessActs; arts: Art[]; live: string | null; start?: string | null; onClose: () => void }) {
  const [narrow, setNarrow] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => (start ? { [start]: true } : {}));
  const [whole, setWhole] = useState<Record<string, boolean>>({});
  const [read, setRead] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  useEffect(() => { if (start) list.current?.querySelector(`[data-folder="${CSS.escape(start)}"]`)?.scrollIntoView({ block: "start" }); }, [start]);
  const st = acts.st as (s: Ses) => St;
  const titles = useMemo(() => new Map(sessions.map((s) => [s.id, plainTitle(s.title)])), [sessions]);
  const made = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const a of arts) by.set(a.from, [...(by.get(a.from) ?? []), a.title || a.kind]);
    return by;
  }, [arts]);
  const word = q.trim().toLowerCase();
  const folders = useMemo(() => {
    type F = { key: string; name: string; all: number; rows: Ses[]; at: number; needs: number; running: number; unread: number };
    const by = new Map<string, F>();
    for (const s of sessions) {
      const key = folderOf(s as never), f = by.get(key) ?? { key, name: acts.nameOf(key), all: 0, rows: [], at: 0, needs: 0, running: 0, unread: 0 };
      f.all++; f.at = Math.max(f.at, s.updatedAt);
      const state = st(s);
      if (state === "needs") f.needs++; else if (state === "running") f.running++; else if (state === "unread") f.unread++;
      const t = titles.get(s.id) ?? "";
      if (fits(narrow, s, state) && (!word || t.toLowerCase().includes(word) || s.title.toLowerCase().includes(word) || f.name.toLowerCase().includes(word))) f.rows.push(s);
      by.set(key, f);
    }
    const out = [...by.values()].filter((f) => f.rows.length || (!word && narrow === 0));
    for (const f of out) f.rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return out.sort((a, b) => b.rows.length - a.rows.length || b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, narrow, word, titles]);
  const twin = useMemo(() => twins(folders.map((f) => f.key), acts.nameOf), [folders]);   // eslint-disable-line react-hooks/exhaustive-deps
  const found = folders.reduce((k, f) => k + f.rows.length, 0);
  const counts = useMemo(() => NARROW.map((_, i) => sessions.filter((s) => fits(i, s, st(s))).length), [sessions]);   // eslint-disable-line react-hooks/exhaustive-deps
  const loose = !!word || narrow !== 0;   // a word or a state: every folder that holds a match is open
  const go = (id: string) => { onClose(); acts.onOpen(id); };
  // the line of states is a way in too: a press on "3 working" keeps the working ones, a second press shows all again
  const said = ([[1, `${counts[1]} ${counts[1] === 1 ? "needs" : "need"} you`], [2, `${counts[2]} working`], [3, `${counts[3]} finished, not seen yet`], [4, `${counts[4]} pinned`], [5, `${counts[5]} put away`]] as [number, string][]).filter(([i]) => counts[i]);
  return createPortal(
    <div className="ha-veil" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="ha-all hs-all" role="dialog" aria-label="every session">
        <Card w={ALL_W} step="pop">
          <div className="ha-in">
            <div className="ha-head"><span className="ha-title">every session</span><span className="ha-count">{n(sessions.length, "session")} · {n(new Set(sessions.map((s) => folderOf(s as never))).size, "folder")}</span></div>
            <p className="ha-say">{said.length ? said.map(([i, t], k) => <span key={i}>{k > 0 && " · "}<span role="button" tabIndex={-1} className={`hs-pick${narrow === i ? " on" : ""}`} onClick={() => setNarrow(narrow === i ? 0 : i)}>{t}</span></span>) : "nothing needs you, nothing is working, nothing waits unseen"}</p>
            <div className="hs-find"><Glass r={CURVE.radius.field} step="box" /><input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="find a session or a folder" aria-label="find a session or a folder" spellCheck={false} /></div>
            <div className="ha-sort"><Pill words={NARROW} picked={narrow} h={28} onPick={setNarrow} /></div>
            <div className="ha-list" ref={list}>
              {folders.map((f) => {
                const isOpen = loose ? open[f.key] !== false : !!open[f.key], cap = whole[f.key] ? f.rows.length : CAP;
                const sub = [f.needs && `${f.needs} ${f.needs === 1 ? "needs" : "need"} you`, f.running && `${f.running} working`, f.unread && `${f.unread} not seen yet`, f.at ? `last used ${ago(f.at)}` : ""].filter(Boolean).join(" · ");
                return (
                  <div key={f.key} className={`ha-group hs-group${isOpen ? " open" : ""}`} data-folder={f.key}>
                    <div role="button" tabIndex={-1} className="ha-row hs-folder" aria-expanded={isOpen} title={homePath(f.key)} onClick={() => setOpen((o) => ({ ...o, [f.key]: !isOpen }))}>
                      <span className={`hc-caret hs-caret${isOpen ? " open" : ""}`} aria-hidden />
                      <span className="ha-words"><span className="hs-fname">{f.name}{twin.get(f.key) && <span className="hs-twin"> {twin.get(f.key)}</span>}</span><span className="hs-sub">{sub}</span></span>
                      <span className="hs-n">{loose ? <>{f.rows.length}<span className="hs-of"> of {f.all}</span></> : f.all}</span>
                      <span className="ha-lift" aria-hidden><Glass r={CURVE.radius.row} step="raised" edge={0} /></span>
                    </div>
                    {isOpen && <div className="hs-kids">
                      <div className="hs-path">{homePath(f.key)}</div>
                      {f.rows.slice(0, cap).map((s) => {
                        const state = st(s), reading = read === s.id;
                        const asker = s.parent ? quote(titles.get(s.parent) ?? "another session") : undefined;
                        const things = made.get(s.id);
                        const more = upper([asker ? `started by ${asker}` : "", things ? `made ${things.slice(0, 2).join(", ")}${things.length > 2 ? ` and ${things.length - 2} more` : ""}` : "", s.machine === "nucbox" ? "ran on the NucBox" : ""].filter(Boolean).join(" · "));
                        return (
                          <div key={s.id} className={`hs-one${reading ? " reading" : ""}`}>
                            {reading && <Glass r={CURVE.radius.row} step="raised" edge={0} />}
                            <div role="button" tabIndex={-1} aria-expanded={reading} className={`ha-row hs-ses hs-${state || "quiet"}${s.id === live ? " here" : ""}`} data-ses={s.id}
                              onClick={() => setRead(reading ? null : s.id)} onDoubleClick={() => go(s.id)}>
                              <span className="hs-mark">{acts.mark?.(state)}</span>
                              <span className="ha-words">
                                <span className="hs-t">{titles.get(s.id) || "an untitled session"}</span>
                                <span className="hs-st">{standing(state, s, acts.since?.(s.id))}{s.id === live ? " · open now" : ""}</span>
                                {more && <span className="hs-more">{more}</span>}
                              </span>
                              <span role="button" className="ha-bring hs-open" title="open this session" onClick={(ev) => { ev.stopPropagation(); go(s.id); }}>open</span>
                              <span className="ha-lift" aria-hidden><Glass r={CURVE.radius.row} step={reading ? "box" : "raised"} edge={0} /></span>
                            </div>
                            {reading && <Reading s={s} acts={acts} asker={asker} onOpen={() => go(s.id)} />}
                          </div>
                        );
                      })}
                      {f.rows.length > cap && <div role="button" tabIndex={-1} className="ha-row hs-rest" onClick={() => setWhole((x) => ({ ...x, [f.key]: true }))}><span className="hs-st">show {f.rows.length - cap} more in {f.name}</span></div>}
                    </div>}
                  </div>
                );
              })}
              {!found && loose && <p className="ha-none">no session fits{word ? ` "${q.trim()}"` : ""}{narrow ? ` in ${NARROW[narrow]}` : ""}</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>, document.body);
}

/** the side's foot, under the artifacts: every session there is, one press away; `ask` opens it at a folder (the
 *  side's "N more") */
export function SessFoot({ sessions, acts, arts = [], live, ask }: { sessions: Ses[]; acts: SessActs; arts?: Art[]; live: string | null; ask?: { folder: string | null; at: number } | null }) {
  const [all, setAll] = useState<{ start: string | null } | null>(null);
  useEffect(() => { if (ask) setAll({ start: ask.folder }); }, [ask?.at]);   // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => sessions.filter((s) => !s.gone), [sessions]);
  return (
    <>
      <div role="button" tabIndex={-1} data-thing data-kind="head" data-sessions title="every session, by folder (the side shows only what is live or recent)" className={`hd-arts${all ? " held" : ""}`} onClick={() => setAll({ start: null })}>
        <Glass r={CURVE.radius.block} step={all ? "raised" : "card"} />
        <span className="hd-artw">sessions</span>
        <span className="hc-n">{known.length || ""}</span>
      </div>
      {all && <SessAll sessions={known} acts={acts} arts={arts} live={live} start={all.start} onClose={() => setAll(null)} />}
    </>
  );
}
