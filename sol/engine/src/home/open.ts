// One thing in both modes (#830, Home 7; specs home-plan §6 Home 7): a Thing and the block it is on the stage are one
// thing, so what happens to the block happens to the Thing, and moving it between Home and the stage is recorded.
//   frozen      a block that is frozen on the stage makes done every Thing that stands for it: its own Thing (Home 2's
//               id, it-<12 hex of "block:<project>/<id>">) and any other whose links hold "block:<project>/<id>" (a job
//               opened on the stage). One thing.done each, by whoever froze it (the frozen line's `by`, as waits.ts
//               reads a line); a Thing already done, or gone, is left as it is, so freezing again writes nothing. At
//               start every Thing with a block link is read against its block, so a block frozen while Home was off is
//               put right (by the engine). Then home.today to every window, as for any change
//   thing.open  {id, mode?} (contract/home/open.ts): "open on the stage" (mode build, the default) or "back to Home"
//               (mode home). It writes one thing.open { mode } and answers the list to every window. It moves nothing
//               itself: a Thing with no block is not given one (making a block is compose, with a project to choose,
//               which is the face's and the person's), and one with a block is only recorded as opened. An id that is
//               no Thing, a gone one, or an ask that does not parse: the list to the asker, nothing written
// What "back to Home" returns with (what changed on the stage) has no message yet: the Thing's own state, through the
// list, is all the engine sends. Home's evening (the ledger's fold) lists the done Thing once Home 6 is in.
// Only the blocks of the home Home runs over (waits.ts stageHome); nothing here runs while Home is off.
import type { Face } from "../browser.js";
import { getBlock, type Change } from "../work/blocks.js";
import type { By } from "../file-trail.js";
import { OPEN, OpenAsk, MODES } from "../contract/home/open.js";
import { onStage } from "./hooks.js";
import { changeThing, type Thing } from "./items.js";
import { ENGINE, YOU } from "./log.js";
import { sendToday } from "./today.js";
import { BLOCK, byOf, linkOf, stageHome, thingIdOf } from "./waits.js";
import type { Ctx, Handler, Unit } from "./unit.js";

/** what a frozen block makes of its Thing */
export const DONE = { state: "done", waitsOn: "none" } as const;

/** every block a Thing stands for, from its links (pure) */
export function blocksOf(t: Pick<Thing, "links">): { project: string; id: string }[] {
  return t.links.flatMap((l) => {
    const m = /^block:([^/]+)\/([a-z0-9][a-z0-9-]{0,63})$/.exec(l);
    return m ? [{ project: m[1], id: m[2] }] : [];
  });
}
/** whether a Thing stands for this block: its own id (Home 2's), or a link to it (pure) */
export const standsFor = (t: Thing, project: string, blockId: string): boolean =>
  t.id === thingIdOf(project, blockId) || t.links.includes(linkOf(project, blockId));

/** a frozen block: each Thing that stands for it and is not done (nor gone) made done. The events written */
export function freezeThings(ctx: Ctx, project: string, blockId: string, by: By): number {
  let n = 0;
  for (const t of ctx.items.all()) {
    if (t.gone || t.state === "done" || !standsFor(t, project, blockId)) continue;
    if (changeThing(ctx, t.id, DONE, { by })) n++;
  }
  return n;
}

/** one change on the stage (hooks.ts onStage): a block frozen */
export function stageFrozen(ctx: Ctx, m: Change): void {
  if (m.block?.state !== "frozen" || !stageHome(ctx)) return;
  if (freezeThings(ctx, m.project, m.block.id, byOf(m.line))) ctx.pushToday();
}

/** at start: every Thing with a block link whose block is frozen now, made done (by the engine) */
export function reconcileOpen(ctx: Ctx): number {
  if (!stageHome(ctx)) return 0;
  let n = 0;
  for (const t of ctx.items.all()) {
    if (t.gone || t.state === "done" || !t.links.some((l) => l.startsWith(BLOCK))) continue;
    for (const b of blocksOf(t)) {
      let block = null;
      try { block = getBlock(b.project, b.id); } catch { /* a link to no block */ }
      if (block?.state === "frozen" && changeThing(ctx, t.id, DONE, { by: ENGINE })) { n++; break; }
    }
  }
  return n;
}

/** thing.open {id, mode?}: one thing.open, then the list to every window */
const openThing: Handler = (ctx: Ctx, face: Face, msg: unknown) => {
  const m = OpenAsk.safeParse(msg);
  if (!m.success) return sendToday(ctx, face);
  const t = ctx.items.get(m.data.id);
  if (!t || t.gone) return sendToday(ctx, face);
  ctx.log.write({ kind: "thing.open", item: t.id, value: { mode: m.data.mode ?? MODES[0] }, by: YOU });
  ctx.pushToday();
};

onStage(stageFrozen);

export const open: Unit = { name: "open", handlers: { [OPEN]: openThing }, start: (ctx) => { reconcileOpen(ctx); } };
