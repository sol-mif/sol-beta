// Usage (#133, docs/beta/PRD.md section 8): each press of a button on a rail is counted here, and useEngine sends the
// counts once a minute (arrange.used), added into the arrangement's usage by the engine. A count the link could not take
// stays for the next minute. A press in a session turned private (#1242) is known as one at the press and never enters
// the minute's batch, so turning it back later does not count it.
const counts = new Map<string, number>();

/** where a press happened: the open session, and the list of the ones turned private (a button's ctx, buttons/types.ts) */
export type PressAt = { session?: string; w?: { privates?: string[] } };
export const privateAt = (at?: PressAt): boolean => !!at?.session && !!at.w?.privates?.includes(at.session);

export const pressed = (id: string, at?: PressAt) => { if (!privateAt(at)) counts.set(id, (counts.get(id) ?? 0) + 1); };

/** send what was pressed since the last time; kept when the send fails */
export function sendUsage(send: (o: object) => boolean) {
  if (!counts.size) return;
  if (send({ type: "arrange.used", counts: Object.fromEntries(counts) })) counts.clear();
}
