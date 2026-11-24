import { cleanHome } from "../home/flag";
import { stageWhole } from "../flag";
import { useRef } from "react";
import { Message } from "../Message";
import type { Item, Work } from "./useWork";
import { WorkSteps, type TalkView } from "./WorkSteps";
import { PermCard, Proposal, ReviewCard, SessionCard, WrapBox } from "./Cards";
import { Elapsed } from "./Elapsed";
import { MeRow } from "./MeRow";
import { TonightCard } from "./Tonight";
import { HandInCard } from "./HandIn";
import { CheckpointCard } from "./Checkpoint";
import { UsedMark } from "../cowork/Used";   // the used-Cowork mark (#431)
import { engineSaid } from "../one/engineSaid";
import { splitContext } from "./folderContext";   // the folder context before his first words is one quiet line (BR1 gate 3)

export { toolLine } from "./WorkSteps";

// A Work session's items, drawn. Marco's messages and Claude's text are the same bubbles as Home; a run of tool
// calls and thinking between two messages is one card of steps (WorkSteps); questions for Marco are cards in the
// talk; the task list sits under the latest message; the next-step box ends a turn; quiet lines say what happened
// to the talk itself (summarised, stopped, failed).
const STARTED = /started ([0-9a-f-]{36})/;
// a file link [name](path:12) reads as an unknown scheme to the shared sanitizer, so it becomes path#L12 first
const fileLinks = (t: string) => t.replace(/\]\(([^)\s:]+):(\d+)\)/g, (_all, p: string, n: string) => `](${p}#L${n})`);

// what the person pointed at on the stage as they said it (#698: the engine splits it off their words, items.ts splitAsk)
const onOf = (it: Item): string[] => { const on = (it as Item & { on?: unknown }).on; return Array.isArray(on) ? on.map(String) : []; };

export function WorkTalk({ items, busy, w, view, onFresh, onLink, onBox }: {
  items: Item[]; busy: boolean; w: Work; view: TalkView; onFresh: (text?: string) => void; onLink: (ev: React.MouseEvent) => void; onBox?: (text: string) => void;
}) {
  // an allowed tool needs no line of its own: its step's check says it ran (a no, an answer, a plan stay as lines)
  const top = items.filter((i) => !i.parent && !i.quiet && i.kind !== "plan" && i.kind !== "suggest" &&
    !(i.kind === "perm" && (i.state === "allow" || i.state === "always") && i.tool !== "ExitPlanMode") &&
    !(i.kind === "perm" && i.state === "ask" && cleanHome()));   // the clean Home's bar holds the question (#647)
  // "old" is loaded, not arriving: what was already in the talk when this session's items first drew. Before (2026-10-25,
  // SMOOTH.md) it meant "not busy", so opening a busy session played the arrival of every historic row at once: a
  // spring and two forced layouts per row, ~300 layouts and a second before the talk stood still.
  const first = useRef<{ id: string | null | undefined; ids: Set<string> | null }>({ id: undefined, ids: null });
  if (first.current.id !== w.live) first.current = { id: w.live, ids: null };
  if (!first.current.ids && items.length) first.current.ids = new Set(items.map((i) => i.id));
  const was = (id: string) => !busy || !!first.current.ids?.has(id);
  const out: React.ReactNode[] = [];
  const parent = w.live ? w.sessions.find((s) => s.id === w.live)?.parent : undefined;
  if (parent) out.push(<SessionCard key="from" id={parent} w={w} lead="started from" />);
  const last = top.length - 1;
  const lastWrap = top.map((x) => x.kind).lastIndexOf("wrap");
  const drawn = new Set<string>();   // review rounds already drawn
  for (let i = 0; i <= last; i++) {
    const it = top[i];
    // the interrupt, clean (Marco 2026-11-08: "really jank"): the harness's own lines are not the talk. Its "[Request
    // interrupted…]" message is not his; its diagnostic line is nobody's; the engine's "stopped" note is drawn once,
    // and not at all when his next message is what stopped the turn (the step row already says "stopped by you").
    const txt = String(it.text ?? "");
    if (it.kind === "me" && /^\[Request interrupted/.test(txt)) continue;
    if (/^\[ede_diagnostic\]/.test(txt)) continue;
    if (it.kind === "note" && /^stopped\b/.test(txt)) {
      let j = i + 1;
      while (j <= last && top[j].kind === "note" && /^stopped\b/.test(String(top[j].text ?? ""))) j++;
      const next = top[j];
      if (next && (next.kind === "me" || /^\[Request interrupted/.test(String(next.text ?? "")))) { i = j - 1; continue; }
      if (j > i + 1) i = j - 1;
    }
    if (it.kind === "tool" || it.kind === "think") {
      const start = i;
      while (i <= last && (top[i].kind === "tool" || top[i].kind === "think")) i++;
      const run = top.slice(start, i);
      i--;
      const old = was(top[start].id);
      out.push(<WorkSteps key={`s${top[start].id}`} items={run} all={items} view={view} old={old} />);
      // a session this run started (or handed the task to) gets its own row card after the steps; a proposal its card
      for (const t of run) {
        if (t.kind !== "tool" || !/__(start_session|hand_off)$/.test(String(t.name))) continue;
        const m = STARTED.exec(String(t.out ?? ""));
        if (m) out.push(<SessionCard key={`ss${t.id}`} id={m[1]} w={w} lead={/hand_off$/.test(String(t.name)) ? "handed to" : "started"} />);
        else if (t.input?.initiation === "proposal" && t.ok !== false) out.push(<Proposal key={`pp${t.id}`} it={t} w={w} old={old} />);
      }
    } else if (it.kind === "me" && engineSaid(splitContext(txt).rest)) {
      // what the engine tells an orchestration session is not his (one/engineSaid.ts): one quiet line, its words on hover
      out.push(<p key={it.id} data-item={it.id} className="wline" title={txt.slice(0, 1200)}>{engineSaid(splitContext(txt).rest)}</p>);
    } else if (it.kind === "me") {
      if (it.dropped) continue;   // queued, then forgotten before it was read (#51)
      const { context, rest } = splitContext(txt);
      if (context) out.push(<p key={`${it.id}:ctx`} className="wline" title={context.slice(0, 1200)}>folder context</p>);
      const text = rest + (it.images ? `\n[${it.images} image${it.images > 1 ? "s" : ""}]` : "");
      if (!text.trim() && !it.files?.length) continue;
      out.push(
        <div key={it.id} data-item={it.id} className={`wme ${it.queued ? "queued" : ""}`}>
          {onOf(it).length > 0 && <p className="wsent-on">on {onOf(it).join(" · ")}</p>}
          <Message m={{ who: "me", text, files: it.files, old: was(it.id) }} live={false} />
          <MeRow it={it} w={w} busy={busy} />
        </div>,
      );
    } else if (it.kind === "you") out.push(
      <div key={it.id} data-item={it.id} className="wyou">
        <Message m={{ who: "you", text: fileLinks(String(it.text ?? "")), old: was(it.id) && !it.live }} live={busy && i === last && !!it.live} />
        <UsedMark used={it.usedCowork} />
        {!busy && it.uuid && w.live && <button className="wforkhere" onClick={() => w.fork(w.live!, String(it.uuid))} title="a new session with the talk up to here">fork from here</button>}
      </div>,
    );
    else if (it.kind === "review") {   // Codex's review: its head and remarks, one card per round, where the round began
      if (drawn.has(it.round)) continue;
      drawn.add(it.round);
      out.push(<ReviewCard key={`r${it.round}`} items={top.filter((x) => x.kind === "review" && x.round === it.round)} w={w} onBox={onBox} old={was(it.id)} />);
    }
    else if (it.kind === "tonight") out.push(<div key={it.id} data-item={it.id}><TonightCard it={it} w={w} /></div>);   // the review session's card (#416)
    else if (it.kind === "handin") out.push(<div key={it.id} data-item={it.id}><HandInCard it={it} w={w} /></div>);   // the hand-in card (#476)
    else if (it.kind === "checkpoint") out.push(<div key={it.id} data-item={it.id}><CheckpointCard it={it} w={w} /></div>);   // Scoped and Approve (#482)
    else if (it.kind === "perm") out.push(<div key={it.id} data-item={it.id}><PermCard it={it} w={w} /></div>);
    else if (it.kind === "wrap") out.push(<WrapBox key={it.id} it={it} w={w} last={i === lastWrap && !busy && !top.slice(lastWrap + 1).some((x) => x.kind === "me")} onFresh={onFresh} old={was(it.id)} />);
    else if (it.kind === "compact" && stageWhole()) {
      // the summary as a good thing (Marco 2026-11-12: "it feels like compaction is negative… make it feel cool"): room
      // was made and nothing was lost; the count stays for whoever wants it
      const k = /\(([^)]*tokens?)\)/.exec(String(it.text ?? ""))?.[1];
      out.push(<p key={it.id} data-item={it.id} className="wpack" title={`Sol folded the earlier talk into a summary so there is room to go on. ${String(it.text ?? "")}`}><span className="wpack-in"><i aria-hidden /><b>Room made</b><span>{k ? `${k.replace(/ tokens?/, "")} freed · ` : ""}nothing is lost</span></span></p>);
    }
    else out.push(<p key={it.id} data-item={it.id} className={`wline ${it.kind}`}>{String(it.text ?? "")}</p>);
  }
  if (busy && top[last]?.kind === "me" && !top[last].queued) out.push(<div key="wait" className="msg you md live"><p className="wwait"><Elapsed at={top[last].at} /></p></div>);
  return <div className="wtalk" onClickCapture={onLink}>{out}</div>;
}
