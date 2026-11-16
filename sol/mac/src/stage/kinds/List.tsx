// A list (#696, PlanCard's successor on the stage; v4 §4): steps, each with its dot. The bands turn in the dot while a
// step runs, a done step is green, the one that waits on you is yellow and has its yes; a thin meter and the count under
// them. A step with a proof ticks itself when the proof holds (`ok`). Your yes ticks it and starts the next.
// A list whose steps are runs (#703: bound with watch "run", one step per background session) is drawn as runs (RunRows).
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Meter } from "../../kit";
import type { KindProps, ListBody, Step } from "./types";
import { RunRows } from "./RunRows";
import { isRunBody } from "./runs";

const stOf = (s: Step) => (s.ok ? "done" : s.st);
export const doneOf = (body?: ListBody) => (body?.steps ?? []).filter((s) => stOf(s) === "done").length;
/** the word at a step's right: its note, else what its dot says */
const WORD: Record<string, string> = { half: "now", wait: "waits on you", done: "done" };

export function List({ body, act }: KindProps<ListBody>) {
  if (isRunBody(body)) return <RunRows body={body} />;
  return <Steps body={body} act={act} />;
}

function Steps({ body, act }: Pick<KindProps<ListBody>, "body" | "act">) {
  const steps = body?.steps ?? [];
  const foot = useRef<HTMLDivElement>(null), w = useWidth(foot);
  const yes = (i: number) => act({ body: { steps: steps.map((s, j) => (j === i ? { ...s, st: "done" as const } : j === i + 1 && s.st === "" ? { ...s, st: "half" as const } : s)) } }, `step ${i + 1} ticked by you`);
  const done = doneOf(body);
  return (
    <div className="st-list">
      <div className="st-steps">
        {steps.map((s, i) => {
          const st = stOf(s);
          return (
            <div key={i} className={`st-step ${st}`} data-part={`step ${i + 1}`}>
              <i aria-hidden />
              <span className="st-steptext">{s.t}</span>
              {st === "wait" ? <button className="st-yes" onClick={() => yes(i)}>yes</button> : <small>{s.note ?? WORD[st] ?? ""}</small>}
            </div>
          );
        })}
      </div>
      {steps.length > 0 && (
        <div className="st-listfoot" ref={foot}>
          {w > 0 && <Meter w={w} h={4} value={done / steps.length} label={`${done} of ${steps.length} done`} />}
          <span>{done} of {steps.length}</span>
        </div>
      )}
    </div>
  );
}

/** a box's laid-out width, not its drawn one: a block is born scaled down, and the meter must be the width it lands at */
function useWidth(el: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    const take = () => setW(t.clientWidth);
    take();
    const ro = new ResizeObserver(take);
    ro.observe(t);
    return () => ro.disconnect();
  }, [el]);
  return w;
}
