// Cowork v3, slice 5 (fr-30, #558): the face's team.v3.talk.* / team.v3.setup.* / team.v3.join.*, answered as
// work.v3.talk.* / work.v3.setup.* / work.v3.join.* (same rid). wire.ts loads this file only with the switch on
// (settings.ts coworkV3), so with it off nothing here is loaded and nothing answers (F7). A line said is pushed to every
// Cowork face as work.v3.talk.line, an ask with it as work.v3.talk.asked.
import { portNow, recordOf, roleOf, type By, type Role } from "./port5.js";
import * as T from "./talk.js";
import * as S from "./setup.js";
import * as J from "./join.js";

export type Ctx = { me: string; push: (m: object) => void; projects: () => { id: string; name: string }[] };
const PROJECT = /^[A-Za-z0-9][\w.-]{0,79}$/;
const ID = /^[\w.:-]{1,120}$/;
const s = (v: unknown) => (typeof v === "string" ? v : "");

export async function handleV3Five(m: Record<string, unknown>, c: Ctx): Promise<object> {
  const type = String(m.type), out = { type: type.replace(/^team\./, "work."), ...(m.rid !== undefined ? { rid: m.rid } : {}) };
  if (!c.me) return { ...out, error: "sign in to GitHub first: what you write here is signed as you" };
  const by: By = { person: c.me };
  const port = await portNow();
  const project = s(m.project);
  const nameOf = (id: string) => c.projects().find((p) => p.id === id)?.name ?? id;
  const needProject = !(type === "team.v3.join.open" || type === "team.v3.talk.asks");
  if (needProject && !PROJECT.test(project)) return { ...out, error: "which project?" };
  try {
    switch (type) {
      // --- Talk
      case "team.v3.talk.threads": {
        const evs = port.since(project);
        return { ...out, project, me: c.me, role: roleOf(recordOf(evs), c.me), threads: T.threadsOf(evs, c.me), names: T.namesOf(evs, recordOf(evs)) };
      }
      case "team.v3.talk.thread": {
        const thread = s(m.thread) || T.GENERAL;
        if (!ID.test(thread)) return { ...out, error: "which thread?" };
        const evs = port.since(project);
        return { ...out, project, thread, lines: T.linesOf(evs, thread), asks: T.openAsks(evs, c.me).filter((a) => a.about === thread) };
      }
      case "team.v3.talk.say": {
        const r = T.say(port, { project, by, thread: s(m.thread) || T.GENERAL, text: s(m.text) });
        if ("error" in r) return { ...out, error: r.error };
        c.push({ type: "work.v3.talk.line", project, ...r.line });
        for (const a of r.asks) c.push({ type: "work.v3.talk.asked", ...a });
        return { ...out, ok: true, line: r.line, asks: r.asks, answered: r.answered };
      }
      case "team.v3.talk.loose": {
        const r = T.toLoose(port, { project, by, line: s(m.line) });
        return "error" in r ? { ...out, error: r.error } : { ...out, ok: true, loose: r.loose, ...(r.already ? { already: true } : {}) };
      }
      case "team.v3.talk.answer": {
        const r = T.answer(port, { project, by, ask: s(m.ask) });
        return "error" in r ? { ...out, error: r.error } : { ...out, ok: true, answered: r.answered };
      }
      case "team.v3.talk.asks": {
        const asks = c.projects().flatMap((p) => T.openAsks(port.since(p.id), c.me));
        return { ...out, asks, count: asks.length };
      }
      // --- Setup
      case "team.v3.setup.open":
      case "team.v3.setup.answer": {
        const rec = recordOf(port.since(project)), like = s(m.like);
        const likeShape = like && like !== project ? { name: nameOf(like), shape: S.shapeOf(recordOf(port.since(like))) } : undefined;
        const said = Array.isArray(m.said) ? m.said.map(String).slice(0, 20) : [];
        const likes = c.projects().filter((p) => p.id !== project && roleOf(recordOf(port.since(p.id)), c.me) && roleOf(recordOf(port.since(p.id)), c.me) !== "guest");
        return { ...out, project, name: nameOf(project), role: roleOf(rec, c.me), now: S.shapeOf(rec), turn: S.converse(said, { now: S.shapeOf(rec), ...(likeShape ? { like: likeShape } : {}) }), starts: S.STARTS, likes };
      }
      case "team.v3.setup.yes": {
        const cards = Array.isArray(m.cards) ? m.cards.map(String) : [s(m.card)];
        const r = S.yesAll(port, { project, by, cards });
        return "error" in r ? { ...out, error: r.error } : { ...out, ok: true, events: r.events.length, now: S.shapeOf(recordOf(port.since(project))) };
      }
      case "team.v3.setup.like": {
        const r = S.startLike(port, { project, by, like: s(m.like) });
        return "error" in r ? { ...out, error: r.error } : { ...out, ok: true, events: r.events.length, now: r.shape };
      }
      // --- Join
      case "team.v3.join.link": {
        const r = J.makeLink(port, { project, by, role: s(m.role) as Role });
        return "error" in r ? { ...out, error: r.error } : { ...out, ok: true, url: r.url, until: r.until, role: r.role };
      }
      case "team.v3.join.open": {
        const r = J.openLink(port, { url: s(m.url), by, name: s(m.name) });
        if ("error" in r) return { ...out, error: r.error };
        if ("asked" in r) c.push({ type: "work.v3.join.waiting", project: r.project });
        return { ...out, ok: true, ...r, name: nameOf(r.project) };
      }
      case "team.v3.join.waiting":
        return { ...out, project, waiting: J.waitingOf(port.since(project)) };
      case "team.v3.join.letin": {
        const r = J.letIn(port, { project, by, who: s(m.who), role: (s(m.role) || undefined) as Role | undefined });
        if ("error" in r) return { ...out, error: r.error };
        c.push({ type: "work.v3.join.in", project, ...r.member, count: r.count });
        return { ...out, ok: true, member: r.member, count: r.count };
      }
      case "team.v3.join.arrival":
        return { ...out, project, ...J.arrivals(port, { project, who: s(m.who) || c.me, name: nameOf(project) }) };
      default: return { ...out, error: "no such call" };
    }
  } catch (e) { return { ...out, error: String((e as Error)?.message ?? e).split("\n")[0].slice(0, 200) }; }
}
