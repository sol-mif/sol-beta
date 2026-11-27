// The folder, drawn as a folder (#1615; Marco's decision 2026-11-21, mine/look/br1/bar-folder.html). At Far a folder is a
// back panel in its tint with a tab, one to three papers peeking out by how much is inside, and a front panel that says
// what its form at its size on screen holds (form.ts, root part 3): near, its name and its one line (place.ts placeOf:
// the same line every screen says of it) with a badge for how many things need the person; far, its name and one word
// with its count; smaller, the shape alone, its name on the shape's title. A name wraps, never cut. On hover or focus the front tips forward, the papers rise and a contents card opens beside it: everything
// inside, quiet things included, each thing's state in a word, a bar for a running session. Opened at Middle it is the
// same folder's body (plane index's Area), its tab carrying the name and the same line. The data hooks the counts read
// stay on the section the plane draws (.pl-card[data-region], FarLeads, Yours).
// Signed: marcocyl04-ux's agent, the port's BR1 folder (#1615).
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode, type SyntheticEvent } from "react";
import { Pop } from "../Overlay.tsx";
import { boxOf, type Rect } from "../layers.ts";
import { MODE, asksOn, piecesIn, regionOf, useNext, type Piece, type Region } from "../cv/index.ts";
import { lastChange } from "./last.ts";   // the peek's foot (conform 22)
import { apartOf, placeOf, ranked, type Place } from "../place.ts";
import { folderSays, formOf, wordsShown } from "../form.ts";
import * as L from "./layout.ts";
import { stateOf } from "./Face.tsx";
import { multi, leadBits } from "../lead/rules.ts";
import Yours from "../pieces/Yours.tsx";
import Because, { knownNow } from "../because/Because.tsx";   // BR1 item 4: F's because, on a folder Sol placed
import { PLACED_W } from "../because/place.ts";
import { placementOf, pointWas, unseenNow, useWas } from "./placed.ts";
import { lookAsk, looksLive } from "../cv/wire/look.ts";
import { LOOKS } from "../folder/parts/fixture.ts";
import { frontOf } from "../folder/setup/front.ts";
import { fsAsk, setupOf } from "../cv/moves/setup.ts";
import { leave, point, useHand } from "./raise-state.ts";
import { caseOf } from "./case.ts";
import { FolderCase, paintAt } from "../../kit/index.ts";
import "./folder.css";

/** derived, because the data has no money: about $0.40 a working AI a night (shell.js costOf) */
const COST_PER_AI = 0.4;
export const costOf = (rid: string) => piecesIn(rid).filter((p) => p.kind === "session").length * COST_PER_AI;
export const money = (n: number) => "$" + n.toFixed(2);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** a place's dot: something needs the person, at work, done, else at rest */
export const toneOf = (pl: Place) => (pl.counts.asks ? "asks" : pl.state === "active" ? "run" : pl.state === "done" ? "good" : "quiet");
/** the badge's words: how many things need the person */
export const needsWords = (n: number) => `${n} need${n === 1 ? "s" : ""} you`;

// A session is not an agent (Marco, 2026-11-21 11:51; mine/look/br1/frame.html parts 1, 2, 5): it is named by its task and
// marked by its folder's colour, a loose one by a dashed mark; never an agent's name or face. An agent shows only as a
// label, when the session's data carries one: started by an automation, or sitting in a seat the folder gives.
/** a session's title: its task (layout.ts, so the moves name it the same way) */
export const titleOf = L.titleOf;
/** the one label a session may carry: "automation · <name>" or "seat · <name>", only when its data says so */
export function labelOf(p: Piece): string | null {
  const a = p.automation, s = p.seat;
  if (typeof a === "string" && a) return `automation · ${a}`;
  if (typeof s === "string" && s) return `seat · ${s}`;
  return null;
}
/** a session started in no folder: loose */
export const loose = (p: Piece) => !p.region || !regionOf(p.region);
/** the folder's colour mark, a small tab; dashed when the session is loose */
export function Mark({ p }: { p: Piece }) {
  const i = loose(p) ? -1 : L.tintOf(p.region);
  return <span className={`fo-mark${i < 0 ? " fo-loose" : ` pl-t${i}`}`} aria-hidden="true" />;
}
export function Label({ p }: { p: Piece }) { const l = labelOf(p); return l ? <span className="fo-lbl" data-label>{l}</span> : null; }

type Tone = "asks" | "bad" | "run" | "good" | "quiet";
const failing = (p: Piece) => p.state === "failed" || /\bfail|\bbroke/i.test(String(p.term?.stateWord || ""));
const merged = (p: Piece) => (p.copies || []).some((c) => c.state === "merged");

const KIND: Record<string, string> = { session: "session", job: "job", copies: "side copies", list: "list", sticky: "note", doc: "page", page: "page", row: "automation", diary: "diary", arrivals: "arrivals", starter: "session", block: "block" };
/** one thing inside, in a word: its kind, its name, its state and how that reads (good, bad, asks, running) */
function thing(p: Piece): { k: string; n: string; st: string; tone: Tone | "" } {
  const k = KIND[p.kind] || p.kind;
  const n = p.kind === "session" ? titleOf(p) : String(p.name || p.kind);
  if (p.kind === "session" || p.kind === "job" || p.kind === "starter") {
    const st = failing(p) ? "failing" : merged(p) ? "merged" : stateOf(p);
    return { k, n, st, tone: st === "asks you" || st === "waiting" ? "asks" : st === "failing" || st === "failed" ? "bad" : st === "done" || st === "merged" ? "good" : st === "working" || st === "starting" ? "run" : "" };
  }
  if (asksOn(p.id).length) return { k, n, st: "asks you", tone: "asks" };
  if (p.kind === "copies") return { k, n, st: plural((p.copies || []).length, "copy").replace("copys", "copies"), tone: "" };
  if (p.kind === "arrivals") return { k, n, st: plural((p.items || []).length, "arrival"), tone: "" };
  return { k, n, st: "", tone: "" };
}

const SHOWN = 9;
/** the contents card: what is inside, without opening the folder; a pop-up (Overlay.tsx) beside the folder, right when
 *  it fits, else left, below or above; its padding on the folder's side carries the pointer across */
function Peek({ r, anchor }: { r: Region; anchor: () => Rect | null }) {
  const pl = placeOf(r.id), ps = ranked(r.id), c = costOf(r.id), last = lastChange(r.id);
  // nothing inside: no card, its front already says so ("Inside life · 25% of your time" was a card of nothing, conform 22)
  if (!ps.length) return null;
  return (
    <Pop className="fo-peek" data-peek={r.id} role="tooltip" anchor={anchor} prefer="right" gap={0}>
      <div className="fo-pk">
        {/* one count per folder (BR1 hold 3): the head names it and says its one count, its sessions as every screen says them, else its things, as the drawing's head does
            ("Inside api · 5 things"); the foot says when it last changed (bar-folder.html #peek, conform 22) */}
        <div className="fo-pkh"><span>Inside {pl.name}</span><span data-peek-count>{pl.sessions && pl.count ? pl.count : plural(ps.length, "thing")}</span></div>
        {ps.length ? <div className="fo-grid">{ps.slice(0, SHOWN).map((p) => {
          const t = thing(p);
          return <div key={p.id} className={`fo-tile${t.tone ? " fo-" + t.tone : ""}`} data-peek-thing={p.id}>
            <span className="fo-k">{p.kind === "session" ? <Mark p={p} /> : null}{t.k}</span><b>{t.n}</b>{p.kind === "session" ? <Label p={p} /> : null}{t.st ? <span className="fo-st">{t.st}</span> : null}
            {t.tone === "run" ? <span className="fo-bar"><i /></span> : null}
          </div>;
        })}</div> : null}
        {ps.length > SHOWN ? <p className="fo-more">and {ps.length - SHOWN} more inside</p> : null}
        {last || c ? <div className="fo-pkf">{last ? <span data-peek-last>Last change {last}</span> : null}{c ? <span>{money(c)} so far</span> : null}</div> : null}
      </div>
    </Pop>
  );
}

const leadsOf = (rid: string) => piecesIn(rid).filter(multi);
const leadWords = (p: Piece) => titleOf(p) + leadBits(p).slice(1).map((x) => ` · ${x}`).join("");
/** the front panel's share of the card's height (folder.css .fo-front top: 34%) */
const FRONT = 0.66;

/** Far: the folder at rest, its contents card on hover or focus. The section is the plane's card: its class, data and
 *  place are the caller's; this draws what its form holds at `w` × `h` screen px, its raise in `room` px under it */
export function FolderCard({ r, cls, style, front, extra, quiet, w, h }: { r: Region; cls: string; style: CSSProperties; front: boolean; extra?: ReactNode; quiet?: boolean; w: number; h: number; room?: number }) {
  const [peek, setPeek] = useState(false);
  const own = useRef<HTMLElement | null>(null);
  const at = () => (own.current ? boxOf(own.current) : null);
  const hand = useHand(), focused = hand.focus === r.id;
  const on = (e?: SyntheticEvent<HTMLElement>) => { point(r.id, e?.type === "focus"); if (!peek) setPeek(true); };
  // the contents card is drawn in the pop-ups' layer, outside the section's box: going into it is not leaving
  const off = (e: SyntheticEvent<HTMLElement>) => {
    const to = (e as unknown as FocusEvent).relatedTarget;
    if (to instanceof Element && e.currentTarget.contains(to)) return;
    leave(r.id, e.type === "blur" && !(to instanceof Element && to.closest("#talk")));   // to the bar, its To stays (raise.ts holdTo)
    if (to instanceof Element && to.closest(`[data-peek="${r.id}"]`)) return;
    setPeek(false);
  };
  const pl = placeOf(r.id);
  const leads = leadsOf(r.id), fh = h * FRONT, says = folderSays(pl, leads.map(leadWords), w, fh);
  const form = formOf(says, w, fh, Infinity), words = form === "near" || wordsShown(says, w, fh) > 0;
  // the second line and the "due today" badge (BR1 conform #21): from the folder's own parts, asked once per folder drawn;
  // the second line only where it fits under the first, whole
  const live = MODE !== "fixture";
  useEffect(() => { if (live) { lookAsk(r.id); fsAsk(r.id); } }, [live, r.id]);
  // its setup picks which part goes on the front (setup.html §3, builder F10); none said, the line is cardOf's as before
  const card = useNext(() => { const c = frontOf((live ? looksLive() : LOOKS)[r.id], setupOf(r.id)); return `${c.due ? 1 : 0}${c.line}`; });
  const c = caseOf(pl, card.slice(1));
  // the keys (BR1 item 5): the chosen card is the canvas's one Tab stop, named as it reads; ← → move the choice, and the
  // keys follow it when they were on the canvas already
  const sel = /\bpl-sel\b/.test(cls);
  useEffect(() => { if (sel && own.current && document.activeElement?.closest?.(".pl-card")) own.current.focus({ preventScroll: true }); }, [sel]);
  // where Sol put it (BR1 item 4): unseen, a dot until That's right or the move back; pointed at, why under the card, and
  // the card it came from outlined
  useNext(() => { const x = placementOf(r, knownNow(), unseenNow()); return x ? `${x.k} ${x.dot} ${x.from}` : ""; });
  const pm = placementOf(r, knownNow(), unseenNow()), was = useWas() === r.id;
  useEffect(() => { if (!pm?.from) return; pointWas(peek ? pm.from : null); return () => pointWas(null); }, [peek, pm?.from]);
  return (
    <section ref={own} className={`${cls} fo fo-${words ? form : "shape"}${peek ? " fo-on" : ""}${focused ? " fo-focus" : ""}${was ? " fo-pwas" : ""}`} data-front={front ? "" : undefined} data-region={r.id} data-part={pl.name} data-form={form} data-placed={pm ? (pm.dot ? "new" : "") : undefined} tabIndex={sel ? 0 : -1} role="group" aria-roledescription="folder" aria-label={`${pl.name}: ${pl.line}${pm?.dot ? " · your AI put it here" : ""}`} style={style}
      title={words ? undefined : `${pl.name}: ${pl.line}`} onPointerEnter={on} onPointerLeave={off} onFocus={on} onBlur={off}>
      <FolderCase name={pl.name + (apartOf(r.id) ? ` ${apartOf(r.id)}` : "")} paint={paintAt(Math.max(0, L.tintOf(r.id)))} sub={c.sub} count={c.count} next={c.next}
        working={c.working && "working"} quiet={c.quiet} hover={peek || focused} more={extra} lid={<Yours rid={r.id} band="far" />} />
      {pm?.dot ? <span className="fo-pdot" data-placed-dot aria-hidden="true" /> : null}
      {pm ? <div className="fo-pcap" data-placed-cap><Because ks={[pm.k]} all={pm.all ?? undefined} words={PLACED_W} here={r.id} /></div> : null}
      {peek && !quiet ? <Peek r={r} anchor={at} /> : null}   {/* one pop-up at a time: its ⋯ menu open, no contents card; nothing else hangs under the case */}
      {/* #1879: at rest a folder is its case only, nothing under it; its asks are in its count, the sidebar and the Diary, the open folder */}
    </section>
  );
}

/** Middle: the opened folder's tab, its name and the same line as a chip */
/** `line` false: the place line is said elsewhere (an empty folder's own line, index.tsx Empty), so the tab says it not twice */
export function OpenTab({ r, line = true }: { r: Region; line?: boolean }) {
  const pl = placeOf(r.id), tone = toneOf(pl);
  return (
    <>
      <span className="pl-dot" /><span className="fo-tn">{pl.name}{apartOf(r.id) ? <span className="fo-apart" data-apart> {apartOf(r.id)}</span> : null}</span>
      {line ? <span className={`fo-chip fo-${tone}`} data-sig={tone} data-place-line><span className="fo-d" />{pl.line}</span> : null}
    </>
  );
}
