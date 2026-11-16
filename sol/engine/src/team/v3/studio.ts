// Cowork v3, slice 6 (fr-30, #559): the studio. An automation is made from words or dragged parts and stored as both:
// the words as they were said, and the flow drawn from them (parts: a trigger, the steps, the outputs). It is never a
// node language; the words stay beside the flow. Every write is one event on the trail (studio-trail.ts, the one
// coupling to slice 0), and the studio's state is folded from them:
//   automation  { what, name, words, flow, owner, on, spend }   made, drawn again, renamed, copied (the whole thing)
//   run         { run, step, part, label, result, state, cost } one per part a run reaches: the run log is these
//   yes.asked   { to, what, place, run, step }                  a part would write to a place someone else connected;
//                                                               the run waits there (slice 2's "needs me" counts it)
//   yes.given   { of, place }                                   that owner's yes; the waiting run goes on
// The maker owns it: only the owner changes or runs it; anyone else may look, or copy it as their own. Each says whose
// subscription pays and its budget for the month; a run over the budget is refused before its first part.
// The three nights (nights.ts) are automations the same way, computed from today's timers and scripts, never stored.
import type { By, Ev, StudioTrail } from "./studio-trail.js";
import { undoneIn } from "./record.js";

export type Part = "when" | "gather" | "ask" | "wait" | "summarize" | "send" | "if";
export const PART_ORDER: Part[] = ["when", "gather", "ask", "wait", "summarize", "send", "if"];
export const PARTS: Record<Part, { name: string; def: string }> = {
  when: { name: "When", def: "every Friday 16:00" },
  gather: { name: "Gather", def: "what changed" },
  ask: { name: "Ask someone", def: "Frank" },
  wait: { name: "Wait for", def: "an answer" },
  summarize: { name: "Summarize", def: "in a few lines" },
  send: { name: "Send", def: "Talk" },
  if: { name: "If, then", def: "something is red" },
};
/** one of today's scripts, called by a part (the nights) */
export type Call = { script: "sol/night" | "sol/release" | "sol/morning"; args: string[] };
export type Step = {
  part: Part; label: string;
  /** where an output writes (send): talk, drive, github, notch, calendar, email, chat, record */
  place?: string;
  /** the script this part runs */
  call?: Call;
  /** for a part after a call: the line of the script's output it reports (a regular expression's source) */
  look?: string;
};
export type Parsed = { words: string; trigger: Step | null; steps: Step[]; outputs: Step[]; flow: Step[] };
/** whose subscription pays, and the month's limit in dollars (0: it may spend nothing) */
export type Spend = { who: string; limit: number };
export type Night = "night" | "release" | "morning";
export type Automation = {
  id: string; project: string; owner: string; name: string; words: string; flow: Step[]; on: boolean; spend: Spend;
  made: number; changed: number;
  /** one of our three nights (nights.ts): its timer, its OnCalendar, the next run; drawn from today's scripts, read-only */
  night?: Night; timer?: string; calendar?: string; next?: string; readonly?: true; note?: string;
};
export type PartRun = { step: number; part: Part; label: string; result: string; state: "done" | "waiting" | "failed"; cost: number; at: number; event: string };
export type Run = { run: string; id: string; at: number; by: By; parts: PartRun[]; state: "done" | "waiting" | "failed"; cost: number; waitingFor?: { to: string; place: string; ask: string } };
export type SpendNow = Spend & { run: number; month: number };
export type Ask = { event: string; id: string; name: string; to: string; place: string; run: string; step: number; by: string; at: number };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isPart = (p: unknown): p is Part => typeof p === "string" && (PART_ORDER as string[]).includes(p);

// ---- words → flow (pure) ----

/** where a send writes, from its words */
export function placeOf(label: string): string {
  const l = label.toLowerCase();
  if (/\bnotch\b/.test(l)) return "notch";
  if (/\bdrive\b|\bdoc(ument)?s?\b|\bfolder\b/.test(l)) return "drive";
  if (/\bgithub\b|\bissue\b|\bpull request\b|\bpr\b/.test(l)) return "github";
  if (/\bcalendar\b/.test(l)) return "calendar";
  if (/\bmail\b|\bemail\b|\binbox\b/.test(l)) return "email";
  if (/\bdiscord\b|\bslack\b|\bwhatsapp\b/.test(l)) return "chat";
  if (/\brecord\b/.test(l)) return "record";
  return "talk";
}

/** a flow from words: the trigger first (when), then the steps, the outputs (send) where they were said */
export function parse(text: string): Parsed {
  const words = String(text ?? "").trim().replace(/\s+/g, " ").slice(0, 600);
  const flow: Step[] = [];
  let s = " " + words.replace(/[.!]+$/, "") + " ";
  const w = s.match(/\b((?:every|each)\s+(?:day|evening|morning|night|week|month|hour|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\w*(?:\s+at\s+\d{1,2}(?::\d\d)?(?:\s*[ap]m)?)?|on\s+the\s+\d{1,2}(?:st|nd|rd|th)(?:\s+of\s+(?:each|every)\s+month)?(?:\s+at\s+\d{1,2}(?::\d\d)?)?|whenever\s+[^,]+?(?=,|\s+then\s|\s+and\s|$)|when\s+[^,]+?\s+(?:happens|lands|arrives|merges|opens|turns red|comes in)\b)/i);
  if (w) { flow.push({ part: "when", label: w[1].replace(/^when(ever)?\s+/i, "").trim() }); s = s.replace(w[0], " , "); }
  for (const c of s.split(/,|;|\bthen\b|\band\b/i).map((x) => x.trim()).filter(Boolean)) {
    let m: RegExpMatchArray | null;
    if ((m = c.match(/^(?:if|unless|only if)\s+(.*)/i))) flow.push({ part: "if", label: m[1] });
    else if ((m = c.match(/^(?:ask|check with)\s+(.*)/i))) flow.push({ part: "ask", label: m[1] });
    else if ((m = c.match(/^wait(?:\s+for)?\s*(.*)/i))) flow.push({ part: "wait", label: m[1] || "an answer" });
    else if ((m = c.match(/^(?:summari[sz]e|sum(?:\s+it)?\s+up|digest|condense|draft)\s*(?:it|that)?\s*(.*)/i))) flow.push({ part: "summarize", label: m[1] || "in a few lines" });
    else if ((m = c.match(/^(?:send|post|tell|notify|put|drop|share)\s+(?:it\s+|that\s+|them\s+)?(?:to\s+|in\s+|into\s+|on\s+)?(.*)/i))) {
      // "send a summary to Talk" is two parts: summarize, then send
      const sum = m[1].match(/^(?:an?\s+|the\s+|my\s+)?(summary|digest|recap|update|report)(?:\s+of\s+(.+?))?\s+(?:to|in|into|on)\s+(.+)$/i);
      if (sum && !flow.some((x) => x.part === "summarize")) flow.push({ part: "summarize", label: sum[2] ? `${sum[2]} as a ${sum[1].toLowerCase()}` : `as a ${sum[1].toLowerCase()}` });
      const label = (sum ? sum[3] : m[1]) || "Talk";
      flow.push({ part: "send", label, place: placeOf(label) });
    }
    else if ((m = c.match(/^(?:gather|collect|find|look at|read|pull|grab|get)\s+(.*)/i))) flow.push({ part: "gather", label: m[1] });
    else if (c.length > 2) flow.push({ part: "gather", label: c });
  }
  const out = flow.slice(0, 9);
  return { words, trigger: out.find((f) => f.part === "when") ?? null, steps: out.filter((f) => f.part !== "when" && f.part !== "send"), outputs: out.filter((f) => f.part === "send"), flow: out };
}

/** the words a drawn flow says, when it was changed by dragging rather than said (pure) */
export function wordsOf(flow: Step[]): string {
  if (!flow.length) return "";
  const said = flow.map((f) => ({
    when: f.label, gather: "gather " + f.label, ask: "ask " + f.label, wait: "wait for " + f.label.replace(/^for\s+/i, ""),
    summarize: "summarize " + f.label, send: "send to " + f.label.replace(/^(to|in|into)\s+/i, ""), if: "if " + f.label,
  })[f.part]);
  return cap(said.join(", ")) + ".";
}

/** a name from the flow: its trigger and what it gathers (pure) */
export function nameOf(flow: Step[]): string {
  const w = flow.find((f) => f.part === "when"), g = flow.find((f) => f.part === "gather");
  return cap([w && w.label.replace(/^(every|each)\s+/i, ""), g && g.label].filter(Boolean).join(": ")) || "New automation";
}

/** a flow as the face sent it, kept to what a flow may hold (pure) */
export function cleanFlow(v: unknown): Step[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 9).flatMap((x) => {
    if (!x || typeof x !== "object" || !isPart((x as Step).part)) return [];
    const f = x as Step, label = String(f.label ?? "").trim().slice(0, 120) || PARTS[f.part].def;
    return [{ part: f.part, label, ...(f.part === "send" ? { place: typeof f.place === "string" && f.place ? f.place : placeOf(label) } : {}) }];
  });
}

// ---- the studio over the trail ----

export type Exec = (step: Step, ctx: { project: string; au: Automation; run: string; index: number; out: string; gathered: string[] }) =>
  Promise<{ result: string; cost?: number; out?: string; gathered?: string[] }>;
export type StudioDeps = {
  trail: StudioTrail;
  now?: () => number;
  /** who connected a place in a project (null: nobody did, or it is the project's own) */
  placeOwner?: (project: string, place: string) => string | null;
  /** runs one of today's scripts; never throws: the exit code and the output */
  script?: (call: Call) => Promise<{ code: number; out: string }>;
  /** runs a part that is not a script (the default does it on the trail itself) */
  exec?: Exec;
};

export const DEFAULT_LIMIT = 2;
const PLACE_WORD: Record<string, string> = { talk: "Talk", drive: "Drive", github: "GitHub", notch: "the notch", calendar: "the calendar", email: "email", chat: "the chat", record: "the record" };
export const placeWord = (p: string) => PLACE_WORD[p] ?? p;
const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);
const rid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const aid = () => `au-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function studioOf(d: StudioDeps) {
  const now = d.now ?? Date.now;
  const evs = (project: string) => d.trail.since(project, 0);

  /** the automations of a project, folded: the latest write of each wins; an undone one (a crossing taken back) is not there */
  function list(project: string): Automation[] {
    const by = new Map<string, Automation>(), all = evs(project), undone = undoneIn(all as never);   // an undone write never happened
    for (const e of all) {
      if (e.kind !== "automation" || !e.item || !e.value || typeof e.value !== "object" || undone.has(e.id)) continue;
      const v = e.value as Partial<Automation> & { what?: string };
      const had = by.get(e.item);
      by.set(e.item, {
        id: e.item, project, owner: String(v.owner ?? had?.owner ?? e.by.person), name: String(v.name ?? had?.name ?? "New automation"),
        words: String(v.words ?? had?.words ?? ""), flow: cleanFlow(v.flow ?? had?.flow), on: v.on ?? had?.on ?? true,
        spend: { who: String(v.spend?.who ?? had?.spend.who ?? e.by.person), limit: Number(v.spend?.limit ?? had?.spend.limit ?? DEFAULT_LIMIT) },
        made: had?.made ?? e.at, changed: e.at,
      });
    }
    return [...by.values()].sort((a, z) => a.made - z.made);
  }
  const get = (project: string, id: string) => list(project).find((a) => a.id === id) ?? null;

  function write(project: string, au: Automation, by: By, what: string): Automation {
    d.trail.append({ project, kind: "automation", item: au.id, by,
      value: { what, name: au.name, words: au.words, flow: au.flow, owner: au.owner, on: au.on, spend: au.spend } });
    return get(project, au.id)!;
  }

  /** a new automation, owned by its maker: from words (the flow drawn from them) or from a drawn flow (words said back) */
  function make(o: { project: string; by: By; words?: string; flow?: unknown; name?: string; spend?: Partial<Spend> }): Automation {
    const p = o.words ? parse(o.words) : null;
    const flow = p ? p.flow : cleanFlow(o.flow);
    const t = now();
    const au: Automation = { id: aid(), project: o.project, owner: o.by.person, name: (o.name ?? "").trim().slice(0, 80) || nameOf(flow),
      words: p ? p.words : wordsOf(flow), flow, on: true, spend: { who: o.spend?.who ?? o.by.person, limit: o.spend?.limit ?? DEFAULT_LIMIT }, made: t, changed: t };
    return write(o.project, au, o.by, "made it");
  }

  /** a change by its owner only: said again in words, drawn again, renamed, paused, its budget */
  function change(o: { project: string; id: string; by: By; words?: string; flow?: unknown; name?: string; on?: boolean; spend?: Partial<Spend> }): Automation | { error: string } {
    const au = get(o.project, o.id);
    if (!au) return { error: "no such automation" };
    if (!same(au.owner, o.by.person)) return { error: `${au.owner} made this one, so only ${au.owner} changes it; you can make your own copy` };
    let what = "changed it";
    const next = { ...au, spend: { ...au.spend } };
    if (typeof o.words === "string" && o.words.trim()) { const p = parse(o.words); next.words = p.words; next.flow = p.flow; what = "drew it again from the words"; }
    else if (o.flow !== undefined) { next.flow = cleanFlow(o.flow); next.words = wordsOf(next.flow); what = "changed the flow"; }
    if (typeof o.name === "string" && o.name.trim()) { next.name = o.name.trim().slice(0, 80); if (what === "changed it") what = `named it “${next.name}”`; }
    if (typeof o.on === "boolean") { next.on = o.on; if (what === "changed it") what = o.on ? "turned it on" : "paused it"; }
    if (o.spend) {
      if (typeof o.spend.who === "string" && o.spend.who) next.spend.who = o.spend.who;
      if (typeof o.spend.limit === "number" && Number.isFinite(o.spend.limit) && o.spend.limit >= 0) next.spend.limit = Math.min(1000, o.spend.limit);
      if (what === "changed it") what = "changed the budget";
    }
    return write(o.project, next, o.by, what);
  }

  /** my own copy of anyone's automation (a night's too): I own it and I pay */
  function copy(o: { project: string; from: Automation; by: By }): Automation {
    return make({ project: o.project, by: o.by, flow: o.from.flow.map(({ part, label, place }) => ({ part, label, ...(place ? { place } : {}) })), name: `${o.from.name}, mine` });
  }

  /** the run log, folded from the trail: one line per part a run reached, the newest run first */
  function runs(project: string, id: string): Run[] {
    const all = new Map<string, Run>();
    const asks = new Map<string, Ev>(), given = new Set<string>();
    for (const e of evs(project)) {
      if (e.item !== id || !e.value || typeof e.value !== "object") continue;
      const v = e.value as Record<string, unknown>;
      if (e.kind === "yes.asked") asks.set(e.id, e);
      if (e.kind === "yes.given" && typeof v.of === "string") given.add(v.of);
      if (e.kind !== "run" || typeof v.run !== "string") continue;
      const r = all.get(v.run) ?? { run: v.run, id, at: e.at, by: e.by, parts: [], state: "done" as Run["state"], cost: 0 };
      const step = Number(v.step);
      const pr: PartRun = { step, part: isPart(v.part) ? v.part : "gather", label: String(v.label ?? ""), result: String(v.result ?? ""),
        state: v.state === "waiting" || v.state === "failed" ? v.state : "done", cost: Number(v.cost) || 0, at: e.at, event: e.id };
      r.parts = [...r.parts.filter((x) => !(x.step === step && x.state === "waiting" && pr.state !== "waiting")), pr];
      r.cost = r.parts.reduce((n, x) => n + x.cost, 0);
      all.set(v.run, r);
    }
    for (const r of all.values()) {
      const last = r.parts[r.parts.length - 1];
      r.state = last?.state ?? "done";
      if (r.state === "waiting") {
        const a = [...asks.values()].reverse().find((x) => (x.value as { run?: string }).run === r.run && !given.has(x.id));
        const av = a?.value as { to?: string; place?: string } | undefined;
        if (a && av) r.waitingFor = { to: String(av.to ?? ""), place: String(av.place ?? ""), ask: a.id };
      }
    }
    const order = [...all.values()];   // the newest first; two runs in one millisecond: the later one on the trail first
    return order.map((r, i) => ({ r, i })).sort((a, z) => z.r.at - a.r.at || z.i - a.i).map((x) => x.r);
  }

  /** what it spent: the last run, this month, of the limit, and whose subscription */
  function spendOf(project: string, au: Automation): SpendNow {
    const rs = runs(project, au.id), m = monthOf(now());
    return { ...au.spend, run: rs[0]?.cost ?? 0, month: rs.filter((r) => monthOf(r.at) === m).reduce((n, r) => n + r.cost, 0) };
  }

  /** the yeses that wait on `me`: a part of someone's automation would write to a place I connected */
  function asksFor(project: string, me: string): Ask[] {
    const names = new Map(list(project).map((a) => [a.id, a.name]));
    const asked: Ask[] = [], given = new Set<string>();
    for (const e of evs(project)) {
      const v = (e.value ?? {}) as Record<string, unknown>;
      if (e.kind === "yes.given" && typeof v.of === "string") given.add(v.of);
      if (e.kind === "yes.asked" && e.item && same(String(v.to ?? ""), me))
        asked.push({ event: e.id, id: e.item, name: names.get(e.item) ?? String(v.what ?? e.item), to: String(v.to), place: String(v.place ?? ""), run: String(v.run ?? ""), step: Number(v.step), by: e.by.person, at: e.at });
    }
    return asked.filter((a) => !given.has(a.event));
  }

  /** has the owner of `place` said yes to this automation writing there? */
  const yesGiven = (project: string, id: string, place: string) => evs(project).some((e) => e.kind === "yes.given" && e.item === id && (e.value as { place?: string })?.place === place);
  /** who must say yes before this part writes: the place's owner when that is not the automation's owner */
  function yesNeeded(project: string, au: Automation, f: Step): string | null {
    if (f.part !== "send" || !f.place || !d.placeOwner) return null;
    const owner = d.placeOwner(project, f.place);
    return owner && !same(owner, au.owner) && !yesGiven(project, au.id, f.place) ? owner : null;
  }

  /** the parts that need someone's yes before a run, as the card names them */
  const needsYes = (project: string, au: Automation) => au.flow.flatMap((f) => { const to = yesNeeded(project, au, f); return to && f.place ? [{ to, place: f.place }] : []; });

  /** what a part that is not a script does: it reads the trail since the last run, and says what it has */
  const plain: Exec = async (f, c) => {
    switch (f.part) {
      case "when": return { result: "now, by hand" };
      case "gather": {
        const before = runs(c.project, c.au.id).find((r) => r.run !== c.run)?.at ?? 0;
        const changed = evs(c.project).filter((e) => e.at > before && e.item !== c.au.id && !e.kind.startsWith("yes."));
        return { result: `found ${changed.length} change${changed.length === 1 ? "" : "s"}`, gathered: changed.map((e) => `${e.kind}${e.item ? " " + e.item : ""}`) };
      }
      case "summarize": { const n = Math.min(8, c.gathered.length); return { result: n ? `${n} line${n === 1 ? "" : "s"}` : "nothing to say" }; }
      case "ask": return { result: `asked ${f.label}` };
      case "wait": return { result: "went on" };
      case "if": return { result: "yes, went on" };
      case "send": return { result: `for ${placeWord(f.place ?? placeOf(f.label))}, on the run log` };
    }
  };

  /** a script's output, read for one part: the last line that matches, or the script's own last line */
  const lineOf = (out: string, look?: string) => {
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    if (look) { const re = new RegExp(look, "i"); const hit = [...lines].reverse().find((l) => re.test(l)); if (hit) return hit.slice(0, 140); return "nothing said"; }
    return (lines[lines.length - 1] ?? "said nothing").slice(0, 140);
  };

  /** one run: every part in order, one trail event each. A part that writes to a place someone else connected asks that
   *  owner first (one yes.asked) and the run waits there; `resume` goes on from the part that waited. Over the month's
   *  budget, it is refused before the first part */
  async function run(o: { project: string; au: Automation; by: By; resume?: string }): Promise<Run | { error: string }> {
    const { project, au, by } = o;
    if (!same(au.owner, by.person)) return { error: `${au.owner} owns “${au.name}”, so only ${au.owner} runs it; you can make your own copy` };
    if (!au.flow.length) return { error: "nothing to run yet: say what should happen, or drag a part in" };
    let runId = rid(), from = 0, out = "", gathered: string[] = [];
    if (o.resume) {
      const was = runs(project, au.id).find((r) => r.run === o.resume);
      if (!was || was.state !== "waiting") return { error: "that run is not waiting" };
      runId = was.run; from = was.parts[was.parts.length - 1].step;
    }
    const sp = spendOf(project, au);
    if (!o.resume && sp.limit > 0 && sp.month >= sp.limit) return { error: `over its budget: $${sp.month.toFixed(2)} of $${sp.limit.toFixed(2)} this month; raise it or wait for the next month` };
    const exec = d.exec ?? plain;
    const ev = (i: number, f: Step, result: string, state: PartRun["state"], cost = 0) =>
      d.trail.append({ project, kind: "run", item: au.id, by, value: { run: runId, step: i, part: f.part, label: f.label, result, state, cost } });
    for (let i = from; i < au.flow.length; i++) {
      const f = au.flow[i];
      const to = yesNeeded(project, au, f);
      if (to) {
        d.trail.append({ project, kind: "yes.asked", item: au.id, by, value: { to, what: au.name, place: f.place, run: runId, step: i } });
        ev(i, f, `waiting for ${to}’s yes to write to ${placeWord(f.place!)}`, "waiting");
        break;
      }
      try {
        if (f.call) {
          const r = d.script ? await d.script(f.call) : { code: 2, out: "no script runner here" };
          out = r.out;
          ev(i, f, `${f.call.script} ${f.call.args.join(" ")}: ${lineOf(r.out)}`.trim(), r.code === 0 ? "done" : "failed");
          if (r.code !== 0) break;
        } else if (f.look !== undefined && out) {
          ev(i, f, lineOf(out, f.look), "done");
        } else {
          const r = await exec(f, { project, au, run: runId, index: i, out, gathered });
          if (r.out !== undefined) out = r.out;
          if (r.gathered) gathered = r.gathered;
          ev(i, f, r.result, "done", Math.max(0, Number(r.cost) || 0));
        }
      } catch (e) {
        ev(i, f, String((e as Error)?.message ?? e).split("\n")[0].slice(0, 140), "failed");
        break;
      }
    }
    return runs(project, au.id).find((r) => r.run === runId)!;
  }

  /** the owner of a place says yes to one ask: the automation may write there from now on */
  function yes(o: { project: string; ask: string; by: By }): { ok: true; id: string; run: string } | { error: string } {
    const e = evs(o.project).find((x) => x.id === o.ask && x.kind === "yes.asked");
    if (!e || !e.item) return { error: "no such ask" };
    const v = e.value as { to: string; place: string; run: string };
    if (!same(v.to, o.by.person)) return { error: `only ${v.to} says yes to this: it is their place` };
    if (o.by.agent) return { error: "a yes is said by its person, never their agent" };
    d.trail.append({ project: o.project, kind: "yes.given", item: e.item, by: o.by, value: { of: e.id, place: v.place } });
    return { ok: true, id: e.item, run: v.run };
  }

  return { list, get, make, change, copy, runs, spendOf, asksFor, needsYes, run, yes };
}
export type Studio = ReturnType<typeof studioOf>;
