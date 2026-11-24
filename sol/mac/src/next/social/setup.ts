// Share a setup, the face's half (BR1 meta part 5, scene 8, #1615; engine social/setup.ts, PROTOCOL.md "Social: share
// a setup"): a card of how a person works, given to a friend and taken by them, all or in parts. Pure, so the tests read
// it with invented people: the card's parts as the person reads them, which parts a press picks, and the line a take
// leaves. The wire (cv/wire/social.ts) holds the cards; Social.tsx draws them. Signed: marcocyl04-ux's agent (#1615).

/** one part of a card, as the engine sends it: a Home folder with its stickies' titles, or a fit's take everywhere */
export type Part = { id: string; kind: "place"; name: string; pieces: string[] } | { id: string; kind: "fit"; knob: string; take: string };
export type Card = { from: string; at: number; parts: Part[] };
/** a friend's card in a friend room: its room and the version a take takes */
export type Got = Card & { code: string; sha: string };
/** what a take did, kept for its Back; parts: the ids it took, drawn solid on the card */
export type Took = { code: string; sha: string; plan?: string; fits: string[]; made: number; from: string; parts: string[] };

/** a fit's knob in words: its first word and its take, "diary.look" + "calm" → "Diary · calm" */
export function fitWords(knob: string, take: string): string {
  const w = knob.split(/[._-]/)[0] ?? knob;
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} · ${take}`;
}
/** a part's name on the card */
export const partName = (p: Part) => (p.kind === "place" ? p.name : fitWords(p.knob, p.take));
/** a part's second line: what it brings */
export function partLine(p: Part): string {
  if (p.kind === "fit") return "how Sol shows it, everywhere";
  const n = p.pieces.length;
  return n ? `a place, with ${n === 1 ? `“${p.pieces[0]}”` : `${n} stickies`}` : "a place";
}

/** a card's size in words: "2 places and 1 setting" */
export function cardSize(parts: readonly Part[]): string {
  const pl = parts.filter((p) => p.kind === "place").length, ft = parts.length - pl;
  const w = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return [pl ? w(pl, "place") : "", ft ? w(ft, "setting") : ""].filter(Boolean).join(" and ") || "nothing yet";
}

/** the parts a press leaves picked: one part turned on or off; the first press in "pick pieces" starts from none */
export function toggle(picked: readonly string[], id: string): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

/** what a take says once it lands: "2 pieces from Denise" */
export const tookLine = (t: Pick<Took, "made" | "from">) => `${t.made} ${t.made === 1 ? "piece" : "pieces"} from ${t.from}`;

/** the fixture's card (no engine): an invented friend's, the way the drawing shows both pages before a real one */
export const EXAMPLE: Got = { code: "EXAMPL", sha: "example", from: "Denise", at: 0, parts: [
  { id: "p:Studio", kind: "place", name: "Studio", pieces: ["Who paid", "Book the kiln", "Glaze test tiles"] },
  { id: "p:Clients", kind: "place", name: "Clients", pieces: ["Quotes out this week"] },
  { id: "f:diary.look", kind: "fit", knob: "diary.look", take: "calm" },
] };

/** a card's parts read from the engine, only the two shapes, every string a string */
export function partsOf(v: unknown): Part[] {
  return (Array.isArray(v) ? v : []).flatMap((p): Part[] => {
    if (p?.kind === "place" && typeof p.name === "string" && typeof p.id === "string") return [{ id: p.id, kind: "place", name: p.name, pieces: Array.isArray(p.pieces) ? p.pieces.map(String) : [] }];
    if (p?.kind === "fit" && typeof p.knob === "string" && typeof p.take === "string" && typeof p.id === "string") return [{ id: p.id, kind: "fit", knob: p.knob, take: p.take }];
    return [];
  });
}
