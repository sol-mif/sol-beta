// How the engine starts a way's room (#1311, team/v3/way-room.ts): a session my own AI runs, woken with nobody there.
// work/wire.ts hands the doors in at the engine's start; way-room.ts takes them when a pass wakes a room. This file sits
// outside team/v3 and imports nothing, so the work side never loads a v3 module with the ways' switch off.
import type { z } from "zod";

/** a tool given to one session alone (work/tools.ts OnlyTool) */
export type RoomTool = { name: string; description: string; shape: Record<string, z.ZodTypeAny>; run: (args: any) => Promise<string> };
export type RoomStart = {
  /** start the session in the empty folder, marked woken by others before it starts (runs.ts holds it bare and narrow) */
  say: (sessionId: string, text: string) => Promise<void>;
  /** its tools, these and nothing else, before it starts */
  give: (sessionId: string, tools: RoomTool[]) => void;
  /** the title, fixed by the engine */
  name: (sessionId: string, title: string) => void;
  /** is its turn still running */
  working: (sessionId: string) => boolean;
  /** end its turn and take its tools back: its time is up, so a resume has nothing to call */
  stop: (sessionId: string, tools: string[]) => Promise<void>;
};

let doors: RoomStart | null = null;
export const setRoomStart = (d: RoomStart | null): void => { doors = d; };
export const roomStart = (): RoomStart | null => doors;
