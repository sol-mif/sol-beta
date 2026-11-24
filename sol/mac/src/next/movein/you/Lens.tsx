// Settings › You: what Sol knows as one picture over the person's canvas (BR1 meta layer part 2, #1615; scene 7 of
// mine/look/br1/meta-loop.html, "the circle is your Mac"):
//   the banner    "You · what Sol knows and may do", the place just taken out with Back, the fact just forgotten with
//                 Back, "and N more" (the places under 1%)
//   the circle    circle.ts works it out, Circle.tsx draws it: the places by their share of time with their dial, the
//                 facts as chips in them, a thread from each to where Sol learned it, Claude outside
//   the panel     what was pressed (a fact: where Sol learned it, Forget with Back; a place: all it knows, the dial:
//                 next.you.level, take it out: next.you.part.drop), the Claude switch (Claude.tsx, the same as screen
//                 2's), where Sol learned it, How Sol talks (next.you.talk), What Sol keeps
//                 (next.you.sieve), Your AIs (next.you.accounts), Look, Done
// Drawn once, when settled (#yu calm, BR1): the layer stays unseen until the picture, its room and the AIs have come, or
// WAIT has passed, so it never shows an empty circle that then fills and a panel that then grows.
// Signed: marcocyl04-ux's agent (builder F; the drawing once, builder H).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BINS, TALKS, type Bin, type Talk } from "./types.ts";
import { paint } from "./model.ts";
import { knowsWith, regionOf, type Box, type Region } from "./lens-state.ts";
import { GLYPH, KIND, circleOf, placesOf } from "./circle-state.ts";
import Circle, { type Sel } from "./Circle.tsx";
import Picked from "./Picked.tsx";
import { known as knownOf, samePlace, type Sources } from "../../known.ts";
import ClaudeSwitch from "./Claude.tsx";
import { WAIT, words } from "./You.tsx";
import * as Y from "./store.ts";

/** what only the page around the layer knows: the plane's folders (their ids, names and boxes on screen, and colour), and
 *  the window's look; none on the dev page */
export type Plane = { regions: () => Region[]; box: (regionId: string) => (Box & { c?: string }) | null; sources?: () => Omit<Sources, "you"> };
export type LookCtl = { dark: () => boolean; big: () => boolean; set: (k: "light" | "dark" | "big") => void };

const BIN_W: Record<Bin, string> ={ keys: "Passwords", money: "Money", health: "Health", talk: "Private talk", id: "ID" };
const TALK_W: Record<Talk, string> = { plain: "Plain", brief: "Brief, the answer first", explained: "Explains the why" };

/** at: the place to open on (a badge pressed on its folder), else none picked */
export default function Lens({ plane, look, onDone, frame, at }: { plane?: Plane; look?: LookCtl; onDone: () => void; frame: () => Box; at?: string }) {
  const s = Y.useYou((x) => x);
  // each place knows what its folder's badge counts (lens.ts knowsWith), so "N facts" is one number everywhere
  const y = useMemo(() => (s.you && plane?.sources ? knowsWith(s.you, plane.regions(), plane.sources()) : s.you), [s.you, plane]);
  const T = words(s.ko);
  const [, bump] = useState(0);
  const [room, setRoom] = useState<Box | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  // opened from a badge: its place picked once next.you has come (the badge was on a folder; a part may name it otherwise)
  const atDone = useRef(false);
  useEffect(() => { if (atDone.current || !at || !y) return; atDone.current = true; const p = y.parts.find((x) => samePlace(x.id, at)); if (p) setSel({ place: p.id }); }, [y, at]);
  const banner = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);

  // the room the circle has: under the banner, left of the panel (again when the window changes)
  useLayoutEffect(() => {
    const place = () => {
      const f = frame(), b = banner.current?.getBoundingClientRect(), pn = panel.current?.getBoundingClientRect();
      const pad = 16, top = b ? b.bottom - f.y + 12 : 64, right = pn ? f.x + f.w - pn.left + pad : pad;
      const r = { x: pad, y: Math.round(top), w: Math.round(Math.max(240, f.w - right - pad)), h: Math.round(Math.max(240, f.h - top - pad)) };
      setRoom((o) => (o && o.x === r.x && o.y === r.y && o.w === r.w && o.h === r.h ? o : r));
    };
    let t = 0;
    const again = () => { place(); clearTimeout(t); t = window.setTimeout(place, 450); };
    again();
    addEventListener("resize", again);
    return () => { removeEventListener("resize", again); clearTimeout(t); };
  }, [!!y, !!s.accounts, !!s.forgot, !!s.lastDrop]);

  const ais = (s.accounts?.ais ?? []).filter((a) => a.signedIn);
  // Claude's box beside the Mac only while Claude is on; off, the Mac takes its room (nine places at 1280×800 fit, BR1 conform
  // row 8). On, in a room where the box leaves the places overlapping, the box gives way (the panel's switch still says on):
  // nothing is drawn over text
  const claude = Y.claudeOn(s) && ais.some((a) => a.id === "claude-code" || a.id === "anthropic");
  const pic = useMemo(() => {
    if (!room || !y) return null;
    const o = { w: Math.max(720, room.w), h: Math.max(640, room.h), dropped: new Set(s.dropped), more: s.more, levels: s.levels };
    const p = circleOf(y, { ...o, outside: claude });
    return p.fits || !claude ? p : circleOf(y, { ...o, outside: false });
  }, [y, room, s.dropped, s.more, s.levels, claude]);
  // #yu calm (BR1): drawn once, when what it shows has come (the picture in its room, the AIs); never a circle empty, then
  // the panel swapping and the AIs growing. A reply that never comes holds it no longer than WAIT
  const [late, setLate] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLate(true), WAIT); return () => clearTimeout(t); }, []);
  const settled = late || (!!pic && !!room && !!s.accounts);
  const smallN = useMemo(() => placesOf(y, new Set(s.dropped), false).small.length, [y, s.dropped]);
  // every fact by its k (known.ts), the ones in a chip and the ones behind "N more" alike; a chip's id is its fact's k
  const known = useMemo(() => new Map(knownOf("you", { you: y }).map((f) => [f.k, f])), [y]);

  const regions = plane?.regions() ?? [];
  const partOf = (id: string | null) => (id ? y?.parts.find((p) => p.id === id) ?? null : null);
  const colour = (id: string, i: number) => { const p = partOf(id), rid = p ? regionOf(p, regions) : null; return (rid && plane?.box(rid)?.c) || paint(null, i); };
  const dropName = s.lastDrop ? y?.parts.find((p) => p.id === s.lastDrop)?.name : null;
  const keep =new Set(y?.sieve.keep ?? []);
  const press = (k: "light" | "dark" | "big") => { look?.set(k); bump((n) => n + 1); };
  const back = (k: string) => (y?.parts.some((p) => p.knows?.some((f) => f.k === k)) ? "is back" : "comes back at the next read");

  return (
    <div className="yl" aria-busy={!settled} style={{ minHeight: pic && room ? room.y + pic.h + 16 : undefined, visibility: settled ? undefined : "hidden" }}>
      <div className="yl-dim" aria-hidden="true" onClick={() => setSel(null)} />
      <div className="yl-banner" ref={banner} role="status">
        <b>{T.you}</b> · what Sol knows and may do. The circle is your Mac.
        {dropName ? <> {dropName} taken out · <button className="link" onClick={() => Y.undrop(s.lastDrop!)}>{T.back}</button></> : null}
        {s.forgot && !s.forgot.back ? <> “{s.forgot.fact}” forgotten · <button className="link" onClick={() => Y.unforget()}>{T.back}</button></> : null}
        {s.forgot?.back ? <> “{s.forgot.fact}” {back(s.forgot.k)}</> : null}
        {smallN && !s.more ? <> · <button className="link" onClick={() => Y.more(true)}>{T.more(smallN)}</button></> : null}
      </div>
      {pic && room ? <div className="yl-circle" style={{ left: room.x, top: room.y }}>
        <Circle size="full" pic={pic} sel={sel} colour={colour} claude={claude}
          onChip={(id) => setSel((o) => (o && "chip" in o && o.chip === id ? null : { chip: id }))}
          onPlace={(id) => setSel((o) => (o && "place" in o && o.place === id ? null : { place: id }))} />
      </div> : null}
      <aside className="yl-panel" ref={panel} aria-label={T.you}>
        <h2>{T.you}</h2>
        <Picked T={T} sel={sel} setSel={setSel} known={known} />
        {y ? <ClaudeSwitch T={T} cls="yl-claude" /> : null}
        {pic?.rim.length ? <>
          <h4>Where Sol learned it</h4>
          <div className="yl-legend">{pic.rim.map((r) => <span key={r.kind}><i className="yl-dot" style={{ background: KIND[r.kind].c }} />{KIND[r.kind].w}</span>)}</div>
          <p className="yl-cap">{GLYPH[0]} looks, changes nothing · {GLYPH[1]} prepares, you approve · {GLYPH[2]} does it for you</p>
        </> : null}
        {y?.talk ? <>
          <h4>How Sol talks</h4>
          <div className="yl-pills" role="radiogroup" aria-label="How Sol talks">
            {TALKS.map((t) => <button key={t} role="radio" aria-checked={y.talk!.style === t} className={`yl-pill${y.talk!.style === t ? " on" : ""}`}
              onClick={() => Y.talk(t)}>{TALK_W[t]}</button>)}
          </div>
          <p className="yl-cap">{y.talk.by === "read" && y.talk.why ? y.talk.why
            : y.talk.by === "you" ? <>Your pick, in every new session. <button className="link" onClick={() => Y.talk(null)}>Let Sol go by your AIs</button></>
            : "Plain until you pick."}</p>
        </> : null}
        {y ? <>
          <h4>What Sol keeps</h4>
          <div className="yl-pills">
            {BINS.map((b) => <button key={b} className={`yl-pill${keep.has(b) ? " on" : ""}`} aria-pressed={keep.has(b)} onClick={() => Y.keepBin(b)}>{BIN_W[b]}</button>)}
          </div>
          <p className="yl-cap">{keep.size ? `${keep.size} kept. ` : ""}The rest is thrown away as Sol reads.</p>
        </> : null}
        {ais.length || y ? <h4>{T.aisW}</h4> : null}
        {s.accounts && !ais.length ? <div className="yl-line"><span className="mute">None signed in yet</span></div> : null}
        {ais.map((a) => <div className="yl-line" key={a.id}><span>{a.name}</span><small>{a.signedIn ? (a.via === "key" ? "key" : "signed in") : "not signed in"}</small></div>)}
        {y && y.read.by !== "none" ? <div className="yl-line"><span>This Mac</span><small>{y.read.made === "claude" ? "reads here; Claude sums it up" : "reads and sums up, on this Mac"}</small></div> : null}
        {look ? <>
          <h4>{T.lookC}</h4>
          <div className="yl-pills">
            <button className={`yl-pill${look.dark() ? "" : " on"}`} aria-pressed={!look.dark()} onClick={() => press("light")}>Light</button>
            <button className={`yl-pill${look.dark() ? " on" : ""}`} aria-pressed={look.dark()} onClick={() => press("dark")}>Dark</button>
            <button className={`yl-pill${look.big() ? " on" : ""}`} aria-pressed={look.big()} onClick={() => press("big")}>Bigger text</button>
          </div>
        </> : null}
        <button className="btn primary yl-done" onClick={onDone}>Done</button>
      </aside>
    </div>
  );
}
