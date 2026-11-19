// Cowork v3, slice 8 (fr-30, #561): the switch's one row in Settings, under the me layer. Off by default. Turning it on
// sets cowork.v3 and asks the engine for the import's dry run; when today's groups hold anything new, one card says
// what ("4 items, 2 things, … Import / Not now") and Import writes it into the trail. The old record is never touched.
// SOL_COWORK_V3 on the engine wins: then the row says so and does not move. Drawn only when the shell shows "me".
// The row's words are a person's (#948): what they will see change, nothing of how it is built.
import { useState } from "react";
import { Switch, useShell } from "../../settingsShell";
import { askEngine } from "../askEngine";
import { v3On } from "./flag";   // the switch's one reading
import "./switch.css";

type Report = { total: number; run: boolean; groups: { name: string }[] };
type Answer = { report?: Report; line?: string; error?: string };
type Card = { line: string; groups: number } | { busy: string } | { said: string } | null;


export function SwitchRow({ s, off, onSet }: { s: unknown; off: boolean; onSet: (patch: object) => void }) {
  const sh = useShell();
  const [card, setCard] = useState<Card>(null);
  if (!sh || sh.sel !== "me") return null;
  const on = v3On(s);
  const env = (s as { coworkEnv?: string } | null)?.coworkEnv;

  const dry = async () => {
    setCard({ busy: "looking through your groups…" });
    const a = (await askEngine("team.v3.migrate.dry", {}, 60_000)) as Answer;
    if (a.error || !a.report) return setCard({ said: a.error ?? "the engine did not answer" });
    setCard(a.report.total > 0 ? { line: a.line ?? "", groups: a.report.groups.length } : null);
  };
  const run = async () => {
    setCard({ busy: "bringing it over…" });
    const a = (await askEngine("team.v3.migrate.run", {}, 120_000)) as Answer;
    setCard({ said: a.error ?? `brought over ${a.line ?? ""}; your groups stay as they are` });
  };
  const flip = (v: boolean) => {
    onSet({ cowork: { v3: v } });
    if (v) window.setTimeout(() => void dry(), 300);   // the engine reads the setting on its next message
    else setCard(null);
  };

  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>new Cowork</span>
          <small>{env ? "set on this computer, so it can't be changed here" : "Cowork opens on one page with a tile per project and what each needs from you. The first time, Sol shows what it would bring over from your groups and asks first."}</small></div>
        <Switch on={on} set={flip} disabled={off || !!env} label="new Cowork" />
      </div>
      {card && "line" in card && (
        <div className="v3-card" role="group" aria-label="the import">
          <p><b>{card.line}</b> <span>from {card.groups} group{card.groups === 1 ? "" : "s"}, to bring over. Your groups stay as they are.</span></p>
          <div className="v3-card-do">
            <button className="v3-go" onClick={() => void run()}>Bring it over</button>
            <button className="v3-not" onClick={() => setCard(null)}>Not now</button>
          </div>
        </div>
      )}
      {card && "busy" in card && <p className="hint-line">{card.busy}</p>}
      {card && "said" in card && <p className="hint-line">{card.said}</p>}
      {on && !env && !card && <p className="hint-line"><button className="v3-not" onClick={() => void dry()}>check for anything new to bring over</button></p>}
    </div>
  );
}
