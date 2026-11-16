// The views that have no insides yet (Marco 2026-11-07): Home, new, and Social. Each is a side and a core, empty, so a
// function can land in it one at a time (mine/look/functions/board.html). Build is today's Home (home/Home.tsx);
// Cowork is cowork/CoworkApp.tsx.
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useHomeWhole, useBrowserShared } from "../flag";   // C28; C42
import { usePlace } from "../home/whole/sourcesStore";   // C33
import { placesNow, useFolder, whereWord } from "../home/whole/placesStore";   // C36
import { Frame, Head } from "../kit/Chrome";
import "./spine.css";

export function EmptyView({ name, side, cards, core, where, sideNode }: { name: string; side: { h: string; rows: string[] }[]; cards: { k: string; t: string }[]; core?: ReactNode; where?: string; sideNode?: ReactNode /* C36: a side of its own */ }) {
  const key = `sol.side.${name}`;
  const [open, setOpen] = useState(() => localStorage.getItem(key) !== "0");
  const flip = () => setOpen((o) => { localStorage.setItem(key, o ? "0" : "1"); return !o; });
  // the one key every mode answers the same way (kit/Chrome.tsx): cmd+\ folds and opens the side
  useEffect(() => {
    const down = (ev: KeyboardEvent) => { if (ev.metaKey && !ev.shiftKey && ev.key === "\\") { ev.preventDefault(); flip(); } };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame className="ev" open={open} head={<Head side={{ open, onFlip: flip }} title={name} where={where ?? "nothing here yet"} />}
      side={sideNode ?? <div className="ev-side">
        {side.map((g) => (
          <div key={g.h}><div className="ev-h">{g.h}</div>{g.rows.length === 0 && <div className="ev-none">none yet</div>}{g.rows.map((r) => <div key={r} className="ev-row"><i /> {r}</div>)}</div>
        ))}
        <div className="ev-foot">{name}'s settings</div>
      </div>}>
      {core ?? <section className="ev-core" data-place="talk">
        <p className="ev-lead">This view is empty on purpose. Each of its functions lands alone, then gets its piece of UI.</p>
        <div className="ev-cards">{cards.map((c) => <div key={c.k} className="ev-card"><b>{c.k}</b>{c.t}</div>)}</div>
      </section>}
    </Frame>
  );
}

// C28 (#791): with sol.home.whole on, Home's core is its first screen (home/whole/First.tsx), loaded only then; off, the
// empty view as it was
const Today = lazy(() => import("../home/whole/First").then((m) => ({ default: m.Today })));
// C33 (#796): Home's places, today or sources; the head names the one you are in
const SourcesView = lazy(() => import("../home/whole/Sources").then((m) => ({ default: m.Sources })));
const FoldView = lazy(() => import("../home/whole/Fold").then((m) => ({ default: m.Fold })));   // C34 (#797): the evening fold
// C36 (#799): Home's side (today, the week, places from Canvas and files, people, the foot) and the places behind it
const WholeSide = lazy(() => import("../home/whole/WholeSide").then((m) => ({ default: m.WholeSide })));
const FolderView = lazy(() => import("../home/whole/Place").then((m) => ({ default: m.FolderPlace })));
const PeopleView = lazy(() => import("../home/whole/FollowUps").then((m) => ({ default: m.FollowUps })));   // C45 (#808): people is the follow-ups flow's place (was Place's PeoplePlace)
const AppsView = lazy(() => import("../home/whole/Applications").then((m) => ({ default: m.Applications })));   // C45 (#808): the applications flow, living, in jobs
const FlowsView = lazy(() => import("../home/whole/FlowsPage").then((m) => ({ default: m.FlowsPage })));   // C39 (#802): the flows page
const TrustView = lazy(() => import("../home/whole/Trust").then((m) => ({ default: m.Trust })));   // C43 (#806): the trust and the page ledger
const BrowserView = lazy(() => import("../home/whole/SharedBrowser").then((m) => ({ default: m.SharedBrowser })));   // C42 (#805): one shared browser
const JevView = lazy(() => import("../home/whole/JevAllDay").then((m) => ({ default: m.JevAllDay })));   // C40 (#803): Jev, all day
const WeekView = lazy(() => import("../home/whole/ThreeCalendars").then((m) => ({ default: m.ThreeCalendars })));   // C44 (#807): three calendars as one
export const HomeView = () => {
  const place = usePlace();   // C33
  const folder = useFolder();   // C36
  const browserOn = useBrowserShared();   // C42: the shared browser's own switch
  return (
  <EmptyView name="home" {...(useHomeWhole() ? { where: whereWord(place, placesNow(), folder) /* C36 */, sideNode: <Suspense fallback={null}><WholeSide /></Suspense> /* C36 */,
    core: <Suspense fallback={null}>{place === "sources" ? <SourcesView /> : place === "done" ? <FoldView /> /* C34 */ : place === "folder" ? (folder === "jobs" || folder === "applications" ? <AppsView /> /* C45 */ : <FolderView />) : place === "people" ? <PeopleView /> /* C36 */ : place === "week" ? <WeekView /> /* C44 */ : place === "jev" ? <JevView /> /* C40 */ : place === "browser" && browserOn ? <BrowserView /> /* C42 */ : place === "trust" && browserOn ? <TrustView /> /* C43 */ : place === "flows" ? <FlowsView /> /* C39 */ : <Today />}</Suspense> } : {})}
    side={[{ h: "today", rows: ["waiting on you", "ready for you"] }, { h: "your areas", rows: ["school", "work", "life"] }, { h: "pinned tools", rows: ["calendar", "browser", "whiteboard"] }]}
    cards={[{ k: "stickies", t: "a line is a job: write it and it starts" }, { k: "calendar", t: "works ahead: the exam arrives with its notes ready" }, { k: "browser", t: "your agent drives it; you take the wheel any moment" }, { k: "whiteboard", t: "draw it, it becomes a job" }]} />
  );
};
export const SocialView = () => (
  <EmptyView name="social"
    side={[{ h: "people", rows: [] }, { h: "groups", rows: [] }]}
    cards={[{ k: "lend your Claude", t: "a time and a budget; take it back any moment" }, { k: "plans you vote on", t: "the agents gather, you vote, it lands in your calendar" }, { k: "friends as jellies", t: "whose agent is busy, at a glance" }]} />
);
