// A folder's own stickies (#957): the ones a person makes in Home, kept in the folder as stickies.md, a file a person
// reads and edits by hand as well. Since #1228 the engine keeps them (sol/engine/src/agent/stickies.ts): the face only
// asks (agent.stickies, agent.sticky, agent.press) and draws the run it is told about (agent.step).
//   - [ ] Outline offer and acceptance — the elements, one case each
//     - asked Nov 10 19:40 ← now
//     - did: made/2026-11-10-offer.md, one page
// `- [x]` is done. The line after " — " is what it asks. The indented lines under it are what was asked and what the
// folder's agent did. A press (the engine's, agent.press) writes "← now" on the one pressed and runs the rule `stickies`.
import { useCallback, useEffect, useRef, useState } from "react";

export type Made = { done: boolean; t: string; s: string; notes: string[]; shown?: Shown; reach?: keyof typeof PRESS };
/** a thing the person showed once ("show me once", showOnce.tsx): what it saw, in order, and when it is to be done.
 *  Kept as notes under the sticky, so the file stays the one a person reads:
 *    - shown Nov 11 · every week        (or "· when I press")
 *    - step: https://…/course · pressed "Week 12"
 *  "every week" is kept and said honestly: nothing runs it by itself yet; on its day it waits for a press. */
export type Shown = { when: "week" | "press"; day: number; steps: string[] };
export const WHEN = { week: "every week", press: "when I press" } as const;
/** Sunday first, as Date.getDay(): 7 Jan 2024 was a Sunday */
const DAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString("en-US", { weekday: "short" }));
const SHOWN = /^shown (.+?) · (every week|when I press)$/, STEP = /^step: (.+)$/;
/** the notes a shown sticky is kept with */
export const shownNotes = (steps: string[], when: Shown["when"], at = new Date()) =>
  [`shown ${at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${WHEN[when]}`, ...steps.map((x) => `step: ${x}`)];
function shownOf(notes: string[]): Shown | undefined {
  const h = notes.map((n) => SHOWN.exec(n)).find(Boolean);
  if (!h) return undefined;
  const day = DAYS.indexOf(h[1].slice(0, 3));
  return { when: h[2] === "every week" ? "week" : "press", day, steps: notes.map((n) => STEP.exec(n)?.[1]).filter((x): x is string => !!x) };
}
/** how a shown sticky waits, in a few words: "every week · waits for Wednesday", "today is its day", "when you press" */
export function waiting(sh: Shown, now = new Date()) {
  if (sh.when === "press") return "when you press";
  if (sh.day < 0) return "every week · waits for your press";
  if (sh.day === now.getDay()) return "every week · today is its day";
  return `every week · waits for ${new Date(2024, 0, 7 + sh.day).toLocaleDateString("en-US", { weekday: "long" })}`;
}
type Ask = <T>(o: object, ms: number) => Promise<T | null>;

export const FILE = "stickies.md";
export const HEAD = (name: string) => `# ${name} · your stickies

Made by you in Home, one per line: \`- [ ]\` open, \`- [x]\` done; after " — " what it asks. Under each, what was asked
and what the folder's agent did. Home and this file are the same list: edit either.
`;
/** the rule a press runs: the folder's agent reads which sticky was pressed from the file (agent.run takes a rule, not a line) */
export const STICKY_RULE = `- [watch] stickies: when I press a sticky in Home, do what the sticky marked "← now" in stickies.md asks, inside this folder; then under it write one line "- did: what you made, with its file names" and take the "← now" mark off; leave its box as it is: Marco ticks it done himself.`;
export const NOW = " ← now";

const ITEM = /^- \[( |x|X)\]\s+(.*)$/, NOTE = /^\s{2,}- (.*)$/;
export function parse(text: string): { head: string; items: Made[] } {
  const head: string[] = [], items: Made[] = [];
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line), n = NOTE.exec(line);
    if (m) { const [t, ...s] = m[2].split(" — "); items.push({ done: m[1] !== " ", t: t.trim(), s: s.join(" — ").trim(), notes: [] }); }
    else if (n && items.length) items[items.length - 1].notes.push(n[1].trim());
    else if (!items.length) head.push(line);
  }
  for (const i of items) { const sh = shownOf(i.notes); if (sh) i.shown = sh; }
  return { head: head.join("\n").replace(/\n+$/, "\n"), items };
}
export function serialize(head: string, items: Made[]): string {
  const body = items.map((i) => [`- [${i.done ? "x" : " "}] ${i.t}${i.s ? ` — ${i.s}` : ""}`, ...i.notes.map((n) => `  - ${n}`)].join("\n")).join("\n");
  return `${head.replace(/\n+$/, "")}\n\n${body}\n`;
}
/** what a sticky last got: the agent's newest "did:" line, else when it was asked */
export const lastOf = (m: Made) => {
  const did = [...m.notes].reverse().find((n) => /^did\b/i.test(n));
  if (did) return did.replace(/^did:?\s*/i, "did: ").replace(/`/g, "").replace(/\bmade\/\d{4}-\d\d-\d\d-/g, "made/");
  const asked = [...m.notes].reverse().find((n) => /^asked\b/i.test(n));
  // the gate's words in the asked line are for the run (#1497); the person reads only when
  return asked ? asked.replace(NOW, "").replace(GATE, "") + (asked.endsWith(NOW) ? " · working" : "") : null;
};
const GATE = / · (drafts|asks|yes): .*$/;
/** how far a press goes (the engine's reach from the sticky's words, #1497): the foot's word, and what it promises */
export const PRESS = {
  does: ["do it", "the folder's agent does what it asks, while you watch"],
  drafts: ["draft it", "Sol gets it ready; nothing is sent until you press Send"],
  asks: ["get it ready", "Sol gets it ready and stops before any payment, submission or deletion"],
} as const;
export const stamp = (d = new Date()) => `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d.toTimeString().slice(0, 5)}`;

type Sub = (f: (m: any) => void) => () => void;
export type Board = ReturnType<typeof useStickies>;
/** one step of a run, as the engine tells it (agent.step, engine agent/index.ts RunStep) */
export type RunStep = { kind: "start" | "tool" | "made" | "end"; at: number; text: string; id?: string; rule?: string; sticky?: string; done?: boolean; ok?: boolean; report?: string };
/** a run of this folder: going now, or the last one ended (kept on screen until the next) */
export type RunOf = { rule: string; sticky?: string; at: number; steps: RunStep[]; end?: RunStep };
type Answer = { ok?: boolean; why?: string; items?: Made[]; undo?: string; key?: string };
/** how a sticky was finished or dropped (#1493): its button, carried to the tray, or the Delete key */
export type Via = "button" | "carry" | "key";

/** the list for one folder (its absolute path, null while unknown), kept by the engine: every change is asked of it and
 *  the list it answers is drawn; a change the agent or a hand made meanwhile comes back with the next answer. The run
 *  of this folder, pressed here or started by the clock, is followed as the engine tells it (sub: the wire) */
export function useStickies(ask: Ask, folder: string | null, _name: string, sub?: Sub) {
  const [items, setItems] = useState<Made[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [agent, setAgent] = useState<boolean | null>(null);
  const [run, setRun] = useState<RunOf | null>(null);
  const base = folder ? folder.replace(/\/+$/, "").split("/").pop() ?? "" : "";
  const live = useRef(folder);
  live.current = folder;

  const take = useCallback((x: Answer | null, what: string): boolean => {
    if (!x) { setErr(`${what}: the engine did not answer. Your stickies are in the folder's stickies.md.`); return false; }
    if (!x.ok) { setErr(`${what}: ${x.why ?? "it stopped"}.`); return false; }
    if (x.items) setItems(x.items.map((m) => { const sh = shownOf(m.notes); return sh ? { ...m, shown: sh } : m; }));
    setErr(null);
    return true;
  }, []);
  const load = useCallback(async () => {
    if (!folder) return;
    const r = await ask<Answer & { agent?: boolean; running?: RunOf | null }>({ type: "agent.stickies", folder }, 8000);
    if (live.current !== folder) return;
    if (take(r, "Not read") && r) { setAgent(!!r.agent); if (r.running) setRun((was) => (was && !was.end && was.at === r.running!.at ? was : { ...r.running! })); }
  }, [ask, folder, take]);
  useEffect(() => { setItems(null); setRun(null); void load(); }, [load]);
  useEffect(() => sub?.((m: any) => {
    if (m?.folder !== base) return;
    if (m.type === "agent.changed") void load();
    else if (m.type === "agent.step" && m.step) {
      const s = m.step as RunStep;
      setRun((was) => {
        if (s.kind === "start") return { rule: s.rule ?? "", ...(s.sticky ? { sticky: s.sticky } : {}), at: s.at, steps: [s] };
        const r = was && !was.end ? was : { rule: s.rule ?? "", at: s.at, steps: [] };
        const i = s.id ? r.steps.findIndex((x) => x.id === s.id) : -1;
        const steps = i >= 0 ? r.steps.map((x, k) => (k === i ? s : x)) : [...r.steps, s];
        return { ...r, steps, ...(s.kind === "end" ? { end: s } : {}) };
      });
    }
  }), [sub, base, load]);

  const op = useCallback(async (o: object, what: string): Promise<Answer | null> => {
    if (!folder) return null;
    const r = await ask<Answer>({ type: "agent.sticky", folder, ...o }, 8000);
    return take(r, what) ? r : null;
  }, [ask, folder, take]);

  return {
    items, err, agent, run, load,
    /** off the screen: the last run's pane closed */
    closeRun: () => setRun((r) => (r?.end ? null : r)),
    /** made; `due` is the engine's "2026-11-20 18:00" (Today, #1487) */
    add: (line: string, due?: string) => op({ op: "make", line, ...(due ? { due } : {}) }, "Not made"),
    /** gone (dropped, kept a day); the answer carries its undo (null: nothing was removed). `via`: how the person did it
     *  (the button, a carry to the tray, the Delete key), for the count (#1493) */
    remove: async (key: string, via?: Via): Promise<(() => Promise<unknown>) | null> => {
      const r = await op({ op: "remove", key, ...(via ? { via } : {}) }, "Not dropped");
      return r?.undo ? () => op({ op: "undo", id: r.undo }, "Not brought back") : null;
    },
    /** a whole sticky with its notes (a shown one); one of the same title is replaced */
    keep: (m: Made) => op({ op: "keep", item: { done: m.done, t: m.t, s: m.s, notes: m.notes } }, "Not kept"),
    /** one line under a sticky (what a press did) */
    note: (key: string, line: string) => op({ op: "note", key, line }, "Not written"),
    edit: (key: string, t: string, s: string) => op({ op: "edit", key, t, s }, "Not changed"),
    done: (key: string, done: boolean, via?: Via) => op({ op: "done", key, done, ...(via ? { via } : {}) }, "Not ticked"),
    /** its due set ("2026-11-20 18:00") or cleared (null): carried onto Today (#1493) */
    due: (key: string, due: string | null) => op({ op: "due", key, due }, "Not dated"),
    /** the one press: the engine marks it, writes the rule and runs the agent; answered when the run ends */
    press: async (key: string) => {
      if (!folder) return null;
      setItems((l) => l && l.map((m) => (m.t === key ? { ...m, notes: [...m.notes, `asked ${stamp()}${NOW}`] } : m)));
      const r = await ask<{ ok?: boolean; why?: string; ticket?: { needs?: { title?: string } | null } | null }>({ type: "agent.press", folder, key }, 20 * 60_000);
      void load();
      if (!r) setErr("The engine did not answer. Whatever the agent made is in the folder.");
      else if (!r.ok) setErr(r.why ?? "It stopped.");
      return r;
    },
  };
}
