// Cowork, whole (#1173; the shape Marco approved 2026-11-14, the mockup's pass 3): Cowork is the anchor, opened for the
// big decisions; the rest of the time its parts reach each person's Build session. Social, Home and Build are modes of
// Jelly, not here.
//
// One way to move between layers (#1416, Marco's review of 2026-11-17): every place is an address on one history
// (place.ts): Cowork › a project › a part › the part's children, and a page opened from any of them as a layer over it.
// The crumbs at the top of the view, ‹ › and ⌘[ ⌘] walk the history, Esc goes one layer up. The rail draws the parts
// that are registered (ours.tsx is our setup of them), under the anchor or under the project the engine says is in use
// (team.state's rooms): nothing here names a project, a login or a tab. The reads are the engine's
// (engine/src/parts/cowork-shell.ts, cowork.shell.read); System is the System stage kind itself, on the area "jelly".
import { useEffect, useRef, useState } from "react";
import type { useEngine } from "../../useEngine";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { Button } from "../../kit";
import { store as stageStore } from "../../stage/engineStore";
import { askEngine } from "../askEngine";
import { groupsOf } from "../rooms";
import { OldRow } from "./OldRow";
import { OutLayer } from "./OutLayer";
import { OutContext, outLabel } from "./out";
import { canMove, focusOf, keyMove, nameProjects, partsOf, place, usePlace, type Place } from "./place";
import { viewOf } from "./parts";
import "./ours";   // our setup: the parts our Cowork carries
import "./shell.css";

type Room = { id: string; name: string; repos: string[]; hub?: string; code?: string; mine?: boolean; joined?: boolean };
type Projects = { list: { id: string; name: string }[]; now: string };
/** the projects as the engine last said them, kept across mode switches (Cowork's tree goes when another mode is picked) */
let seen: Projects = { list: [], now: "" };

/** the projects this person is in and the one in use, from the engine's team.state (a Cowork face says team.hello) */
function useProjects(): Projects {
  const [p, setP] = useState<Projects>(seen);
  useEffect(() => {
    const L = link(ENGINE);
    const off = L?.on((m: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      if (m?.type !== "team.state" || !Array.isArray(m.settings?.rooms)) return;
      const rooms = m.settings.rooms as Room[], mine = groupsOf(rooms);
      const now = typeof m.settings.room === "string" ? m.settings.room : "";
      // the room in use is a project even when nobody made it (one project is still a crumb)
      const list = (mine.some((r) => r.id === now) ? mine : [...mine, ...rooms.filter((r) => r.id === now)]).map((r) => ({ id: r.id, name: r.name || r.id }));
      seen = { list, now };
      setP(seen);
    });
    // asked on every up, not once: opened before the engine answers, it asks again when it does (gate one q7)
    const offLink = L?.onLink((up) => { if (up) L.send({ type: "team.hello" }); });
    return () => { off?.(); offLink?.(); };
  }, []);
  return p;
}

const addressOf = (p: Place) => [p.project || "·", p.part || "·", ...p.path].join("/");

/** the crumbs: ‹ › then Cowork › project › part › …, each a press to its address; the last is where you are */
function Crumbs({ crumbs, canBack, canForward }: ReturnType<typeof usePlace>) {
  return (
    <nav className="cw-crumbs" aria-label="where you are" data-tauri-drag-region>
      <span className={`cw-step${canBack ? "" : " off"}`} data-go="back"><Button h={24} flat label="back (⌘[)" onClick={canBack ? place.back : undefined}>‹</Button></span>
      <span className={`cw-step${canForward ? "" : " off"}`} data-go="forward"><Button h={24} flat label="forward (⌘])" onClick={canForward ? place.forward : undefined}>›</Button></span>
      <ol className="cw-trail">
        {crumbs.map((c, i) => i < crumbs.length - 1
          ? <li key={i} data-go={addressOf(c.to)}><Button h={24} flat onClick={() => place.go(c.to)}>{c.label}</Button><i aria-hidden>›</i></li>
          : <li key={i} aria-current="page"><b>{c.label}</b></li>)}
      </ol>
    </nav>
  );
}

/** Cowork itself: the projects you are in */
function Projects({ p }: { p: Projects }) {
  return (
    <div className="cw-pad">
      <p className="cw-lead">The projects you work on with others. Each has its own parts.</p>
      {p.list.length === 0 ? <p className="cw-dim">reading your projects…</p> : (
        <div className="cw-grid">{p.list.map((x) => (
          <button key={x.id} className="cw-go" data-go={addressOf({ project: x.id, part: "", path: [] })} onClick={() => place.go({ project: x.id, part: "", path: [] })}>
            <b>{x.name}</b><span className="cw-dim">{x.id === p.now ? "in use" : "press to open"}</span>
          </button>))}</div>
      )}
    </div>
  );
}

/** a project: its parts */
function Project({ id }: { id: string }) {
  const parts = partsOf().filter(([, s]) => !s.anchor);
  return (
    <div className="cw-pad">
      <div className="cw-grid">{parts.map(([part, s]) => (
        <button key={part} className="cw-go" data-go={addressOf({ project: id, part, path: [] })} onClick={() => place.go({ project: id, part, path: [] })}><b>{s.label}</b></button>
      ))}</div>
    </div>
  );
}

function RailRow({ part, words, on, to }: { part: string; words: string; on: boolean; to: Place }) {
  const n = viewOf(part)?.useCount?.() ?? 0;
  return (
    <button className={`cw-r ${on ? "on" : ""}`} data-go={addressOf(to)} onClick={() => place.go(to)}>
      <span>{words}</span>{n > 0 && <span className="cw-n">{n}</span>}
    </button>
  );
}

export function Shell({ e }: { e: ReturnType<typeof useEngine> }) {
  const where = usePlace(), at = where.at;
  const projects = useProjects();
  const [settings, setSettings] = useState(false);
  // the System kind asks the engine through the stage's link: Cowork hands it in, as Home does
  useEffect(() => { stageStore.connect(askEngine as never, e.subscribe, { send: e.send, frames: e.subscribeFrames }); }, [e.subscribe, e.send]); // eslint-disable-line react-hooks/exhaustive-deps
  // the project is the engine's word: its names go to the crumbs, and a place that waited for it takes the one in use
  useEffect(() => {
    nameProjects(Object.fromEntries(projects.list.map((x) => [x.id, x.name])));
    place.settle(projects.now);
  }, [projects]);
  // a place in another project than the one in use: the engine turns to it, as the old Cowork's front did
  const turned = useRef("");
  useEffect(() => {
    if (!at.project || at.project === projects.now || !projects.list.some((x) => x.id === at.project) || turned.current === at.project) return;
    turned.current = at.project;
    void askEngine("team.settings", { patch: { room: at.project } }, 20_000);
  }, [at.project, projects]);
  // ⌘[ ⌘] and Esc, from anywhere in Cowork
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      const m = keyMove(ev, focusOf(document.activeElement));
      // a key the place cannot take (the first place, the root) is left to the window: the spine walks its views
      if (!m || !canMove(place.history(), m)) return;
      ev.preventDefault();
      place[m]();
    };
    addEventListener("keydown", down, true);   // before the spine's, which walks the views on the same keys
    return () => removeEventListener("keydown", down, true);
  }, []);

  const project = at.project || projects.now;
  const own = (part: string): Place => ({ project: partsOf().find(([p]) => p === part)?.[1].anchor ? "" : project, part, path: [] });
  const projectName = projects.list.find((x) => x.id === project)?.name ?? "";
  const View = at.part ? viewOf(at.part)?.View : undefined;
  const open = (url: string, label: string) => place.open(url, outLabel(label));

  return (
    <div className="cw-whole" data-place="cowork">
      <nav className="cw-rail" aria-label="Cowork" data-tauri-drag-region>
        <div className="cw-h">Anchor</div>
        {partsOf().filter(([, s]) => s.anchor).map(([p, s]) => <RailRow key={p} part={p} words={s.label} on={at.part === p} to={own(p)} />)}
        <div className="cw-h">{projectName || "your project"}</div>
        {partsOf().filter(([, s]) => !s.anchor).map(([p, s]) => <RailRow key={p} part={p} words={s.label} on={at.part === p} to={own(p)} />)}
        <p className="cw-note">Social, Home and Build are modes of Jelly, not here. Another project would get its own parts.</p>
        <div className="cw-foot">
          <button className={`cw-r ${settings ? "on" : ""}`} data-act="Cowork's settings" onClick={() => setSettings((s) => !s)} aria-expanded={settings}><span>Cowork's settings</span></button>
          {settings && <div className="cw-set"><OldRow /></div>}
        </div>
      </nav>
      <main className="cw-view" data-tab={at.part || (at.project ? "project" : "cowork")} data-at={`${addressOf(at)}${at.out ? "/↗" : ""}`}>
        <Crumbs {...where} />
        <div className="cw-body">
          <OutContext.Provider value={open}>
            {View ? <View at={at} /> : at.project ? <Project id={at.project} /> : <Projects p={projects} />}
          </OutContext.Provider>
          {at.out && <OutLayer out={at.out} />}
        </div>
      </main>
    </div>
  );
}
