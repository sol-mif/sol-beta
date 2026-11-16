// Cowork v3 (fr-30): the face's one way to ask the engine a team.v3.* question that is answered as work.v3.* (slices 1,
// 4, 5, 6, 7), matched by rid. useTeam's ask hears only team.* answers, so this listens on the engine's link itself, for
// its own rid: a work.v3.* answer, or team.error (the engine refused it). { error } when the engine is not there or says
// nothing within the wait. Slices 2, 3 and 8 are answered with their own team.v3.* type and use useTeam's ask.
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";

export function askV3<T = any>(type: string, body: object = {}, wait = 30_000): Promise<T & { error?: string }> {
  return new Promise((ok) => {
    const L = link(ENGINE), rid = `v3-${crypto.randomUUID()}`;
    let t = 0;
    const off = L.on((m: any) => {
      if (m?.rid !== rid || typeof m.type !== "string" || !(m.type.startsWith("work.v3.") || m.type === "team.error")) return;
      off(); window.clearTimeout(t); ok(m.type === "team.error" ? { error: m.message ?? "the engine refused it" } : m);
    });
    if (!L.send({ type, rid, ...body })) { off(); ok({ error: "not connected" } as T & { error?: string }); return; }
    t = window.setTimeout(() => { off(); ok({ error: "no answer" } as T & { error?: string }); }, wait);
  });
}
