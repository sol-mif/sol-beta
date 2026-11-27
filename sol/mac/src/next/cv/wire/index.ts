// The wires (#1604, docs/port/slices.md "Fixture or live"): in a real Sol the store starts empty and each slice's wire
// fills D from the engine's messages; the fixture is never loaded there. One file per slice, so no two builders touch
// one file; this one only gathers them. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import type { Engine } from "./types.ts";
import { attach as plane } from "./plane.ts";
import { attach as needs } from "./needs.ts";
import { attach as near } from "./near.ts";
import { attach as life } from "./life.ts";
import { attach as ais } from "./ais.ts";
import { attach as settings } from "./settings.ts";
import { attach as engine } from "./engine.ts";
import { attach as people } from "./people.ts";
import { attach as movein } from "./movein.ts";
import { attach as pieces } from "./pieces.ts";
import { attach as seats } from "./seats.ts";
import { attach as lead } from "./lead.ts";   // slice R7 (#1615)

export type { Engine };
const WIRES = { plane, needs, near, life, ais, settings, engine, people, movein, pieces, lead, seats };
import { attach as fits } from "./fits.ts"; Object.assign(WIRES, { fits });   // slice R8 (#1615)
import { attach as workspace } from "./workspace.ts"; Object.assign(WIRES, { workspace });   // BR1 carry (#1615): Workspace changes
import { attach as tabs } from "./tabs.ts"; Object.assign(WIRES, { tabs });   // BR1 tabs (#1615): the row on top of the canvas
import { attach as keeps } from "./keeps.ts"; Object.assign(WIRES, { keeps });   // #1879 step 3: last present, seen, pinned, each folder's last use
import { attach as canvas } from "./canvas.ts"; Object.assign(WIRES, { canvas });   // BR1 B (#1615): the bar is always agentic
import { attach as stable } from "./stable.ts"; Object.assign(WIRES, { stable });   // BR1 lane G (#1615): a new version, on the frame's line

/** attach every slice's wire to the engine (Next.tsx, live only); the answer takes them all off again */
export function attach(e: Engine): () => void {
  const offs: (() => void)[] = [];
  for (const [name, w] of Object.entries(WIRES)) {
    try { const off = w(e); if (typeof off === "function") offs.push(off); } catch (err) { console.error(`next: the ${name} wire failed`, err); }
  }
  return () => { for (const f of offs) { try { f(); } catch { /* one wire's trouble is never another's */ } } };
}
import { attach as scope } from "./scope.ts"; Object.assign(WIRES, { scope });   // slice R9 (#1615)
import { attach as diary } from "./diary.ts"; Object.assign(WIRES, { diary });   // BR1, the Diary (#1615)
import { attach as work } from "./work.ts"; Object.assign(WIRES, { work });   // BR1 C: work plans and automations (#1615)
import { attach as notes } from "./notes.ts"; Object.assign(WIRES, { notes });   // BR1 C: notes and sessions inside a folder (#1615)
import { attach as you } from "./you.ts"; Object.assign(WIRES, { you });   // BR1, How Sol sees you (#1615): the screens on a first run
import { attach as social } from "./social.ts"; Object.assign(WIRES, { social });   // BR1 people: Social on #1072's model (#1615)
import { attach as fitmode } from "./fitmode.ts"; Object.assign(WIRES, { fitmode });   // BR1 people: fit mode's tries and keeps (#1615)
import { attach as setup } from "./setup.ts"; Object.assign(WIRES, { setup });   // BR1 people item 2: a folder's setup and its sorts (#1615)
import { attach as because } from "./because.ts"; Object.assign(WIRES, { because });   // BR1, the because (#1615): next.known, fact.fix, source
import { attach as account } from "./account.ts"; Object.assign(WIRES, { account });   // BR1, Settings' Account row (#1615): team.cloud.me
import { attach as raises } from "./raises.ts"; Object.assign(WIRES, { raises });   // BR1 quiet canvas (#1615): next.raises, each ask's judged raise and the floor's meter
import { attach as look } from "./look.ts"; Object.assign(WIRES, { look });   // BR1, a folder's parts (#1615): P's next.folder.look
import { attach as atwork } from "./atwork.ts"; Object.assign(WIRES, { atwork });   // BR1 item 7, See what's at work (#1615): work.run's helpers and held, next.atwork
import { attach as shelf } from "../../shelf/model.ts"; Object.assign(WIRES, { shelf });   // BR1 item 7, the shelf (#1615): next.shelf, .take
import { attach as placed } from "./placed.ts"; Object.assign(WIRES, { placed });   // BR1 item 4 (#1615): next.placed, the canvas's dot on a folder Sol placed
import { attach as fix } from "./fix.ts"; Object.assign(WIRES, { fix });   // BR1 item 5 (#1615): a folder Sol placed, moved by hand, is next.known.fix
import { attach as raise } from "./raise.ts"; Object.assign(WIRES, { raise });   // BR1 quiet canvas (#1615): a raise's outcome is next.known.fix
import { attach as tidy } from "./tidy.ts"; Object.assign(WIRES, { tidy });   // BR1 tidy (#1615): the sort after the move-in, next.tidy.*
