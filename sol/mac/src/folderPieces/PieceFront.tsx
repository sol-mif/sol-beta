// A piece's front (#1092, the design: S/design/design.md NOW 2): what the page in the room and the block in a session
// both draw, so the two are one thing at two sizes. One row in front with the kit's Button named by its effect, the rest
// by name, and for 6 s after a press one line at the foot with its undo. A piece whose rows name a group (runs: the
// machines) lays the rest as plates side by side. The square in the head turns the piece over (PieceBack).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../kit";
import { frontOf, groupsOf, pressWord, saidOf, LEAVE_MS, UNDO_MS, type FrontStep } from "./front";
import { ownLine, sameNoteOf } from "./model";
import type { Look } from "./model";
import "./pieces.css";   // the square and its breath
import "./front.css";

export function PieceFront({ title, look, wants, doubt = 0, steps, size, groups: named, error, onLet, letWhy, scope, program, line, aside, may, onMay, mayBy, onPress, onUndo, onTurn, onHead }: {
  title: string; look: Look; wants: number; steps: FrontStep[];
  /** new and wanting, Jev only half sure it needs him (the folder's dashed square): the head says "1 maybe for you" */
  doubt?: number;
  /** page: in the room, 640 at most; block: in a session's stage, 340 */
  size: "page" | "block";
  /** the groups the recipe names (runs: every machine), so one with nothing in it still shows, as "idle" */
  groups?: string[];
  /** a broken recipe's reason: the front is the reason */
  error?: string;
  /** set while the piece waits for his yes to run this folder's scripts: the front asks for it */
  onLet?: () => void;
  /** why the last yes did not take, in words; and what a yes covers ("sol-dev and its worktrees") */
  letWhy?: string; scope?: string;
  /** the program a script piece would run (its recipe's path), shown under the ask in the code face */
  program?: string;
  /** the piece's own line (its source's `line`): a piece that never asks shows it as its front, dim */
  line?: string;
  /** an agent in a session asked for more than the piece lets it ("act", "draft"): the head asks him, dashed; his
   *  press raises the back's ladder to that notch (work.pieces.set) */
  may?: "draft" | "act" | "spend"; onMay?: () => void;
  /** the name of the session whose agent asks (the head says "<name> asks" while the chip is up) */
  mayBy?: string;
  /** the head's right: "into <session>" on the page, nothing in a block */
  aside?: ReactNode;
  /** the front's button, or a name's own press: the row's index. The parent opens its link and ticks it */
  onPress: (i: number) => void;
  onUndo: (i: number) => void;
  /** the square in the head: turn the piece over */
  onTurn?: () => void;
  /** the head taken by the hand (a block's head drags back to the folder) */
  onHead?: (ev: React.PointerEvent) => void;
}) {
  const [led, setLed] = useState<number | null>(null);
  const [out, setOut] = useState<{ s: FrontStep; i: number } | null>(null);       // the front on its way out
  const [said, setSaid] = useState<{ t: string; i: number } | null>(null);        // the foot's line, 6 s
  const [all, setAll] = useState(false);                                           // "+N more" pressed: every name, the room scrolls them
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // rows a session's agent put away while he looks (pieceVerbs.ts put_away): the foot names who, and undo is in reach
  const [theirs, setTheirs] = useState<{ by: string; keys: string[] } | null>(null);
  const was = useRef<Map<string, string> | null>(null), theirTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (theirTimer.current) clearTimeout(theirTimer.current); }, []);
  useEffect(() => {
    const before = was.current;
    was.current = new Map(steps.map((x) => [x.id ?? x.t, x.st]));
    if (!before) return;
    const gone = steps.filter((x) => x.st === "done" && x.by && x.by !== "you" && before.has(x.id ?? x.t) && before.get(x.id ?? x.t) !== "done");
    if (!gone.length) return;
    const by = gone[0].by ?? "";
    setTheirs((t) => ({ by, keys: [...(t && t.by === by ? t.keys : []), ...gone.map((x) => x.id ?? x.t)] }));
    if (theirTimer.current) clearTimeout(theirTimer.current);
    theirTimer.current = setTimeout(() => setTheirs(null), UNDO_MS);
  }, [steps]);
  const undoTheirs = () => { if (!theirs) return; theirs.keys.forEach((k) => { const i = steps.findIndex((x) => (x.id ?? x.t) === k && x.st === "done"); if (i >= 0) onUndo(i); }); setTheirs(null); };

  const { front, rest } = frontOf(steps, led);
  const groups = [...new Set([...(named ?? []), ...groupsOf(steps)])], block = size === "block", cap = block ? 3 : 5;
  const shown = out ?? front;
  const sameNote = sameNoteOf(steps);
  // a name says its press only where it differs from the front's: "answer" five times down the right edge says nothing
  const frontWord = shown ? pressWord(shown.s) : "";

  const press = (x: { s: FrontStep; i: number }) => {
    setOut(x); setLed(null);
    onPress(x.i);                                   // the folder's figure drops now, not at the next pulse
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(() => setOut(null), LEAVE_MS), setTimeout(() => setSaid(null), UNDO_MS)];
    // an answer the piece drafted goes with him: on his clipboard as the issue opens
    const draft = !!x.s.said && pressWord(x.s) === "answer";
    if (draft) void navigator.clipboard?.writeText(x.s.said ?? "").catch(() => {});
    setSaid({ t: draft ? "" : x.s.t, i: x.i });
  };
  const undo = () => { if (!said) { undoTheirs(); return; } onUndo(said.i); setLed(said.i); setSaid(null); };
  const keys = (ev: React.KeyboardEvent) => {
    if (ev.key === "z" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); undo(); return; }
    if (ev.key === " " && onTurn && !(ev.target as HTMLElement).closest("[role=button], button")) { ev.preventDefault(); onTurn(); return; }
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const f = [...(root.current?.querySelectorAll<HTMLElement>(".pf-go [role=button], .pf-name") ?? [])];
    const nx = f[Math.max(0, Math.min(f.length - 1, f.indexOf(document.activeElement as HTMLElement) + (ev.key === "ArrowDown" ? 1 : -1)))];
    if (nx) { ev.preventDefault(); nx.focus(); }
  };
  // the page opens with the hand on the front's button
  useEffect(() => { if (!block && !out) root.current?.querySelector<HTMLElement>(".pf-go [role=button]")?.focus({ preventScroll: true }); }, [block, front?.i, out]);

  const name = (x: { s: FrontStep; i: number }, cls = "") => (
    <button key={x.s.id ?? `${x.i}`} type="button" className={`pf-name ${cls}${x.s.ghost ? " pf-ghost" : ""}`} data-part={`name ${x.i + 1}`}
      onClick={() => (x.s.st === "wait" ? setLed(x.i) : x.s.href ? onPress(x.i) : undefined)}>
      {x.s.st === "half" && <i className="pf-run" role="img" aria-label="being worked now" title="being worked now" />}
      <span>{x.s.t}</span>
      <small>{x.s.st === "done" ? "put away" : x.s.st === "wait" ? (pressWord(x.s) === frontWord ? x.s.fig ?? "" : pressWord(x.s)) : block || sameNote ? "" : x.s.note ?? ""}</small>
    </button>
  );

  return (
    <div ref={root} className={`pf pf-${size} pf-${look}`} onKeyDown={keys} data-piece-front>
      <header className="pf-head" onPointerDown={onHead}>
        <button type="button" className="pf-turn" aria-label="turn it over: what it is made of" title="turn it over" onClick={onTurn} onPointerDown={(ev) => ev.stopPropagation()}><i className={`fp-sq fp-${look}`} aria-hidden /></button>
        <b>{title}</b>
        <span className="pf-said">{onLet ? "asks" : may && onMay && mayBy ? `${mayBy.length > (block ? 12 : 28) ? `${mayBy.slice(0, block ? 11 : 27).trimEnd()}…` : mayBy} asks` : block ? (wants > 0 ? wants : "") : saidOf(look, wants, doubt)}</span>
        {may && onMay && <button type="button" className="pf-may" data-part="let" title="how far an agent may go on this piece; its back has the ladder" onClick={onMay} onPointerDown={(ev) => ev.stopPropagation()}>let it {may}</button>}
        {aside && <span className="pf-aside" onPointerDown={(ev) => ev.stopPropagation()}>{aside}</span>}
      </header>

      {onLet ? (
        // a script piece before his yes (the designer's NOW of 02:50): never an empty room, the same one press as the folder's row
        <div className="pf-front"><h1>{program ? "It runs a program from this folder" : "Its agent drafts for you between your visits"}</h1>{program && <p><code className="pf-code">{program}</code></p>}<p>{letWhy ?? `Once you let it, every piece in ${scope ?? "this folder"} may run its program and its agent.`}</p><div className="pf-go"><Button h={32} form="gives" onClick={onLet}>let it run</Button></div></div>
      ) : error ? (
        <div className="pf-front"><h1>{title} cannot read its recipe</h1><p>{error}</p><div className="pf-go"><Button h={32} form="gives" onClick={onTurn}>open the recipe</Button></div></div>
      ) : shown ? (
        <div key={shown.s.id ?? shown.i} className={`pf-front ${out ? "pf-out" : "pf-in"}`} data-part="front">
          <h1>{shown.s.t}</h1>
          {shown.s.note && <p>{shown.s.note}</p>}
          {/* what the piece did between his visits: its own line, its small square before it; never his ink */}
          {shown.s.said && <div className="pf-wash" data-part="said"><i aria-hidden /><span>{shown.s.said}</span></div>}
          <div className="pf-go"><Button h={32} form="gives" onClick={() => !out && press(shown)}>{pressWord(shown.s)}</Button>
            {/* a question whose default is in effect: "keep" puts it away; one quiet word opens where to change it */}
            {shown.s.press === "keep" && shown.s.href && <a className="pf-alt" href={shown.s.href} target="_blank" rel="noopener noreferrer">change it</a>}</div>
        </div>
      ) : !groups.length ? (
        <div className="pf-front pf-none pf-in"><h1>{look === "working" && !steps.length ? "reading" : ownLine(title, line, steps) ?? "nothing waits on you"}</h1></div>
      ) : null}

      {onLet ? null : groups.length ? (
        <div className="pf-plates">
          {groups.map((g) => {
            const rs = rest.filter((x) => x.s.group === g);
            return (
              <section key={g}><h3>{g}</h3>
                {rs.length ? rs.slice(0, cap).map((x) => name(x)) : <p className="pf-idle">idle</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="pf-names">
          {rest.slice(0, all ? rest.length : cap).map((x) => name(x))}
          {/* the rest are one press away, in place: what waits on him is never out of reach */}
          {rest.length > cap && !all && <button type="button" className="pf-name pf-more" data-part="more" onClick={() => setAll(true)}><span>+{rest.length - cap} more</span></button>}
          {/* put-away rows are not listed here: they are the back's ledger lines ("you · put away …") */}
        </div>
      )}

      <footer className={`pf-foot${said || theirs ? " pf-on" : ""}`} aria-live="polite">
        {!said && theirs && <><span data-part="theirs">{theirs.by} put away {theirs.keys.length}</span><button type="button" onClick={undoTheirs}>undo</button></>}
        {said && <><span>{!said.t ? "its draft is on your clipboard" : `put away: ${said.t.length > 48 ? `${said.t.slice(0, 47).trimEnd()}…` : said.t}`}</span><button type="button" onClick={undo}>undo</button></>}
      </footer>
    </div>
  );
}

