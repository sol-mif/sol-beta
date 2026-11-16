// The stage's fixture (#696): five blocks and a session's stage.json from sol/design/system/fixtures/stage, poured into
// a store, so the stage can be tried and shot with no engine. Loaded only when asked: the dev page (stage.html), or the
// face with `?stage=fixture` on its link or `sol.stage.fixture` = 1 in its storage (fixtureAsked).
import type { Block, Line, StageJson } from "./model";
import type { StageStore } from "./store";

const raw = import.meta.glob("../../../design/system/fixtures/stage/**/*.{json,jsonl}", { query: "?raw", import: "default" });
const at = (path: string) => Object.entries(raw).find(([k]) => k.endsWith(path))?.[1];
const text = async (path: string) => { const f = at(path); return f ? String(await f()) : null; };

/** the fixture's blocks, in the order they are written to the stage, and its stage.json */
const FIXTURE = "sol.stage.fixture";
/** the fixture asked for: an empty stage gets its five blocks (What to try, with no engine) */
export const fixtureAsked = () => {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("stage") === "fixture") return true;
  try { return localStorage.getItem(FIXTURE) === "1"; } catch { return false; }
};

export const ORDER = ["week", "kit-side", "side-diff", "stills", "gate"];
export async function fixture(also: string[] = []): Promise<{ blocks: Block[]; stage: StageJson; ledger: Record<string, Line[]> }> {
  const ids = [...ORDER, ...also];
  const blocks: Block[] = [], ledger: Record<string, Line[]> = {};
  for (const id of ids) {
    const b = await text(`/blocks/${id}/block.json`);
    if (!b) continue;
    const body = await text(`/blocks/${id}/body.json`);
    blocks.push({ ...JSON.parse(b), body: body ? JSON.parse(body) : undefined });
    ledger[id] = ((await text(`/blocks/${id}/ledger.jsonl`)) ?? "").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Line);
  }
  const stage = JSON.parse((await text("/sessions/the-stage/stage.json")) ?? "null") as StageJson;
  return { blocks, stage, ledger };
}

/** the fixture's first n blocks composed on a session's stage, at their places where the fixture has one */
export async function pour(st: StageStore, session: string, n = ORDER.length, also: string[] = []) {
  const f = await fixture(also);
  const take = [...f.blocks.slice(0, n), ...f.blocks.filter((b) => also.includes(b.id))];
  for (const b of take) {
    const p = f.stage.blocks.find((x) => x.id === b.id);
    st.compose(session, b, p ? { x: p.x, y: p.y, w: p.w, h: p.h, z: p.z, folded: p.folded } : undefined);
  }
}
