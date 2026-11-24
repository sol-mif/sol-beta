// next.workspace and its five acts: a setup Sol suggests, reviewed before anything changes (#1615 BR1; next/workspace.ts,
// next/protocol/WS.md). Its own part, modelled on next-s15.ts, so no other slice's file is edited. Behind ui.next
// (settings.ts uiNext(), read on every message): off, nothing here is answered and nothing is read or written. On, only
// Sol's own windows are answered (a setup is the person's own); any other connection hears {ok:false, why} and nothing
// is read. Answers go to the asker alone; after a keep or an undo the Home folders it touched are told to every window
// as agent.changed {folder} (what agent.sticky tells), and a Build folder made or taken back sends work.sessions again.
// Signed: marcocyl04-ux's agent, BR1 carry (#1615).
import type { Parts, Heard } from "../parts.js";
import { uiNext } from "../settings.js";
import { setWorkspaceTool } from "../next/workspace-tool.js";
import { discard, foldersOf, keep, listPlans, preview, propose, touchesBuild, undo, type Plan } from "../next/workspace.js";
import { becauseOf, EVERYWHERE, fixWhere, noteFix } from "../next/you-known.js";

const REFUSED = "only Sol's own windows";

/** the Home folder a suggestion touches, as a fix's place (h:<folder>): what its keep changed, else what its operations
 *  name (a folder it makes, by its name); more than one, or none, everywhere */
export function placeOfPlan(p: Plan): string {
  const made = new Map(p.operations.flatMap((o) => (o.op === "create_folder" ? [[o.key, o.name] as const] : [])));
  const named = (region: string) => (region.startsWith("$") ? made.get(region.slice(1)) ?? "" : region);
  const fs = p.applied ? foldersOf(p) : p.operations.flatMap((o) => o.op === "create_folder" ? [o.name] : o.op === "create_piece" ? [named(o.region)] : o.op === "move_piece" ? [o.ref.folder, named(o.region)] : [o.ref.folder]);
  const one = [...new Set(fs.filter(Boolean))];
  return one.length === 1 ? `h:${one[0]}` : EVERYWHERE;
}

export default function (p: Parts) {
  p.atStart((e) => setWorkspaceTool(e.HOME, e.everyone));   // suggest_setup (next/workspace-tool.ts) stores into this home and tells these windows
  const hear = (type: string, f: (msg: any, home: string, h: Heard) => object) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      h.face.send({ type, ...rid, ...f(msg ?? {}, h.HOME, h) });
    });
  /** the windows told what a keep or an undo changed, as the engine's own writes tell them */
  const tell = (r: { ok: boolean; plan?: Plan }, h: Heard) => {
    if (!r.ok || !r.plan) return r;
    for (const folder of foldersOf(r.plan)) { h.everyone({ type: "agent.changed", folder }); h.everyone({ type: "agents.changed", folder }); }
    if (touchesBuild(r.plan)) void import("../work/wire.js").then((w) => w.broadcastSessions()).catch(() => {});
    return r;
  };

  hear("next.workspace", (_m, home) => listPlans(home));
  hear("next.workspace.propose", (m, home) => propose(home, m.spec, m.source));
  // a plan a session suggested says why: the keys of what that session's first turn told (next.session.told)
  hear("next.workspace.preview", (m, home) => {
    const r = preview(home, m.id, m.decisions);
    if (!r.ok) return r;
    const l = listPlans(home), plan = l.ok ? l.plans.find((p) => p.id === m.id) : undefined, because = plan?.because?.length ? plan.because : becauseOf(home, plan?.session);
    return because.length ? { ...r, preview: { ...r.preview, because } } : r;
  });
  // one store (#1615): the person's keep, no (discard) and undo of a suggestion are each one fix line in next.known,
  // scoped to the one Home folder it touches, or everywhere when it touches more than one
  const fixed = (home: string, how: "keep" | "back" | "undo", r: { ok: boolean; plan?: Plan }) => {
    if (!r.ok || !r.plan) return r;
    try { noteFix(fixWhere(home), { how, what: `“${r.plan.title}”`, place: placeOfPlan(r.plan), reason: `ws:${r.plan.id}` }); } catch { /* the act stands; its line is lost */ }
    return r;
  };
  hear("next.workspace.keep", (m, home, h) => tell(fixed(home, "keep", keep(home, m.id, { decisions: m.decisions, revision: m.revision })), h));
  hear("next.workspace.discard", (m, home) => fixed(home, "back", discard(home, m.id)));
  hear("next.workspace.undo", (m, home, h) => tell(fixed(home, "undo", undo(home, m.id)), h));
}
