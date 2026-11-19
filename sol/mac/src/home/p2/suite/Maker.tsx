// The maker (#692 suite step 1, suite.html's "made on the fly"): a line in the notes that names a want no sticky covers
// ("keep track of my job applications", "quiz me on chem 110") goes to home.block.make first. The stand-in matches it
// to a suite recipe by its words (cheap), else a run writes a new recipe into the folder (real: the folder's agent;
// fake: a fixture), else it judges the want deeper than a recipe (new code, hours, writes outside the folder) and
// answers "start in Build" with the reason. Shown as the suite page shows it: the recipe card, its depth on the gauge,
// then the block itself (Piece), live. A line that is not a want is the dump's, as before.
import { useState } from "react";
import { Meter } from "../../../kit";
import type { Block2, Home2Api, Place, Recipe } from "../pass2";
import { liftToBuild, say } from "./lift";
import { Piece } from "./Piece";
import { useStageHere } from "../../../stage/kinds/here";
import type { Metas } from "../../meta";
import "./suite.css";

export const meta = {
  Maker: {
    job: "a want from the notes made into a block: the recipe card, its depth, then the block; or start in Build",
    flow: "say",
    states: ["a suite recipe", "a recipe written now", "deeper than a recipe: start in Build", "starting in Build"],
    keys: [
      { press: "start in Build", does: "a seed block, and a session started from it (work.start)", opens: "Piece" },
      { press: "keep it as a sticky", does: "the want goes to the dump as a line (home.dump.line)" },
      { press: "×", does: "closes the card; the block stays in Home" },
    ],
    listens: ["home.block.made", "home.state › blocks"],
  },
} satisfies Metas;

export type Made = { type: string; kind: "none" | "suite" | "made" | "build" | "seed"; recipe?: Recipe; block?: Block2; depth?: number; why?: string; by?: string; path?: string; want?: string; folder?: string; error?: string };

/** a want from the notes: the maker's answer, or null when the line is the dump's */
export async function makeFrom(h: Home2Api, want: string): Promise<Made | null> {
  const m = await h.ask<Made>({ type: "home.block.make", want, from: "notes" });
  if (!m || m.kind === "none" || m.error) return null;
  return { ...m, want };
}

export function Maker({ m, h, setPlace, onClose }: { m: Made; h: Home2Api; setPlace: (p: Place) => void; onClose: () => void }) {
  const here = useStageHere();
  const [starting, setStarting] = useState(false);
  const st = h.st;
  const live = m.block && st?.blocks?.find((b) => b.id === m.block!.id);
  const f = st?.folders?.find((x) => x.id === (m.block?.folder ?? m.folder));
  const close = <button type="button" className="pc-x" aria-label="close the recipe card" onClick={onClose}>×</button>;
  const gauge = (
    <div className="mk-gauge" data-mk-depth={(m.depth ?? 0).toFixed(2)}>
      <Meter w={240} h={6} value={m.depth ?? 0.15} label="how deep the want is" />
      <div className="mk-marks"><i>a block in Home</i><i>a recipe, made now</i><i className="b">starts in Build</i></div>
    </div>
  );
  if (m.kind === "build") {
    const start = async () => {
      setStarting(true);
      const seed = await h.ask<Made>({ type: "home.block.make", want: m.want, folder: m.folder, build: true });
      if (seed?.block) { const sid = await liftToBuild(seed.block, h, here); if (sid) onClose(); }
      else say(seed?.error ?? "Home's engine did not answer");
      setStarting(false);
    };
    const keep = () => { h.send({ type: "home.dump.line", text: m.want, at: new Date().toISOString() }); say("kept as a sticky in Home"); onClose(); };
    return (
      <div className="mk-card build" data-mk="build" data-part="the maker › starts in Build">
        <div className="mk-rh"><b>a new thing</b><span>deeper than a recipe</span>{close}</div>
        <dl><dt>for</dt><dd>{m.want}</dd><dt>why</dt><dd data-mk-why>{m.why}</dd><dt>so</dt><dd>start in Build: a session with this as its seed, {f ? `${f.name}'s` : "the folder's"} context carried over</dd><dt>in Home</dt><dd>a chip pointing at it, with its ring</dd></dl>
        {gauge}
        <div className="mk-go">
          <button type="button" className="pc-act lit" data-mk-start disabled={starting} onClick={() => void start()}>{starting ? "starting…" : "start in Build"}</button>
          <button type="button" className="pc-act quiet" onClick={keep}>keep it as a sticky</button>
        </div>
      </div>
    );
  }
  const r = m.recipe;
  const made = m.kind === "made";
  return (
    <div className={`mk-card ${m.kind}`} data-mk={m.kind} data-mk-recipe={r?.id} data-part={`the maker › ${r?.name ?? ""}`}>
      <div className="mk-rh"><b>{r?.name}</b><span>{made ? `a new recipe, written for this want${m.by ? ` by ${m.by}` : ""}` : "from the suite"} · {r?.by}</span>{close}</div>
      <dl><dt>for</dt><dd>{m.want}</dd><dt>reads</dt><dd>{r?.reads}</dd><dt>shape</dt><dd>{r?.shape}</dd><dt>its run</dt><dd>{r?.run}</dd><dt>moves</dt><dd>{r?.moves}</dd></dl>
      {gauge}
      <p className="mk-said">{made ? `made now: a skill file in ${f?.name ?? "the folder"} (blocks/${r?.id}.md); it shows as a block in a run's time` : `already in Home: it opens in ${f?.name ?? "the folder"}`}</p>
      {live && st && <div className="mk-block"><Piece b={live} st={st} h={h} setPlace={setPlace} /></div>}
    </div>
  );
}
