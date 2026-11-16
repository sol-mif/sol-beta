// Team blocks' pure parts (#429; the engine's team/blocks.ts, PROTOCOL round 74): which of Sol's own blocks are live in
// the project in use. The engine says it in `team.project`'s `blocks`; until it has (or an engine too old to say it),
// each block is as its declaration starts it, so a project nobody changed looks as it always did. No React and no
// JSON import here: src/blocks.test.ts.
export type Block = {
  id: string; kind: string; name: string; shows: string; does: string[]; agents: string[];
  start: "on" | "off"; fixed?: boolean; glyph?: string; with?: Record<string, unknown>;
};
/** a block as the engine sends it: whether it is live in the project, whether it is Sol's own or the team's */
export type BlockLive = Block & { live: boolean; from: "code" | "record"; known: boolean };

/** the ids live in the project (pure): the engine's word where it gave one, else the block's start; a fixed one always */
export function liveIds(own: Block[], heard?: BlockLive[] | null): Set<string> {
  const said = new Map((heard ?? []).map((b) => [b.id, b.live]));
  return new Set(own.filter((b) => b.fixed || (said.get(b.id) ?? b.start === "on")).map((b) => b.id));
}

/** a kind's blocks, in the order declared (pure) */
export const ofKind = (own: Block[], kind: string) => own.filter((b) => b.kind === kind);

/** the patch that asks to turn one block on or off (pure): only that block, the engine lays it over the rest */
export const blockPatch = (id: string, on: boolean) => ({ blocks: { [id]: { on } } });
