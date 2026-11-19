// The knobs card (#692, the brief's point 4): a page block at sol://home/knobs, a small panel beside the Home block on
// the stage. The place (today · a folder · world), the picks Marco has not made yet (pass2.ts PICKS: each a key in this
// window's storage, so the Home block changes as one is flipped, no reload), the runs line from home.state, and the
// shot. A shot of a block is the engine's for a browser block only (work.stage.shot, live.ts), so a page block says so.
import type { Metas } from "../meta";
import { Pill } from "../../kit";
import { useBlockWire } from "./HomeBlock";
import { PICKS, setBlockPlace, setPick, useBlockPlace, useHome2, usePick, type PickKey, type Picks } from "./pass2";
import { live as liveFolders } from "./folders";
import "./block.css";

export const meta = {
  Knobs: {
    job: "the Home block's knobs on the stage: its place, the picks still open, the runs, the shot",
    flow: "mine",
    states: ["engine down", "the knobs", "a folder picked"],
    keys: [
      { press: "today · a folder · world", does: "moves the Home block there", opens: "HomeBlock" },
      { press: "a pick's pill", does: "flips the pick; the Home block changes at once" },
    ],
    listens: ["home.state › folders, runs"],
  },
} satisfies Metas;

const SAID: { [K in PickKey]: { h: string; words: readonly string[] } } = {
  ctx: { h: "a folder's context", words: ["first column", "side column"] },
  run: { h: "while it works on a sticky", words: ["a bud on each", "the whole jelly"] },
  back: { h: "around the jelly", words: ["lit inside", "plain black"] },
  skin: { h: "the jelly's skin", words: ["smooth", "grain"] },
};
const PILL_H = 26;

function PickRow<K extends PickKey>({ k }: { k: K }) {
  const v = usePick(k), all = PICKS[k] as unknown as readonly Picks[K][];
  return (
    <div className="kn-row" data-part={`knobs › ${SAID[k].h}`} data-pick={k} data-picked={v}>
      <span className="kn-h">{SAID[k].h}</span>
      <Pill words={SAID[k].words} picked={all.indexOf(v)} h={PILL_H} onPick={(i) => setPick(k, all[i])} />
    </div>
  );
}

export function Knobs() {
  const h = useHome2(useBlockWire());
  const place = useBlockPlace();
  const fs = liveFolders(h.st).filter((f) => !f.parent);
  const at = place.at === "today" ? 0 : place.at === "folder" ? 1 : 2;
  const runs = h.st?.runs;
  return (
    <div className="kn" data-knobs>
      <section className="kn-sec">
        <h6>the place</h6>
        <div className="kn-row" data-part="knobs › the place">
          <Pill words={["today", "a folder", "world"]} picked={at} h={PILL_H} onPick={(i) => {
            if (i === 0) setBlockPlace({ at: "today" });
            else if (i === 2) setBlockPlace({ at: "world" });
            else if (fs[0] && place.at !== "folder") setBlockPlace({ at: "folder", id: fs[0].id });
          }} />
        </div>
        {at === 1 && fs.length > 0 && (
          <div className="kn-folders">
            {fs.map((f) => <button type="button" key={f.id} className={`kn-chip${place.at === "folder" && place.id === f.id ? " on" : ""}`} onClick={() => setBlockPlace({ at: "folder", id: f.id })}>{f.name}</button>)}
          </div>
        )}
      </section>
      <section className="kn-sec">
        <h6>picks still open</h6>
        <PickRow k="ctx" />
        <PickRow k="run" />
        <PickRow k="back" />
        <PickRow k="skin" />
      </section>
      <section className="kn-sec">
        <h6>runs</h6>
        <p className="kn-line" data-part="knobs › runs" data-runs>
          {!h.st ? (h.up ? "reading Home…" : "Home's engine is not answering (the stand-in on 7791)")
            : runs ? `${runs.real ? "real" : "stand-in"} · ${runs.host} · ${runs.running} running${runs.queued ? ` · ${runs.queued} waiting` : ""}` : "no runs line in home.state"}
        </p>
      </section>
      <section className="kn-sec">
        <h6>shoot</h6>
        <p className="kn-line quiet">The stage shoots browser blocks only (work.stage.shot), not a page: ask the agent for a still of the Home block.</p>
      </section>
    </div>
  );
}
