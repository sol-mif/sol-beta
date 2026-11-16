// Team blocks (#429, C3 of #413): Cowork's tiles (tiles/), card actions (actions/) and project tools (Tools.tsx) as one
// registry. Each block is declared once, in blocks.json beside this file: its id, kind, name, what it shows, what a
// person can do with it, and the agent tools it gives. The engine reads the same file (team/blocks.ts). Each kind's
// place draws only the blocks live in the project in use (`useLiveBlocks`): the dashboard its tiles, the action board
// its actions, the project's page its tools. A block is turned on or off in the project's settings, by agreement.
// A new kind (pages, tables, templates, team tools) is a new place that draws `ofKind(BLOCKS, "<kind>")` filtered by
// `useLiveBlocks`; nothing here changes (sol/README.md, "Team blocks").
import { useEffect, useSyncExternalStore } from "react";
import shipped from "./blocks.json";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { DEV_TEAM, type Team } from "../useTeam";
import { liveIds, ofKind, type Block, type BlockLive } from "./live.ts";

export { blockPatch, type Block, type BlockLive } from "./live.ts";
export const BLOCKS: Block[] = (shipped as { blocks: Block[] }).blocks;
export const blocksOf = (kind: string) => ofKind(BLOCKS, kind);

// one store for every place: the project's word on its blocks, as `team.project` last said it
let heard: { room: string; blocks: BlockLive[] } | null = null;
// ?dev=team: every block on, so a block that ships off (a team tool, #436) can be seen with no engine
let live = DEV_TEAM ? new Set(BLOCKS.map((b) => b.id)) : liveIds(BLOCKS);
const subs = new Set<() => void>();
const set = (room: string, blocks: unknown) => {
  if (!Array.isArray(blocks) || !blocks.length) return;   // an engine that could not read its blocks, or too old to say
  heard = { room, blocks: blocks as BlockLive[] };
  live = liveIds(BLOCKS, heard.blocks);
  subs.forEach((f) => f());
};
let listening = false, roomNow = "";
const listen = () => {
  if (listening || DEV_TEAM) return;
  listening = true;
  link(ENGINE).on((m) => { if (!m?.rid && m?.type === "team.project" && m.rhythm) set(roomNow, m.blocks); });
};

/** the ids of the blocks live in the project in use; until the engine said, each block as it starts */
export function useLiveBlocks(team: Team): Set<string> {
  const room = team.state?.settings.room ?? "";
  useEffect(() => {
    roomNow = room;   // the engine pushes the project in use's page only
    listen();
    if (DEV_TEAM || (heard && heard.room === room)) return;
    // another project's word never stands for this one: back to each block as it starts until this one answers
    if (heard) { heard = null; live = liveIds(BLOCKS); subs.forEach((f) => f()); }
    void team.ask<{ blocks?: unknown; rhythm?: unknown; error?: string }>("team.project", {}, 30_000)
      .then((m) => { if (m.rhythm && roomNow === room) set(room, m.blocks); })
      .catch(() => {});
  }, [team.ask, room]);
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => live);
}
