// Build becomes yours (#1089, behind `build.yours`): the offer and the shaping, at the talk's foot. Design: the
// designer's design.md (S/design, the night of 2026-11-13), drawn from the kit only (Chip, Made, land).
// The Sol user's path:
//   again   they send an ask they have sent before. 1200 ms after, one line stands above the box: the pearl, the tool
//           itself as a dashed chip (its title and two blanks holding their last value), its count, "not now". It is
//           said once: whatever they press, that offer never comes back on its own (Build settings › yours can).
//           An arrangement or a thing always closed is held back until the stage can keep its place (nothing is said on open).
//   shape   pressing the chip lays three made versions over the stage, at their real size; 1 2 3 or ← → pick, a press
//           inside one fills the box (they send). Under the pick: the changes it can take, as presses, and "say it".
//   keep    Enter or "keep": the picked one travels to its place on the stage and lands there as theirs; the line says
//           only the chip (solid now), "yours" and undo, for a few seconds. Its corner turns it over: where it came
//           from, what it may do, undo.
// Nothing is sent for them: the box is only filled.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button, Field, Pearl } from "../kit";
import { ink, label } from "../kit/paint";
import { TYPE as T } from "../kit/tokens";
import { Chip } from "./Chip";
import { Made } from "./Made";
import { landOn } from "./land";
import { ask, buildYours, setKeptLay, useBuildYours, openSession, setOpenSession } from "./live";
import { buildPieces } from "../folderPieces/flag";
import { LayGlyph, LayPick, laysOf, layTitle, tryLay, type Lay } from "./Look";
import { atSend, FILL_FRESH_MS, fillBox, fillFrom, makeHeard, pushesOf, shelfRoom, typedLine, type Fill, type Kept, type Offer, type Spec } from "./model";
import type { Item } from "../work/useWork";
import "../kit/moves.css";   // k-pop, the kit's arrival
import "./yours.css";

const BREATH_MS = 1200;   // the line comes after the send has settled, never with it
// which kept tool filled the box last (the tool learns: what is sent after its fill is read against it)
// (one per window, with the session it was filled in: a send in another session never reads against it)
let lastFill: Fill | null = null;
// the session whose line has an offer (or a keep) standing: a send there is kept as a record only (#1131)
let standing: string | null = null;
const filledBy = (id: string, session: string) => { if (/^yours-[0-9a-f]{8}$/.test(id)) lastFill = { id, at: Date.now(), session }; };
type Learn = { id: string; form: string; count: number; added: string };
type Heard = Promise<{ offer: Offer | null; versions: Spec[]; lead?: number; doubt?: boolean }>;
// each send in Build's box is told to the engine at the send, line or no line (a first turn that fails may never bring its
// line back, the walk of 2026-11-13); the line takes that ask when the sent line comes, never asking twice for one send
const heard = makeHeard<Heard>();
const askSaid = (session: string, said: string): Heard => ask({ type: "work.yours.offer", sessionId: session, said }, 30000);
/** the box sent `text` in `session` (Composer, after the send went): with the switch on, the engine hears it now, with
 *  the folder the session opens in (`cwd`: a new session's run is still opening, #1131); the decision is model.ts atSend */
export function heardAtSend(session: string, text: string, cwd?: string) {
  if (!buildYours()) return;
  const d = atSend({ session, text, cwd, standing: standing === session }, lastFill);
  lastFill = d.fill;   // a fill is for the one send after it (the fill's own path tells it when its line comes back)
  heard.hear({ on: true, session, text, filled: d.filled }, () => { const p: Heard = ask({ type: "work.yours.offer", ...d.said }, 30000); p.catch(() => {}); return p; });
}
const UNDO_MS = 8000;     // the undo after a keep stays this long; then it is on the piece and in the list
/** "once · today", "once · yesterday", "once · 11 Nov": where a repeat's count stands (as the engine's onceWhen) */
const onceWhen = (at: number, now = Date.now()) => {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const n = Math.round((day(now) - day(at)) / 86_400_000);
  return `once · ${n <= 0 ? "today" : n === 1 ? "yesterday" : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
};
/** a kept thing's chip: its slots, or the title alone when the whole ask was kept (no field to fill; the designer) */
export const slotsOf = (s: Spec) => (s.shape === "brief" ? [] : s.fields.map((f) => ({ name: f.name, value: f.value })));
const HEAD: Record<Offer["kind"], string> = { ask: "You ask this often.", checkin: "You check on this often.", correction: "You have said this before.", arrangement: "", closed: "" };
const direct = (o: Offer) => o.kind === "arrangement" || o.kind === "closed";

/** the box filling (and a kept piece's undo) from a page in the stage: one listener per window */
function useFromPages(onUndo: (id: string) => void, session: string) {
  useEffect(() => {
    const hear = (ev: MessageEvent) => {
      // only a kept tool's own page (its block id yours-…) may fill the box or undo, and only itself
      const frame = [...document.querySelectorAll<HTMLIFrameElement>(".st-stagebox iframe")].find((f) => f.contentWindow === ev.source);
      const block = frame?.closest<HTMLElement>("[data-block]")?.dataset.block ?? "";
      const inside = /^yours-[0-9a-f]{8}$/.test(block);
      const d = ev.data as { sol?: string; id?: unknown } | null;
      if (inside && d?.sol === "yours.undo" && d.id === block) { onUndo(block); return; }
      if (inside && d?.sol === "yours.change" && d.id === block) { askChange(block); return; }
      // a press inside the frame wakes the window too: a message with no press behind it never fills
      const pressed = (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true;
      const t = fillFrom(ev.data, inside && pressed);
      if (t !== null && fillBox(document.querySelector<HTMLTextAreaElement>(".st-talkbox textarea"), t)) filledBy(block, session);
    };
    window.addEventListener("message", hear);
    return () => window.removeEventListener("message", hear);
  }, [onUndo, session]);
}

export function YoursOffer({ session, items, lay }: { session: string; items: Item[]; lay?: Lay | null }) {
  const on = useBuildYours();
  if (!on || !session) return null;
  return <OfferLine key={session} session={session} items={items} lay={lay ?? null} />;
}

/** the line stands on the box's own edges: its left edge the box's, its last word's right edge the box's */
function useBoxEdges(el: RefObject<HTMLDivElement | null>): CSSProperties {
  const [st, setSt] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const line = el.current, box = [".st-talkbox .ask-inner", ".st-talkbox .ask", ".st-talkbox"].map((q) => document.querySelector<HTMLElement>(q)).find(Boolean);
    const host = line?.parentElement;
    if (!line || !box || !host) return;
    const tb = document.querySelector<HTMLElement>(".st-talkbox");
    const fit = () => {
      const b = box.getBoundingClientRect(), h = host.getBoundingClientRect(), room = tb ? Math.max(0, b.top - tb.getBoundingClientRect().top) : 0;
      // its last edge 8px above the box: the room inside the box's own wrapper is taken back
      setSt({ marginLeft: Math.max(0, b.left - h.left), width: b.width, marginBottom: 8 - room });
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(box); ro.observe(host);
    return () => ro.disconnect();
  }, [el]);
  return st;
}

function OfferLine({ session, items, lay }: { session: string; items: Item[]; lay: Lay | null }) {
  const lineEl = useRef<HTMLDivElement>(null);
  const edges = useBoxEdges(lineEl);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [versions, setVersions] = useState<Spec[]>([]);
  const [lead, setLead] = useState(1);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState<Kept | null>(null);
  const [undone, setUndone] = useState(false);
  const [shelf, setShelf] = useState<Kept[]>([]);
  const [opened, setOpened] = useState<string | null>(null);   // the shelf's piece open above its chip
  const [all, setAll] = useState(false);
  const loadShelf = useCallback(() => ask<{ shelf: Kept[] }>({ type: "work.yours.shelf", sessionId: session }).then((m) => {
    if (!live.current) return;
    const all = m.shelf ?? [];
    setShelf(all.filter((k) => k.spec.shape !== "layout"));
    // the project's kept look: where every session of it never set by hand opens its talk (the newest kept one)
    const look = [...all].reverse().find((k) => k.spec.shape === "layout" && k.spec.lay);
    setKeptLay(look?.spec.lay ?? null);
  }).catch(() => {}), [session]);
  useEffect(() => { void loadShelf(); }, [loadShelf]);
  useEffect(() => { if (offer || kept) standing = session; else if (standing === session) standing = null; }, [offer, kept, session]);
  const live = useRef(true);
  useEffect(() => { live.current = true; setOpenSession(session); return () => { live.current = false; if (lastFill?.session === session) lastFill = null; if (standing === session) standing = null; if (openSession() === session) setOpenSession(""); }; }, [session]);

  // a change asked for (the list, or the page's foot): over the session; then the line says "changed · undo" for 8 s
  const [changeAt, closeChange] = useChangeAsked();
  const [changedK, setChangedK] = useState<Kept | null>(null);
  // the tool learns (the designer's NOW 03:58 3): its own chip, dashed, the edit in its slot, "3×"; one press takes it
  const [learn, setLearn] = useState<Learn | null>(null);
  const changeSheet = changeAt && <ChangeSheet k={changeAt.k} onClose={closeChange}
    onDone={(n) => { closeChange(); changeAt.done?.(n); void loadShelf(); if (n.before) { setChangedK(n); setTimeout(() => live.current && setChangedK((c) => (c?.id === n.id ? null : c)), UNDO_MS); } }} />;
  // a row of "you repeat" (or passed, noticed) pressed: that offer, its versions standing at once
  useEffect(() => {
    const hear = () => {
      const id = pendingOffer; pendingOffer = null;
      if (!id) return;
      void ask<{ offer: Offer | null; versions: Spec[]; lead?: number; doubt?: boolean }>({ type: "work.yours.offer", sessionId: session, id }, 30000).then((m) => {
        if (!live.current || !m.offer) return;
        setKept(null); setOffer(m.offer); setVersions(m.versions); setLead(m.lead ?? 1); setDoubt(!!m.doubt); setShown(true); setOpen(true);
      }).catch(() => {});
    };
    addEventListener(OFFER, hear); hear();
    return () => removeEventListener(OFFER, hear);
  }, [session]);
  const undoId = useCallback((id: string) => { void ask<{ kept: Kept; stays?: boolean }>({ type: "work.yours.undo", id }).then((r) => { setKept((k) => (k?.id === id ? { ...k, undone: r.kept.undone, stays: !!r.stays } : k)); setUndone(!!r.kept.undone); tryLay(null); void loadShelf(); }).catch(() => {}); }, [loadShelf]);
  useFromPages(undoId, session);

  const [doubt, setDoubt] = useState(false);   // the title is the rule's last resort: it stands dashed, a press names it
  const load = useCallback((said?: string) => (said ? heard.take(session, said) ?? askSaid(session, said) : ask<Awaited<Heard>>({ type: "work.yours.offer", sessionId: session }, 30000))
    .then((m) => { if (!live.current || !m.offer) return; setOffer(m.offer); setVersions(m.versions); setLead(m.lead ?? 1); setDoubt(!!m.doubt); setTimeout(() => live.current && setShown(true), BREATH_MS); })
    .catch(() => { /* no offer is the quiet answer */ }), [session]);

  // each ask the Sol user sends is asked about (an open sends nothing: an offer comes only right after they did it again;
  // an arrangement or a close is held back until the stage can keep the place)
  const lastMe = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const me = [...items].reverse().find((i) => i.kind === "me" && typeof i.text === "string" && i.text.trim());
    const id = me?.id ?? null;
    if (lastMe.current === undefined) {
      lastMe.current = id;
      // what was there when the session opened is not a send, unless the session is new: its one ask was just sent
      const mine = items.filter((i) => i.kind === "me").length;
      if (!(me && mine === 1 && items.length <= 4)) return;
    } else if (id === lastMe.current || !me) return;
    lastMe.current = id;
    // a line nobody typed (a stop's "[Request interrupted…]", a wrapper) is not a send: it neither uses a fill nor asks
    if (me && !typedLine(String(me.text))) return;
    // a kept tool's fill sent (edited or not): the engine hears the edit; the same edit three times, the tool may learn it
    const f = lastFill?.session === session ? lastFill : null;
    if (f) lastFill = null;
    if (me && f && Date.now() - f.at < FILL_FRESH_MS) {
      void ask<{ learn: Learn | null }>({ type: "work.yours.sent", id: f.id, text: String(me.text) }).then((r) => {
        if (!live.current || !r.learn) return;
        setTimeout(() => live.current && setLearn({ ...r.learn!, id: f.id }), BREATH_MS);
      }).catch(() => {});
      return;
    }
    if (me && !offer && !kept) void load(String(me.text));
  }, [items, offer, kept, load, session]);

  // the look's moment: 1200 ms after they set the talk by hand (a dock, the seam), never on opening
  const layKey = lay ? `${lay.dock}|${lay.width ?? ""}` : "";
  const firstLay = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (firstLay.current === undefined) { firstLay.current = layKey; return; }
    if (!lay || offer || kept) return;
    const t = setTimeout(() => void ask<{ offer: Offer | null; versions: Spec[] }>({ type: "work.yours.offer", sessionId: session, lay }, 30000)
      .then((m) => { if (!live.current || !m.offer) return; setOffer(m.offer); setVersions(m.versions); setShown(true); }).catch(() => {}), BREATH_MS);
    return () => clearTimeout(t);
  }, [layKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = useCallback(() => { if (offer) void ask({ type: "work.yours.seen", id: offer.id, how: "later" }).catch(() => {}); setOpen(false); setShown(false); setOffer(null); }, [offer]);
  const keep = useCallback(async (spec: Spec, from?: HTMLElement | null) => {
    if (!offer) return;
    // a piece in the folder only with the folder's pieces on (build.pieces)
    const r = await ask<{ kept: Kept }>({ type: "work.yours.keep", sessionId: session, id: offer.id, spec, pieces: buildPieces() });
    if (from) await landOn(from, r.kept.id, 600);
    setKept(r.kept); setOpen(false); setOffer(null); setUndone(false);
    setTimeout(() => { if (!live.current) return; setKept((k) => (k?.id === r.kept.id ? null : k)); void loadShelf(); }, UNDO_MS);
  }, [offer, session, loadShelf]);

  // the shelf: this project's kept things as solid chips in the line's row; a press opens the piece above its chip
  useEffect(() => {
    if (!opened) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpened(null); };
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest?.(".yo-line")) setOpened(null); };
    addEventListener("keydown", k); addEventListener("pointerdown", away);
    return () => { removeEventListener("keydown", k); removeEventListener("pointerdown", away); };
  }, [opened]);
  const room = shelfRoom(typeof edges.width === "number" ? edges.width : 0);
  const chips = (all ? shelf : shelf.slice(0, room)).map((k) => (
    <span key={k.id} className="yo-shelfchip">
      <Chip title={k.title} blanks={slotsOf(k.spec)} kept label={k.spec.shape === "pin" ? `${k.title}: say it` : `${k.title}, yours: open it`}
        onPress={() => (k.spec.shape === "pin" ? void (fillBox(document.querySelector<HTMLTextAreaElement>(".st-talkbox textarea"), k.spec.template) && filledBy(k.id, session)) : setOpened((o) => (o === k.id ? null : k.id)))} />
      {opened === k.id && <div className="yo-pop k-pop" role="dialog" aria-label={k.title}>
        <Made spec={k.spec} state="kept" solid onFill={(t) => { if (fillBox(document.querySelector<HTMLTextAreaElement>(".st-talkbox textarea"), t)) filledBy(k.id, session); setOpened(null); }} />
      </div>}
    </span>
  ));
  const more = !all && shelf.length > room ? <button className="yo-quiet" onClick={() => setAll(true)}>+{shelf.length - room}</button> : null;

  if (changeAt) return <><div ref={lineEl} style={edges} className="yo-line" aria-hidden />{changeSheet}</>;
  const learnK = learn ? shelf.find((k) => k.id === learn.id) : null;
  if (learn && learnK) return (
    <div ref={lineEl} style={edges} className="yo-line on" data-yours="learn" aria-label={`${learnK.title} learns: ${learn.added}`}>
      <span className="yo-mark"><Pearl w={18} h={18} r={9} /></span>
      <Chip title={learnK.title} blanks={[{ name: "edit", value: learn.added }]} label={`${learnK.title}: take your edit, ${learn.added}`}
        onPress={() => void ask<{ kept: Kept; stays?: boolean }>({ type: "work.yours.learn", id: learn.id, form: learn.form }).then((r) => {
          setLearn(null); void loadShelf(); setChangedK({ ...r.kept, stays: !!r.stays });
          setTimeout(() => live.current && setChangedK((c) => (c?.id === r.kept.id ? null : c)), UNDO_MS);
        }).catch(() => setLearn(null))} />
      <span className="yo-count">{learn.count}×</span>
      <span className="yo-said" />
      <button className="yo-quiet" onClick={() => { void ask({ type: "work.yours.learn", id: learn.id, form: learn.form, no: true }).catch(() => {}); setLearn(null); }}>not now</button>
    </div>
  );
  if (changedK) return (
    <div ref={lineEl} style={edges} className="yo-line on" role="status" data-yours="changed">
      <span className="yo-mark"><Pearl w={18} h={18} r={9} /></span>
      <Chip title={changedK.title} blanks={slotsOf(changedK.spec)} kept />
      <span className="yo-said">{changedK.stays ? "changed · your file stays" : "changed"}</span>
      <button className="yo-quiet" onClick={() => void ask<{ kept: Kept }>({ type: "work.yours.unchange", id: changedK.id }).then(() => { setChangedK(null); void loadShelf(); }).catch(() => {})}>undo</button>
    </div>
  );
  if (kept && kept.spec.shape === "layout" && kept.spec.lay) {
    const v = laysOf(kept.spec.lay);
    const now = Math.max(0, v.findIndex((x) => JSON.stringify(x.lay) === JSON.stringify(kept.spec.lay)));
    return (
      <div ref={lineEl} style={edges} className="yo-line on" role="status" data-yours="kept-look">
        <span className="yo-mark"><Pearl w={18} h={18} r={9} /></span>
        {undone ? <span className="yo-said">undone</span> : <LayPick versions={v} kept={now} onTry={(i) => tryLay(i === null ? null : v[i].lay)}
          onKeep={(i) => { tryLay(null); void ask<{ kept: Kept }>({ type: "work.yours.lay", id: kept.id, lay: v[i].lay }).then((r) => { setKept(r.kept); void loadShelf(); }).catch(() => {}); }} after="from now on" />}
        <span className="yo-said" />
        <button className="yo-quiet" onClick={() => undoId(kept.id)}>{undone ? "bring it back" : "undo"}</button>
      </div>
    );
  }
  if (kept) {
    const blanks = slotsOf(kept.spec);
    return (
      <div ref={lineEl} style={edges} className="yo-line on" role="status" data-yours="kept">
        <span className="yo-mark"><Pearl w={18} h={18} r={9} /></span>
        <Chip title={kept.title} blanks={blanks} kept undone={undone} />
        <span className="yo-said">{undone ? (kept.stays ? "undone · your file stays" : "undone") : "yours"}</span>
        {!undone && kept.piece && <span className="yo-where" title="it also stands in this project's folder, not shared">in the folder</span>}
        <button className="yo-quiet" onClick={() => undoId(kept.id)}>{undone ? "bring it back" : "undo"}</button>
      </div>
    );
  }
  if (!offer || !versions.length) return shelf.length
    ? <div ref={lineEl} style={edges} className="yo-line on" data-yours="shelf" aria-label="yours">{chips}{more}</div>
    : <div ref={lineEl} style={edges} className="yo-line" aria-hidden />;   // its 36px are always held: the box never moves
  const first = versions[Math.max(0, Math.min(lead, versions.length - 1))] ?? versions[0];   // the chip is the version that leads
  return (
    <>
      <div ref={lineEl} style={edges} className={`yo-line ${shown && !open ? "on" : ""}`} data-yours="offer" aria-hidden={!shown || open} aria-label={offer.sentence}>
        <span className="yo-mark"><Pearl w={18} h={18} r={9} /></span>
        {first.shape === "layout" && first.lay
          ? <Chip lead={<LayGlyph lay={first.lay} />} title={layTitle(first.lay)} label={`${offer.sentence} Keep it`} onPress={() => void keep(first).then(() => loadShelf())} />
          : <Chip title={first.title} blanks={first.fields.map((f) => ({ name: f.name, value: f.value }))} label={`${offer.sentence} ${first.title}: see it made`}
              onPress={() => (direct(offer) ? void keep(first) : setOpen(true))} />}
        <span className="yo-count" title={offer.examples[0] ?? ""}>{offer.count > 99 ? "99+" : offer.count}×</span>
        {chips}{more}
        <span className="yo-said" />
        <button className="yo-quiet" onClick={later}>not now</button>
      </div>
      {/* over the stage: the talk column is its own layer, so the sheet goes to the page's body */}
      {open && createPortal(<Sheet offer={offer} versions={versions} lead={lead} doubt={doubt} setVersions={setVersions} onKeep={keep} onClose={() => setOpen(false)} onLater={later} />, document.body)}
    </>
  );
}

/** where the group of versions stands: centred on the box, its bottom edge 12px above the line; over the stage when
 *  it is open and wide enough, else over the talk (then the versions are solid: words stand under them) */
function standAt(): { left: number; width: number; bottom: number; overTalk: boolean } {
  const line = document.querySelector(".yo-line")?.getBoundingClientRect();
  const box = document.querySelector(".st-talkbox .ask-inner, .st-talkbox")?.getBoundingClientRect();
  const stage = document.querySelector(".st-stagebox")?.getBoundingClientRect();
  const overTalk = !(stage && stage.width >= 560);
  // its ground stands inside the room (the talk and the stage), never over the side (the designer, NOW 03:33)
  const room = document.querySelector(".st-room")?.getBoundingClientRect();
  const lo = room ? room.left : 16, hi = room ? room.right : innerWidth - 16;
  const width = Math.min(hi - lo, 980);
  const centre = box ? box.left + box.width / 2 : innerWidth / 2;
  const left = Math.max(lo, Math.min(hi - width, centre - width / 2));
  return { left, width, bottom: line ? innerHeight - line.top + 12 : 120, overTalk };
}

/** ask the line to open a kept thing's change (from Build settings › yours, or the foot of its page on the stage) */
const CHANGE = "sol:yours-change";
// an offer pressed by hand in Build settings › yours: the line opens its versions over the session
const OFFER = "sol:yours-offer";
let pendingOffer: string | null = null;
export function askOffer(id: string) { pendingOffer = id; window.dispatchEvent(new CustomEvent(OFFER)); }
type ChangeAsk = { k: Kept | string; done?: (k: Kept) => void };
// held until a line hears it: the settings panel closes first, and the session's line may mount only after
let pending: ChangeAsk | null = null;
export function askChange(k: Kept | string, done?: (k: Kept) => void) { pending = { k, done }; window.dispatchEvent(new CustomEvent(CHANGE)); }
/** the line hears it: it opens the change over the session; a kept thing named by id is found in the list */
function useChangeAsked(): [{ k: Kept; done?: (k: Kept) => void } | null, () => void] {
  const [at, setAt] = useState<{ k: Kept; done?: (k: Kept) => void } | null>(null);
  useEffect(() => {
    const hear = () => {
      const d = pending; pending = null;
      if (!d) return;
      if (typeof d.k !== "string") { setAt({ k: d.k, done: d.done }); return; }
      const id = d.k;
      void ask<{ kept: Kept[] }>({ type: "work.yours.list" }).then((m) => { const k = m.kept.find((x) => x.id === id && !x.undone); if (k) setAt({ k, done: d.done }); }).catch(() => {});
    };
    addEventListener(CHANGE, hear);
    hear();   // one asked before this line was there
    return () => removeEventListener(CHANGE, hear);
  }, []);
  return [at, () => setAt(null)];
}

/** the top a group of versions never goes above: the talk's head's lower edge (else 56) */
const topAt = () => document.querySelector(".st-talkhead")?.getBoundingClientRect().bottom ?? 56;

/** a kept thing to change by saying so: the same sheet with its one version, "Yours, to change."; keep replaces it */
export function ChangeSheet({ k, onDone, onClose }: { k: Kept; onDone: (k: Kept) => void; onClose: () => void }) {
  const [versions, setVersions] = useState<Spec[]>([k.spec]);
  const offer = { id: k.offer, kind: k.from.kind, count: k.from.count, sessions: k.from.sessions, first: k.from.first, last: k.from.last, words: "", examples: [k.from.example], blanks: [], template: k.spec.template, sentence: "Yours, to change.", folder: "" } as Offer;
  const keep = async (spec: Spec) => { const r = await ask<{ kept: Kept; stays?: boolean }>({ type: "work.yours.change", id: k.id, spec }); onDone({ ...r.kept, stays: !!r.stays }); };
  return createPortal(<Sheet offer={offer} versions={versions} lead={0} setVersions={setVersions} onKeep={keep} onClose={onClose} onLater={onClose} head="Yours, to change." small={`kept ${new Date(k.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`} leave="leave it" />, document.body);
}

function Sheet({ offer, versions, lead, setVersions, onKeep, onClose, onLater, head, small, leave, doubt: doubtIn }: {
  offer: Offer; versions: Spec[]; lead: number; setVersions: (f: (v: Spec[]) => Spec[]) => void; head?: string; small?: string; leave?: string; doubt?: boolean;
  onKeep: (s: Spec, from?: HTMLElement | null) => Promise<void>; onClose: () => void; onLater: () => void;
}) {
  const [pick, setPick] = useState(Math.max(0, Math.min(lead, versions.length - 1)));   // the one Jev was sure of, else the middle
  const [doubt, setDoubt] = useState(!!doubtIn);   // the rule's last-resort title, dashed until they name it
  const [words, setWords] = useState("");
  const [pulse, setPulse] = useState<string | null>(null);
  const [miss, setMiss] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState(standAt);
  const frozen = useRef(false);
  // the group follows the line: the box can grow under it (a fill) or the window can change
  useEffect(() => {
    const again = () => setBox((b) => { if (frozen.current) return b; const n = standAt(); return n.left === b.left && n.width === b.width && n.bottom === b.bottom && n.overTalk === b.overTalk ? b : n; });
    const ro = new ResizeObserver(again);
    for (const q of [".st-talkbox", ".st-stagebox", ".st-talkwrap"]) { const e = document.querySelector(q); if (e) ro.observe(e); }
    addEventListener("resize", again);
    return () => { ro.disconnect(); removeEventListener("resize", again); };
  }, []);
  // while the versions stand, the talk and the stage step back to a quarter: readable, not blacked out
  useEffect(() => {
    document.body.classList.add("yo-shaping");
    return () => {
      document.body.classList.remove("yo-shaping");
      // the versions gone (keep, Esc, not now): the box has focus again, so the next letter typed lands (designer NOW 06:30 2)
      const box = document.querySelector<HTMLTextAreaElement>(".st-talkbox textarea");
      if (box && document.activeElement !== box) box.focus({ preventScroll: true });
    };
  }, []);
  const [saying, setSaying] = useState(false);
  const say = useRef<HTMLInputElement>(null), picked = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const keepNow = useCallback(() => {
    if (busy) return;
    setBusy(true); setLeaving(true); frozen.current = true;   // the group stops following the stage; all but the pick go to nothing first
    setTimeout(() => { void onKeep(versions[pick], picked.current).finally(() => { setBusy(false); setLeaving(false); frozen.current = false; }); }, 160);
  }, [busy, onKeep, versions, pick]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey) { setSaying(true); setWords(e.key); e.preventDefault(); return; }
      if (e.key >= "1" && e.key <= String(versions.length)) setPick(Number(e.key) - 1);
      else if (e.key === "ArrowRight") setPick((p) => Math.min(versions.length - 1, p + 1));
      else if (e.key === "ArrowLeft") setPick((p) => Math.max(0, p - 1));
      else if (e.key === "Enter") { e.preventDefault(); keepNow(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, versions.length, keepNow]);
  const change = async (w: string) => {
    if (!w.trim()) return;
    // read on this machine by plain rules (adjust): typed words never leave it
    const r = await ask<{ spec: Spec; changed: string[] }>({ type: "work.yours.adjust", spec: versions[pick], words: w }).catch(() => null);
    if (r?.changed.includes("title")) setDoubt(false);
    if (!r || !r.changed.length) { setMiss(true); setTimeout(() => setMiss(false), 400); say.current?.select(); return; }   // the words stay, selected; the presses beat
    setVersions((v) => v.map((x, i) => (i === pick ? r.spec : x)));
    setWords(""); setSaying(false);
    setPulse(r.changed[0]); setTimeout(() => setPulse(null), 400);
  };
  const fill = (t: string) => fillBox(document.querySelector<HTMLTextAreaElement>(".st-talkbox textarea"), t);
  const root = useRef<HTMLDivElement>(null);
  // its own height: when the room over the line is too small (a tall box, an "allow?" card), it stands from the talk's
  // head down, over the line, on its own ground; its head, Esc and "not now" always in sight (the designer, NOW 03:58)
  const [tall, setTall] = useState(0);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(() => setTall(el.offsetHeight)); ro.observe(el); setTall(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  // focus on the versions (1 2 3, ← →, Enter work at once), after the box's own focus has settled
  useEffect(() => {
    const t = setTimeout(() => root.current?.focus({ preventScroll: true }), 30);
    // the box keeps taking focus back on its own (a turn ending); while the versions stand, focus stays with them
    // unless the Sol user pressed into the box themself
    let pressed = 0;
    const down = (e: PointerEvent) => { if ((e.target as HTMLElement | null)?.closest?.(".st-talkbox")) pressed = Date.now(); };
    const back = (e: FocusEvent) => { if ((e.target as HTMLElement | null)?.closest?.(".st-talkbox") && Date.now() - pressed > 400) root.current?.focus({ preventScroll: true }); };
    addEventListener("pointerdown", down, true); addEventListener("focusin", back, true);
    return () => { clearTimeout(t); removeEventListener("pointerdown", down, true); removeEventListener("focusin", back, true); };
  }, []);
  return (
    <div ref={root} tabIndex={-1} className={`yo-sheet k-pop ${leaving ? "leaving" : ""}`} role="dialog" aria-label={offer.sentence} style={{ left: box.left, width: box.width, bottom: Math.max(8, Math.min(box.bottom, innerHeight - topAt() - tall)) }}>
      <div className="yo-head">
        <Pearl w={18} h={18} r={9} />
        <b style={{ fontWeight: 600, fontSize: T.read[0], color: ink, flex: "none" }}>{head ?? (offer.count < 2 ? "You asked this." : HEAD[offer.kind] || offer.sentence)}</b>
        <span style={{ ...label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }} title={offer.examples[0] ?? ""}>{small ?? (offer.count < 2 ? onceWhen(offer.first) : `${offer.count > 99 ? "99+" : offer.count} ${offer.kind === "correction" ? "times" : "asks"} since ${new Date(offer.first).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)}</span>
        <button className="yo-quiet" onClick={onLater}>{leave ?? "not now"}</button>
      </div>
      <div className="yo-vers">
        {versions.map((v, i) => (
          <div key={i} ref={i === pick ? picked : undefined} data-version={i} className={i === pick ? "yo-pickwrap" : undefined}>
            <Made spec={v} index={versions.length > 1 ? i : undefined} state={i === pick ? "picked" : "ghost"} solid={box.overTalk} pulse={i === pick ? pulse : null} onPick={() => setPick(i)} onFill={fill}
              doubt={doubt} onName={() => { setPick(i); setWords("call it "); setSaying(true); }} />
          </div>
        ))}
      </div>
      <div className="yo-foot">
        <div className={`yo-pushes ${miss ? "nudge" : ""}`}>
          {!saying && pushesOf(versions[pick], offer.count < 2).map((p) => <Button key={p} h={28} flat onClick={() => void change(p)}>{p}</Button>)}
          {!saying && <Button h={28} flat onClick={() => setSaying(true)}>say…</Button>}
          {saying && <Field w={360} h={32}>
            <input ref={say} autoFocus value={words} onChange={(e) => setWords(e.target.value)} placeholder="call it Review" aria-label="say what to change"
              onKeyDown={(e) => { if (e.key === "Enter" && words.trim()) { e.preventDefault(); e.stopPropagation(); void change(words); } if (e.key === "Escape") { e.stopPropagation(); setSaying(false); setWords(""); } }}
              style={{ all: "unset", flex: 1, minWidth: 0, color: ink, fontSize: T.body[0] }} />
          </Field>}
          <Button h={28} acts onClick={keepNow}>keep</Button>
        </div>
      </div>
    </div>
  );
}
