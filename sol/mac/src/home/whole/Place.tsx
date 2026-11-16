// The places behind the side's rows (#799, plan Part C slice 36; home/whole.md pain 10 "what it knows shows from where";
// scene 8, the still home/shots/8.png; flows.md "Decisions" 1), behind sol.home.whole. A folder: its crumb, its one line,
// where it comes from (a Canvas course, a folder on this Mac, or one you made), what it knows (each with where from),
// what is moving in it and what needs you. People: each person Sol keeps up with, where you know them from, and what of
// theirs is on your list. Drawn from the kit's Row; whole-side.css lays it out.
import { useRef } from "react";
import { Row, useSize } from "../../kit";
import { dim, ink, mute } from "../../kit/paint";
import { Glyph, Receipt, bringForward } from "./First";
import { inPlace, peopleLine, placeLine, type PlaceItem } from "./places";
import { openFolder, useFolder, usePlaces } from "./placesStore";
import { goTo } from "./sourcesStore";
import { useToday } from "./store";
import type { Thing } from "./today";

function Rows({ items }: { items: { key: string; title: string; note?: string; lead?: React.ReactNode; onClick?: () => void }[] }) {
  const box = useRef<HTMLDivElement>(null), [w] = useSize(box);
  return <div className="hplace-rows" ref={box}>{w > 0 && items.map((r) => <div key={r.key} data-row={r.key}><Row w={w} h={r.note ? 44 : 32} title={r.title} note={r.note} lead={r.lead} onClick={r.onClick} /></div>)}</div>;
}
const crumbOf = (p: PlaceItem, all: PlaceItem[]) => {
  const up = p.parent ? all.find((x) => x.id === p.parent) : undefined;
  return up ? [up, p] : [p];
};

export function FolderPlace() {
  const places = usePlaces(), open = useFolder(), today = useToday();
  const p = places?.places.find((x) => x.id === open);
  if (!places || !p) return null;
  const needs = today.today?.needs ?? [], things = [...today.things.values()], here = inPlace(p, things);
  const [first, second] = placeLine(p, things, needs);
  const kids = places.places.filter((x) => x.parent === p.id);
  const moving = here.filter((t) => t.state === "moving"), waiting = here.filter((t) => needs.includes(t.id));
  const thingRow = (t: Thing) => ({ key: t.id, title: t.card?.title ?? t.words, note: t.folder, lead: <span style={{ color: dim, display: "grid" }}><Glyph source={t.card?.source ?? "sol"} /></span>, onClick: () => { bringForward(t.id); goTo("today"); } });   // C36-3: the card itself comes forward
  return (
    <section className="hw hplace" data-place="talk" data-home-whole data-folder={p.id}>
      <div className="hw-date" style={{ color: mute }}>
        {crumbOf(p, places.places).map((c, i, a) => i < a.length - 1
          ? <span key={c.id}><button type="button" className="hplace-crumb" style={{ color: dim }} onClick={() => openFolder(c.id)}>{c.name}</button> › </span>
          : <span key={c.id} style={{ color: ink }}>{c.name}</span>)}
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      <div className="hplace-from" data-from={p.from.source} style={{ color: dim }}>
        <Glyph source={p.from.source === "canvas" ? "canvas" : p.from.source === "files" ? "files" : "sol"} />
        <span>{p.from.source === "canvas" ? `from your ${p.from.label}` : p.from.source === "files" ? `the folder ${p.from.label} on this Mac` : p.from.label}</span>
      </div>
      <div className="hplace-cols">
        <div className="hplace-col">
          <div className="hplace-h" style={{ color: mute }}>what it knows · from where</div>
          {p.knows.length ? <Rows items={p.knows.map((k) => ({ key: k.label, title: k.label, note: k.from }))} /> : <div className="hplace-none" style={{ color: mute }}>nothing yet: drop anything here</div>}
          {kids.length > 0 && <>
            <div className="hplace-h" style={{ color: mute }}>inside it</div>
            <Rows items={kids.map((k) => ({ key: k.id, title: k.name, note: k.from.label, onClick: () => openFolder(k.id) }))} />
          </>}
        </div>
        <div className="hplace-col">
          <div className="hplace-h" style={{ color: mute }}>moving</div>
          {moving.length ? <Rows items={moving.map(thingRow)} /> : <div className="hplace-none" style={{ color: mute }}>nothing moving here</div>}
          <div className="hplace-h" style={{ color: mute }}>needs you</div>
          {waiting.length ? <Rows items={waiting.map(thingRow)} /> : <div className="hplace-none" style={{ color: mute }}>nothing here</div>}
        </div>
      </div>
      <Receipt />{/* what you just did, with its undo, here too (#875 C36-1) */}
    </section>
  );
}

export function PeoplePlace() {
  const places = usePlaces(), today = useToday();
  if (!places) return null;
  const needs = today.today?.needs ?? [];
  const [first, second] = peopleLine(places.people, needs);
  return (
    <section className="hw hplace" data-place="talk" data-home-whole data-people>
      <div className="hw-date" style={{ color: mute }}>people · who Sol keeps up with for you</div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      <div className="hplace-cols">
        <div className="hplace-col">
          <Rows items={places.people.map((p) => {
            const theirs = p.thingIds.map((id) => today.things.get(id)).filter((t): t is Thing => !!t);
            return { key: p.id, title: p.name, note: [p.note, ...theirs.map((t) => (needs.includes(t.id) ? `waits on you: ${t.card?.edge ?? t.words}` : t.words))].join(" · "),
              lead: <span style={{ color: dim, display: "grid" }}><Glyph source="people" /></span>, onClick: theirs.length ? () => { const w = theirs.find((t) => needs.includes(t.id)) ?? theirs[0]; bringForward(w.id); goTo("today"); } : undefined };
          })} />
        </div>
      </div>
      <Receipt />{/* #875 C36-1 */}
    </section>
  );
}
