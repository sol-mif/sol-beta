// How Sol sees you, the screens' state and what each press sends (BR1, #1615; mine/look/br1/you.html, sol/PROTOCOL.md
// "next.you"). One store over a port (port.ts: the engine, or a panel person on the dev page):
//   (Here for, the purpose step: parked in br1-update; nothing here asks what Sol is for, nor sends next.you.aims)
//   1 Bring things in  the sources ticked from next.you.suggest, the AIs and connectors (next.you.accounts), a pasted key
//                     (next.you.key), the Mac switches (next.you.perms; the guide opens System Settings at the pane)
//   2 Watching Sol read next.you.read → next.you.reading… folded by model.ts fold(), then next.you
//   3 How Sol sees you the rows; the dial (next.you.level), × (next.you.part.drop, with Back), Look again (next.you.again)
//   4 Sol opens        next.you.apply → next.you.applied; the line on the canvas with Back per item (next.you.back)
// The felt times are kept (press → first line, press → picture) for the PR and the stills. Nothing here fails in front of
// the person: an engine that says no is one plain line where the press was. Signed: marcocyl04-ux's agent (builder F).
import { useSyncExternalStore } from "react";
import { bringCount, fold, reading0, setupOf, type Reading } from "./model.ts";
import type { Accounts, Bin, Level, Perm, Setup, Source, Suggest, Talk, You } from "./types.ts";
import type { Msg, Port } from "./port.ts";

export type Step = 1 | 2 | 3 | 4;
export type GuideCheck = "idle" | "checking" | "off" | "cant";
export type KeyState ={ key: string; provider: string | null; state: "checking" | "ok" | "no"; why?: string };
export type St = {
  step: Step; name: string | null; ko: boolean;
  suggest: Suggest | null; ticked: Source[]; accounts: Accounts | null; perms: Perm[] | null;
  accountsNo: boolean;   // the AIs were asked and no answer came (refused, or none in ACCOUNTS_MS): said, with Ask again (BR1 conform #14)
  key: KeyState | null; guide: Perm | null; guideCheck: GuideCheck;   // after "I did it": asking the Mac, still off, or nobody here can see the switch
  read: Reading; running: boolean; stopping: boolean; skip: boolean; pressAt: number;
  you: You | null; levels: Record<string, Level>; dropped: string[]; lastDrop: string | null; answered: Record<number, string>;
  asking: string[];   // the keys sent as next.you.answer, their row waiting on the reply
  more: boolean;      // screen 4: the places under 1% opened in place
  forgot: { k: string; fact: string; back: boolean } | null;   // Settings › You: the fact last forgotten (Back), or brought back
  telling: boolean;   // a forget or a talk sent; its no is quiet (the picture stands)
  claude: boolean | null;   // "Let Claude read a short summary", as the person set it here; null: as the engine has it
  weekly: boolean; used: boolean;
  applied: { apply: string; items: { i: number; kind: string; label: string; ok: boolean; why?: string }[]; back: number[] } | null;
  said: string;   // one plain line where the last press was, when the engine said no
  felt: { first: number | null; read: number | null; picture: number | null };
};
const st0 = (): St => ({
  step: 1, name: null, ko: false, suggest: null, ticked: [], accounts: null, accountsNo: false, perms: null, key: null, guide: null, guideCheck: "idle",
  read: reading0(), running: false, stopping: false, skip: false, pressAt: 0, you: null, levels: {}, dropped: [], lastDrop: null, answered: {}, asking: [], more: false, forgot: null, telling: false, claude: null,
  weekly: true, used: false, applied: null, said: "", felt: { first: null, read: null, picture: null },
});

/** what only Sol.app can do, given by mount.ts in a real Sol; the dev page has none */
export type Hooks = {
  prep?: (sources: Source[]) => Promise<string | null>;   // the places copy for the read's `from`
  done?: () => void;                                       // the read is over: the copy dropped
  pane?: (p: Perm) => void;                                // System Settings at the pane
  known?: (fresh?: boolean) => Promise<Record<string, boolean> | null>;   // Sol.app's own answer per permission; fresh: asked again, never the one kept
  signIn?: (id: string) => Promise<unknown>;
  connect?: (at: string) => void;                          // a connector's page, opened
  opened?: () => void;                                     // Open Sol pressed and applied: the move-in comes down
};
let hooks: Hooks = {};
export const setHooks = (h: Hooks) => { hooks = h; };

let S: St = st0();
let port: Port | null = null, off: (() => void) | null = null;
const subs = new Set<() => void>();
const set = (f: (s: St) => St) => { S = f(S); for (const g of [...subs]) g(); };
export const get = () => S;
export function useYou<T>(pick: (s: St) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pick(S), () => pick(S));
}
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** what the engine says, into the store */
function heard(m: Msg): void {
  switch (m.type) {
    case "next.you.suggest": if (m.ok !== false) set((s) => ({ ...s, suggest: m as unknown as Suggest, ticked: s.ticked.length ? s.ticked : [...((m.sources as Source[]) ?? [])] })); return;
    case "next.you.accounts":
      if (m.ok !== false) set((s) => ({ ...s, accountsNo: false, accounts: { ais: (m.ais as Accounts["ais"]) ?? [], connectors: (m.connectors as Accounts["connectors"]) ?? [] } }));
      else if (!S.accounts) set((s) => ({ ...s, accountsNo: true }));
      return;
    case "next.you.perms": {
      // no answer is not "off": nobody here saw the switch
      if (m.ok === false) { set((s) => (s.guideCheck === "checking" ? { ...s, guideCheck: "cant" } : s)); return; }
      const perms = (m.perms as Perm[]) ?? [];
      set((s) => {
        const g = s.guide ? perms.find((p) => p.id === s.guide!.id) ?? s.guide : null;
        // after "I did it": on closes the guide; still off stays, says so, and offers the pane again; null (nobody here
        // can see the switch, walk note w1) stays and says so, never "off"
        if (g && s.guideCheck === "checking" && g.granted === true) return { ...s, ...nextGuide(perms) };
        if (g && s.guideCheck === "checking") return { ...s, perms, guide: g, guideCheck: g.granted === false ? "off" : "cant" };
        return { ...s, perms, guide: g };
      });
      return;
    }
    case "next.you.key": set((s) => (s.key ? { ...s, key: { ...s.key, state: m.ok ? "ok" : "no", why: m.ok ? undefined : String(m.why ?? "the provider said no") } } : s)); if (m.ok) askAccounts(); return;
    case "next.you.reading": {
      set((s) => {
        const read = fold(s.read, m as never), t = now() - s.pressAt;
        return { ...s, read, felt: { ...s.felt, first: s.felt.first ?? Math.round(t) } };
      });
      return;
    }
    case "next.you": {
      // a no to an answer (not asked now) or to a stop (no read running) is quiet: the buttons come back, the picture stands
      if (m.ok === false && S.asking.length) { set((s) => ({ ...s, asking: [] })); return; }
      if (m.ok === false && S.telling) { set((s) => ({ ...s, telling: false, forgot: null })); port?.send({ type: "next.you" }); return; }
      if (S.telling) S = { ...S, telling: false };
      if (m.ok === false && S.stopping && !S.running) { set((s) => ({ ...s, stopping: false })); return; }
      if (m.ok === false) { set((s) => ({ ...s, running: false, said: String(m.why ?? "Sol could not read just now") })); return; }
      const you = m.you as You;
      if (S.running) hooks.done?.();
      set((s) => {
        const t = s.running ? Math.round(now() - s.pressAt) : null;
        const read = s.read.you || !s.running ? s.read : { ...s.read, you, making: null };
        // next.you.stop: the sources not finished come back marked stopped (you.read.stopped, or as reading events)
        for (const src of you.read?.stopped ?? []) if (read.sources[src]?.state !== "done") read.sources = { ...read.sources, [src]: { state: "stopped", line: read.sources[src]?.line ?? "" } };
        return { ...s, you, running: false, stopping: false, step: s.stopping ? 3 : s.step, weekly: you.again?.weekly ?? s.weekly, read,
          asking: s.asking.filter((k) => you.questions.some((q) => q.k === k)),
          felt: s.running ? { ...s.felt, read: s.felt.read ?? t, picture: t } : s.felt };
      });
      return;
    }
    case "next.you.part": if (m.ok !== false) set((s) => ({ ...s, dropped: m.dropped ? [...new Set([...s.dropped, String(m.id)])] : s.dropped.filter((d) => d !== m.id), lastDrop: m.dropped ? String(m.id) : null })); return;
    case "next.you.level": if (m.ok === false) set((s) => ({ ...s, said: String(m.why ?? "") })); return;
    // Settings › You's panel: the sieve as the engine kept it (a no leaves the picture as it was)
    case "next.you.sieve": if (m.ok !== false && Array.isArray(m.keep)) set((s) => (s.you ? { ...s, you: { ...s.you, sieve: { ...s.you.sieve, keep: m.keep as You["sieve"]["keep"] } } } : s)); return;
    case "next.you.applied": {
      if (m.ok === false) { set((s) => ({ ...s, said: String(m.why ?? "Sol could not set this up") })); return; }
      if (m.back) set((s) => (s.applied ? { ...s, applied: { ...s.applied, back: [...new Set([...s.applied.back, Number(m.item)])] } } : s));
      else { set((s) => ({ ...s, applied: { apply: String(m.apply), items: (m.items as NonNullable<St["applied"]>["items"]) ?? [], back: [] }, step: 4 })); hooks.opened?.(); }
      return;
    }
  }
  if (m.type === "next.refused" && String(m.asked ?? "") === "next.you.answer") { set((s) => ({ ...s, asking: [] })); return; }   // the buttons come back, no error text
  if (m.type === "next.refused" && m.asked === "next.you.read.again") { set((s) => ({ ...s, said: String(m.why ?? "") })); return; }   // the engine's own why ("Sol did not read … last time: Look again reads it", "a read is running"); the read stands
  if (m.type === "next.refused" && m.asked === "next.you.accounts") { if (!S.accounts) set((s) => ({ ...s, accountsNo: true })); return; }
  if (m.type === "next.refused" && String(m.asked ?? "").startsWith("next.you")) set((s) => ({ ...s, running: false, said: String(m.why ?? "") }));
}

/** the store on a port, from the start (the dev page, a fresh onboarding); `name` is how the screens greet */
export function start(p: Port, o: { name?: string | null; ko?: boolean; step?: Step } = {}): void {
  off?.(); port = p;
  S = { ...st0(), name: o.name ?? null, ko: !!o.ko, step: o.step ?? 1 };
  off = p.subscribe(heard);
  p.send({ type: "next.you" }); p.send({ type: "next.you.suggest" }); askAccounts(); p.send({ type: "next.you.perms" });
}
/** Settings › You on a port: the picture and the AIs asked, the screens' own state left out (nothing read, nothing set up) */
export function watch(p: Port, o: { name?: string | null; ko?: boolean } = {}): void {
  off?.(); port = p;
  S = { ...st0(), name: o.name ?? null, ko: !!o.ko, step: 3 };
  off = p.subscribe(heard);
  p.send({ type: "next.you" }); askAccounts(); p.send({ type: "next.you.suggest" });   // suggest: the Claude switch's by
}
export const stop = () => { off?.(); off = null; port = null; };
/** the AIs and connectors asked (next.you.accounts): with no answer in ACCOUNTS_MS the screen says so and offers Ask again,
 *  never "Asking…" for good (BR1 conform #14); the engine's own wait on a connector's list is 12 s */
export const ACCOUNTS_MS = 15000;
let accountsT: ReturnType<typeof setTimeout> | null = null;
export function askAccounts(): void {
  const p = port; if (!p) return;
  if (S.accountsNo) set((s) => ({ ...s, accountsNo: false }));
  if (accountsT) clearTimeout(accountsT);
  accountsT = setTimeout(() => { accountsT = null; if (port === p && !S.accounts) set((s) => ({ ...s, accountsNo: true })); }, ACCOUNTS_MS);
  p.send({ type: "next.you.accounts" });
}
export const go = (step: Step) => set((s) => ({ ...s, step, said: "", guide: null, guideCheck: "idle" }));


// ---- 1 Bring things in
export const tick = (src: Source) => set((s) => ({ ...s, ticked: s.ticked.includes(src) ? s.ticked.filter((x) => x !== src) : [...s.ticked, src] }));
export const count = () => bringCount(new Set(S.ticked), S.accounts);
export function addKey(key: string, provider: string | null): void {
  if (!provider) { set((s) => ({ ...s, key: { key, provider, state: "no", why: "Sol doesn’t know this kind of key yet" } })); return; }
  set((s) => ({ ...s, key: { key, provider, state: "checking" } }));
  port?.send({ type: "next.you.key", provider, key });
}
/** "Mac asks": the guide up, and in Sol.app System Settings opened at the pane (permit_open, else the perm's link); Not now
 *  (null) also forgets the switches Show me lined up after it */
export function guide(p: Perm | null): void { if (!p) after = []; set((s) => ({ ...s, guide: p, guideCheck: "idle" })); if (p) hooks.pane?.(p); }
/** the switches still to show after the one up (Bring's Show me walks them one at a time) */
let after: Perm[] = [];
/** Bring's one line, Show me: the guide for each switch in turn, the next once the Mac says this one is on */
export function guideAll(ps: Perm[]): void { guide(ps[0] ?? null); after = ps.slice(1); }
/** this switch is done with: the next switch Show me lined up and not on (its pane opened), else the guide closes */
function nextGuide(perms: Perm[] | null): Pick<St, "perms" | "guide" | "guideCheck"> {
  let next: Perm | null = null;
  while (!next && after.length) { const a = after.shift()!; const now = perms?.find((p) => p.id === a.id) ?? a; if (now.granted !== true) next = now; }
  if (next) queueMicrotask(() => hooks.pane?.(next!));
  return { perms, guide: next, guideCheck: "idle" };
}
/** Got it, when nobody here can see the switch: the person's word stands, and the guide moves on */
export function guideOn(): void { set((s) => ({ ...s, ...nextGuide(s.perms) })); }
/** the person says the switch is on: the Mac asked again with the guide still up, fresh (never the answer kept from
 *  before they went to System Settings); on closes it, off says so (the perms case) */
export function guideDone(): void {
  set((s) => ({ ...s, guideCheck: "checking" }));
  if (hooks.known) hooks.known(true).then((known) => port?.send({ type: "next.you.perms", ...(known ? { known } : {}) }), () => port?.send({ type: "next.you.perms" }));
  else port?.send({ type: "next.you.perms" });
}
/** Sign in (Claude Code, Codex): Sol.app's own login, then the accounts asked again */
export function signIn(id: string): void {
  if (!hooks.signIn) { set((s) => ({ ...s, said: "Sign in from Sol.app" })); return; }
  hooks.signIn(id).then(askAccounts, askAccounts);
}
/** Connect (a connector tile that has a way, model.ts connTiles): its page opens (Sol.app's own way, else a tab), and
 *  the accounts are asked again when the person comes back to Sol, so a connector just added shows connected */
export function connect(at: string): void {
  if (hooks.connect) hooks.connect(at);
  else if (typeof window !== "undefined") window.open(at, "_blank");
  if (typeof window !== "undefined") window.addEventListener("focus", () => askAccounts(), { once: true });
}
/** Bring these in: the read, in the order next.you.suggest gave. In Sol.app, `prep` first makes Sol.app's copy of what only it may open
 *  (Safari, Calendar, Notes: places_copy) and the read takes it as `from`; the screen moves at the press either way */
export function bring(): void {
  const order = S.suggest?.order ?? [], sources = [...order.filter((x) => S.ticked.includes(x)), ...S.ticked.filter((x) => !order.includes(x))];
  set((s) => ({ ...s, step: 2, running: true, stopping: false, skip: false, read: reading0(), pressAt: now(), felt: { first: null, read: null, picture: null }, said: "" }));
  // with the person's Claude only when the switch says so (screen 2 and the circle: the same switch, pre-set from by)
  const send = (from: string | null) => port?.send({ type: "next.you.read", sources, by: claudeOn(S) ? "claude" : "device", ...(from ? { from } : {}) });
  if (!hooks.prep) { send(null); return; }
  hooks.prep(sources).then(send, () => send(null));
}
/** Skip: I'll tell Sol myself: nothing read, the picture only from what the person tells Sol later */
export function skip(): void {
  set((s) => ({ ...s, step: 2, running: true, skip: true, read: reading0(), pressAt: now(), said: "" }));
  port?.send({ type: "next.you.read", sources: [], by: "none" });
}
/** Stop here, keep what's read: asked of the engine; the screen moves on when the picture comes (an engine without
 *  next.you.stop finishes the read first, and the screen says it is keeping what's read meanwhile) */
/** Read this again, on an opened row: that one source read again, its rows sent anew (next.you.read.again, proposed to
 *  P's engine; an engine without it says no, in one plain line) */
export const readAgain = (source: Source, item: string) => port?.send({ type: "next.you.read.again", source, item });
export function stopRead(): void { port?.send({ type: "next.you.stop" }); set((s) => ({ ...s, stopping: true })); }

// ---- 3 How Sol sees you
export function level(place: string, l: Level, word: string): void {
  set((s) => ({ ...s, levels: { ...s.levels, [place]: l } }));
  port?.send({ type: "next.you.level", place, level: word });
}
export const drop = (id: string) => port?.send({ type: "next.you.part.drop", id });
export const undrop = (id: string) => port?.send({ type: "next.you.part.drop", id, back: true });
/** a question answered (n: its place in you.questions): next.you.answer with the engine's key; the reply is the corrected
 *  picture, drawn as any next.you (the question leaves it, never this press). "Telling Sol…" meanwhile; with no reply in a
 *  while the buttons come back. An engine with no keys yet: the word is kept, and nothing is written (no aims: the
 *  purpose step is parked) */
export function answer(n: number, a: string, yes: boolean): void {
  const q = S.you?.questions[n], k = q?.k;
  if (k) {
    set((s) => ({ ...s, asking: [...new Set([...s.asking, k])] }));
    port?.send({ type: "next.you.answer", k, yes });
    setTimeout(() => set((s) => (s.asking.includes(k) ? { ...s, asking: s.asking.filter((x) => x !== k) } : s)), 8000);
    return;
  }
  set((s) => ({ ...s, answered: { ...s.answered, [n]: a } }));
}
/** Settings › You: a bin kept, or thrown away again (next.you.sieve) */
export function keepBin(b: Bin): void {
  if (!S.you) return;
  const k = S.you.sieve.keep, keep = k.includes(b) ? k.filter((x) => x !== b) : [...k, b];
  port?.send({ type: "next.you.sieve", keep });
}
/** Settings › You: one fact of a place forgotten (next.you.fact.forget); the reply is the picture without it */
export function forget(k: string, fact: string): void {
  set((s) => ({ ...s, forgot: { k, fact, back: false }, telling: true }));
  port?.send({ type: "next.you.fact.forget", k });
}
/** Back: a told fact returns now, a read one at the next read */
export function unforget(): void {
  const f = S.forgot;
  if (!f || f.back) return;
  set((s) => ({ ...s, forgot: { ...f, back: true }, telling: true }));
  port?.send({ type: "next.you.fact.forget", k: f.k, back: true });
}
/** Settings › You: how Sol talks, picked (null gives it back to what the read found, or plain) */
export function talk(style: Talk | null): void {
  set((s) => (s.you ? { ...s, telling: true, you: { ...s.you, talk: style ? { style, by: "you", why: null } : s.you.talk } } : s));
  port?.send({ type: "next.you.talk", style });
}
/** "Let Claude read a short summary": as the person set it, else as the engine holds it (you.read.claude), else from
 *  next.you.suggest's by; off until one says on */
export const claudeOn = (s: St): boolean => s.claude ?? s.you?.read.claude ?? s.suggest?.by === "claude";
/** the switch pressed: kept here for the next read; told to the engine when it holds the switch (next.you.claude), an
 *  engine without it never asked, so nothing fails in front of the person */
export function claude(on: boolean): void {
  const tell = S.you?.read.claude !== undefined;
  set((s) => ({ ...s, claude: on, telling: tell || s.telling }));
  if (tell) port?.send({ type: "next.you.claude", on });
}
export function weekly(on: boolean): void { set((s) => ({ ...s, weekly: on })); port?.send({ type: "next.you.again", weekly: on }); }
export const used = (on: boolean) => set((s) => ({ ...s, used: on }));
export const more = (on: boolean) => set((s) => ({ ...s, more: on }));
/** Open Sol: the setup applied as one change, Back per item */
export function open(): void {
  if (!S.you) return;
  const setup: Setup[] = setupOf(S.you, new Set(S.dropped), S.levels);
  if (!setup.length) { set((s) => ({ ...s, step: 4, applied: { apply: "", items: [], back: [] } })); hooks.opened?.(); return; }
  port?.send({ type: "next.you.apply", setup });
}

// ---- 4 Sol opens
export const back = (item: number) => { if (S.applied?.apply) port?.send({ type: "next.you.back", apply: S.applied.apply, item }); };
export const backAll = () => { for (const x of S.applied?.items ?? []) if (x.ok && !S.applied!.back.includes(x.i)) back(x.i); };

/** the dev page only: a state set at once, for the stills (dev.tsx) */
export const seed = (f: (s: St) => St) => set(f);
