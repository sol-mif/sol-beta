// The extra askers (round 6, #1615; merge/people.js CV.people.EXTRA, NOTES.md "Round 6" · "Shared hooks" and F1): other
// askers join the one queue ahead of the people's (a blocked AI's seat, a move-in item left by Skip, a piece of your own).
// Each registers one provider from its own file; its items carry `.ext` (the provider), not `src`, which Social's cards
// already use. Needs you draws them at the top with the provider's own row, ⌘J walks them first, and the one count
// (cv/core.ts above()) counts them with the canvas's asks.
//   register({ items, line, done?, first?, row? }) → its undo
//   EXTRA       the providers, in the order they registered
//   extOpen()   their open items, in the walk's order (answered ones out, a "later" at the end)
// Ported at the join for slices 11 (move-in), 12 (your own pieces) and 6b (seats). Signed: marcocyl04-ux's agent (#1615).
import type { ReactNode } from "react";
import { hooks } from "../cv/core.ts";
import { items } from "./queue.ts";

/** one item an extra asker has open: its id is unique across the queue (its own `type`, if it gives one, is kept as `of`) */
export type ExtItem = { id: string; [more: string]: unknown };
/** an item as the queue holds it: type "ext", with its provider */
export type ExtOpen = ExtItem & { type: "ext"; of?: unknown; ext: Provider };
export type Provider = {
  /** what it has open now (answered ones may stay: the queue's book keeps what was answered) */
  items(): ExtItem[];
  /** the diary line an answer writes, in the person's words */
  line(t: ExtOpen, said: string): { what: string; why: string | null } | null;
  /** after the queue marks it answered */
  done?(t: ExtOpen, said: string): void;
  /** the Diary's and Far's "The first …" when this ask stands first ("holds Ada up, in Seats") */
  first?(t: ExtOpen): string;
  /** its row on Needs you (focus: ⌘J stands on it) */
  row?(t: ExtOpen, focus: boolean): ReactNode;
};

export const EXTRA: Provider[] = [];

/** a provider joins the queue; the answer takes it out again */
export function register(p: Provider): () => void {
  EXTRA.push(p);
  return () => { const i = EXTRA.indexOf(p); if (i >= 0) EXTRA.splice(i, 1); };
}

/** every provider's items, each with its provider */
export const extraAll = (): ExtOpen[] => EXTRA.flatMap((e) => e.items().map((x) => ({ ...x, of: x.type, type: "ext" as const, ext: e })));
/** the extra askers' open items, in the walk's order */
export const extOpen = (): ExtOpen[] => (EXTRA.length ? items().filter((x): x is ExtOpen => x.type === "ext") : []);
/** the words after "The first" when an extra ask stands first; null when the canvas's ask does */
export function firstWords(): string | null {
  const t = extOpen()[0];
  return t && t.ext.first ? t.ext.first(t) : null;
}

// the store's one count reads it (cv/core.ts above()), without the store importing the people
hooks.extOpen = () => extOpen().length;
