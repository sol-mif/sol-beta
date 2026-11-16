// Cowork v3, slice 5 (fr-30, #558): the face's one way to the engine's team.v3.talk / setup / join. The engine answers
// as work.v3.* with the same rid (team/v3/wire5.ts), heard by ask.ts askV3. A push (a line said, someone waiting,
// someone let in) reaches `onPush`.
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { askV3 } from "./ask";   // the one work.v3.* listener

export type Slice = "talk" | "setup" | "join";
export const ask5 = <T = any>(slice: Slice, call: string, body: object = {}, wait = 30_000): Promise<T & { error?: string }> =>
  askV3<T>(`team.v3.${slice}.${call}`, body, wait);
/** a push of this slice (no rid): work.v3.talk.line, work.v3.talk.asked, work.v3.join.waiting, work.v3.join.in */
export const onPush = (f: (m: any) => void) => link(ENGINE).on((m) => { if (!m?.rid && typeof m?.type === "string" && /^work\.v3\.(talk|join)\./.test(m.type)) f(m); });
/** what Sol says when the engine did not answer */
export const plain = (e: string) => (e === "not connected" || e === "no answer" ? "Sol is not answering on this machine right now" : e);
