// The migration (BR1, #1615; mine/look/br1/migration.html C and D, Marco 13:45): the first move-in, one thing on the
// screen at a time. Each move Sol made (plan.ts, from the engine's judge) is a picture and one sentence, Looks right or
// Change; what Sol did not guess comes after the moves (Keep it · Archive · Fold into…); last the overview,
// "Is this how you want it?", the canvas after with each step's number on what it touched, what was agreed, and Yes,
// move in (These are mine, with the answers). Skip to the overview takes the rest as Sol made it, at any point. A read
// with nothing to sort is D: its folders as cards and Move in. Nothing here moves a file: the answers go to the engine
// with next.movein.keep (live.ts toKeep, plan.ts migKeep). It presses M.move_in_mig and M.these_are_mine.
// C-2: a folder an AI made is drawn apart (dashed, the key under the picture); a group Sol suggests is "new · a group I
// suggest", and the quick tries gathered into Experiments are their own move.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { M } from "../cv/core.ts";
import { after, calm, steps, type Ask, type Fold, type Mig, type Move, type Plan } from "./plan.ts";
import { ed } from "./state.ts";
import type { Person, Row } from "./data.ts";
import "./migration.css";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const num = (n: number) => WORDS[n] ?? String(n);
const Num = (n: number) => { const w = num(n); return w[0].toUpperCase() + w.slice(1); };
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** a few names said whole ("api, web and cli"), more as a count */
const names = (fs: Fold[]) => (fs.length <= 3 ? fs.map((f) => f.name).join(", ").replace(/, ([^,]*)$/, " and $1") : `${Num(fs.length)} folders`);
const NONE: Mig = { at: 0, no: {}, ans: {} };

/** a folder's colour as the canvas will draw it: the four of the plane, in the read's order (index.tsx toneOf) */
const toneOf = (plan: Plan, f: string) => { const i = plan.folders.findIndex((x) => x.folder === f); return (i < 0 ? 0 : i) % 4; };
const Fd = ({ t, size, n, ai }: { t: number; size: "s" | "c" | "m" | "l"; n?: number; ai?: boolean }) => <span className={`mg-fold ${size} t${t}${ai ? " ai" : ""}`} aria-hidden="true">{n ? <b>{n}</b> : null}</span>;

/** the dots: one per step, the ones done darker, the one here darkest */
function Dots({ n, at, label, skip }: { n: number; at: number; label: string; skip?: boolean }) {
  return (
    <div className="mg-dots">
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < at ? "done" : i === at ? "on" : ""} />)}
      <span>{label}</span>
      {skip ? <a className="mg-skip" data-mgskip="1" role="button" tabIndex={0} onClick={() => M.move_in_mig("skip")}>Skip to the overview ›</a> : null}
    </div>
  );
}

/** what Sol saw and what the person said, kept apart */
const Why = ({ saw, said }: { saw: string; said?: string[] }) => (
  <p className="mg-why">{said?.length ? <><em className="told">you said</em>{said.map((s) => `“${s}”`).join(", ")} &nbsp;·&nbsp; </> : null}<em className="saw">saw</em>{saw}</p>
);

/** one move's sentence */
function sentence(mv: Move): string {
  const n = mv.folders.length, one = n === 1 ? mv.folders[0].name : "", byAi = mv.ai === n;
  if (mv.kind === "tries") return `I gathered ${n === 1 ? "one quick try" : `${num(n)} quick tries`} your AIs made into ${mv.to[0].name}.`;
  if (mv.kind === "inside" && byAi) return `${n === 1 ? `${one}, which your AI made,` : `${Num(n)} folders your AIs made`} went inside ${mv.to.length === 1 ? mv.to[0].name : "the folders they were made in"}.`;
  if (mv.kind === "group") return `I grouped ${one || `${num(n)} folders`} into ${mv.to[0].fresh ? "one folder" : mv.to[0].name}.`;
  if (mv.kind === "inside") return `${one || `${Num(n)} folders`} went inside ${mv.to.length === 1 ? mv.to[0].name : "the folders they sit in"}.`;
  return `I archived ${one || (n <= 3 ? names(mv.folders) : `${num(n)} folders`)}. Nothing is deleted.`;
}

/** a move as a picture: the folders it took, an arrow, where they went */
function Pic({ plan, mv }: { plan: Plan; mv: Move }) {
  const show = mv.folders.slice(0, 5), more = mv.folders.length - show.length;
  // into one folder: the ones it takes wear its colour already, as drawn (C1); else each its own
  const one = mv.kind !== "shelf" && mv.to.length === 1 ? toneOf(plan, mv.to[0].fresh ? mv.folders[0].folder : mv.to[0].folder) : null;
  return (
    <div className="mg-pic" data-mgpic={mv.kind}>
      <div className="mg-from">
        {show.map((f) => <div key={f.folder} className="mg-mini"><Fd t={one ?? toneOf(plan, f.folder)} size="m" ai={plan.ai.includes(f.folder)} /><span>{f.name}</span></div>)}
        {more > 0 ? <div className="mg-mini more"><span>+{more} more</span></div> : null}
      </div>
      <span className="mg-arrow" aria-hidden="true">→</span>
      {mv.kind === "shelf"
        ? <div className="mg-mini to"><span className="mg-shelfbar" aria-hidden="true" /><span className="nm">Archived</span><span className="tag">kept, out of the way</span></div>
        : mv.to.length === 1
          ? <div className="mg-mini to"><Fd t={one ?? 0} size="l" n={mv.folders.length} /><span className="nm">{mv.to[0].name}</span><span className="tag">{mv.suggest ? "new · a group I suggest" : mv.to[0].fresh ? "new folder" : "already yours"}</span></div>
          : <div className="mg-to-many">{mv.to.slice(0, 4).map((t) => <div key={t.folder} className="mg-mini"><Fd t={toneOf(plan, t.folder)} size="m" /><span>{t.name}</span></div>)}</div>}
      {mv.ai ? <p className="mg-key" data-mgkey="1"><Fd t={one ?? 0} size="s" ai /> made by your AI{mv.ai < mv.folders.length ? <> &nbsp; <Fd t={one ?? 0} size="s" /> made by you</> : null}</p> : null}
    </div>
  );
}

/** a step's way to change it: one line, in a small menu under Change ▾ */
function Change({ items }: { items: [string, () => void][] }) {
  const [open, set] = useState(false);
  return (
    <span className="mg-chg">
      <button type="button" className="mg-btn line" data-mgchange="1" aria-expanded={open} onClick={() => set(!open)}>Change ▾</button>
      {open ? <span className="mg-menu" role="menu">{items.map(([l, f]) => <button key={l} type="button" role="menuitem" onClick={() => { set(false); f(); }}>{l}</button>)}</span> : null}
    </span>
  );
}

function MoveStep({ plan, at }: { plan: Plan; at: number }) {
  const mv = plan.moves[at], n = mv.folders.length;
  const back = mv.kind === "shelf" ? (n === 1 ? "Keep it on the canvas" : "Keep them on the canvas") : n === 1 ? "Leave it as it was" : "Leave them as they were";
  return (
    <div className="mg-step" data-mgstep={`move:${mv.id}`}>
      <Dots n={steps(plan)} at={at} label={`Move ${at + 1} of ${plan.moves.length}`} skip />
      <p className="mg-big">{sentence(mv)}</p>
      <Pic plan={plan} mv={mv} />
      <Why saw={mv.saw} said={mv.said} />
      <div className="mg-acts">
        <button type="button" className="mg-btn pri" data-mgok="1" autoFocus onClick={() => M.move_in_mig("ok")}>Looks right</button>
        <Change items={[[back, () => M.move_in_mig("no")]]} />
      </div>
    </div>
  );
}

function AskStep({ plan, mig, a, at }: { plan: Plan; mig: Mig; a: Ask; at: number }) {
  const [into, setInto] = useState(false);
  const others = after(plan, mig).tops.filter((t) => t.folder !== a.folder);
  const k = plan.asks.indexOf(a);
  return (
    <div className="mg-step" data-mgstep={`ask:${a.folder}`}>
      <Dots n={steps(plan)} at={at} label={plan.asks.length === 1 ? "One I didn’t guess" : `One I didn’t guess · ${k + 1} of ${plan.asks.length}`} skip />
      <p className="mg-big">What should I do with {a.name}?</p>
      <div className="mg-pic"><div className="mg-mini to"><Fd t={toneOf(plan, a.folder)} size="l" /><span className="nm">{a.name}</span>{a.line ? <span className="tag">{a.line}</span> : null}</div></div>
      <Why saw="you didn’t mention it, and nothing else uses it, so I left it to you" />
      <div className="mg-acts">
        <button type="button" className="mg-btn pri" data-mgans="keep" autoFocus onClick={() => M.move_in_mig("ans", a.folder, "keep")}>Keep it</button>
        <button type="button" className="mg-btn line" data-mgans="shelf" onClick={() => M.move_in_mig("ans", a.folder, "shelf")}>Archive</button>
        <span className="mg-chg">
          <button type="button" className="mg-btn line" data-mgans="into" aria-expanded={into} disabled={!others.length} onClick={() => setInto(!into)}>Fold into…</button>
          {into ? <span className="mg-menu" role="menu">{others.map((t) => (
            <button key={t.folder} type="button" role="menuitem" data-mginto={t.folder} onClick={() => { setInto(false); M.move_in_mig("ans", a.folder, `into:${t.folder}`); }}>
              <Fd t={toneOf(plan, t.fresh ? (plan.moves.find((m) => m.to.some((x) => x.folder === t.folder))?.folders[0].folder ?? t.folder) : t.folder)} size="c" />{t.name}</button>
          ))}</span> : null}
        </span>
      </div>
    </div>
  );
}

/** one line of what was agreed: its number, what it did, and how it was agreed (pressed: back to that step) */
function Agreed({ i, text, how }: { i: number; text: ReactNode; how: string }) {
  return (
    <button type="button" className="mg-ag" data-mgag={i} onClick={() => M.move_in_mig("to", i - 1)}>
      <i>{i}</i><span>{text}</span><em className="how">{how}</em><em className="chg">Change</em>
    </button>
  );
}

function Overview({ p, plan, mig }: { p: Person; plan: Plan; mig: Mig }) {
  const a = after(plan, mig), rowOf = (f: string) => p.rows.find((r) => r.id === f);
  const seen = mig.skip ?? Infinity;
  const holdsOf = (t: { folder: string; fresh: boolean; holds: number }) => {
    if (t.fresh) return plan.moves.some((m) => m.kind === "tries" && m.to[0]?.folder === t.folder) ? "quick tries by your AIs" : `${pl(t.holds, "folder")}, grouped`;
    const r = rowOf(t.folder);
    return [t.holds ? `${pl(t.holds, "folder")} inside` : "", r?.small ?? ""].filter(Boolean).join(" · ");
  };
  const toneTop = (t: { folder: string; fresh: boolean }) => toneOf(plan, t.fresh ? plan.moves.find((m) => m.to.some((x) => x.folder === t.folder))?.folders[0].folder ?? t.folder : t.folder);
  return (
    <div className="mg-step wide" data-mgstep="overview">
      <Dots n={steps(plan)} at={steps(plan)} label="Your setup" />
      <p className="mg-big">Is this how you want it?</p>
      <p className="mg-sub">Everything you agreed to, in one place. Press a line to change it; nothing on your disk moves.</p>
      <div className="mg-ov">
        <div>
          <div className="mg-canvas" data-mgcanvas="1">
            {a.tops.map((t) => (
              <div key={t.folder} className="mg-card" data-mgtop={t.folder}>
                {t.pins.length ? <span className="mg-pins">{t.pins.map((n) => <i key={n}>{n}</i>)}</span> : null}
                <Fd t={toneTop(t)} size="l" n={t.holds || undefined} />
                <b>{t.name}</b><small>{holdsOf(t)}</small>
              </div>
            ))}
          </div>
          {a.shelf.length ? <div className="mg-shelfline" data-mgshelf={a.shelf.length}><span className="mg-pins">{a.shelfPins.map((n) => <i key={n}>{n}</i>)}</span><span className="mg-shelfbar" aria-hidden="true" />Archived · {a.shelf.length}</div> : null}
        </div>
        <div className="mg-agreed">
          <p className="mg-lbl">What you agreed to</p>
          {plan.moves.map((mv, i) => {
            const no = !!mig.no[mv.id], to = mv.to.length === 1 ? <b>{mv.to[0].name}</b> : "the folders they sit in";
            const text = no ? <>{names(mv.folders)}, left as {mv.folders.length === 1 ? "it was" : "they were"}</>
              : mv.kind === "tries" ? <>{mv.folders.length === 1 ? "One quick try" : `${Num(mv.folders.length)} quick tries`}, gathered in {to}</>
              : mv.kind === "group" ? <>{names(mv.folders)}, grouped in {to}</>
                : mv.kind === "inside" ? <>{names(mv.folders)}, inside {to}</>
                  : <>{names(mv.folders)}, archived</>;
            return <Agreed key={mv.id} i={i + 1} text={text} how={no ? "you changed it" : i < seen ? "you said yes" : "as I made it"} />;
          })}
          {plan.asks.map((q, i) => {
            const x = mig.ans[q.folder], into = x?.startsWith("into:") ? a.tops.find((t) => t.folder === x.slice(5))?.name ?? "" : "";
            const text = x === "shelf" ? <><b>{q.name}</b>, archived</> : into ? <><b>{q.name}</b>, folded into <b>{into}</b></> : <><b>{q.name}</b> kept as it is</>;
            return <Agreed key={q.folder} i={plan.moves.length + i + 1} text={text} how={x ? "your answer" : "as I left it"} />;
          })}
          {a.same.length ? <p className="mg-same">As they were: {a.same.slice(0, 6).map((f) => f.name).join(", ")}{a.same.length > 6 ? `, and ${a.same.length - 6} more` : ""}.</p> : null}
        </div>
      </div>
      <div className="mg-foot">
        <button type="button" className="mg-btn pri" data-mvmine="1" autoFocus onClick={() => M.these_are_mine()}>Yes, move in</button>
        <button type="button" className="mg-btn line" data-mgagain="1" onClick={() => M.move_in_mig("again")}>Go through it again</button>
        <span className="mg-r">{pl(plan.folders.length, "folder")} → {a.tops.length}</span>
      </div>
    </div>
  );
}

/** D: nothing to sort, the folders as they are and Move in. A card's line would be one read from what the folder holds, as
 *  drawn ("Chapters, sources and a reading list"), never a named kind ("A repo") or its path: the read gives none yet, so
 *  a card is its name */
function Calm({ p, plan }: { p: Person; plan: Plan }) {
  const n = plan.folders.length, rows = plan.folders.map((f) => p.rows.find((r) => r.id === f.folder)).filter((r): r is Row => !!r);
  const head = n === 1 ? "One folder, yours" : n === 2 ? "Two folders, both yours" : `${Num(n)} folders, all yours`;
  return (
    <div className="mg-step mg-calm" data-mgstep="calm">
      <div>
        <h1 className="mg-h">{head}</h1>
        <p className="mg-sub">I saw {n === 1 ? "one place" : `${num(n)} places`} you work{plan.ai.length ? "" : " and nothing your AIs left behind"}. Nothing to sort: {n === 1 ? "it goes" : "they go"} on your canvas as {n === 1 ? "it is" : "they are"}.</p>
        <div className="mg-cards">
          {rows.map((r) => <div key={r.id} className="mg-c" data-mgcard={r.id}><div className="hd"><Fd t={toneOf(plan, r.id)} size="c" /><b>{r.n}</b></div></div>)}
        </div>
        <div className="mg-foot plain">
          <button type="button" className="mg-btn pri" data-mvmine="1" autoFocus onClick={() => M.these_are_mine()}>Move in</button>
          <span>{pl(n, "folder")}</span>
        </div>
      </div>
      {/* the promise the engine keeps after the move-in (engine next/tidy.ts: the offer on a folder's raise, and the bar's
          "tidy my folders", cv/say/tidy.ts); builder T, Marco 16:30 */}
      <div className="mg-say" data-mgsay="tidy"><div className="who"><b />Sol</div><p>{TIDY_SAY}</p></div>
    </div>
  );
}
/** D's Sol box, word for word as drawn (migration.html D) */
export const TIDY_SAY = 'As you add more, I\'ll offer to sort it the same way. You can also ask me any time: "tidy my folders".';

/** --k scales the drawing's sizes to the window as the start-up's day screen does (Day.tsx: its 1184-wide window, at least
 *  1, at most 2.2), so the migration reads at the same size as the screen before it */
function useK() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--k", String(Math.max(1, Math.min(2.2, innerWidth / 1184, innerHeight / 600))));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return box;
}

export default function Migration({ name, p }: { name: string; p: Person }) {
  const plan = p.plan!, mig = ed(name).mig ?? NONE, n = steps(plan), box = useK();
  if (calm(plan)) return <div ref={box} className="mg-page calm" data-movein={name}><Calm p={p} plan={plan} /></div>;
  const at = Math.min(mig.at, n);
  return (
    <div ref={box} className={`mg-page${at >= n ? " wide" : ""}`} data-movein={name} data-mgat={at}>
      {at < plan.moves.length ? <MoveStep key={at} plan={plan} at={at} />
        : at < n ? <AskStep key={at} plan={plan} mig={mig} a={plan.asks[at - plan.moves.length]} at={at} />
          : <Overview p={p} plan={plan} mig={mig} />}
    </div>
  );
}
