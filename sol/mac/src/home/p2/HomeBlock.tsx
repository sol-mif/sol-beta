// Home pass 2 on the stage (#692, mine/notes/2026-11-08-home-on-the-stage.md): a page block whose src is sol://home is
// Home itself, drawn inline (no frame), so Marco uses it on Build's stage while the agent changes its files beside it.
// The block's head stays the stage's; inside: a notes line at the top of today (the dump's message, home.dump.line,
// as the composer sends it in the spine's Home), then Home2. Its side comes back when the block is 900 wide or more,
// measured on the block, not the window; narrower, the side folds into a head: where you are, and a places button that
// drops the side over Home. Home's socket is its own (wire.ts homeAddr, the stand-in on 7791); under ?ws= the
// window's engine is Home's too, so the stage's socket is used. The place is the window's (pass2.ts useBlockPlace):
// moving inside writes nothing to the engine; an address that names a place sets it as the block opens.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Metas } from "../meta";
import { link } from "../../socket";
import { homeAddr } from "./wire";
import { store as stageStore } from "../../stage/engineStore";
import { Home2 } from "./Home2";
import { Side2 } from "./Side2";
import { setBlockPlace, useBlockPlace, useHome2, type Place } from "./pass2";
import { folderNamed, type HomeSrc } from "./address";
import { Maker, makeFrom, type Made } from "./suite/Maker";
import "./block.css";

export const meta = {
  HomeBlock: {
    job: "Home pass 2 as a block on the stage: the same Home, in a block of any size, live on Home's engine",
    flow: "know",
    states: ["engine down", "narrow: the head and the places button", "the places open over Home", "wide: the side beside Home", "a line filed from the notes line"],
    keys: [
      { press: "type in the notes line, Enter", does: "the line goes to the dump (home.dump.line) and says where it went", goal: "say" },
      { press: "type a want in the notes line, Enter", does: "the maker: a suite block, a recipe written now, or start in Build (home.block.make)", opens: "Maker" },
      { press: "places", does: "the side over Home: today, the folders, world", opens: "Side2" },
      { press: "click a step of the crumb", does: "back to today" },
    ],
    listens: ["home.state (pass2.ts useHome2)"],
  },
} satisfies Metas;

/** the side comes back at this block width (the brief's ~900) */
export const SIDE_AT = 900;
/** how long the notes line says where a line went */
const SAID_FOR = 4000;

type Wire = { subscribe: (f: (m: any) => void) => () => void; send: (o: object) => boolean | void; up: boolean };
/** Home's socket from inside a block: its own link (no `e` here), else the stage's socket (a page opened with ?ws=) */
export function useBlockWire(): Wire {
  const addr = homeAddr();
  const L = addr ? link(addr) : null;
  const [up, setUp] = useState(() => L?.up() ?? !!stageStore.link());
  useEffect(() => (L ? L.onLink(setUp) : undefined), [L]);
  const [wire] = useState<Wire>(() => {
    if (L) return {
      subscribe: (f) => { const a = L.on(f), b = L.onLink((u) => { if (u) f({ type: "open" }); }); return () => { a(); b(); }; },
      send: (o) => L.send(o), up: false,
    };
    return {
      subscribe: (f) => stageStore.link()?.listen(f) ?? (() => {}),
      send: (o) => { const s = stageStore.link(); if (!s) return false; s.send(o); return true; },
      up: false,
    };
  });
  return { ...wire, up };
}

export function HomeBlock({ src }: { src: Extract<HomeSrc, { at: "home" }> }) {
  const h = useHome2(useBlockWire());
  const place = useBlockPlace();
  const root = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [places, setPlaces] = useState(false);
  useLayoutEffect(() => {
    // the block's own width (its frame, padding and all), so a block 900 wide has its side; Home alone, its own
    const el = root.current?.closest<HTMLElement>("[data-block]") ?? root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the address's place, once per address: today and world at once, a folder when the folders are read
  const want = src.place === undefined ? "" : typeof src.place === "string" ? src.place : `folder:${src.place.folder}`;
  const took = useRef("");
  const fs = h.st?.folders;
  useEffect(() => {
    if (!want || took.current === want) return;
    if (want === "today" || want === "world") { took.current = want; setBlockPlace({ at: want }); return; }
    if (!fs) return;
    took.current = want;
    const f = folderNamed(fs, want.slice("folder:".length));
    setBlockPlace(f ? { at: "folder", id: f.id } : { at: "today" });
  }, [want, fs]);
  const go = (p: Place) => { setBlockPlace(p); setPlaces(false); };
  const wide = w >= SIDE_AT;
  const open = place.at === "folder" ? fs?.find((f) => f.id === place.id) : undefined;
  // a folder gone (archived, renamed by id never) puts the block back on today
  useEffect(() => { if (place.at === "folder" && fs && !open) setBlockPlace({ at: "today" }); }, [place, fs, open]);

  return (
    <div ref={root} className={`hb-block ${wide ? "wide" : "narrow"}`} data-home-block data-place-at={place.at}>
      {wide && h.st && <aside className="hb-side"><Side2 st={h.st} place={place} setPlace={go} h={h} /></aside>}
      <div className="hb-core">
        {!wide && h.st && (
          <div className="hb-head">
            <nav className="hb-crumb" aria-label="where you are">
              {place.at === "today" ? <b>today</b> : <button type="button" onClick={() => go({ at: "today" })}>today</button>}
              {open && open.crumb.map((c, i) => <span key={i}><i aria-hidden>›</i>{i === open.crumb.length - 1 ? <b>{c}</b> : c}</span>)}
              {place.at === "world" && <span><i aria-hidden>›</i><b>world</b></span>}
            </nav>
            <button type="button" className={`hb-places${places ? " on" : ""}`} data-part="Home › places" aria-expanded={places} onClick={() => setPlaces(!places)}>places</button>
          </div>
        )}
        {!wide && places && h.st && <div className="hb-drop" data-p2="places"><Side2 st={h.st} place={place} setPlace={go} h={h} /></div>}
        {place.at === "today" && h.st && <NotesLine h={h} setPlace={go} />}
        <div className="hb-home"><Home2 h={h} place={place} setPlace={go} /></div>
      </div>
    </div>
  );
}

type Reply = { line?: { id: string; folder?: string; when?: string | null; sort?: string; why?: string } };
/** the dump's own box for the stage, one line: "write everything here"; Enter sends it as the composer does */
function NotesLine({ h, setPlace }: { h: ReturnType<typeof useHome2>; setPlace: (p: Place) => void }) {
  const [v, setV] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(null), SAID_FOR); return () => clearTimeout(t); }, [said]);
  const send = async () => {
    const text = v.trim();
    if (!text) return;
    setV(""); setSaid("reading…");
    // a want first (#692 suite: the maker): a suite block, a recipe written now, or "start in Build"; else the dump's
    const m = await makeFrom(h, text);
    if (m) { setMade(m); setSaid(m.kind === "build" ? "deeper than a recipe: start in Build?" : m.kind === "made" ? `a new block type: ${m.recipe?.name}` : `a ${m.recipe?.name} block`); return; }
    const r = await h.ask<Reply>({ type: "home.dump.line", text, at: new Date().toISOString() });
    const f = h.st?.folders?.find((x) => x.id === r?.line?.folder);
    setSaid(r?.line ? [f ? f.crumb.join(" › ") : "your notes", r.line.when, r.line.sort === "needs_me" ? "needs you" : "starting"].filter(Boolean).join(" · ") : "not read: Home's engine did not answer");
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } };
  return (
    <>
    <div className="hb-notes" data-part="Home › notes line">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={key} placeholder="write everything here" aria-label="write everything here" data-p2="notes-line" />
      {said && <span className="hb-said" role="status" aria-live="polite" data-p2="notes-said">{said}</span>}
    </div>
    {made && <div className="hb-made"><Maker m={made} h={h} setPlace={setPlace} onClose={() => setMade(null)} /></div>}
    </>
  );
}
