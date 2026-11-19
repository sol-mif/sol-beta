// The waits mark and the count (#825, Home 2; specs home-plan §6 Home 2): a block on the stage that waits on the person
// is a Thing on Today, so Home's count (today.needs.length, which the spine's count reads) goes up by one
// while its question is open. The stage keeps the block's own `waits` (work/blocks.ts, unchanged); what this adds is the
// Thing, one for each block, in the Thing store like any other:
//   the Thing     id it-<the first 12 hex of SHA-256 of "block:<project>/<block id>">, so a block that waits twice is
//                 the same Thing; read "job", state "asks", waitsOn "you", blocks: true (a job waits on it), words the
//                 block's title, folder the project, links ["block:<project>/<block id>"], at when it began to wait.
//                 No card: the face draws a card only from `card`, and the words of one are Marco's to say
//   it leaves     the block live or working again: moving, the job goes on (waitsOn "agent"); frozen: done; closed
//                 (dead): gone. A block that waits again: asks again. Each is one thing.state or thing.done (items.ts)
//   the feeds     every change on the stage, through hooks.ts onStage (work/wire.ts hands the bus to homeStage), each
//                 change that wrote anything pushing home.today to every window without an ask; and at start every
//                 block in the home, so one that began to wait while Home was off has its Thing
//   the answer    home.answer on such a Thing is the block's yes (blocks.ts yes, the answer its note): the block is live
//                 again, and the stage's change sets the Thing moving. The yes in the block is not taken back by an
//                 undo of the answer: that undo is refused (nothing of the Thing changed by the answer itself)
// Only the blocks of the home Home runs over (the engine's SOL_HOME): a context over another folder (a test's) leaves
// the stage alone. Nothing here runs while Home is off (homeStage gives no context then).
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { allBlocks, getBlock, homeRoot, ledger, projects, yes, type Block, type Change, type Line } from "../work/blocks.js";
import type { By } from "../file-trail.js";
import { onAnswer, onStage } from "./hooks.js";
import { changeThing, newThing, type Thing } from "./items.js";
import { ENGINE, YOU } from "./log.js";
import type { Ctx, Unit } from "./unit.js";

/** a block's link on its Thing, and the prefix hooks.ts routes an answer by (specs home-plan §6 Home 1, link forms) */
export const BLOCK = "block:";
export const linkOf = (project: string, blockId: string): string => `${BLOCK}${project}/${blockId}`;
/** the Thing of a block: the same id each time it waits (pure) */
export const thingIdOf = (project: string, blockId: string): string => `it-${createHash("sha256").update(linkOf(project, blockId)).digest("hex").slice(0, 12)}`;
/** the block a Thing stands for, from its link, or null (pure) */
export function blockOf(t: Pick<Thing, "links">): { project: string; id: string } | null {
  for (const l of t.links) {
    const m = /^block:([^/]+)\/([a-z0-9][a-z0-9-]{0,63})$/.exec(l);
    if (m) return { project: m[1], id: m[2] };
  }
  return null;
}
/** how the block's Thing reads while it waits (the face's own words for a job's question: read "job", state "asks") */
export const ASKS = { read: "job", state: "asks", waitsOn: "you", blocks: true } as const;
/** what the block's yes says in its ledger when it was given on Home */
export const ON_HOME = "you, on Home";

/** who a stage line is by, as the log says it (log.ts): a seat's agent, the watch or a run (the engine), else the person */
export function byOf(line?: Pick<Line, "by">): By {
  const by = line?.by ?? "";
  if (!by || /^the (watch|run)$/.test(by)) return ENGINE;
  if (/\bagent\b/.test(by)) return { person: "seat", agent: "work" };
  return YOU;
}
/** when a block began to wait: the line that says so, else its ledger's last waits line, else when it was made */
function waitedAt(project: string, b: Block, line?: Line): number {
  if (line) return line.at;
  const ls = ledger(project, b.id);
  for (let i = ls.length - 1; i >= 0; i--) if (ls[i].ev === "waits") return ls[i].at;
  return b.at;
}

/** the block, as it stands, made true of its Thing: the events written (none when nothing changed) */
export function blockToThing(ctx: Ctx, project: string, b: Block, line?: Line): number {
  const id = thingIdOf(project, b.id), cur = ctx.items.get(id), by = byOf(line);
  if (b.state === "waits") {
    if (!cur) {
      const t: Thing = { id, ...ASKS, folder: project, words: b.title, at: waitedAt(project, b, line), links: [linkOf(project, b.id)], made: [] };
      return newThing(ctx, t, { by }) ? 1 : 0;
    }
    return changeThing(ctx, id, { ...ASKS, folder: project, words: b.title, gone: undefined }, { by }) ? 1 : 0;
  }
  if (!cur || cur.gone) return 0;
  if (b.state === "dead") return changeThing(ctx, id, { gone: true }, { by }) ? 1 : 0;
  if (b.state === "frozen") return cur.state === "done" ? 0 : changeThing(ctx, id, { state: "done", waitsOn: "none" }, { by }) ? 1 : 0;
  // live or working: the question is answered, the job goes on (only from asking: a done Thing stays done)
  return cur.state === "asks" ? (changeThing(ctx, id, { state: "moving", waitsOn: "agent" }, { by }) ? 1 : 0) : 0;
}

const real = (p: string): string => { try { return realpathSync(p); } catch { return resolve(p); } };
/** whether a context is over the home the stage keeps its blocks in */
export const stageHome = (ctx: Ctx): boolean => real(ctx.home) === real(homeRoot());

/** set while an answer gives the block its yes: the answer's own home.today follows (today.ts), so no second push */
let answering = false;
/** one change on the stage (hooks.ts onStage) */
export function stageChanged(ctx: Ctx, m: Change): void {
  if (!m.block || !stageHome(ctx)) return;
  if (blockToThing(ctx, m.project, m.block, m.line) && !answering) ctx.pushToday();
}
/** at start: every block in the home, so a block that began to wait (or stopped) while Home was off is put right */
export function reconcileWaits(ctx: Ctx): number {
  if (!stageHome(ctx)) return 0;
  let n = 0;
  for (const p of projects()) for (const b of allBlocks(p, true)) { try { n += blockToThing(ctx, p, b); } catch (err) { console.error(`home: the block ${p}/${b.id}:`, err instanceof Error ? err.message : String(err)); } }
  return n;
}
/** home.answer on a block's Thing (hooks.ts onAnswer "block:"): the block's yes, the answer its note. Not handled (false,
 *  so today.ts's own rule takes it) when the block is not there or no longer waits */
export async function answerBlock(ctx: Ctx, t: Thing, answer: string): Promise<boolean> {
  const at = blockOf(t);
  if (!at || !stageHome(ctx)) return false;
  const b = getBlock(at.project, at.id);
  if (!b || b.state !== "waits") return false;
  answering = true;
  try {
    const now = yes({ project: at.project, sessionId: b.sessions[0] ?? "", by: ON_HOME }, { id: b.id, note: answer.slice(0, 200) });
    // the stage's change has reached the live Home through the bus; a Home that is not the live one (a test's) is told here
    const last = ledger(at.project, b.id).at(-1);
    blockToThing(ctx, at.project, now, last);
  } finally { answering = false; }
  return true;
}

onStage(stageChanged);
onAnswer(BLOCK, answerBlock);

export const waits: Unit = { name: "waits", start: (ctx) => { reconcileWaits(ctx); } };
