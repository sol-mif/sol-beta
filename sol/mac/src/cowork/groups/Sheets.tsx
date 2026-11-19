// The sheets over a table (#1537; a4, a8, a11 of docs/cowork-ui-2026-11-18), ported as drawn. The first time at a
// table: one card, one agree (a4). My AI at this table, opened: runs on, is, and it, reaches (a8). Leave: four lines
// of what happens, then one press (a11). The data is what the engine has today: the machines it knows, the seat
// (claude or codex), how far it goes (the permission mode), what is connected here; nothing per table yet.
import { Coin, Gl } from "./Coin";
import { Jelly } from "./Jelly";
import { LEVELS, type Level } from "./view";

export type MyAi = { machines: string[]; machine: string; ai: "claude" | "codex"; level: Level; reaches: { github: boolean; talk: boolean; drive: boolean } };
type Pick = { onAi: (ai: "claude" | "codex") => void; onLevel: (l: Level) => void };

const Seg = ({ words, on, pick, act }: { words: readonly string[]; on: string; pick?: (w: string) => void; act: string }) => (
  <div className="gh-seg" role="radiogroup" data-act={act}>
    {words.map((w) => <button key={w} type="button" role="radio" aria-checked={w === on} className={`gh-pill${w === on ? " on" : ""}`} onClick={pick ? () => pick(w) : undefined} disabled={!pick}>{w}</button>)}
  </div>
);

export function Consent({ me, table, others, my, onLevel, onAgree, onNotYet }: { me: string; table: string; others: string[]; my: MyAi; onLevel: Pick["onLevel"]; onAgree: () => void; onNotYet: () => void }) {
  const who = others.length === 0 ? "whoever sits down" : others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
  return (
    <div className="gh-lifted gh-sheet" data-sheet="consent" role="dialog" aria-label={`first time at ${table}`}>
      <Jelly login={me} me={me} s={88} /><span className="gh-stk r3">first time here</span>
      <div className="gh-disp d28" style={{ textAlign: "center" }}>at {table}, your ai is</div>
      <div className="gh-line"><span className="gh-pill tint">{my.machine}</span><span className="gh-pill tint">{my.ai}</span></div>
      <div className="gh-col g8" style={{ alignItems: "center" }}><span className="gh-dim">and it</span><Seg words={LEVELS} on={my.level} pick={(w) => onLevel(w as Level)} act="level" /></div>
      <div className="gh-dim" style={{ textAlign: "center", maxWidth: 380 }}>{who} see this line at your seat. one agree turns the table on. change it from the table any time.</div>
      <div className="gh-row g8" style={{ marginTop: 4 }}><button type="button" className="gh-pill ctl gh-lg" data-act="agree" onClick={onAgree}>agree</button><button type="button" className="gh-pill gh-lg" data-act="not-yet" onClick={onNotYet}>not yet</button></div>
    </div>
  );
}

export function MyAiSheet({ me, table, others, my, onAi, onLevel, onDone }: { me: string; table: string; others: string[]; my: MyAi; onDone: () => void } & Pick) {
  const who = others.length === 0 ? "whoever sits down" : others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
  const reach = (on: boolean, w: string) => <span key={w} className={`gh-pill${on ? " on" : " ctl"}`} title={on ? `${w}: connected on this mac` : `${w}: not connected on this mac (Settings › me)`}>{w}</span>;
  return (
    <div className="gh-lifted gh-sheet mine" data-sheet="myai" role="dialog" aria-label={`my ai at ${table}`}>
      <Jelly login={me} me={me} s={88} /><span className="gh-stk r3">every table, for now</span>
      <div className="gh-disp d28" style={{ textAlign: "center" }}>my ai at {table}</div>
      <div className="gh-set"><span className="gh-dim">runs on</span><Seg words={my.machines.length ? my.machines : [my.machine]} on={my.machine} act="machine" /></div>
      <div className="gh-set"><span className="gh-dim">is</span><Seg words={["claude", "codex"]} on={my.ai} pick={(w) => onAi(w as "claude" | "codex")} act="ai" /></div>
      <div className="gh-set"><span className="gh-dim">and it</span><Seg words={LEVELS} on={my.level} pick={(w) => onLevel(w as Level)} act="level" /></div>
      <div className="gh-set"><span className="gh-dim">reaches</span><div className="gh-row g8">{reach(my.reaches.github, "github")}{reach(my.reaches.talk, "the talk")}{reach(my.reaches.drive, "drive")}</div></div>
      <div className="gh-dim" style={{ textAlign: "center", maxWidth: 400 }}>{who} see the first three lines at your seat. not what it reaches. today these are this sol's settings at every table, not {table}'s alone.</div>
      <div className="gh-row g8"><button type="button" className="gh-pill ctl gh-lg" data-act="done" onClick={onDone}>done</button></div>
    </div>
  );
}

export function LeaveSheet({ me, table, others, onLeave, onStay, busy }: { me: string; table: string; others: string[]; onLeave: () => void; onStay: () => void; busy?: string }) {
  const who = others.length === 0 ? "nobody is here to see it" : `${others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`} see you left`;
  return (
    <div className="gh-lifted gh-sheet leave" data-sheet="leave" role="dialog" aria-label={`leave ${table}?`}>
      <Jelly login={me} me={me} s={88} look={-4} />
      <div className="gh-disp d28" style={{ textAlign: "center" }}>leave {table}?</div>
      <div className="gh-what g12">
        <div className="gh-row g12"><Coin state="idle" size={22} /><span>your seat goes empty. {who}.</span></div>
        <div className="gh-row g12"><Coin state="idle" size={22} /><span>your ai stops here and lets go of this table.</span></div>
        <div className="gh-row g12"><span className="gh-coin s22 g"><Gl d="tick" /></span><span>what you handed over stays with the table.</span></div>
        <div className="gh-row g12"><span className="gh-coin s22 g"><Gl d="tick" /></span><span>the code still works. you can sit back down any time.</span></div>
      </div>
      {busy && <div className="gh-dim">{busy}</div>}
      <div className="gh-row g8" style={{ marginTop: 4 }}><button type="button" className="gh-pill ctl gh-lg" data-act="leave" onClick={onLeave} disabled={!!busy}>leave</button><button type="button" className="gh-pill gh-lg" data-act="stay" onClick={onStay}>stay</button></div>
    </div>
  );
}
