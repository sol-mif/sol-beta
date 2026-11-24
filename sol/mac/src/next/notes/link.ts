// The engine the notes and the opened folder send to (BR1, parts 5 and 6): set by the wire (cv/wire/notes.ts) in a real
// Sol, null on the dev page and in tests, where nothing is sent. Signed: marcocyl04-ux's agent, BR1 parts 5 and 6 (#1615).
import type { Engine } from "../cv/wire/types.ts";

export const link: { e: Engine | null } = { e: null };
/** send one message to the engine, live only; false when there is none */
export const send = (o: object): boolean => (link.e ? link.e.send(o) : false);
/** the folders this face asked to start a session in (＋ New session in <folder>), and its first words: the engine's
 *  next.folder.started for one of them opens the session's tab here (BR1 gate 1); another face's start opens nothing */
export const startedHere: Record<string, { at: number; words: string }> = {};
