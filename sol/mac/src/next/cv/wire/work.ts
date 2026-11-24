// "Sol works for you"'s wire (BR1, #1615): the engine's next.plans, next.autos, next.planner and their answers read into
// D.work through work/read.ts's allowlist; a next.refused for one of them is said on the page. The page's presses send
// through work/link.ts. Asked once when attached. Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
// BR1 item 2: each automation is a piece in the folder it works in (auto/model.ts sync), put again when the list or the
// folders change; the plane lays out what changed. Signed: marcocyl04-ux's agent (builder F).
import { change, hooks } from "../core.ts";
import type { Engine } from "./types.ts";
import { link } from "../../work/link.ts";
import { cleanAutos, cleanBy, cleanPlanner, cleanPlans, empty, type Work } from "../../work/read.ts";
import { sync } from "../../auto/model.ts";

const W = (d: Record<string, unknown>): Work => (d.work as Work | undefined) ?? (d.work = empty()) as Work;
/** the automations' pieces made to match, laid out when they changed */
const place = () => change((d) => { if (sync(d, W(d as never).autos)) hooks.layout?.(); });
const FOLDERS = new Set(["work.sessions", "home.places", "next.movein", "next.state"]);
const undoId = (w: Work) => String((w.undo?.data as { id?: unknown } | undefined)?.id ?? "");
const ours =(t: unknown) => typeof t === "string" && /^next\.(plans|autos|planner)\b/.test(t);

export function attach(e: Engine): void | (() => void) {
  link.e = e;
  const off = e.subscribe((m: { type?: string; [k: string]: unknown }) => {
    const t = m?.type;
    // a new list clears the last refusal, and the Undo once what it put back is in the list again
    if (t === "next.plans") { const plans = cleanPlans(m); change((d) => { const w = W(d); w.plans = plans; w.note = null; if (w.undo?.kind === "plan" && plans.some((p) => p.id === undoId(w))) w.undo = null; }); }
    else if (t === "next.autos") { const autos = cleanAutos(m); change((d) => { const w = W(d); w.autos = autos; w.note = null; if (w.undo?.kind === "auto" && autos.some((a) => a.id === undoId(w))) w.undo = null; }); place(); }
    // the folders came or changed (another wire fills them, maybe after this one): the pieces follow, once that is done
    else if (typeof t === "string" && FOLDERS.has(t)) queueMicrotask(place);
    else if (t === "next.planner") { const p = cleanPlanner(m); change((d) => { W(d).planner = p; }); }
    else if (t === "next.plans.making") change((d) => { const w = W(d); w.making = typeof m.ask === "string" ? m.ask.slice(0, 2000) : ""; w.made = null; w.note = null; });
    else if (t === "next.plans.made" && typeof m.id === "string") { const made = { id: m.id, by: cleanBy(m.by) }; change((d) => { const w = W(d); w.making = null; w.made = made; }); }
    else if (t === "next.plans.removed") change((d) => { W(d).undo = { kind: "plan", name: String((m.plan as { title?: unknown })?.title ?? "The plan").slice(0, 160), data: m.plan }; });
    else if (t === "next.autos.removed") change((d) => { W(d).undo = { kind: "auto", name: String((m.auto as { name?: unknown })?.name ?? "The automation").slice(0, 120), data: m.auto }; });
    else if (t === "next.refused" && ours(m.asked)) {
      const why = typeof m.why === "string" ? m.why.slice(0, 300) : "That was not done.";
      change((d) => { const w = W(d); w.note = why; if (m.asked === "next.plans.make") w.making = null; });
    }
  });
  e.send({ type: "next.planner.get" });
  e.send({ type: "next.plans.get" });
  e.send({ type: "next.autos.get" });
  return () => { off(); if (link.e === e) link.e = null; };
}
