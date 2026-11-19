// Agents mode's dev page (#1327): the flow drawn on an invented home (fixture.ts) with an engine in memory, so every
// screen can be seen and pressed through with no engine running. Dev only, like world.html: not in the face's build
// inputs; nothing reaches a real engine. The stills open it at a place:
//   ?at=home                 Home: the place where Sol noticed a job, its stickies on Home's own board; on the one
//                            ticked done, the job's jelly peeks "again?"; under it, who works here (the doer jellies)
//   ?at=offer[&id=<offer>]   the offer (no id: the first open one)     ?at=floor (default)   the floor
//   ?at=join[&id=<ask>]      a join ask: one agent for two places? (no id: the first open one; ?who=parent has one)
//   ?at=desk[&id=<agent>]    an agent's desk (no id: the first agent)  ?at=changes · ?at=make
//   ?who=baker|nurse|translator|parent|student|empty|many: which invented home (fixture.ts HOMES), the baker by default
//   the calm pass's states, by name (?state=<name> or #<name>), each a home and a place; any other parameter wins:
//     #first-open  "Meet your agents": the cast walking in, the keeper sentence with undo, one button to the top ask
//     #empty       an empty Sol: "None yet: they appear when your work repeats" and a one-line field
//     #front       a floor with the sign-in ahead, "Then" three asks, "1 more" (the student: five need her)
//     #calm        nothing needs you: the "Today" day line at 13:30, past faded, the "now" mark (the translator)
//     #many        sixteen agents: shelves by place, the one with a blocked agent open
//     #desk        an agent with two places: "X only" on a step of one place, the dashed tile for a sibling
//     #join        one agent or two: the shared steps in one shade, the place-only steps in another
//     #steps       two steps of one place asked about ("One agent for these two steps?") with no Jev: the floor's
//                  front ask and its one line about Jev (the translator at 13:30); #steps-ask: that ask's own screen
//     #shelf       eleven agents on one shelf, one blocked: the blocked one first, seven cards, "4 more"
//     #desk-table  its work keeps a markdown table: drawn as a table, rows that name nothing counted in one quiet line
//     #changes     what Sol changed: one line per cause, its changes folded under it
//     #regroup     an older Sol grouped the home one agent per rule: "Sol groups agents better now: N → M", Regroup
//                  or Keep as is (the student)
//   ?now=HH:MM               fix the time of day (the "Today" line reads it)
//   &seen=1                  what the view sent as agents.seen, in a hidden <pre data-seen> (read with --dump-dom)
//   ?press=fix|change: the desk with a line fixed once (it asks "Always like this?") or a change rehearsed (before/after)
//   ?at=looking              the floor while Sol is still looking (the engine's late look): past 3 s the floor's jelly
//                            in the side works; &for=<ms> ends the look then (default: never, for a still)
//   ?at=first                the first open: the first grouping still running, no agents yet, the floor's jelly at
//                            work; &for=<ms> ends it then (default: never, for a still)
//   ?at=meet                 the first visit to the floor (the calm pass): "Meet your agents", the sign-in pauses Sol
//                            made in one sentence with one undo. ?who=many: every home in one, past seven (shelves)
import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Frame, Head, useFrameVars } from "../kit/Chrome";
import { AgentsView } from "./AgentsView";
import { Again, AgentTags, useAgentsForHome } from "./HomeTags";
import { HOMES, HOME_DIR, fakeEngine, fixtureOf, type Who } from "./fixture";
import { AGENT_AT, OPEN_AGENT, openAgent, setAgentsOn } from "./flag";
import { useAgents } from "./useAgents";
import { FolderStickies } from "../home/folders/FolderStickies";
import { setPaper } from "../creature/ring";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../home/folders/folders.css";

const q = new URLSearchParams(location.search);
// the calm pass's states by name (?state=<name> or #<name>); any other parameter still wins over what a state sets
const STATES: Record<string, { who: Who; at: string; id?: string; now?: string; steps?: true; shelf?: true; regroup?: true }> = {
  "first-open": { who: "baker", at: "meet" },
  empty: { who: "empty", at: "floor" },
  front: { who: "student", at: "floor" },
  calm: { who: "translator", at: "floor", now: "13:30" },
  many: { who: "many", at: "floor" },
  desk: { who: "translator", at: "desk", id: "friday-update", now: "13:30" },
  join: { who: "parent", at: "join" },
  steps: { who: "translator", at: "floor", now: "13:30", steps: true },
  "steps-ask": { who: "translator", at: "join", id: "j-steps", now: "13:30", steps: true },
  shelf: { who: "many", at: "floor", shelf: true },
  "desk-table": { who: "translator", at: "desk", id: "client-mail", now: "13:30" },
  changes: { who: "many", at: "changes" },
  regroup: { who: "translator", at: "floor", now: "13:30", regroup: true },
};
const state = STATES[q.get("state") ?? location.hash.slice(1)];
const who = (HOMES as string[]).includes(q.get("who") ?? "") ? (q.get("who") as Who) : state?.who ?? HOMES[0];
const at0 = q.get("at") ?? state?.at ?? "floor";
// the clock: ?now=HH:MM fixes the time of day (the Today line reads it); a state may fix it too
const hhmm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(q.get("now") ?? state?.now ?? "");
const nowMs = hhmm ? new Date().setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0) : undefined;
const clock = () => nowMs ?? Date.now();
const steps = state?.steps ?? q.get("steps") === "1";
const shelf = state?.shelf ?? q.get("shelf") === "1";
const regroup = state?.regroup ?? q.get("regroup") === "1";
const engine = fakeEngine(clock, who, { ...(at0 === "looking" ? { looking: Number(q.get("for")) || Infinity } : at0 === "first" ? { first: Number(q.get("for")) || Infinity } : at0 === "meet" ? { meet: true } : {}), steps, shelf, regroup });
const fx = fixtureOf(clock(), who, { steps, shelf });
const at = at0 === "looking" || at0 === "first" || at0 === "meet" ? "floor" : at0;
const id = q.get("id") ?? state?.id ?? (at === "offer" ? fx.offers[0]?.id : at === "join" ? fx.list.joins?.[0]?.id : fx.list.agents.find((a) => (a.places?.length ?? 0) > 1)?.id ?? fx.list.agents[0]?.id);
sessionStorage.setItem(AGENT_AT, JSON.stringify((at === "desk" || at === "offer" || at === "join") && id ? { k: at, id } : at === "changes" || at === "make" ? { k: at } : { k: "floor" }));
localStorage.setItem("sol.side.agents", q.get("side") === "0" ? "0" : "1");
setAgentsOn(true);
// Home on its own paper, as App.tsx sets it
if (at === "home") { document.documentElement.dataset.mode = "home"; setPaper("home"); }
// a press already made, for the stills: a line of its last run fixed once (it asks "Always like this?"), or a change said
const press = q.get("press");
const desk0 = fx.desks[id ?? ""]?.work[0];
if (press === "fix" && id && desk0) engine.send({ type: "agents.fix", id, place: desk0.place, before: desk0.lines[desk0.lines.length - 1], after: "Best wishes", rid: "dev-fix" });
const say0 = press === "change" ? "add the hours as a total at the end" : undefined;

/** Home, as far as the flow needs it: the place where Sol noticed a job, on Home's own sticky board */
function HomePlace() {
  const offer = fx.offers[0];
  const place = offer?.on?.place.split("#")[0] ?? Object.keys(fx.stickies)[0];
  const name = place ? fx.stickies[place]?.name ?? place : "";
  const { ask } = useAgents(engine);   // its asker lives with its effect (StrictMode mounts twice)
  const { agents, offers } = useAgentsForHome(engine);
  const [went, setWent] = useState<string | null>(null);
  useEffect(() => { const f = () => setWent(sessionStorage.getItem(AGENT_AT)); window.addEventListener(OPEN_AGENT, f); return () => window.removeEventListener(OPEN_AGENT, f); }, []);
  const doers = [...new Set((agents ?? []).flatMap((a) => a.rules.map((r) => r.folder)))][0];
  return (
    <Frame className="ev" head={<Head title="home" where={name || "an empty home"} />}>
      <div className="fh fh-main" data-place="talk"><div className="fh-view">
        {!place ? <p className="fh-note">Nothing here yet: no stickies, no agents. Type a sticky in a folder and press it.</p> : <>
          <div className="fh-lbl">{name} · yours · press one and the folder's agent does it</div>
          <FolderStickies ask={(o, ms) => ask(o as { type: string }, ms)} sub={(f) => engine.subscribe(f)} folder={`${HOME_DIR}/${place}`} name={name} dry={false} say={() => {}}
            doer={<AgentTags agents={agents} folder={place} />} peek={(t) => <Again offers={offers} place={place} sticky={t} />} />
        </>}
        {doers && <><div className="fh-lbl">{doers} · today's runs</div><AgentTags agents={agents} folder={doers} /></>}
        {went && <p className="fh-note">The window turns to Agents: {went}</p>}
      </div></div>
    </Frame>
  );
}

// ?seen=1: what the view sent as agents.seen (Agents in use: the engine counts it), written under the page for a check
function Seen() {
  const [s, setS] = useState("");
  useEffect(() => { const t = window.setInterval(() => setS(JSON.stringify((globalThis as { agentsSeen?: object[] }).agentsSeen ?? [])), 500); return () => window.clearInterval(t); }, []);
  return <pre data-seen hidden>{s}</pre>;
}

// ?at=onehome: the real Home (onboard/OneHome) on this home, Agents inside it (#1327, 2026-11-18): its side's agents place,
// the doers' jelly on the folders and stickies; &open=<folder> opens a folder, &open=agents the agents place,
// &open=desk:<agent id> that agent's desk, &open=made the made row (#1490); &made=<its title> then opens that made thing
const OneHome = lazy(() => import("../onboard/OneHome").then((m) => ({ default: m.OneHome })));
const wire = { ...engine, up: true } as unknown as Parameters<typeof import("../onboard/OneHome").OneHome>[0]["e"];
function RealHome() {
  useEffect(() => {
    const open = q.get("open");
    if (!open) return;
    if (open.startsWith("desk:")) { const t = window.setTimeout(() => openAgent(open.slice(5)), 600); return () => window.clearTimeout(t); }
    // a place opens from the side, so a sub-place (clubs/chess) opens as well as a top one
    const t = window.setTimeout(() => (document.querySelector<HTMLElement>(open === "agents" ? "[data-side-agents]" : open === "made" ? "[data-side-made]" : `[data-side-area="${open}"]`))?.click(), 600);
    return () => window.clearTimeout(t);
  }, []);
  // &made=<a made thing's title>: opened (in a place, the made row, or Today's waiting ones, #1497); &yes=1: its act
  // pressed in the sheet (held a moment for undo, then the step is done)
  useEffect(() => {
    const made = q.get("made");
    if (!made) return;
    const t = window.setTimeout(() => document.querySelector<HTMLElement>(`[data-made="${CSS.escape(made)}"]`)?.click(), 1400);
    const t2 = q.get("yes") ? window.setTimeout(() => document.querySelector<HTMLElement>("[data-made-yes]")?.click(), 2200) : 0;
    return () => { window.clearTimeout(t); window.clearTimeout(t2); };
  }, []);
  // &put=<words>: typed anywhere once the page stands (the blank sticky takes the keys, #1483), then Enter
  useEffect(() => {
    const put = q.get("put");
    if (!put) return;
    const t = window.setTimeout(() => {
      for (const k of put) window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      window.setTimeout(() => document.querySelector("[data-blank-sticky] input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), 300);
    }, 1400);
    return () => window.clearTimeout(t);
  }, []);
  // &carry=<a sticky's title>: pressed and carried (#1493), the tray up; &over=done|drop|today held over that zone;
  // &let=1 let go there (the act and its undo line)
  useEffect(() => {
    const carry = q.get("carry");
    if (!carry) return;
    const pe = (type: string, x: number, y: number) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true });
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-sticky="${CSS.escape(carry)}"] .t, [data-today-slip="${CSS.escape(carry)}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect(), x = r.left + 30, y = r.top + 14;
      el.dispatchEvent(pe("pointerdown", x, y));
      window.dispatchEvent(pe("pointermove", x + 60, y + 90));
      window.setTimeout(() => {
        const z = document.querySelector<HTMLElement>(`[data-carry-zone="${q.get("over") ?? ""}"]`)?.getBoundingClientRect();
        const [zx, zy] = z ? [z.left + z.width / 2, z.top + z.height / 2] : [x + 60, y + 90];
        window.dispatchEvent(pe("pointermove", zx, zy));
        if (q.get("let") === "1") window.setTimeout(() => window.dispatchEvent(pe("pointerup", zx, zy)), 200);
      }, 200);
    }, 1800);
    return () => window.clearTimeout(t);
  }, []);
  return <Suspense fallback={null}><OneHome e={wire} /></Suspense>;
}

function Page() {
  useFrameVars(false);
  return <div style={{ height: "100vh" }}>{at === "onehome" ? <RealHome /> : at === "home" ? <HomePlace /> : <AgentsView e={engine} now={nowMs} say0={say0} />}{q.get("seen") === "1" && <Seen />}</div>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
