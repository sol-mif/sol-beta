// Cowork v3, one way around (fr-30, #573): a project's frame, the prototype's (cowork-proto/core.js views.project). On
// top the project's head: its mark, its name, its faces, the one count, and what it is (a press opens Setup / About).
// Under it the room the side picked, scrolling to its end; the agent's mark at the bottom right of every room that has
// no agent or box of its own (Automations and Setup carry their agent, Talk its box). What today's bar pills did now lives in the rooms:
// - Space and Plan holds the GitHub board under the plan ("issues and PRs, mirrored"), the action board's cards with
//   their ⋯ (open in Work, try, review, ready, comment, hand, the team's actions);
// - Talk is v3's Talk over today's project chat;
// - People holds my window, what may interrupt me, my machines and letting someone in (the floor and join);
// - Artifacts holds what the repositories share (product memory, designs, cards), opening in the same pane.
// Loaded only with the switch on (CoworkApp lazy-imports it).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Team, Card } from "../useTeam";
import type { Work } from "../../work/useWork";
import { Mark } from "../../Mark";
import { composing } from "../../ime";
import { ActionBoard } from "../ActionBoard";
import { Shared } from "../Shared";
import { useV3 } from "./front-store";
import { Faces } from "./Front";
import { SpacePlan } from "./SpacePlan";
import { TalkV3 } from "./Talk";
import { People } from "./People";
import { MyWindow } from "./Window";
import { Running } from "./Running";
import { Studio } from "./Studio";
import { Places } from "./Places";
import { Artifacts } from "./Artifacts";
import { Floor } from "./Floor";
import { Join } from "./Join";
import { Setup } from "./Setup";
import { roomName, useOwner, type RoomId } from "./Nav";
import "./people.css";
import "./five.css";
import "./front.css";
import "./nav.css";

const WHAT: Record<RoomId, string> = {
  plan: "Loose things from anyone on the left, dated things on the right. Drag one across the line to plan it.",
  talk: "One general thread, and one beside each thing.",
  people: "Who is on what, and your window: what leaves you, from the inside out.",
  running: "What is red, what runs now, what comes next.",
  automations: "The project's nights and the rest, drawn as steps you can read.",
  places: "Where the files really live. Red means a sign-in stopped.",
  artifacts: "What was made here that stays, versioned.",
  setup: "",
};

export type FrameProps = {
  team: Team; w: Work; project: string; name: string; room: RoomId; id?: string; what?: string; hasRepos: boolean;
  flash: (s: string) => void;
  onRoom: (r: RoomId, id?: string) => void; onFront: () => void;
  /** a line to my agent: a session of this project starts with it */
  onAsk: (text: string) => Promise<boolean>;
  onOpenWork: (c: Card) => void; onNewAction: () => void;
};

export default function Frame(p: FrameProps) {
  const { team, project, room } = p;
  const owner = useOwner(team);
  const { front } = useV3(team.ask);
  const tile = front?.tiles.find((t) => t.project === project);
  const faces = tile?.faces.length ? tile.faces : [...new Set([team.me, ...(team.state?.members ?? [])].filter(Boolean))];
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [project, room]);
  const fit = room === "talk";   // Talk keeps its own box at the bottom: the room fits the stage and its lines scroll
  return (
    <div className="v3f" data-v3-frame={room} data-project={project}>
      <header className="v3f-head">
        <div className="v3f-title">
          <span className="v3f-mark" aria-hidden="true">{(p.name.trim()[0] ?? "?").toUpperCase()}</span>
          <h1>{p.name}</h1>
          <Faces logins={faces} max={6} />
          <span className="v3f-room">{roomName(room, owner)}<i /></span>
        </div>
        <button className="v3f-what" onClick={() => p.onRoom("setup")} title={owner ? "what it is · Setup" : "what it is · About"}>
          {p.what || WHAT[room] || (owner ? "Tell Sol what this project is, in Setup." : "What this project is.")}
        </button>
      </header>
      <div ref={scroller} className={`v3f-body ${fit ? "fit" : "scroll"}`} data-v3-scroll={room}>
        <Room {...p} />
        {!fit && <div className="v3f-end" aria-hidden="true" />}
      </div>
      {room !== "automations" && room !== "setup" && room !== "talk" && <AgentMark name={p.name} onAsk={p.onAsk} />}
    </div>
  );
}

function Room(p: FrameProps): ReactNode {
  const { team, w, project, name, flash } = p;
  const [whose, setWhose] = useState<string>(team.me);
  const people = Array.from(new Set([team.me, ...(team.state?.members ?? [])].filter(Boolean)));
  switch (p.room) {
    case "plan": return (<>
      <div className="v3f-fill"><SpacePlan key={project} team={team} project={project} onFront={p.onFront} /></div>
      {p.hasRepos && (
        <section className="v3f-sec" data-v3-sec="github">
          <div className="v3f-sec-h"><h2>From GitHub</h2><p>Issues and PRs, mirrored: where each stands, and its ⋯ to act on it.</p>
            <button className="wbtn ghost" onClick={() => void team.refresh()} title="read the board again">read again</button></div>
          <ActionBoard team={team} onOpenWork={p.onOpenWork} onNewAction={p.onNewAction} />
        </section>
      )}
    </>);
    case "talk": return <div className="v5 v3f-talk"><TalkV3 team={team} project={project} flash={flash} /></div>;
    case "people": return (<>
      <section className="v3f-sec v3-rooms" data-v3-sec="people"><People team={team} onWindow={(x) => setWhose(x)} /></section>
      <section className="v3f-sec v3-rooms" data-v3-sec="window">
        <div className="v3f-sec-h"><h2>My window</h2><p>What leaves you, from the inside out.</p></div>
        <MyWindow team={team} whose={whose || team.me} people={people} onWhose={setWhose} />
      </section>
      <section className="v3f-sec" data-v3-sec="floor"><Floor key={project} project={project} name={name} me={team.me} /></section>
      <section className="v3f-sec v5" data-v3-sec="join">
        <div className="v3f-sec-h"><h2>Let someone in</h2><p>Joining is not access: each place says it.</p></div>
        <Join project={project} flash={flash} />
      </section>
    </>);
    case "running": return <section className="v3f-sec v3-rooms"><Running team={team} w={w} onPlaces={() => p.onRoom("places")} /></section>;
    case "automations": return <Studio project={project} projectName={name} me={team.me} />;
    case "places": return <Places team={team} project={project} name={name} />;
    case "artifacts": return (<>
      <Artifacts key={project} project={project} name={name} me={team.me} open={p.id} onOpen={(id) => p.onRoom("artifacts", id)} />
      {p.hasRepos && !p.id && (
        <section className="v3f-sec" data-v3-sec="shared">
          <div className="v3f-sec-h"><h2>From the repositories</h2><p>Product memory, designs and cards, signed by who moved them last. One opens at the right.</p></div>
          <Shared team={team} />
        </section>
      )}
    </>);
    case "setup": return <div className="v5 v3f-setup"><Setup me={team.me} project={project} flash={flash} /></div>;
  }
}

/** the agent at hand: its mark at the bottom right; pressed, one line, and Enter starts a session of the project with it */
function AgentMark({ name, onAsk }: { name: string; onAsk: (text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onAsk(text.trim());
    setBusy(false);
    if (ok) { setText(""); setOpen(false); }
  };
  return (
    <div className={`v3f-agent ${open ? "open" : ""}`} data-v3-agent>
      {open && (
        <input ref={box} className="v3f-agent-in" value={text} placeholder={`ask your agent about ${name}`} spellCheck={false} disabled={busy}
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") { ev.stopPropagation(); setOpen(false); }
            else if (ev.key === "Enter" && !composing(ev)) { ev.preventDefault(); void go(); }
          }} />
      )}
      <button className="v3f-agent-mark" onClick={() => (open && text.trim() ? void go() : setOpen((o) => !o))}
        title={open ? "send it: a session of this project starts with it" : "your agent, at hand: one line starts a session here"} aria-expanded={open}>
        <Mark size={22} />
      </button>
    </div>
  );
}
