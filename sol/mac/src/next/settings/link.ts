// The engine Settings' moves send to (#1604, slice 6): set by the wire (cv/wire/settings.ts) in a real Sol, null on
// the dev page and in tests, where nothing is sent. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import type { Engine } from "../cv/wire/types.ts";

export const link: { e: Engine | null } = { e: null };
/** send one message to the engine, live only; false when there is none */
export const send = (o: object): boolean => (link.e ? link.e.send(o) : false);
