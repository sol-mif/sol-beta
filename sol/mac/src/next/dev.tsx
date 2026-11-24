// The new face's dev page (#1604; sol/mac/next.html): the shell on the fixture, never on an engine. ?scen=<id> loads one
// of the mockup's scenarios (cv/fixture.ts; dev-morning when unsaid), &slot=<name>[&region=<id>][&band=far|middle][&scope=<folder>][&id=<piece>]
// draws that one slot alone, for a slice tried before the others land; &autos puts three invented automations in the
// morning's folders (auto/fixture.ts; &slot=automation does too). It exposes window.CV (D, S, M, load, answer,
// say, …) here only, for the counts (sol/test/e2e/next). Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { createRoot } from "react-dom/client";
import * as CV from "./cv/index.ts";
import { FIXTURE } from "./cv/fixture.ts";
import { LEAD } from "./lead/fixture.ts"; Object.assign(FIXTURE, LEAD);   // slice R7 (#1615): dev-launch, dev-8, dev-80, &r7=
import { FITS } from "./fits/fixture.ts"; import { usePeople } from "./fits/state.ts"; usePeople(FITS);   // slice R8 (#1615): the panel's fits
import { SCOPE } from "./scope/fixture.ts"; Object.assign(FIXTURE, SCOPE);   // slice R9 (#1615): dev-500
import { MOVEIN_SCEN } from "./movein/fixture.ts"; Object.assign(FIXTURE, MOVEIN_SCEN);   // BR1 (#1615): coder (Claude Code and Codex read), empty (the welcome card)
import { Shell } from "./Next.tsx";
import { SLOTS, type SlotName, type SlotProps } from "./slots.ts";
import { withAutos } from "./auto/fixture.ts";
import { withAtwork } from "./atwork/fixture.ts";
import { openAt } from "./atwork/act.ts";

const q = new URLSearchParams(location.search);
import { markChrome } from "./chrome.ts"; markChrome(q.get("chrome"));   // &chrome=mac|none forces the Mac app's window-buttons band on or off, for the stills (#1615)
const scen = q.get("scen") || "dev-morning";
if (!FIXTURE[scen]) console.error(`next: no scenario "${scen}"; the scenarios are ${Object.keys(FIXTURE).join(", ")}`);
const slot = q.get("slot") as SlotName | null;
const aw = q.get("atwork");   // &atwork[=<folder>]: See what's at work opened, on everything or that folder (BR1 item 7, #1615)
if (aw != null) withAtwork();
else if (q.has("autos") || slot === "automation") withAutos();   // BR1 item 2 (#1615)
CV.load(FIXTURE[scen] ? scen : "dev-morning");
const only = slot && SLOTS.includes(slot)
  ? { name: slot, props: { region: q.get("region") ?? undefined, band: (q.get("band") as SlotProps["band"]) ?? undefined, part: q.get("part") ?? undefined, scope: q.get("scope") ?? undefined, id: q.get("id") ?? undefined } }
  : undefined;
// the counts' handle on the store, as the mockup's window.CV: live bindings, read at the moment
(window as unknown as { CV: unknown }).CV = Object.defineProperties({ ...CV, scenarios: Object.keys(FIXTURE) }, {
  D: { get: () => CV.D }, S: { get: () => CV.S }, SCN: { get: () => CV.SCN }, MODE: { get: () => CV.MODE },
});
createRoot(document.getElementById("root")!).render(<Shell only={only} />);
// &settings=<page or place>: Settings opened there, for a check that only loads (BR1, #1615: &settings=privacy)
const st = q.get("settings");
if (st) setTimeout(() => CV.M.stOpen(st), 0);
// &customize=on: Customize on; &customize=<words>: those words said to it ("make api coral"), its bar open (BR1 people, #1615)
const cu = q.get("customize");
if (cu) setTimeout(() => (cu === "on" ? CV.M.cuOn() : CV.M.cuSay(cu)), 300);
// &bar=<where|arrange|add|fit>: that bar card opened, &add=<kind> then its tile pressed (&bar=add&add=automation: the
// automation's maker), for a check that only loads (BR1 item 3, #1615). Presses the real buttons once the bar is drawn.
const card = q.get("bar"), tile = q.get("add");
if (card) {
  const press = (sel: string, then?: () => void, n = 0) => { const b = document.querySelector<HTMLElement>(sel); if (b) { b.click(); then && setTimeout(then, 50); } else if (n < 100) setTimeout(() => press(sel, then, n + 1), 50); };
  press(`[data-bar="${card}"]`, tile ? () => press(`[data-add="${tile}"]`) : undefined);
}
// &folder=<id>: that folder opened (its page: its parts, what it knows, its shelves), for a check that only loads (BR1
// override 4, #1615: &folder=api)
const fo = q.get("folder");
if (fo) setTimeout(() => CV.M.folder_open(fo, q.get("as") === "page" ? "page" : "place"), 0);   // &as=page: up as its page (BR1 2+Q2)
// &open=<piece>: that piece up close (a folder's Diary, "diary:<folder>", made first; with &autos an automation, "auto:<id>"),
// for a check that only loads (BR1 item 1, the slots, #1615)
const op = q.get("open");
if (op) setTimeout(() => { if (CV.isFolderDiary(op)) CV.M.make("diary", "Diary", op.slice(CV.FOLDER_DIARY.length)); CV.M.goto(op); }, 0);
if (aw != null) setTimeout(() => openAt(aw || null), 0);
// &markup=on | <id>:<words>,…: Mark up on, those things marked (BR1, #1615; markup/dev.ts)
import { devMarkUp } from "./markup/dev.ts"; devMarkUp(q.get("markup"));
// &attach=on | open | shot: the chat bar's attach menu, before the bar mounts it (BR1 3c, #1615; markup/dev.ts)
import { devAttach } from "./markup/dev.ts"; devAttach(q.get("attach"));
// &placed=<folder>[:<from>]: that folder placed by Sol and unseen, moved from the other: its dot and caption (BR1 item 4, #1615)
import { devPlaced } from "./plane/placed.ts"; devPlaced(q.get("placed"), (id) => CV.D.regions.find((r) => r.id === id)?.name ?? id);
// &lead=day | work | both: that start screen picked, as Settings › Start screen picks it (BR1 row 29, narrow.html, #1615)
import { setLead as pickLead, LEADS } from "./movein/seenFirst.ts";
const ld = q.get("lead") as (typeof LEADS)[number] | null;
if (ld && LEADS.includes(ld)) setTimeout(() => pickLead(ld), 0);
// &learn=1: the move-in's end card (learn.html part 1); &learn=lead: the start-screen question after it; &walk=<id>[:<step>]:
// that walk playing at that step (part 2); &help=1 | <words>: Help open as a tab, those words asked there; &ask=<words>:
// those words typed into the canvas bar, its one line answering (part 3). BR1 (#1615), builder T-face
import { endCard, notNow, walkStart } from "./learn/learn-state.ts";
import { helpOpen, helpAsk, barAsk } from "./learn/help-state.ts";
import type { WalkId } from "./learn/walks.ts";
const SETTLED = 300;   // the bar and the canvas drawn
const lr = q.get("learn"), wk = q.get("walk"), hp = q.get("help"), ak = q.get("ask");
if (lr) setTimeout(() => { endCard(true); if (lr === "lead") notNow(); }, 0);
if (wk) setTimeout(() => { const [w, s] = wk.split(":"); walkStart(w as WalkId, Number(s) || 0, "help"); }, SETTLED);
if (hp) setTimeout(() => { helpOpen(); if (hp !== "1") helpAsk(hp); }, 0);
if (ak) setTimeout(() => barAsk(ak), SETTLED);
