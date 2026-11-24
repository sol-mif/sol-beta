// The engine the Work page's presses send to (BR1, #1615): set by the wire (cv/wire/work.ts) in a real Sol, null on the
// dev page and in tests, where nothing is sent. Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import type { Engine } from "../cv/wire/types.ts";

export const link: { e: Engine | null } = { e: null };
/** send one message to the engine, live only; false when there is none */
export const send = (o: object): boolean => (link.e ? link.e.send(o) : false);
