// Your setup, side by side (#1423; the rows: setup.ts): the first part of the closing moment for a person who already has an AI setup. It
// sits where the lens was, before the unsure things. Their side on the left, Jelly's on the right, grouped by what each
// thing does for them (setup.ts rowsOf). Agree merges into one row; theirs comes in as it is; Jelly's additions show on
// its side; only a disagreement asks, with its choices under it, and a pressed one shows the line that won.
//   SideBySide  the rows and the choices; "go on" moves to the unsure things (an unpressed disagreement: theirs holds)
//   Reach       how far Jelly may change their AI's own rules and settings (leave them, ask me first, change them), under
//               the level: its own question and words, so it never reads as the level again (Marco's try 2026-11-17)
import { Button } from "../kit";
import { choicesOf, CHOICE_WORDS, GROUPS, openOf, REACH, settledLine, type Choice, type Reach as ReachT, type Row } from "./setup";
import "./sidebyside.css";

/** a group's own rows past this many come in folded ("and 9 more of your rules"): they are theirs, nothing to decide */
const FOLD = 3;

export function SideBySide({ rows, choices, onChoose, onDone }: { rows: Row[]; choices: Partial<Record<string, Choice>>; onChoose: (id: string, c: Choice | null) => void; onDone: () => void }) {
  const open = openOf(rows, choices);
  return (
    <div className="obs" data-setup data-open={open.length}>
      <div className="obs-head t-label"><span>Yours</span><span>Jelly's</span></div>
      <div className="obs-list">
        {GROUPS.map((g) => {
          const rs = rows.filter((r) => r.group === g);
          if (!rs.length) return null;
          const mine = rs.filter((r) => r.kind === "mine"), shown = rs.filter((r) => r.kind !== "mine" || mine.indexOf(r) < FOLD);
          return (
            <section key={g}>
              <h4 className="t-label">{g}</h4>
              {shown.map((r) => <RowOf key={r.id} r={r} c={choices[r.id]} onChoose={(c) => onChoose(r.id, c)} />)}
              {mine.length > FOLD && <div className="obs-more t-label">and {mine.length - FOLD} more of yours, as they are</div>}
            </section>
          );
        })}
      </div>
      <div className="obs-foot">
        <span className="t-label">{open.length ? `${open.length === 1 ? "One differs" : `${open.length} differ`}. Leave one and yours holds.` : "Nothing left to settle."}</span>
        <span data-setup-go><Button h={36} onClick={onDone}>go on</Button></span>
      </div>
    </div>
  );
}

function RowOf({ r, c, onChoose }: { r: Row; c?: Choice; onChoose: (c: Choice | null) => void }) {
  const from = r.src ? <em title={r.src}>{r.owner === "team" ? "your team's · " : ""}{r.src.replace(/:\d+$/, "").split("/").slice(-2).join("/")}</em> : null;
  if (r.kind === "agree") return <div className="obs-row agree" data-kind="agree"><div className="both"><span>{r.yours}</span>{from}<i>both say this</i></div></div>;
  if (r.kind === "adds") return <div className="obs-row adds" data-kind="adds"><div /><div className="j"><span>{r.jelly}</span></div></div>;
  if (r.kind === "mine") return <div className="obs-row mine" data-kind="mine" data-owner={r.owner}><div><span>{r.yours}</span>{from}{r.note && <i>{r.note}</i>}</div><div /></div>;
  if (r.later) return <div className="obs-row differ later" data-kind="differ" data-later><div><span>{r.yours}</span>{from}</div><div className="j"><span>{r.jelly}</span><i>waits in Home · yours holds</i></div></div>;
  return (
    <div className={`obs-row differ${c ? " settled" : ""}`} data-kind="differ" data-choice={c ?? undefined} data-shared={r.shared || undefined}>
      <div><span>{r.yours}</span>{from}</div>
      <div className="j"><span>{r.jelly}</span></div>
      {c ? <div className="obs-won"><span>{settledLine(r, c)}</span><button type="button" onClick={() => onChoose(null)}>change</button></div>
        : <div className="obs-pick">{choicesOf(r).map((x) => <button key={x} type="button" data-pick={x} onClick={() => onChoose(x)}>{CHOICE_WORDS[x]}</button>)}</div>}
    </div>
  );
}

export function Reach({ value, onChange, w }: { value: ReachT; onChange: (r: ReachT) => void; w: number }) {
  return (
    <div className="obs-reach" style={{ width: w }} data-reach={value}>
      <span className="t-label oby-q">your AI's own rules and settings</span>
      <div role="radiogroup" aria-label="how far I may change your AI's rules and settings">
        {REACH.map(([k, word, why]) => <button key={k} type="button" role="radio" aria-checked={k === value} className={k === value ? "on" : ""} title={why} onClick={() => onChange(k)}>{word}</button>)}
      </div>
      <span className="t-label oby-means">{REACH.find(([k]) => k === value)![2]}</span>
    </div>
  );
}
