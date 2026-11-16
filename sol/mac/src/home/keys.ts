// The clean Home's keys (#589, decided 2026-11-02, ~/computer/scratch/sol/atlas-today/home-ux.html): which move a key
// makes from where the focus is. Pure, so it is tested (src/homeKeys.test.ts); Home.tsx reads the focus off the page and
// does the move.
//   Three places side by side: side, talk, pane. In each place, things: a row, a folder, a message, a card, the bar.
//   ← → move between the places; ↑ ↓ move between the things of one place. Enter goes one level in, Esc one level out,
//   back to exactly where you came from. Right means in: → opens a folder, ← closes it; → on a session goes into the
//   talk; inside a card ← → move between its buttons. Typing wins in the bar: there the arrows move the cursor, ↑ in an
//   empty bar steps up into the messages.

export type Place = "side" | "talk" | "pane";
export type Key = "left" | "right" | "up" | "down" | "enter" | "esc";
export type Kind = "head" | "folder" | "session" | "message" | "card" | "bar" | "pane";
export type At =
  | { level: "place"; place: Place }
  | { level: "thing"; place: Place; kind: Kind; open?: boolean }
  | { level: "inside"; place: Place; kind: Kind }
  | { level: "typing"; empty: boolean };
export type Act =
  | { do: "place"; to: Place }      // to that place, on the thing it remembers
  | { do: "step"; by: 1 | -1 }      // the next or the one before in this place (the talk's last is the bar: typing)
  | { do: "remembered" }            // from a place onto the thing it remembers
  | { do: "type" }                  // into the bar
  | { do: "bar-up" }                // from an empty bar up onto the last message
  | { do: "in" }                    // into a thing: its first button, a page's own keys
  | { do: "out" }                   // up one level: to the thing, or from a thing to its place
  | { do: "fold"; open: boolean }   // a folder opened or closed
  | { do: "open" }                  // a session row: its talk opens, the focus goes there
  | { do: "press" }                 // a head row (+ new, all sessions): pressed
  | { do: "inner"; by: 1 | -1 }     // between a card's buttons
  | { do: "unwide" }                // the side opened wide goes back to where you were
  | { do: "pass" }                  // the key is the thing's own (a cursor, a button's Enter, a page)
  | { do: "none" };

const ORDER: Place[] = ["side", "talk", "pane"];
/** the place beside `from` that way, among those showing */
export function beside(places: Place[], from: Place, dir: -1 | 1): Place | null {
  const shown = ORDER.filter((p) => places.includes(p));
  const i = shown.indexOf(from);
  return i < 0 ? null : shown[i + dir] ?? null;
}

export function route(k: Key, at: At, ctx: { places: Place[]; wide?: boolean }): Act {
  const move = (from: Place, dir: -1 | 1): Act => { const to = beside(ctx.places, from, dir); return to ? { do: "place", to } : { do: "none" }; };
  if (at.level === "typing") {
    if (k === "esc") return { do: "out" };
    if (k === "up" && at.empty) return { do: "bar-up" };
    return { do: "pass" };
  }
  if (at.level === "place") {
    if (k === "left") return move(at.place, -1);
    if (k === "right") return move(at.place, 1);
    if (k === "esc") return ctx.wide ? { do: "unwide" } : { do: "none" };
    return { do: "remembered" };
  }
  if (at.level === "inside") {
    if (k === "esc") return { do: "out" };
    if (at.kind === "card" || at.kind === "head") {
      if (k === "left" || k === "up") return { do: "inner", by: -1 };
      if (k === "right" || k === "down") return { do: "inner", by: 1 };
    }
    return { do: "pass" };
  }
  // a thing
  if (k === "up") return { do: "step", by: -1 };
  if (k === "down") return { do: "step", by: 1 };
  if (k === "esc") return ctx.wide && at.place === "side" ? { do: "unwide" } : { do: "out" };
  if (at.place === "side") {
    if (at.kind === "folder") {
      if (k === "right") return at.open ? move("side", 1) : { do: "fold", open: true };
      if (k === "left") return at.open ? { do: "fold", open: false } : { do: "none" };
      return { do: "fold", open: !at.open };
    }
    if (k === "left") return { do: "none" };
    if (k === "right") return at.kind === "session" ? (ctx.wide ? { do: "open" } : move("side", 1)) : { do: "in" };
    return at.kind === "session" ? { do: "open" } : at.kind === "head" ? { do: "press" } : { do: "in" };
  }
  if (k === "left") return move(at.place, -1);
  if (k === "right") return move(at.place, 1);
  return at.kind === "bar" ? { do: "type" } : { do: "in" };
}

// The only two shortcuts (home-ux.html, Marco 2026-11-02): ⌘N a new session, ⌘K jump by name. Nothing else is one:
// the side folds from its corner button, Settings opens from the side's settings row (or ⌘K by name).
export type Shortcut = "fresh" | "jump";
export const shortcut = (ev: { meta: boolean; shift?: boolean; key: string }): Shortcut | null => {
  if (!ev.meta) return null;
  const k = ev.key.toLowerCase();
  if (k === "n" && !ev.shift) return "fresh";
  if (k === "k") return "jump";
  return null;
};

// The folded side, soft-opened over the talk (it never pushes it). Two things hold it open: the cursor (it came in
// at the window's left edge and is still over the side) and the keys (← from the talk landed on it). It soft-closes
// when neither does: the cursor moved away, or the focus left it.
export type Soft = { hover: boolean; keys: boolean };
export type SoftEv = "edge" | "enter" | "leave" | "keys" | "blur";
export const SHUT: Soft = { hover: false, keys: false };
export const soft = (s: Soft, ev: SoftEv): Soft => {
  switch (ev) {
    case "edge": case "enter": return { ...s, hover: true };
    case "leave": return { ...s, hover: false };
    case "keys": return { ...s, keys: true };
    case "blur": return { ...s, keys: false };
  }
};
export const softOpen = (s: Soft) => s.hover || s.keys;
