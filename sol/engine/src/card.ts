// The card (the design's gate, step 4, 2026-11): what a block asks beyond its wall, a person's press that says yes to
// it, and what the face is handed to draw the card. The face draws it (Marco's); the engine holds the press and gives two
// doors: GET /things says `waiting` on a block that waits, POST /things/<id>/approve is the press.
//   what it asks   the five lists of needs (domains, folders, programs, Sol's tools, keys), the screen, and a seat's kinds
//                  it hears (seat.turn, seat.done, seat.step, seat.sent: what a person's AI does, never its words). A block that asks none
//                  of these is never asked about (a small room, as Marco's: refused afterwards, shown afterwards). One that
//                  asks any, in either room, waits for a press: the card is about what goes beyond the wall, not the
//                  room's size
//   the press      <Sol's folder>/approved/<home>-<hash>/<id>.json: the asks pressed, when, and the card's print. It sits
//                  beside the log, outside every home and every checkout, so the AI that wrote the record cannot press
//                  for it by writing a line in it. A record that later asks for more waits again with the press kept
//                  (what is new is said on the card); one that asks for less goes on, nothing asked
//   the print      a hash of what the card shows. The press names the print it saw: a record widened between the card
//                  being drawn and the press is not pressed for
//   the sentences  the card always says, when they hold: a key for GitHub is your GitHub account; the screen is the whole
//                  screen; a key another block uses too is shared, by name; hearing a seat is hearing what it does
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeWhole } from "./safewrite.js";
import type { Columns, Needs } from "./record.js";
import { SEAT_KINDS, oldNames } from "./contract/kinds.js";   // the seats' kinds, from the registry
import { keyMeta, haveKey } from "./keys.js";

/** what goes beyond the wall, as lists: what a press says yes to, and what a record asks */
export const OUTWARD = ["domains", "folders", "programs", "sol", "keys"] as const;
export type Ask = Record<(typeof OUTWARD)[number], string[]> & { screen: boolean; hears: string[]; big: boolean; provides: string[] };
export type Pressed = Partial<Ask> & { at?: number; print?: string };

/** what a record asks beyond the wall (pure): its needs' five lists and screen, the seat's kinds it hears, and a room of
 *  its own (a big room never starts without a press, whatever it asks: the design's loader) */
export function askOf(c: Pick<Columns, "needs" | "hears" | "room">): Ask {
  const n: Needs | null = c.needs;
  return {
    ...(Object.fromEntries(OUTWARD.map((k) => [k, [...(n?.[k] ?? [])].sort()])) as Record<(typeof OUTWARD)[number], string[]>),
    screen: !!n?.screen,
    hears: (c.hears ?? []).filter((k) => SEAT_KINDS.includes(k)).sort(),
    big: c.room === "big",
    provides: [...(n?.provides ?? [])].sort(),   // a seat it provides: its asks are as good as everything (step 6)
  };
}
/** a seat's kind as the card says it: the action, without its family (seat.turn: turn) */
const actionOf = (kind: string): string => kind.slice(kind.indexOf(".") + 1);
/** whether it asks anything a person must say yes to */
export const asksAny = (a: Ask): boolean => OUTWARD.some((k) => a[k].length > 0) || a.screen || a.hears.length > 0 || a.big || a.provides.length > 0;

/** what a record asks beyond what was pressed (pure): each thing, said; none when the press covers it. Narrower asks nothing */
export function widerThan(pressed: unknown, a: Ask): string[] {
  const p = (pressed && typeof pressed === "object" ? pressed : {}) as Pressed;
  const more: string[] = [];
  for (const k of OUTWARD) for (const x of a[k]) if (!(Array.isArray(p[k]) && p[k]!.includes(x))) more.push(`${k === "sol" ? "Sol's tool" : k.replace(/s$/, "")} ${x}`);
  if (a.screen && p.screen !== true) more.push("the screen");
  if (a.big && p.big !== true) more.push("a room of its own");
  for (const x of a.provides) if (!(Array.isArray(p.provides) && p.provides.includes(x))) more.push(`being a ${x}`);
  for (const x of a.hears) if (!(Array.isArray(p.hears) && (p.hears.includes(x) || oldNames(x).some((o) => p.hears!.includes(o))))) more.push(`hearing a seat's ${actionOf(x)}`);   // a press from before the event format v1 names the kind as it was (turn): it still covers it
  return more;
}

/** the print of what a card shows (pure): the asks, the one sentence why and the sentences it says (a key that another
 *  block takes up meanwhile is another card) */
export const printOf = (a: Ask, why: string, plain: string[] = []): string => createHash("sha256").update(JSON.stringify({ a, why, plain })).digest("hex").slice(0, 16);

/** a home's folder name under approved/: its path made safe, and a short hash so /a/b-c and /a/b/c never share one */
export const homeKey = (home: string) => `${resolve(home).replace(/[^A-Za-z0-9]/g, "-")}-${createHash("sha256").update(resolve(home)).digest("hex").slice(0, 8)}`;
/** where a block's press is kept: beside the log, outside the home */
export const pressedFile = (app: string, home: string, id: string) => join(app, "approved", homeKey(home), `${id}.json`);
/** the press on file for a block, or null when nobody pressed (or it cannot be read: then nobody did) */
export function readPress(app: string, home: string, id: string): Pressed | null {
  try { const p = JSON.parse(readFileSync(pressedFile(app, home, id), "utf8")); return p && typeof p === "object" && !Array.isArray(p) ? (p as Pressed) : null; } catch { return null; }
}
/** keep a press: what was asked, the print the person saw, when. Written by the engine only, from the face's press */
export function writePress(app: string, home: string, id: string, a: Ask, print: string, at: number): void {
  mkdirSync(app, { recursive: true, mode: 0o700 });
  writeWhole(pressedFile(app, home, id), JSON.stringify({ ...a, print, at }, null, 2) + "\n", { root: app });
}
export const pressedHere = (app: string, home: string, id: string) => existsSync(pressedFile(app, home, id));
/** a block gone from the home: its press goes too */
export const forgetPress = (app: string, home: string, id: string) => rmSync(pressedFile(app, home, id), { force: true });

/** a key on the card: whether there is one yet (else the card asks for it to be pasted), and the other blocks that use it */
export type CardKey = { name: string; have: boolean; purpose?: string; hosts?: string[]; also: string[] };
/** what GET /things says of a block that waits for a person: the face draws its card from this */
export type Waiting = {
  print: string;
  /** the record's one plain sentence: why it needs what it names */
  why: string;
  /** pressed before, and now it asks for more: `more` is what is new */
  again: boolean;
  more: string[];
  /** the five lists, the screen, the seat's kinds it hears */
  asks: Ask;
  /** the sentences the card always says when they hold (the design's gate: the two the spike found, and a shared key) */
  plain: string[];
  keys: CardKey[];
  /** keys it names that are not pasted yet: it waits for them too, even once pressed */
  missing: string[];
};

/** the GitHub sentence holds when a key is for GitHub or the program it runs is gh */
const forGitHub = (name: string, hosts: string[], a: Ask) => /github/i.test(name) || [...hosts, ...a.domains].some((h) => /(^|\.)github\.com(:\d+)?$/i.test(h)) || a.programs.includes("gh");

/** the card for a block (pure but for reading the keys' notes): `users` says, by key name, which other blocks name it */
export function cardOf(app: string, id: string, c: Pick<Columns, "needs" | "hears" | "room">, pressed: Pressed | null, users: (key: string) => string[]): Waiting {
  const a = askOf(c), why = c.needs?.why ?? "";
  const keys: CardKey[] = a.keys.map((name) => {
    const m = keyMeta(app, name);
    return { name, have: haveKey(app, name), ...(m?.purpose ? { purpose: m.purpose } : {}), ...(m?.hosts ? { hosts: m.hosts } : {}), also: users(name).filter((x) => x !== id) };
  });
  const plain: string[] = [];
  for (const k of keys) if (forGitHub(k.name, k.hosts ?? [], a)) { plain.push(`Giving it GitHub (the key ${k.name}) means it can do anything your GitHub account can, not only what it says it is for.`); break; }
  if (!keys.length && a.programs.includes("gh")) plain.push("It runs gh: with a GitHub key it can do anything your GitHub account can.");
  for (const k of keys) if (!forGitHub(k.name, k.hosts ?? [], a)) plain.push(`With the key ${k.name} it can do anything that key lets anyone do${k.hosts?.length ? ` at ${k.hosts.join(", ")}` : ""}.`);
  if (a.screen) plain.push("Turning on screenshots means it sees your whole screen, every window and its title, not only Sol's.");
  for (const k of keys) if (k.also.length) plain.push(`The key ${k.name} is also used by ${k.also.join(", ")}: one key, given to ${k.also.length + 1} blocks.`);
  if (a.provides.includes("seat")) plain.push("It becomes a seat: what you say to it goes to it, and it answers as your AI does. Treat it as having everything it asks for, used however it likes.");
  if (a.hears.length) plain.push(`It hears what your AI does (${a.hears.map(actionOf).join(", ")}): when a turn starts and ends, which tools it uses. Never the words.`);
  if (a.folders.length) plain.push(`It can read and change every file in ${a.folders.join(", ")}.`);
  if (a.big && !OUTWARD.some((k) => a[k].length) && !a.screen) plain.push("It runs in a room of its own beside Sol, walled in: it reaches nothing outside it.");
  if (a.sol.length) plain.push(`It can use Sol's own ${a.sol.length === 1 ? "tool" : "tools"} ${a.sol.join(", ")}, as your AI does.`);
  const more = pressed ? widerThan(pressed, a) : [];
  return { print: printOf(a, why, plain), why, again: !!pressed && more.length > 0, more, asks: a, plain, keys, missing: keys.filter((k) => !k.have).map((k) => k.name) };
}
