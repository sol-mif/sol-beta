// What the person sees first when Sol opens (BR1, #1615; mine/look/br1/narrow.html part 1): My day, My work or Both side
// by side. The answer is D.movein.lead (movein/seenFirst.ts), the name the plane reads for its starting arrangement. It is
// asked only here, as the Start screen row in Settings: the move-in and the welcome card no longer ask it, and a new person
// keeps the default start screen (Marco, 2026-11-22 12:47, BR1 rapid; tutorials may offer it at their end later, parked).
// Every colour is the kit's (movein.css). Signed: marcocyl04-ux's agent, BR1 (#1615).
import { useState } from "react";
import { useNext } from "../cv/core.ts";
import { heldByHand, layOutAgain, leadShown, setLead, type Lead } from "./seenFirst.ts";
import { IC } from "./you/icons.ts";
import "./movein.css";

/** the row's icons (Settings, Fit Sol): the screens' one set (you/icons.ts) for day and work; it has no two panes, so
 *  both draws them here in its stroke */
const GLYPH: Record<Lead, string> = { day: IC.notes, work: IC.work, both: '<rect x="3" y="4" width="7.5" height="16" rx="2"/><rect x="13.5" y="4" width="7.5" height="16" rx="2"/>' };

export const CHOICES: { id: Lead; n: string; say: string }[] = [
  { id: "day", n: "My day", say: "The Diary leads: what happened, what’s next, your notes. Folders wait at the bottom as tabs." },
  { id: "work", n: "My work", say: "Folders lead, each with its status. The Diary folds to its spine on top." },
  { id: "both", n: "Both side by side", say: "The Diary on the left and folders beside it, fewer of each at a time." },
];

/** what the canvas opens with, said after a press (Jev: these over "Your canvas opens with …", 0.66 against 0.90) */
const NOW: Record<Lead, string> = { day: "The Diary comes first now.", work: "Your folders come first now.", both: "The Diary and your folders sit side by side now." };

/** the choice as a row of Settings (the Start screen row, under How Sol behaves). Checked is
 *  what the canvas leads with as it stands; a press says what it did, and when the person's own places hold the canvas it
 *  says so and offers to lay it out again, with Back (BR1 first-timer 5, builder F) */
export function LeadRow() {
  const lead = useNext(() => leadShown());
  const [said, setSaid] = useState<{ l: Lead; held: boolean; back?: () => void } | null>(null);
  const pick = (l: Lead) => { setLead(l); setSaid({ l, held: heldByHand() }); };
  return (
    <div className="st-knob" data-p="lead">
      <div className="st-head ld-row">
        <span className="st-ht"><b>What you see first</b><small className="st-who">When Sol opens, most of all in a small window</small></span>
        <span className="st-seg" role="radiogroup" aria-label="What you see first">
          {CHOICES.map((c) => <button key={c.id} type="button" role="radio" aria-checked={lead === c.id} data-lead={c.id} aria-description={c.say} onClick={() => pick(c.id)}><svg className="ld-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPH[c.id] }} />{c.n}</button>)}
        </span>
      </div>
      {said ? <p className="ld-said" role="status" data-lead-said={said.held && !said.back ? "held" : "done"}>
        {said.held && !said.back ? <span>Nothing moved: you arranged these yourself. <button type="button" className="mv-lk" data-lead-again="1" onClick={() => setSaid({ ...said, back: layOutAgain(said.l) })}>Rearrange it</button> to put {CHOICES.find((c) => c.id === said.l)?.n ?? "it"} first.</span>
          : <>{NOW[said.l]}{said.back ? <> <button type="button" className="mv-lk" data-lead-back="1" onClick={() => { said.back!(); setSaid(null); }}>Back</button></> : null}</>}
      </p> : null}
    </div>
  );
}
