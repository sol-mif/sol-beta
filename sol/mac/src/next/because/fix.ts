// A fix to what Sol knows, and what it would change (BR1, #1615; mine/look/br1/because.html scene 2). The engine's
// next.you.fact.fix {k, how, now?, place?} answers a preview, {changes: [{what, from, to, when}], token}; the token is
// then kept or given back. "right" saves at once. The fixer is held here once a wire has it (setFixer), so the because
// offers the four ways only where a fix can be kept; until then it offers Not true (a forget). Pure but for the
// store, so the words are tested without a window. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import { useSyncExternalStore } from "react";
import { samePlace, type Known } from "../known.ts";

export type How = "right" | "not-true" | "not-anymore" | "only-here";
/** to null: the fact goes and nothing stands in its place; when: "now", "from the next read" or a day ("tomorrow") */
export type Change = { what: string; from?: string; to: string | null; when?: string };
/** the other places Sol used the same fact for the same reason (P's one store, next.you.fact.fix's same): null, none */
export type SameOf = { reason: string; n: number; these: { k: string; place: string | null; fact: string }[] };
export type Preview = { changes: Change[]; token: string; same?: SameOf | null };
export type Fixer = {
  /** a preview of what would change (for "right", saved at once); null: not taken */
  fix(a: { k: string; how: How; now?: string; place?: string }): Promise<Preview | null>;
  settle(token: string, keep: boolean): Promise<void>;
  /** a kept fix taken to the other places (next.known.same): these keys, or everywhere; false: not taken */
  same?(a: { reason: string; how: How; reach: "here" | "these" | "everywhere"; to?: string[] }): Promise<boolean>;
};

/** the ways in plain words: the card check's Jev read "Not true", "Not anymore" and "Only here" as unclear, and "That
 *  changed" and "Only in <a folder's name>" too, alone on a button; these it reads clear */
export const HOW_W: Record<How, string> = { right: "That’s right", "not-true": "That’s wrong", "not-anymore": "It’s out of date", "only-here": "Only in this folder" };
/** a place as its name: the last part of its path ("w:/u/ana/thesis" → "thesis") */
export const placeWord = (p: string) => p.replace(/^[wh]:/, "").replace(/\/+$/, "").split("/").pop() || p;
/** one way as its hover says it (the button's title): Only here names the folder it keeps the fact to */
export const howW = (h: How, here?: string) => (h === "only-here" && here ? `Only in ${placeWord(here)}` : HOW_W[h]);

/** the ways a fact can be answered where the because sits: Only here for a fact told of a wider place than `here`
 *  (the engine moves only a told fact), the rest always */
export function waysOf(f: Pick<Known, "k" | "place">, here?: string): How[] {
  const only = !!here && f.k.startsWith("fact:") && !(f.place && samePlace(f.place, here));
  return (["right", "not-true", "not-anymore", "only-here"] as const).filter((h) => h !== "only-here" || only);
}

/** when, as the end of a sentence: "now" and "from the next read" as said, a day said "from tomorrow" */
export const whenW = (w: string) => (w === "now" || /^from\b/.test(w) ? w : `from ${w}`);

/** the preview's headline: how many things Sol does would change, and from when, if they all start together */
export function changed(cs: readonly Change[]): string {
  if (!cs.length) return "Nothing Sol does would change. Keep it anyway?";
  const when = new Set(cs.map((c) => c.when ?? ""));
  const at = when.size === 1 && [...when][0] ? ` ${whenW([...when][0])}` : "";
  return `${cs.length === 1 ? "1 thing changes" : `${cs.length} things change`}${at}`;
}

/** one change as its row says it: what, what it was (unsaid when it is the what itself), what it becomes (a fact that
 *  goes: Sol stops using it) */
export function lineOf(c: Change): { what: string; from: string | null; to: string } {
  return { what: c.what, from: c.from && c.from !== c.what ? c.from : null, to: c.to ?? "Sol stops using it" };
}

/** the frame's line once a fix is kept */
export const kept = (cs: readonly Change[]) => (cs.length ? `Kept: ${changed(cs)}` : "Kept: what Sol knows is changed");

let held: Fixer | null = null;
const subs = new Set<() => void>();
/** a wire hands its fixer here once the engine has it; null takes it away (the engine went) */
export function setFixer(f: Fixer | null): void { held = f; subs.forEach((s) => s()); }
export const fixerNow = () => held;
export const useFixer = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, fixerNow, () => null);
