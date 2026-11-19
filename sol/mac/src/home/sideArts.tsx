// The side's artifacts (2026-11-11, "hold it"; Marco: "the artifacts thing is fine"): what was made, as things, at the
// side's foot. The tray wears the marks of what is on stage; the pointer over it peeks at what is on stage now, across
// sessions; a press opens everything made. An artifact is the stage's block, said in the person's word.
// Where they come from, with no engine change: a session's stage (work.stage.get) answers its own blocks and its
// project's open blocks that are on other stages (the tray, #739). So this session's stage gives its whole project;
// one session of each other folder on the side (its newest) gives that folder's. Closed artifacts are not listed by
// any verb yet, so "everything made" is everything still open.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Card, FileMark, Glass, Pill } from "../kit";
import { CURVE } from "../kit/tokens";
import { dur } from "../motion";
import type { StageStore } from "../stage/store";
import type { Kind, State } from "../stage/model";
import { when } from "./sideRows";
import type { Metas } from "./meta";

export const meta = {
  ArtsFoot: {
    job: "what was made, at the side's foot: the marks of what is on stage and how many artifacts are open",
    flow: "pickup",
    states: ["none", "some", "peek", "everything"],
    keys: [
      { press: "point at it", does: "peeks at what is on stage now, across sessions", goal: "know", faster: true },
      { press: "click it", does: "opens everything made", goal: "pickup", faster: true },
    ],
    listens: ["work.stage.get (this session's stage and its project's tray; one session of each other folder)", "work.stage.changed"],
  },
  ArtsAll: {
    job: "everything made that is still open, across the side's folders: what it is, where it was made, how many sessions hold it",
    flow: "pickup",
    states: ["newest", "by session", "by kind"],
    keys: [
      { press: "click an artifact", does: "here: raises it on the stage; elsewhere: opens the session that made it", goal: "pickup", faster: true },
      { press: "click bring here", does: "carries it onto this session's stage, so this session reads it too (work.stage.carry)" },
      { press: "Esc or a click away", does: "closes it" },
    ],
    listens: ["the same as ArtsFoot"],
  },
  ArtRow: {
    job: "one artifact as a row, in the peek and in everything made: its file mark, its title, where it was made and when, how many sessions hold it",
    flow: "pickup",
    states: ["on this stage", "from another session", "held in several sessions (wide)", "bring here (wide, from elsewhere)"],
    keys: [
      { press: "click it", does: "here: raises it on the stage; elsewhere: opens the session that made it", goal: "pickup", faster: true },
      { press: "click bring here", does: "carries it onto this session's stage (work.stage.carry)" },
    ],
    listens: ["the side's artifacts (useArtifacts)", "the sessions' titles"],
  },
} satisfies Metas;

export type Art = { id: string; kind: Kind; title: string; state: State; from: string; at: number; here: boolean; src?: string; held: number };
type Ses = { id: string; title: string; project: string; updatedAt: number; archived?: boolean; gone?: boolean };

const OTHERS = 4;   // how many other folders are asked for their artifacts (one stage read each)
const EXT: Record<Kind, string> = { page: "tsx", list: "md", shots: "png", card: "md", table: "xlsx", diff: "tsx", browser: "png", terminal: "tsx" } as Record<Kind, string>;
const BY_FILE: [RegExp, string][] = [[/\.(md|txt)$/i, "md"], [/\.(png|jpe?g|webp|gif)$/i, "png"], [/\.pdf$/i, "pdf"], [/\.docx?$/i, "docx"], [/\.(xlsx?|csv)$/i, "xlsx"], [/\.pptx?$/i, "pptx"], [/\.\w+$/, "tsx"]];
/** the kit's file mark an artifact wears: its file's kind when it is bound to one, else its block kind's */
export const extOf = (a: Pick<Art, "kind" | "src">) => (a.src && BY_FILE.find(([re]) => re.test(a.src!))?.[1]) || EXT[a.kind] || "md";

/** every open artifact the side can reach: this session's stage and its project's, then each other folder's */
export function useArtifacts(store: StageStore, live: string | null, sessions: Ses[]): Art[] {
  const asked = useMemo(() => {
    const mine = sessions.find((s) => s.id === live)?.project;
    const by = new Map<string, Ses>();
    for (const s of sessions) {
      if (s.archived || s.gone || s.project === mine) continue;
      const was = by.get(s.project);
      if (!was || s.updatedAt > was.updatedAt) by.set(s.project, s);
    }
    const others = [...by.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, OTHERS).map((s) => s.id);
    return live ? [live, ...others] : others;
  }, [sessions, live]);
  const key = asked.join(" ");
  const [n, tick] = useState(0);
  useEffect(() => {
    const offs = asked.map((id) => store.subscribe(id, () => tick((v) => v + 1)));
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);
  return useMemo(() => {
    const out = new Map<string, Art>();
    for (const sid of asked) {
      const seen = store.read(sid);
      for (const b of seen.blocks) {
        if (b.state === "dead") continue;
        const here = sid === live, was = out.get(b.id);
        if (was && (was.here || !here)) continue;
        const last = b.versions?.[b.versions.length - 1] as { at?: number } | undefined;
        out.set(b.id, { id: b.id, kind: b.kind, title: b.title, state: b.state, from: b.sessions[0] ?? sid, at: last?.at ?? 0, here, src: b.bind?.source, held: Math.max(1, b.sessions.length) });
      }
      for (const t of seen.tray ?? []) if (!out.has(t.id) && t.state !== "dead") out.set(t.id, { id: t.id, kind: t.kind, title: t.title, state: t.state, from: t.from, at: t.at, here: false, held: 1 });
    }
    return [...out.values()].sort((a, b) => Number(b.here) - Number(a.here) || b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key, live, n]);
}

const PEEK_W = 304, ALL_W = 468, PAD = 12, PEEKS = 6;
type Acts = { titleOf: (sid: string) => string | undefined; onOpen: (sid: string) => void; raise: (id: string) => void; bring?: (id: string) => void };

function ArtRow({ a, acts, wide, onDone }: { a: Art; acts: Acts; wide?: boolean; onDone: () => void }) {
  const from = a.here ? "on this stage" : acts.titleOf(a.from) ?? "an earlier session";
  const note = [from, a.at ? when(a.at) : "", wide && a.held > 1 ? `in ${a.held} sessions` : ""].filter(Boolean).join(" · ");
  return (
    <div role="button" tabIndex={-1} className="ha-row" data-art={a.id} title={a.src ?? a.title}
      onClick={() => { onDone(); if (a.here) acts.raise(a.id); else acts.onOpen(a.from); }}>
      <span className="ha-mark"><FileMark ext={extOf(a)} h={26} /></span>
      <span className="ha-words"><span className="ha-t">{a.title || a.kind}</span><span className="ha-n">{note}</span></span>
      {wide && !a.here && acts.bring && <span role="button" className="ha-bring" title="carry it onto this session's stage, so this session reads it too"
        onClick={(ev) => { ev.stopPropagation(); acts.bring!(a.id); }}>bring here</span>}
      <span className="ha-lift" aria-hidden><Glass r={CURVE.radius.row} step="raised" edge={0} /></span>
    </div>
  );
}

const SORTS = ["newest", "by session", "by kind"] as const;
/** everything made that is still open: one card over the window, sorted three ways */
function ArtsAll({ arts, acts, onClose }: { arts: Art[]; acts: Acts; onClose: () => void }) {
  const [sort, setSort] = useState(0);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  const name = (a: Art) => (a.here ? "on this stage" : acts.titleOf(a.from) ?? "an earlier session");
  const groups = useMemo(() => {
    if (sort === 0) return [{ name: "", arts: [...arts].sort((a, b) => b.at - a.at) }];
    const by = new Map<string, Art[]>();
    for (const a of arts) { const k = sort === 1 ? name(a) : a.kind; by.set(k, [...(by.get(k) ?? []), a]); }
    return [...by].map(([k, v]) => ({ name: k, arts: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arts, sort]);
  const sessions = new Set(arts.map((a) => a.from)).size;
  return createPortal(
    <div className="ha-veil" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="ha-all" role="dialog" aria-label="everything made">
        <Card w={ALL_W} step="pop">
          <div className="ha-in">
            <div className="ha-head"><span className="ha-title">everything made</span><span className="ha-count">{arts.length} open, from {sessions} {sessions === 1 ? "session" : "sessions"}</span></div>
            <p className="ha-say">An artifact a session holds is something it can read. Bring one here and this session reads it too.</p>
            <div className="ha-sort"><Pill words={SORTS} picked={sort} h={28} onPick={setSort} /></div>
            <div className="ha-list">
              {groups.map((g) => <div key={g.name} className="ha-group">{g.name && <div className="ha-from">{g.name}</div>}{g.arts.map((a) => <ArtRow key={a.id} a={a} acts={acts} wide onDone={onClose} />)}</div>)}
              {!arts.length && <p className="ha-none">nothing is open yet: what a session makes for you shows here</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>, document.body);
}

/** the side's foot: the artifacts tray, its peek under the pointer, everything made on a press */
export function ArtsFoot({ arts, acts }: { arts: Art[]; acts: Acts }) {
  const at = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState<{ x: number; y: number } | null>(null);
  const [all, setAll] = useState(false);
  const away = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hold = () => { clearTimeout(away.current); };
  const leave = () => { clearTimeout(away.current); away.current = setTimeout(() => setPeek(null), dur("reveal") * 1.5); };
  const enter = () => { hold(); const r = at.current?.getBoundingClientRect(); if (r && arts.length) setPeek({ x: r.right + 8, y: r.bottom }); };
  useEffect(() => () => clearTimeout(away.current), []);
  const stage = arts.filter((a) => a.here), shown = (stage.length ? stage : arts).slice(0, PEEKS);
  const marks = [...new Set(arts.map(extOf))].slice(0, 4);
  const sessions = new Set(shown.map((a) => a.from)).size;
  return (
    <>
      <div ref={at} role="button" tabIndex={-1} data-thing data-kind="head" data-arts className={`hd-arts${peek || all ? " held" : ""}`} onMouseEnter={enter} onMouseLeave={leave}
        onClick={() => { setPeek(null); setAll(true); }}>
        <Glass r={CURVE.radius.block} step={peek || all ? "raised" : "card"} />
        <span className="hd-artmarks" aria-hidden>{marks.map((e) => <i key={e}><FileMark ext={e} h={22} /></i>)}</span>
        <span className="hd-artw">artifacts</span>
        <span className="hc-n">{arts.length || ""}</span>
      </div>
      {peek && !all && createPortal(
        <div className="ha-peek" role="dialog" aria-label="artifacts on stage" style={{ left: peek.x, bottom: Math.max(PAD, innerHeight - peek.y) }} onMouseEnter={hold} onMouseLeave={leave}>
          <Card w={PEEK_W} step="pop">
            <div className="ha-in">
              <div className="ha-from">{stage.length ? `on stage now${sessions > 1 ? `, across ${sessions} sessions` : ""}` : "open in other sessions"}</div>
              {shown.map((a) => <ArtRow key={a.id} a={a} acts={acts} onDone={() => setPeek(null)} />)}
              <div className="ha-more"><Button h={32} w={PEEK_W - 2 * PAD} flat onClick={() => { setPeek(null); setAll(true); }}>{`everything made · ${arts.length}`}</Button></div>
            </div>
          </Card>
        </div>, document.body)}
      {all && <ArtsAll arts={arts} acts={acts} onClose={() => setAll(false)} />}
    </>
  );
}
