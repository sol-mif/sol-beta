// Add: a tray of kinds, each made where you are (BR1 item 3, #1615). The bar's Add button (bar/Bar.tsx, E's) opens this
// card; everything inside it lives here. Add makes any piece: a Diary, a folder, a session, a note, an automation. The
// Diary is the folder's own (E's piece, M.make("diary", …)), or the canvas's at the top; the automation opens a session
// that asks what should happen and when, then makes it, paused, on its own table (birth.html row 5; no form). Anything else is asked for in the talk bar under the card, said in one line, not a tile:
// five presses at rest (mine/look/br1/add.html, the proposal picked 2026-11-22).
// Signed: marcocyl04-ux's agent (builder F).
import type { ReactNode } from "react";
import { D, S, M, hooks, piecesIn } from "../cv/index.ts";
import { nameOf as holderName, offHolders, setOffHolder } from "../holders/model.ts";   // a holder taken off the canvas comes back here (holders.html), never a sixth tile
import "./add.css";

const nameOf = (rid: string | null) => (rid && D.regions.find((r) => r.id === rid)?.name) || "";
/** the talk pill takes a ready sentence (Next.tsx Pill sets hooks.talk); with no pill drawn, the words show for a moment */
function toTalk(words: string) {
  const t = (hooks as { talk?: ((w: string) => boolean) | null }).talk;
  if (!t || !t(words)) hooks.flash?.(words);
}

type Kind = { id: string; n: string; sub: string; icon: ReactNode; make?: (rid: string) => { ok?: boolean; id?: string } | null | undefined };
/** the folder's own Diary: the one there, else a new one (E's diary piece); at the top, the canvas's */
function diaryIn(rid: string | null) {
  if (!rid) return M.toDiary();
  const had = piecesIn(rid).find((p) => p.kind === "diary");
  return had ? { ok: true, id: had.id } : M.make("diary", "Diary", rid);
}
const KINDS: Kind[] = [
  { id: "diary", n: "Diary", sub: "what happened here", icon: <svg width="28" height="30" viewBox="0 0 28 30"><rect x="4" y="2" width="20" height="26" rx="3" className="bar-paper" /><path d="M9 2v26M13 10h7M13 15h7" className="bar-rule" /></svg>,
    make: (rid) => diaryIn(rid) },
  { id: "folder", n: "Folder", sub: "holds anything", icon: <svg width="34" height="26" viewBox="0 0 34 26"><path d="M2 6h11l3 3h16v15H2z" fill="var(--a1)" /></svg>,
    make: () => M.newFolder() },
  { id: "session", n: "Session", sub: "a chat with an AI", icon: <svg width="30" height="28" viewBox="0 0 30 28"><circle cx="15" cy="14" r="11" className="bar-orb" /></svg>,
    make: (rid) => M.start({ region: rid }) },
  { id: "note", n: "Note", sub: "write something down", icon: <svg width="26" height="30" viewBox="0 0 26 30"><rect x="2" y="2" width="22" height="26" rx="3" className="bar-paper" /><path d="M7 10h12M7 15h12M7 20h8" className="bar-rule" /></svg>,
    make: () => M.note_new() },   // BR1 C (frame.html part 6): a note is its own layer over the canvas, loose until sent
  { id: "automation", n: "Automation", sub: "runs on its own", icon: <svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" className="bar-paper" /><path d="M15 8v7l5 3" className="bar-hand" /></svg>,
    make: (rid) => M.start({ region: rid, purpose: "automation", now: false }) },
];

/** Add's card: the bar draws it inside its pop-up, closes it with close, and says with here which folder it drops into */
export default function Add({ close, here }: { close: () => void; here: () => string | null }) {
  const add = (k: Kind) => () => {
    const rid = here();
    const r = k.make && (k.id === "folder" || k.id === "note" || k.id === "diary" || rid) ? k.make(rid!) : null;
    close();
    if (k.id === "diary" && !(r && r.ok && rid)) {   // at the top, or a folder's own not made yet: the canvas's Diary
      if (!(r && r.ok)) M.toDiary();
      if (rid) hooks.flash?.(`This Diary holds everything; one for ${nameOf(rid)} alone comes in an update`);
      return;
    }
    if (r && r.ok) {
      if (k.id === "note") return;   // it lands where you are, in no folder
      if ((k.id === "folder" || k.id === "diary") && r.id) M.goto(r.id);   // the Diary opens up close, in front of you
      else if (k.id !== "session" && k.id !== "automation" && rid) { if (!(S.dist === "middle" && S.region === rid)) M.goto(rid); }
      return;
    }
    toTalk(`Make me a ${k.n.toLowerCase()}${rid ? ` in ${nameOf(rid)}` : ""}: `);   // no create path here yet: the words, ready to send
  };
  const rid = here();
  return (
    <>
      <h3>{rid ? `Add to ${nameOf(rid)}` : "Add to the canvas"}</h3>
      <p>It lands here, in front of you.</p>
      <div className="bar-tray">
        {KINDS.map((k) => <button key={k.id} type="button" className="bar-add" data-add={k.id} onClick={add(k)}><span className="bar-ic" aria-hidden="true">{k.icon}</span>{k.n}<small>{k.sub}</small></button>)}
      </div>
      {offHolders().length ? <p className="add-back" data-add-back>Bring back{offHolders().map((id) => <button key={id} type="button" data-add-holder={id} onClick={() => { setOffHolder(id, false); close(); }}>{holderName(id)}</button>)}</p> : null}
      <p className="add-else" data-add-else>Something else? Say it in the bar below: “make me a reading list”.</p>
    </>
  );
}
