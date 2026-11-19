// owned by slice 5 (AIs, voice, the AI's marks), docs/port/slices.md
// The engine this slice's wire attached (cv/wire/ais.ts), for the moves that send live (pass by work.switch, point by
// work.stage.point). Null on the dev page and in tests: the fixture never sends. Signed: marcocyl04-ux's agent, slice 5 (#1615).
import type { Engine } from "../cv/wire/types.ts";

export type Send = Pick<Engine, "send" | "subscribe">;
let link: Send | null = null;
export const engine = (): Send | null => link;
export function setEngine(e: Send | null): void { link = e; }
