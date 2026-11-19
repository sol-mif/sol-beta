// The box, away (#1090, design NOW 05:08). On the window that keeps only the side (the role `anchor`) the room beside
// the side was bare black once the talk had been carried to the other screen: nothing said where the talk went or how
// it comes back. Now the place the box left from stays drawn: the box's outline at the foot of the room, a dashed
// pearl hairline, the other screen's shape inside it. Always there on an anchor (a card in front or not), so it never
// comes and goes. A press brings the talk to this window with the keyboard in its box (the same as carrying it back
// by its head). Follow-me (Jev 6) on an anchor is this same outline, offered: the hairline goes solid pearl, and at
// 0.7 and over the next key typed takes the talk. No words.
//   <div className="sf-room"><Front … /><Away w={room} offered={!!follow} onBring={() => { forgetFollow(); talkTo(ME); }} /></div>
// Layout only in away.css; a wall keeps `.sc-boxghost` (it has no side to stand clear of).
import { frontW } from "./Front";
import "./away.css";

export const meta = {
  Away: {
    job: "on the window that keeps only the side: where the talk's box was, drawn as its outline, and the way to bring it back",
    flow: "mine",
    states: ["at rest: a dashed hairline", "under the pointer: pearl", "offered (follow-me): solid pearl"],
    keys: [{ press: "click the outline", does: "the talk comes to this window, the keyboard in its box" }],
    listens: ["screens.state: this window's role is anchor", "screens.follow (Jev 6)"],
  },
};

/** `w`: the room's width, as Front takes it: the outline is as wide as the card in front and stands on the same middle */
export function Away({ w, offered = false, onBring }: { w: number; offered?: boolean; onBring: () => void }) {
  return (
    <button type="button" className={`aw ${offered ? "offered" : ""}`} data-part="the box, away" aria-label="bring the talk back to this window" onClick={onBring} style={{ width: frontW(w) }}>
      <svg viewBox="0 0 22 14" width="22" height="14" aria-hidden><rect x=".5" y=".5" width="21" height="13" rx="2.5" fill="none" stroke="currentColor" /></svg>
    </button>
  );
}
