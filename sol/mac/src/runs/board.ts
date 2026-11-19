// The runs board, read (#889): every 5 s from one address (rules.ts boardUrl), and the two asks a person makes of it,
// /plan and /start. A read that fails keeps the last good board and says so; the screen never empties on one miss.
//
// Stubbed until the engine half lands (named in the PR): the engine serving the board and the relay on the Mac
// (127.0.0.1:8811). Until then `?runs.url=` points at the NucBox's collector. When the board answers 404 to /plan, the
// plan is made here (rules.ts localPlan); when it answers 404 to /start, the ask is kept in this window only, as a
// request the board does not have yet; /cancel {id} answering {ok} is the shape an undo of a start asks for.
import { useEffect, useRef, useState } from "react";
import { boardPath, isPlan, localPlan, type Board, type Plan, type Request } from "./rules";
import { DEFAULTS, sheetBody, type Sheet } from "./sheet";

export const POLL_MS = 5000;

export interface Read { board: Board | null; error: string | null; okAt: number | null; reading: boolean }

export function useBoard(url: string): Read {
  const [r, setR] = useState<Read>({ board: null, error: null, okAt: null, reading: true });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let t: number | undefined;
    const read = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`it answered ${res.status}`);
        const b = (await res.json()) as Board;
        if (!b || typeof b.at !== "number") throw new Error("its answer is not a runs board");
        if (alive.current) setR({ board: b, error: null, okAt: Date.now(), reading: false });
      } catch (e) {
        const why = e instanceof TypeError ? "nothing answers there" : String((e as Error)?.message ?? e);
        if (alive.current) setR((o) => ({ ...o, error: why, reading: false }));
      }
      if (alive.current) t = window.setTimeout(read, POLL_MS);
    };
    read();
    return () => { alive.current = false; window.clearTimeout(t); };
  }, [url]);
  return r;
}

async function post(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

/** a plan for a sentence: the board's, or, when the board has no /plan (404) or does not answer, made here */
export async function askPlan(url: string, board: Board, sentence: string, project: string, sheet: Sheet = DEFAULTS): Promise<Plan> {
  try {
    // his changed rules go with the ask (#906); the engine half keeps the sheet itself and sends POST <board>/sheet
    const r = await post(boardPath(url, "plan"), { sentence, project, sheet: sheetBody(sheet) });
    if (r.status === 200 && isPlan(r.json)) return r.json;
  } catch { /* the board does not answer: planned here */ }
  return localPlan(board, sentence, Math.floor(Date.now() / 1000), sheet);
}

/** the press "Run": the board starts it, or (no /start yet) the ask is kept here and said so */
export async function askStart(url: string, plan: Plan): Promise<{ ok: boolean; state: string; here: boolean }> {
  if (!plan.id.startsWith("here-")) {
    try {
      const r = await post(boardPath(url, "start"), { id: plan.id });
      const j = r.json as { ok?: boolean; state?: string } | null;
      if (r.status === 200 && j) return { ok: !!j.ok, state: j.state ?? (j.ok ? "asked" : "refused"), here: false };
      if (r.status !== 404) return { ok: false, state: `the board answered ${r.status}`, here: false };
    } catch { /* falls to here */ }
  }
  return { ok: true, state: "kept here: the board cannot start runs yet", here: true };
}

/** the undo of a start: the board's /cancel, else (kept here) only forgotten here */
export async function askCancel(url: string, id: string, here: boolean): Promise<boolean> {
  if (here) return true;
  try { const r = await post(boardPath(url, "cancel"), { id }); return r.status === 200 && !!(r.json as { ok?: boolean } | null)?.ok; }
  catch { return false; }
}

/** the asks kept in this window (the board had no /start), shown with the board's own requests */
export type LocalAsk = Request & { id: string; here: true };
