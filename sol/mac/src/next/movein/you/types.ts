// How Sol sees you, the face's side of the messages (BR1, #1615; sol/PROTOCOL.md "next.you", the engine's next/you.ts,
// you-read.ts, you-accounts.ts). The shapes the engine sends and the face draws, named once here so the screens, the
// wire and the panel's fixture agree. Signed: marcocyl04-ux's agent (builder F), BR1 (#1615).
import type { KnownIn } from "../../known.ts";

export const SOURCES = ["claude-sessions", "codex-sessions", "apps", "browser", "calendar-store", "notes", "files", "projects"] as const;
export type Source = (typeof SOURCES)[number];
export const BINS = ["keys", "money", "health", "talk", "id"] as const;
export type Bin = (typeof BINS)[number];
export type Thrown = Record<Bin, number>;
export type Level = "record" | "show" | "draft" | "do";
export type SrcState = "waiting" | "reading" | "done" | "skipped" | "stopped";   // stopped: next.you.stop came first

/** what one row of the read took, drawn when the row is opened (the engine's you-read.ts More): a folder's kinds of files,
 *  its sessions per AI and its last activity; a browser's sites grouped by what they are for; a file's kind and place
 *  (never what is inside: Sol does not open it); `adds` is what the row adds to how Sol sees you */
export type More = {
  kind: "folder" | "sites" | "file" | "app" | "notes" | "date" | "skill" | "tool";
  name: string; adds: string;
  is?: string; where?: string; kinds?: string[]; sessions?: { claude?: number; codex?: number }; last?: string;
  groups?: { what: string; n: number; sites: string[] }[]; n?: number; open?: boolean; at?: string; by?: string;
};

/** a read row opened (BR1 reading.html screen 2): what Sol looked at (names, counts, never the contents it skipped), what it
 *  kept (each line with where it came from, and its k for × → next.you.fact.forget), and what it left alone; P's engine
 *  sends it on next.you.reading items (marco/product-br1-draft-reading-engine-1615). A row without it opens to its More */
export type Open = { looked: string[]; kept: { line: string; from: string; k: string }[]; left: string[] };

/** one step of the read (next.you.reading); `at` is ms since the press */
export type Ev = { at?: number } & (
  | { kind: "order"; order: Source[]; because: { aim: string; line: string } | null }
  | { kind: "source"; source: Source; state: SrcState; line: string; perm?: string }
  | { kind: "item"; source: Source; item: string; notice?: string; setup?: string; perm?: string; place?: string; more?: More; open?: Open; again?: string }   // place: a folder's line, said again with its new count; again: the row next.you.read.again was asked from
  | { kind: "thrown"; source: Source; item: string; bin: Bin; n: number }
  | { kind: "place"; id: string; name: string; colour: string; share: number }
  | { kind: "making"; part?: "places" | "day" | "questions" | "words"; line: string; places?: { id: string; name: string; share: number }[];
      hours?: number[]; quiet?: [number, number] | null; by?: string; ms?: number; budget?: number; made?: string }
  | { kind: "done"; you: You }
);

export type Aim = { w: string; said: boolean; ok: boolean | null; at: string };
/** what Sol knows of a place (next.you parts[].knows) is the one Known (next/known.ts); the part it sits in is its place */
export type Part = {
  id: string; name: string; share: number | null; tools: string[]; ais: number; level: Level | null; faded: boolean; new: boolean; main?: boolean;
  at: number[]; from: string[]; facts: number; knows?: KnownIn[];
};
/** how Sol talks (you.talk, next.you.talk): by "you" (picked), "read" (what the person set their own AI to, said in why), "default" */
export const TALKS = ["plain", "brief", "explained"] as const;
export type Talk = (typeof TALKS)[number];
export type Question = { q: string; at: number | null; kind: "check" | "drift"; aim?: string; k?: string };   // k: the engine's key (main:<place>, done:<place>, new:<place>, aim:<aim>, drift:<aim>), sent back by next.you.answer
export type Setup =
  | { kind: "place"; id: string; name?: string; zone?: string; label?: string }
  | { kind: "level"; place: string; level: Level; label?: string }
  | { kind: "look"; knob: string; scope: string; take: string; reason: string; count: number; label?: string }
  | { kind: "date"; words: string; label?: string };
export type You = {
  who: string | null; said: string | null; headline: string; aims: Aim[]; seenAims: string[]; parts: Part[];
  day: { hours: number[]; quiet: [number, number] | null }; sieve: { thrown: Thrown; keep: Bin[] };
  read: { at: string | null; sources: Source[]; by: "device" | "claude" | "none" | null; made: "device" | "claude" | "rules" | null; digest: string;
    closed?: { what: string; perm: string; line: string }[]; stopped?: Source[];
    /** the sources the person said no to (consent "no", next.you.source; agreed with the people builder, not yet sent) */
    off?: Source[];
    claude?: boolean };   // the switch "Let Claude read a short summary" (next.you.claude), once the engine holds it
  questions: Question[]; setup: Setup[]; again: { weekly: boolean; last: string | null; due: boolean };
  talk?: { style: Talk; by: "you" | "read" | "default"; why: string | null };
};

/** by: "claude" once the person has pressed a read with their Claude, else "device"; claudeAsk: the engine's own sentence
 *  for the moment Sol asks to use their Claude, said word for word */
export type Suggest = { sources: Source[]; order: Source[]; because: { aim: string; line: string } | null; by?: "device" | "claude"; claudeAsk?: string };
export type Ai = { id: string; name: string; via: "sign-in" | "key"; present: boolean; signedIn: boolean };
export type Connector = { name: string; kind: "account" | "mcp"; via: "claude" | "claude-account" | "codex" | "gh"; connected: boolean };
export type Accounts = { ais: Ai[]; connectors: Connector[] };
export type Perm = { id: string; name: string; why: string; link: string; granted: boolean | null; opens?: string[] };
export type Applied = { ok: boolean; apply: string; items?: { i: number; kind: Setup["kind"]; label: string; ok: boolean; why?: string }[]; item?: number; back?: boolean };

/** a panel person, as the engine would answer them (fixture.ts); `typed` is screen 1's own words; `only` is Skip */
export type Panel = {
  key: string; name: string; lang: "en" | "ko"; look: string; typed: string; only?: boolean;
  suggest: Suggest; accounts: Accounts; perms: Perm[]; reading: Ev[]; you: You;
};
