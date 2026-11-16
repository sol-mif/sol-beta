// The side (#799, plan Part C slice 36; home/whole.md pain 5, 10; flows.md "Decisions" 1-2; the still
// home/shots/1.png), behind sol.home.whole. Home's side, in place of the empty view's example rows: today (with how many
// need you), the week, your places as a tree (the folders from your Canvas courses and your files, each with Canvas's
// or the folder's mark, a yellow dot where something waits on you), people, and the foot: done today (its count),
// sources (each source's health as a dot under it), flows (none yet). The row you are on is the pearl; a press goes
// there. Drawn from the kit's Row; whole-side.css lays it out.
import { useRef } from "react";
import { Row, useSize } from "../../kit";
import { dim, mute } from "../../kit/paint";
import { JELLY } from "../../kit/tokens";
import { Glyph } from "./First";
import { treeOf, todayCount, type SideRow } from "./places";
import { healthLine } from "./policy";
import { openFolder, useFolder, usePlaces } from "./placesStore";
import { goTo, usePlace, useSources } from "./sourcesStore";
import { useLedger } from "./ledgerStore";
import { useFlows } from "./flowsStore";   // C39
import { useApps, useMet } from "./outreachStore";   // C45
import { needsOf as appsNeeds } from "./postings";   // C45
import { needsOf as metNeeds } from "./met";   // C45
import { doneBy } from "./ledger";
import { useToday } from "./store";
import "../whole-side.css";

const SUN = JELLY.warm[3], OK = JELLY.six[5], RED = JELLY.six[0];
const ROW_H = 32, INDENT = 16;   // a row is the kit's control height (--h-row); a child steps in by one mark column

function Dot({ on }: { on: boolean }) {
  return <span className="hwside-dot" aria-hidden style={{ background: on ? SUN : "transparent" }} />;
}

export function WholeSide() {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  const place = usePlace(), open = useFolder(), places = usePlaces(), today = useToday(), ledger = useLedger(), sources = useSources();
  const needs = today.today?.needs ?? [], things = [...today.things.values()];
  const tree: SideRow[] = places ? treeOf(places.places, things, needs) : [];
  const done = ledger ? doneBy(ledger.entries).all.length : 0;
  const flows = useFlows();   // C39
  const apps = useApps(), met = useMet();   // C45: a dot on jobs and people where the two flows wait on you
  // a paused flow waits on nothing: no dot where its screen shows no card (C45-3)
  const flowIsOn = (id: string) => flows?.flows.find((f) => f.id === id)?.on ?? true;
  const jobsWait = flowIsOn("f-apps") && !!apps && appsNeeds(apps.postings).length > 0, metWait = flowIsOn("f-follow") && !!met && metNeeds(met.people, met.today).length > 0;
  const peopleWait = (places?.people ?? []).some((p) => p.thingIds.some((id) => needs.includes(id)));
  const row = (id: string, title: string, picked: boolean, go: () => void, extra: { aside?: React.ReactNode; lead?: React.ReactNode; depth?: number; note?: string } = {}) => (
    <div key={id} className="hwside-row" data-side-row={id} data-picked={picked || undefined} style={{ paddingLeft: (extra.depth ?? 0) * INDENT }}
      role="button" tabIndex={0} aria-current={picked ? "page" : undefined} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}>
      {w > 0 && <Row w={w - (extra.depth ?? 0) * INDENT} h={ROW_H} title={title} picked={picked} onClick={go} aside={extra.aside} lead={extra.lead} note={extra.note} />}
    </div>
  );
  return (
    <div className="hwside" data-whole-side>
      <div className="hwside-in" ref={box}>{/* measured inside the padding, so a row and its pearl fit the side */}
      {row("today", "today", place === "today", () => goTo("today"), { aside: todayCount(needs.length) })}
      {row("week", "the week", place === "week", () => goTo("week") /* C44: three calendars as one */)}
      <div className="hwside-h" style={{ color: mute }}>places</div>
      {!places && <div className="hwside-none" style={{ color: mute }}>reading your folders…</div>}
      {tree.map((r) => row(`place-${r.id}`, r.name, place === "folder" && open === r.id, () => openFolder(r.id), {
        depth: r.depth,
        lead: r.from === "canvas" ? <span style={{ color: dim, display: "grid" }} title="from Canvas"><Glyph source="canvas" size={12} /></span>
          : r.from === "files" ? <span style={{ color: dim, display: "grid" }} title="a folder on this Mac"><Glyph source="files" size={12} /></span> : <Dot on={false} />,
        aside: r.waits || (r.id === "jobs" && jobsWait /* C45 */) ? <Dot on /> : undefined,
      }))}
      {row("people", "people", place === "people", () => goTo("people"), { aside: peopleWait || metWait /* C45 */ ? <Dot on /> : undefined, lead: <span style={{ color: dim, display: "grid" }}><Glyph source="people" size={12} /></span> })}
      <div className="hwside-foot">
        {row("done", "done today", place === "done", () => goTo("done"), { aside: done ? String(done) : undefined })}
        {row("sources", "sources", place === "sources" || place === "jev" /* C40: Jev lives under Sources */ || place === "browser" /* C42: so does your browser */ || place === "trust" /* C43 */, () => goTo("sources"))}
        <div className="hwside-health" aria-label="each source's health">
          {(sources?.sources ?? []).map((s) => (
            <button key={s.id} type="button" className="hwside-src" data-health={s.health.state} title={`${s.name}: ${s.health.state === "broken" ? s.health.why ?? "stopped" : s.health.state === "stale" ? `stale, ${healthLine(s, Date.now())}` : "reading"}`}
              onClick={() => goTo("sources")} style={{ color: dim }}>
              <Glyph source={s.id} size={14} /><i style={{ background: s.health.state === "broken" ? RED : s.health.state === "stale" ? SUN : OK }} />{/* stale in yellow, not green (#875 C36-5) */}
            </button>
          ))}
        </div>
        {/* C39 (#802): flows in the side foot (flows.md decision 2), a row with how many run */}
        {row("flows", "flows", place === "flows", () => goTo("flows"), { aside: flows ? String(flows.flows.length) : undefined })}
      </div>
      </div>
    </div>
  );
}
