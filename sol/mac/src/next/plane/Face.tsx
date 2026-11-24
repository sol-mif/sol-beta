// owned by slice 1 (Plane), docs/port/slices.md
// A piece's face on the plane (#1615; the mockup's merge/views/face.js and shell.js pieceCard, foldLine): at Middle a
// full face, at most eight of them, the rest one line each (the fold). Kinds: a session (a split job too: its parts are
// rows inside it, never pieces of their own), side copies, a page or a list, and round 1's card for the rest. What a run
// is in words is runs.js's (stateOf, sentence). Hooks kept for the counts: a session keeps round 1's data-face box word
// for word (count 9 reads it), with data-terminal and data-copy (count 5); an ask sits in its own data-front data-ask.
// Pause, resume and stop (#15) are pressed here, as data-act, so voice and keys reach the same moves.
// Signed: marcocyl04-ux's agent, the port's slice 1 (#1615).
import type { Ask, Piece } from "../cv/index.ts";
import { asksOn, isFolderDiary, open, regionOf } from "../cv/index.ts";
import { Slot } from "../slots.ts";   // BR1 slots (#1615): an automation's piece and a folder's Diary are their slices'
import { PREFIX as AUTO } from "../auto/model.ts";
import { titleOf } from "./layout.ts";   // a session by its task and its folder, never an agent (Marco, 2026-11-21)
import { JobFace, LeadFold, LeadSay, PartsSum, folds } from "../lead/views.tsx";   // slice R7: render points (requests/lead.md)
import { multi, talkWords } from "../lead/rules.ts";
import { formOf, lineSays, wordsShown } from "../form.ts";

const STATE_ORDER = ["uncommitted", "behind main", "other app", "merged", "clean"];
const TAG: Record<string, string> = { working: "working", asks: "asks you", "asks you": "asks you", done: "done", paused: "paused", stopped: "stopped", "taken back": "taken back", waiting: "waiting", idle: "idle", failed: "failed" };
const money = (n: number) => "$" + (+n || 0).toFixed(2);
const costOf = (p: Piece) => (typeof p.cost === "number" && p.cost > 0 ? p.cost : p.state === "working" || p.state === "done" ? 0.4 : 0);
const tests = (w?: string) => String(w || "").replace(/^tests: /, "tests ");
const partAsks = (x: Piece) => open().filter((a) => a.part === x.id);

/** runs.js stateOf: what a run is now, in one word */
export function stateOf(p: Piece): string {
  if (p.kind === "starter") return "starting";
  if (p.term?.waiting) return "waiting";
  if (/paused|stopped|done|taken back|failed/.test(String(p.state))) return String(p.state);
  if (asksOn(p.id).length || (p.parts || []).some((x) => partAsks(x).length)) return "asks you";
  if (p.state === "idle") return "idle";
  return "working";
}
function partsSummary(p: Piece): string {
  const n: Record<string, number> = {};
  for (const x of p.parts || []) { const st = partAsks(x).length ? "asks" : String(x.state); n[st] = (n[st] || 0) + 1; }
  const bits = ["working", "asks", "paused", "done", "stopped", "taken back"].filter((k) => n[k]).map((k) => `${n[k]} ${k}`);
  return `${(p.parts || []).length} parts: ${bits.join(", ")}`;
}
/** runs.js sentence: the run in words (a face, the sidebar and the agent say the same) */
export function sentence(p: Piece): string {
  const st = stateOf(p), n = p.files || 0, did = p.words ? `“${p.words}”` : `${p.copy}`;
  if (p.parts && p.parts.length && !/stopped|taken back/.test(String(p.state))) return `Split into ${partsSummary(p)}.`;
  if (st === "waiting") return "Waiting for you at its terminal.";
  if (st === "paused") return p.waits ? "Waits for the other session to finish." : "Paused. Nothing runs until you resume it.";
  if (st === "stopped") return "Stopped. Its changes stay as they are.";
  if (st === "taken back") return "Taken back: every change it made is undone.";
  if (st === "done") return "Done.";
  if (st === "failed") return "Its last run failed.";
  if (st === "idle") return "Idle. It answers when you write to it.";
  if (st === "asks you") return `Asks you one thing about ${did}.`;
  if (!n) return `Starting on ${did}.`;
  return `Working on ${did}: ${n} file${n === 1 ? "" : "s"} so far, ${tests(p.term?.stateWord)}.`;
}

/** one ask inside a face: answered in place, or opened when it needs its evidence (shell.js askHTML) */
export function AskRow({ a }: { a: Ask }) {
  const opens = a.how === "near" || !!a.serious;
  return (
    <div className="pl-ask" data-front data-ask={a.id}>
      <span className="pl-ask-t">{a.text}<small>{a.source}</small></span>
      <span className="pl-acts">
        {opens ? <button className="pl-btn pl-pri" data-act={`goto:${a.piece}`}>Open it</button>
          : <><button className="pl-btn pl-pri" data-act={`answer:${a.id}`}>Yes</button><button className="pl-btn" data-act={`later:${a.id}`}>Later</button></>}
      </span>
    </div>
  );
}

/** a run's own presses (#15): pause or resume, and stop */
function RunActs({ p }: { p: Piece }) {
  const st = String(p.state);
  if (/stopped|taken back|done/.test(st)) return null;
  return (
    <div className="pl-acts pl-run">
      {st === "paused" ? <button className="pl-btn" data-act={`resume:${p.id}`}>Resume</button> : <button className="pl-btn" data-act={`pause:${p.id}`}>Pause</button>}
      <button className="pl-btn" data-act={`stop:${p.id}`}>Stop</button>
    </div>
  );
}

function Session({ p }: { p: Piece }) {
  const st = stateOf(p), split = !!(p.parts && p.parts.length), asks = asksOn(p.id).filter((a) => !a.part);   // a part's ask sits under its part
  const box = `${talkWords(p.files)}\nterminal · ${p.term?.waiting ? "waiting for input" : p.term?.stateWord ?? ""}`;
  return (
    <>
      <div className="pl-h"><span className={`nx-aura${st === "working" ? "" : " still"}`} /><b>{titleOf(p)}</b>
        <span className="pl-s">in {String(regionOf(p.region)?.name || p.region).replace(/ \(.*\)$/, "")} · {split ? `${money(costOf(p) * (1 + p.parts!.length))} so far` : p.branch}</span></div>
      {multi(p) ? <LeadSay p={p} /> : <p className="pl-say" data-say>{sentence(p)}</p>}
      {folds(p) ? <PartsSum p={p} /> : split ? (
        <div className="pl-parts" role="list">
          {p.parts!.map((x) => {
            const as = partAsks(x), xs = as.length ? "asks" : String(x.state);
            return <div key={x.id} role="listitem">
              <div className="pl-part" data-partrow={x.id}><span className="nx-aura still" /><span className="pl-partn"><b>{titleOf(x)}</b></span><span className={`pl-tag st-${xs.replace(/ /g, "-")}`}>{TAG[xs] || xs}</span></div>
              {as.map((a) => <AskRow key={a.id} a={a} />)}
            </div>;
          })}
        </div>
      ) : <div className="pl-box" data-face={p.id} data-terminal data-copy={p.copy}>{box}</div>}
      {split ? null : <div className="pl-meta"><span>{money(costOf(p))} so far</span>{typeof p.model === "string" ? <span>{p.model}</span> : null}</div>}
      <RunActs p={p} />
      {asks.map((a) => <AskRow key={a.id} a={a} />)}
    </>
  );
}

function Copies({ p }: { p: Piece }) {
  const rows = [...(p.copies || [])].sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
  const un = rows.filter((r) => r.state === "uncommitted").length;
  return (
    <>
      <div className="pl-h"><b>Side copies</b><span className="pl-s">{rows.length} · sorted by state</span></div>
      <div className="pl-st">{un ? `${un} with uncommitted work, first` : "Nothing uncommitted"}</div>
      <div className="pl-rows">{rows.map((c) => <div key={c.name} className="pl-row" data-copyrow={c.state}><span>{c.name}</span><span className={`pl-tag st-${c.state.replace(/ /g, "-")}`}>{c.state}</span></div>)}</div>
    </>
  );
}

function Page({ p }: { p: Piece }) {
  return (
    <>
      <div className="pl-h"><b>{p.name}</b><span className="pl-s">{p.kind === "list" ? "a list" : p.kind === "sticky" ? "a sticky" : "a page"}</span></div>
      <p className="pl-t">{String(p.text ?? p.words ?? "")}</p>
      {asksOn(p.id).map((a) => <AskRow key={a.id} a={a} />)}
    </>
  );
}

/** a full face, drawn inside the plane's section for the piece */
export function Face({ p }: { p: Piece }) {
  if (p.kind === "session") return <Session p={p} />;
  if (p.kind === "copies") return <Copies p={p} />;
  if (p.kind === "job") return <JobFace p={p} />;
  if (p.id.startsWith(AUTO)) return <Slot name="automation" id={p.id} band="middle" />;
  if (p.kind === "diary" && isFolderDiary(p.id)) return <Slot name="diary" scope={p.region} band="far" part="piece" />;
  return <Page p={p} />;
}

/** a session's line keeps room for its dot (the aura and its gap, the scale's --s3 and --s2) */
const AURA = 20;
/** a piece's one line, for one not drawn whole (shell.js foldLine), in its form at `w` screen px (form.ts): near, its
 *  name and its state; far, its name; smaller, its dot alone, the name on the line's title. A name wraps, never cut */
export function FoldLine({ p, w = Infinity }: { p: Piece; w?: number }) {
  if (p.kind === "job" || multi(p)) return <LeadFold p={p} />;
  const a = asksOn(p.id).length, s = p.kind === "session";
  const st = s ? (p.term?.waiting ? "waiting" : a ? "asks you" : stateOf(p)) : a ? "asks you"
    : p.kind === "copies" ? `${(p.copies || []).length} copies` : p.kind === "arrivals" ? "arrivals" : p.kind === "list" ? "a list"
    : p.kind === "diary" ? "what happened here" : p.id.startsWith(AUTO) ? "an automation" : "a page";
  const name = s ? titleOf(p) : String(p.name ?? ""), says = lineSays(name, st), room = w - (s ? AURA : 0);
  const form = formOf(says, room, Infinity, Infinity), words = form === "near" || wordsShown(says, room) > 0;
  return (
    <>
      {s ? <span className="nx-aura still" /> : null}
      {words ? <b>{name}</b> : <span className="pl-fdot" title={`${name}: ${st}`} aria-label={name} />}
      {form === "near" || (!words && a) ? <span className={`pl-fst${a ? " pl-asks" : ""}`} data-form={form}>{form === "near" ? st : ""}</span> : null}
    </>
  );
}
