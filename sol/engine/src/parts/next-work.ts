// "Sol works for you" (BR1, #1615): work plans (next/plans.ts), automations (next/automations.ts) and the planner
// (next/planner.ts), on the wire. Behind the switch ui.next, as parts/next.ts is: off, nothing here answers, nothing
// ticks, no automation fires. Only Sol's own windows are answered (fromSol); anything else is refused and nothing is read.
// A step or an automation runs as a fresh session through the engine's own hands (work/one.ts sessionHands, the same
// say / run / lastWords / stop the orchestration sessions use), asking before each change; the engine makes no runner.
//   next.planner.get                          → next.planner {thisMac, reason, yourAI} to the asker
//   next.plans.get                            → next.plans {plans} to the asker
//   next.plans.make {ask, cwd?}               → next.plans.making {ask} to the asker, then next.plans to every window and
//                                               next.plans.made {id, by} to the asker (by: who planned it)
//   next.plans.write {title, steps}           a plan written by the person: as make, by "you"
//   next.plans.edit {id, revision, title?, steps?} / .start {id, revision, yes, cwd?} / .pause {id} / .stop {id}
//                                             → next.plans to every window
//   next.plans.remove {id}                    → next.plans to every window, next.plans.removed {plan} to the asker (Undo)
//   next.plans.restore {plan}                 the Undo: → next.plans to every window
//   next.autos.get                            → next.autos {autos} to the asker (each with `next`, when it runs next)
//   next.autos.make {name?, does, when, model?, cwd?, region?} / .set {id, on?, does?, when?, name?} / .run {id}
//                                             → next.autos to every window
//   next.autos.when {when, cwd?}              → next.autos.when {when, ok, next, event | why} to the asker: Add's read-back
//   next.autos.remove {id}                  → next.autos to every window, next.autos.removed {auto} to the asker (Undo)
//   next.autos.restore {auto}                 the Undo: → next.autos to every window
// Anything not what it should be changes nothing: next.refused {asked, why} to the asker alone.
// Signed: marcocyl04-ux's agent, BR1 "Sol works for you" (#1615).
import { homedir } from "node:os";
import type { Engine, Heard, Parts } from "../parts.js";
import { onUiNext, uiNext } from "../settings.js";
import { sessionHands, stopSession } from "../work/one.js";
import * as plans from "../next/plans.js";
import * as autos from "../next/automations.js";
import { makePlan, plannerMsg } from "../next/planner.js";
import { NOT_OWN } from "./next.js";
import { noteStop } from "../next/you-known.js";

export const PLAN_MS = 3000, AUTO_MS = 30000;

/** the engine's session hands as plans.ts and automations.ts take them */
export function hands(): plans.Hands {
  const d = () => { const x = sessionHands(); if (!x) throw new Error("sessions are not wired yet"); return x; };
  return {
    start: async (id, text, o) => {
      await d().say(id, text, { cwd: o.cwd }, { free: "ask", ...(o.model ? { model: o.model } : {}) });
      void d().name?.(id, o.title).catch(() => {});
    },
    status: (id) => {
      const r = sessionHands()?.run(id);
      if (!r) return "idle";
      if (r.perms.size > 0) return "asks";
      return r.working || r.busy ? "working" : "idle";
    },
    lastWords: (id) => d().lastWords(id),
    stop: async (id) => { await stopSession(id); },
  };
}

type H = (m: any, h: Heard) => unknown;
const cwd = () => homedir();

export default function (p: Parts) {
  // one change at a time: a tick that waits on a session never writes over a press made meanwhile
  let line: Promise<unknown> = Promise.resolve();
  const serial = <T>(f: () => Promise<T> | T): Promise<T> => { const r = line.then(f, f); line = r.catch(() => {}); return r; };
  const refuse = (h: Heard, asked: string, why: string) => h.send(h.ws, { type: "next.refused", asked, why });
  const own = (type: string, f: H, inLine = true) => p.on(type, (m, h) => {
    if (!uiNext()) return undefined;
    if (!h.fromSol) return refuse(h, type, NOT_OWN);
    return inLine ? serial(() => f(m ?? {}, h)) : f(m ?? {}, h);
  });
  const tellPlans = (e: Engine) => e.everyone(plans.plansMsg(e.HOME));
  const tellAutos = (e: Engine) => e.everyone(autos.autosMsg(e.HOME));
  const plan = (h: Heard, type: string, r: { ok: true } | { ok: false; why: string }) => { if (!r.ok) return refuse(h, type, r.why); tellPlans(h); };
  const auto = (h: Heard, type: string, r: { ok: true } | { ok: false; why: string }) => { if (!r.ok) return refuse(h, type, r.why); tellAutos(h); };
  /** one store (#1615): a Stop the person pressed is one fix line in next.known, scoped to the folder it worked in */
  const stopped = <T extends { ok: boolean }>(h: Heard, of: (r: T) => { what: string; reason: string; cwd: unknown }, r: T): T => {
    if (r.ok) noteStop(h.HOME, of(r));
    return r;
  };

  own("next.planner.get", async (_m, h) => h.send(h.ws, await plannerMsg(h.HOME)), false);   // a first build can take a minute
  own("next.plans.get", (_m, h) => h.send(h.ws, plans.plansMsg(h.HOME)));
  own("next.plans.make", async (m, h) => {
    const ask = typeof m.ask === "string" ? m.ask.trim() : "";
    if (!ask) return refuse(h, "next.plans.make", "Say what should get done.");
    h.send(h.ws, { type: "next.plans.making", ask });
    // the planner runs out of line (it can take a minute); only the plan's write waits its turn
    const made = await makePlan(h.HOME, ask);
    return serial(() => {
      const r = plans.propose(h.HOME, made.spec, { ask, by: made.by, cwd: typeof m.cwd === "string" ? m.cwd : null });
      if (!r.ok) return refuse(h, "next.plans.make", r.why);
      tellPlans(h);
      h.send(h.ws, { type: "next.plans.made", id: r.plan.id, by: made.by });
    });
  }, false);
  own("next.plans.write", (m, h) => plan(h, "next.plans.write", plans.propose(h.HOME, { title: m.title, steps: m.steps }, { by: { who: "you" } })));
  own("next.plans.edit", (m, h) => plan(h, "next.plans.edit", plans.edit(h.HOME, m)));
  own("next.plans.start", async (m, h) => {
    const r = plans.start(h.HOME, m, cwd());
    if (!r.ok) return refuse(h, "next.plans.start", r.why);
    await plans.tick(h.HOME, hands());
    tellPlans(h);
  });
  own("next.plans.pause", async (m, h) => plan(h, "next.plans.pause", await plans.pause(h.HOME, m, hands())));
  own("next.plans.stop", async (m, h) => plan(h, "next.plans.stop", stopped(h, (r) => ({ what: r.ok ? `“${r.plan.title}”` : "a plan", reason: `plan:${r.ok ? r.plan.id : String(m?.id ?? "")}`, cwd: r.ok ? r.plan.cwd : null }), await plans.stop(h.HOME, m, hands()))));
  own("next.plans.remove", (m, h) => {
    const r = plans.remove(h.HOME, m);
    if (!r.ok) return refuse(h, "next.plans.remove", r.why);
    tellPlans(h);
    h.send(h.ws, { type: "next.plans.removed", plan: r.plan });
  });
  own("next.plans.restore", (m, h) => plan(h, "next.plans.restore", plans.restore(h.HOME, m.plan)));

  own("next.autos.get", (_m, h) => h.send(h.ws, autos.autosMsg(h.HOME)));
  own("next.autos.make", (m, h) => auto(h, "next.autos.make", autos.make(h.HOME, m)));
  own("next.autos.when", (m, h) => h.send(h.ws, { type: "next.autos.when", when: m.when, ...autos.whenRead(m) }));
  own("next.autos.set", (m, h) => auto(h, "next.autos.set", m?.on === false ? stopped(h, (r) => ({ what: r.ok ? `“${r.auto.name}”` : "an automation", reason: `auto:${r.ok ? r.auto.id : String(m?.id ?? "")}`, cwd: r.ok ? r.auto.cwd : null }), autos.set(h.HOME, m)) : autos.set(h.HOME, m)));
  own("next.autos.run", async (m, h) => auto(h, "next.autos.run", await autos.runNow(h.HOME, m, hands(), cwd())));
  own("next.autos.remove", (m, h) => {
    const r = autos.remove(h.HOME, m);
    if (!r.ok) return refuse(h, "next.autos.remove", r.why);
    tellAutos(h);
    h.send(h.ws, { type: "next.autos.removed", auto: r.auto });
  });
  own("next.autos.restore", (m, h) => auto(h, "next.autos.restore", autos.restore(h.HOME, m.auto)));

  // the clocks: plans every few seconds while one runs, automations every half minute; nothing while the switch is off
  p.atStart((e) => {
    plans.holdAtStart(e.HOME);   // a plan never goes on by itself after a restart: the person looks, then starts again
    const t1 = setInterval(() => {
      if (!uiNext() || !plans.readPlans(e.HOME).some((x) => x.state === "running")) return;
      void serial(async () => { if (await plans.tick(e.HOME, hands())) tellPlans(e); }).catch(() => {});
    }, PLAN_MS);
    const t2 = setInterval(() => {
      if (!uiNext()) return;
      void serial(async () => { if (await autos.tick(e.HOME, hands(), cwd())) tellAutos(e); }).catch(() => {});
    }, AUTO_MS);
    t1.unref(); t2.unref();
    onUiNext((on) => { if (on) { tellPlans(e); tellAutos(e); } });
  });
}
