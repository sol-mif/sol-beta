// Settings › Your own pieces (round 6 · M3, #1615; merge/pieces.js X.pages.pieces, X.rows, X.afters, window.stFind):
//   Page      the page: each piece with its state and one press, "Something off? Set all my pieces aside" (one press,
//             with undo), and Sol's version (going back to 2.3 as a whole, after a confirm)
//   GoRow     its row in "How it looks and reads" (data-p="pieces"), opening the page
//   FindRows  Find's "Something's off? Set all my pieces aside" for words like "something's off", landing on that press
// Settings (slice 6) mounts them (docs/port/requests/pieces.md). They read the store and press M.
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { useLayoutEffect } from "react";
import { M, useNext } from "../cv/index.ts";
import { version } from "../cv/moves/pieces.ts";
import { UPDATE, drawn, hits, list, me, pcSt, st, ui, type Piece } from "./model.ts";
import "./pieces.css";

const PIECE = <svg className="pc-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M4 10h16" /></svg>;
const BACK = <svg className="pc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14l-4-4 4-4" /><path d="M5 10h9a5 5 0 0 1 0 10h-3" /></svg>;

/** is the page open now (Settings draws it in place of its own page) */
export const pageOpen = (): boolean => ui.open;

function PieceRow({ x }: { x: Piece }) {
  const s = pcSt(x), S = st();
  let state = <span className="pc-state on"><i />In use</span>, small = x.small || "", btn = <button className="st-btn" onClick={() => M.piece_state(x.id, "sols")}>Back to Sol’s</button>;
  if (s === "in") { if (x.back && S.pc[x.id] === "in") small = x.back; }
  else if (s === "aside") { state = <span className="pc-state need"><i />Set aside by {UPDATE.v}</span>; small = x.why || ""; btn = <button className="st-btn pri" onClick={() => M.piece_state(x.id, "in")}>Bring it back</button>; }
  else if (s === "remade") { state = <span className="pc-state need"><i />Remade for {UPDATE.v}</span>; small = x.why || ""; btn = <button className="st-btn" onClick={() => M.piece_state(x.id, "last")}>Use my last version</button>; }
  else if (s === "last") { small = `your last version: ${x.last}`; btn = <button className="st-btn" onClick={() => M.piece_state(x.id, "remade")}>Use the remade one</button>; }
  else {
    state = <span className="pc-state off"><i />Sol’s in use</span>;
    small = S.all && S.all[x.id] != null ? "set aside with all of yours · kept" : "yours rests here, kept";
    btn = <button className="st-btn" onClick={() => M.piece_state(x.id, x.st === "aside" ? "in" : x.st)}>Use mine again</button>;
  }
  return (
    <div className={`pc-row${ui.hl === x.id ? " hl" : ""}`} data-piece-row={x.id}>
      <span className="pc-mk">{PIECE}</span>
      <span className="pc-t"><b>{x.n} <span className="cu-for">for Sol’s {x.for}</span></b><small>{small}</small><span className="cu-st">{state}</span></span>
      <span className="pc-acts">{btn}</span>
    </div>
  );
}

export function Page() {
  useNext(() => 0);
  const p = me(), S = st(), xs = list(), hl = ui.hl;
  useLayoutEffect(() => {
    if (!hl) return;
    document.querySelector(`#v-settings [data-piece-row="${CSS.escape(hl)}"]`)?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [hl]);
  const back = <button className="pc-back" onClick={() => M.see_pieces(false)}>‹ Settings</button>;
  if (!p) return <div className="pc-page">{back}<h1>Your own pieces</h1><p className="pc-calm"><span className="nx-aura still" /> Nothing of yours yet.</p></div>;
  const inUse = xs.filter(drawn).length;
  return (
    <div className="pc-page" data-r6="pieces">
      {back}
      <h1>Your own pieces</h1>
      <p className="st-say">Sol is the same for everyone. What you add stands in for one of Sol’s pieces, by name, and only for you. Updates never change yours: one that can’t come along is set aside, with one press to bring it back.</p>
      <h2 className="st-gh">Yours <small>{xs.length || "none yet"}</small></h2>
      {xs.length ? <div className="pc-list">{xs.map((x) => <PieceRow key={x.id} x={x} />)}</div>
        : <p className="pc-calm"><span className="nx-aura still" /> Nothing of yours yet. Say what you’d change, anywhere: “a quieter morning page”, “a key for something I do often”. You see a mockup before anything changes.</p>}
      {xs.length ? <div className={`pc-row pc-all${hl === "all" ? " hl" : ""}`} data-piece-row="all">
        <span className="pc-mk">{BACK}</span>
        <span className="pc-t">{S.all
          ? <><b>All of Sol’s, for now.</b> Your {Object.keys(S.all).length} pieces rest, every one kept as it was. If what was off is gone, one of yours did it: bring them back one at a time above.</>
          : <><b>Something off?</b> Set all {inUse === 1 ? "one of your pieces" : `${inUse} of your pieces`} aside in one press and see Sol as it comes. Undo puts each one back as it was.</>}</span>
        <span className="pc-acts">{S.all
          ? <button className="st-btn" data-cuall="undo" onClick={() => M.set_pieces_aside(true)}>Use mine again</button>
          : <button className="st-btn" data-cuall="aside" disabled={!inUse} onClick={() => M.set_pieces_aside()}>Set all my pieces aside</button>}</span>
      </div> : null}
      <h2 className="st-gh">Sol’s version</h2>
      <div className="pc-list">
        <div className="pc-row"><span className="pc-mk"><span className="nx-aura still" /></span>
          <span className="pc-t"><b>Sol {S.ver}</b><small>{S.ver === "2.4" ? `since ${UPDATE.when} · your pieces sit on top of it` : "you went back · 2.4 waits; it comes again when you say"}</small></span>
          <span className="pc-acts">{S.ver === "2.4" ? <button className="st-btn" onClick={() => version("2.3")}>Go back to 2.3</button> : <button className="st-btn pri" onClick={() => version("2.4")}>Use 2.4 again</button>}</span></div>
        {S.verConf ? <div className="pc-conf"><span>Sol goes back to 2.3 as a whole, never half. Your pieces come along as they were on 2.3. Possible until 18 December.</span>
          <button className="st-btn pri" onClick={() => version("go")}>Go back</button><button className="st-btn" onClick={() => version("stay")}>Stay on 2.4</button></div> : null}
      </div>
      <p className="pc-calm">{BACK} Every change to your pieces is in the Diary, each with Undo.</p>
    </div>
  );
}

/** its row in "How it looks and reads" */
export function GoRow() {
  useNext(() => 0);
  const p = me(), xs = list(), n = xs.filter(drawn).length;
  const sub = p ? (xs.length ? `${n} in use${xs.length > n ? ` · ${xs.length - n} resting` : ""} · each stands in for one of Sol’s` : "Nothing of yours yet · say what you’d change") : "What you remade, and a way back to Sol’s";
  return <div className="st-knob st-go"><button className="st-head" data-p="pieces" onClick={() => M.see_pieces()}><span className="st-ht"><b>Your own pieces</b><small className="st-who">{sub}</small></span><span className="st-cur">›</span></button></div>;
}

/** Find's rows for these words (Settings' find, and ⌘P's once the shell asks: docs/port/requests/pieces.md) */
export function FindRows({ q }: { q: string }) {
  const hs = useNext(() => hits(q));
  if (!hs.length) return null;
  return (
    <div className="st-rl pc-find" role="listbox" aria-label="Your own pieces">
      {hs.map((h) => <button key={h.l} className="st-r" role="option" aria-selected="false" data-r6={h.r6} onClick={() => M.see_pieces(h.row || null)}>
        <span className="st-t"><b>{h.l}</b><small>{h.s}</small></span></button>)}
    </div>
  );
}
