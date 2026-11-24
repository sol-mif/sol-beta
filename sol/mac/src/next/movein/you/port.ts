// How Sol sees you, what the screens talk to (BR1, #1615): the engine (a real Sol, through the face's link) or a panel
// person (the dev page and the stills, fixture.ts) answering the same next.you.* messages with the same shapes, so the
// screens run one code. The panel's read is replayed at its own times (`speed` 1 is as the fixture says).
// Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { Panel } from "./types.ts";

export type Msg = { type?: string; [k: string]: unknown };
export type Port = { send: (m: Msg) => void; subscribe: (f: (m: Msg) => void) => () => void; live: boolean };

/** a panel person as an engine: each next.you.* answered from the fixture, the read streamed at its times */
export function panelPort(p: Panel, speed = 1): Port {
  const subs = new Set<(m: Msg) => void>();
  const say = (m: Msg) => { for (const f of [...subs]) f(m); };
  const later = (ms: number, m: Msg) => setTimeout(() => say(m), Math.max(0, ms / speed));
  let timers: ReturnType<typeof setTimeout>[] = [];
  let dropped = new Set<string>(), you = p.you;   // `you` as answers change it (next.you.answer)
  const held = new Map<string, { part: string; f: NonNullable<Panel["you"]["parts"][number]["knows"]>[number] }>();   // facts forgotten, for Back
  return {
    live: false,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    send: (m) => {
      switch (m.type) {
        case "next.you": return later(5, { type: "next.you", ok: true, you });
        case "next.you.suggest": return later(5, { type: "next.you.suggest", ok: true, ...p.suggest });
        case "next.you.accounts": return later(30, { type: "next.you.accounts", ok: true, ...p.accounts });
        case "next.you.perms": return later(10, { type: "next.you.perms", ok: true, perms: p.perms });
        case "next.you.sieve": {
          you = { ...you, sieve: { ...you.sieve, keep: (m.keep as typeof you.sieve.keep) ?? [] } };
          return later(5, { type: "next.you.sieve", ok: true, keep: you.sieve.keep });
        }
        case "next.you.key": {
          const k = String(m.key ?? "");
          return later(600, k.length > 20 ? { type: "next.you.key", ok: true, provider: m.provider } : { type: "next.you.key", ok: false, provider: m.provider, why: "the provider says this key is not valid" });
        }
        case "next.you.read": {
          for (const t of timers) clearTimeout(t);
          if (m.by === "none") { later(40, { type: "next.you", ok: true, you }); return; }
          timers = p.reading.map((e) => setTimeout(() => say({ type: "next.you.reading", ...e }), (e.at ?? 0) / speed));
          const end = p.reading.reduce((a, e) => Math.max(a, e.at ?? 0), 0);
          timers.push(setTimeout(() => { timers = []; say({ type: "next.you", ok: true, you }); }, end / speed + 20));
          return;
        }
        case "next.you.stop": {
          if (!timers.length) return later(5, { type: "next.you", ok: false, why: "no read is running" });
          for (const t of timers) clearTimeout(t); timers = []; return later(5, { type: "next.you", ok: true, you });
        }
        case "next.you.read.again": {
          // as the engine (P's you.ts readAgain): that one source read alone, its row sent anew with `again`; refused with a why
          const row = p.reading.find((e) => e.kind === "item" && e.source === m.source && e.item === m.item);
          if (timers.length) return later(5, { type: "next.refused", asked: "next.you.read.again", why: "a read is running" });
          if (!row) return later(5, { type: "next.refused", asked: "next.you.read.again", why: `Sol did not read ${String(m.item ?? "that")} last time: Look again reads it` });
          later(10, { type: "next.you.reading", kind: "source", source: m.source, state: "reading", line: `Reading ${String(m.item)} again` });
          const { at: _at, ...again } = row, done = p.reading.find((e) => e.kind === "source" && e.source === m.source && e.state === "done");
          later(500, { type: "next.you.reading", ...again, again: m.item });
          later(520, { type: "next.you.reading", kind: "source", source: m.source, state: "done", line: done && done.kind === "source" ? done.line : "" });
          return later(540, { type: "next.you", ok: true, you });
        }
        case "next.you.answer": {
          // as the engine: the question leaves; "done:<place>" yes takes the place out of the picture and the setup
          const k = String(m.k ?? "");
          if (!you.questions.some((q) => q.k === k)) return later(5, { type: "next.you", ok: false, why: "that question is not asked now" });
          const gone = m.yes === true && k.startsWith("done:") ? k.slice(5) : null;
          you = { ...you, questions: you.questions.filter((q) => q.k !== k),
            parts: gone ? you.parts.filter((x) => x.id !== gone) : you.parts,
            setup: gone ? you.setup.filter((x) => !(x.kind === "place" && x.id === gone) && !(x.kind === "level" && x.place === gone)) : you.setup };
          return later(30, { type: "next.you", ok: true, you });
        }
        case "next.you.level": return later(20, { type: "next.you.level", ok: true, place: m.place, level: m.level, was: null });
        case "next.you.part.drop": {
          const id = String(m.id); if (m.back) dropped.delete(id); else dropped.add(id);
          return later(20, { type: "next.you.part", ok: true, id, dropped: !m.back });
        }
        case "next.you.fact.forget": {
          // as the engine: the fact leaves its place's knows (a read one its tools too); Back returns a told one now, a
          // read one at the next read
          const k = String(m.k ?? ""), at = you.parts.find((x) => x.knows?.some((f) => f.k === k));
          if (m.back) {
            const was = held.get(k); held.delete(k);
            if (was && k.startsWith("fact:")) you = { ...you, parts: you.parts.map((x) => (x.id === was.part ? { ...x, knows: [...(x.knows ?? []), was.f] } : x)) };
            return later(20, { type: "next.you", ok: true, you });
          }
          if (!at) return later(5, { type: "next.you", ok: false, why: "no such fact" });
          const f = at.knows!.find((x) => x.k === k)!, tool = k.startsWith("tool:") ? k.split(":").slice(2).join(":") : null;
          held.set(k, { part: at.id, f });
          you = { ...you, parts: you.parts.map((x) => (x.id === at.id ? { ...x, knows: x.knows!.filter((y) => y.k !== k), tools: tool ? x.tools.filter((t) => t !== tool) : x.tools } : x)) };
          return later(20, { type: "next.you", ok: true, you });
        }
        case "next.you.talk": {
          const st = m.style as string | null;
          if (st !== null && st !== "plain" && st !== "brief" && st !== "explained") return later(5, { type: "next.you", ok: false, why: "not a way of talking" });
          you = { ...you, talk: st ? { style: st, by: "you", why: null } : { style: "plain", by: "default", why: null } };
          return later(20, { type: "next.you", ok: true, you });
        }
        case "next.you.again": return later(10, { type: "next.you.again", ok: true, again: { weekly: !!m.weekly, last: null } });
        case "next.you.apply": {
          const setup = (m.setup as { kind: string; label?: string }[]) ?? [];
          return later(120, { type: "next.you.applied", ok: true, apply: "ya-panel", items: setup.map((s, i) => ({ i, kind: s.kind, label: s.label ?? s.kind, ok: true })) });
        }
        case "next.you.back": return later(60, { type: "next.you.applied", ok: true, apply: m.apply, item: m.item, back: true });
      }
    },
  };
}
