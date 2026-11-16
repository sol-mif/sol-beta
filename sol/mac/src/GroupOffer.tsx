// Home's group card (#321, Cowork PRD §4.1): under the answer whose seat called suggest_group, one hairline at the left
// and four lines, as wF.html #s1: "want a group for this?", the gradient pill "open a new group", the dim "add to a group
// I'm in ›" and the dimmer "skip". It sends nothing to the engine: the two first presses leave Cowork a note
// (homeSuggest.ts) and switch modes; "skip" takes the card away in this conversation. LifeTalk.tsx places it.
import "./groupoffer.css";
import { setPendingGroup, type Offer } from "./homeSuggest";
import type { AppMode } from "./ModeSwitch";

/** the card itself; onSkip remembers the skip (LifeTalk keeps the store) */
export function GroupOffer({ offer, onMode, onSkip }: { offer: Offer; onMode: (m: AppMode) => void; onSkip: () => void }) {
  const open = () => { setPendingGroup({ k: "new", name: offer.name }); onMode("cowork"); };
  const pick = () => { setPendingGroup({ k: "pick" }); onMode("cowork"); };
  return (
    <div className="gsug" role="group" aria-label="want a project for this?">
      <p className="gsug-q">want a project for this?</p>
      <button className="gsug-go" onClick={open} title={offer.name ? `a new project named ${offer.name}, in cowork` : "a new project, in cowork"}><span>open a new project</span></button>
      <button className="gsug-in" onClick={pick}>add to a project I'm in ›</button>
      <button className="gsug-skip" onClick={onSkip}>skip</button>
    </div>
  );
}
