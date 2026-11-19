// What was just done on the stage, and how to take it back (#903, behind the switch `stage.said`): one quiet line under
// the stage says the last step in ordinary words, with its way back. Pure, so the face's tests run every kind of step
// (src/stage-said.test.ts). The words come from here only: a step of the person's hand (moving.ts Step) as it was done,
// taken back (⌘Z) or done again (⇧⌘Z); a ⌘Z that found the block closed since (#892: nothing comes back, and the line
// says so); a step of the agent's, read from what the engine sent (a block opened, changed or closed), always said as
// the agent's. A block is named by its title, never by its id.
import type { Block, Line, Place } from "./model";
import type { Side, Step } from "./moving";
import type { Seen } from "./store";
import type { Snapshot } from "./geometry";

/** how long a line stays before it leaves by itself */
export const SAID_STAYS = 5000;

/** what one block's change in a step was */
export type Kind = "moved" | "resized" | "folded" | "opened" | "closed" | "reopened" | "popped" | "unpopped";

/** one thing the line can say */
export type Said =
  /** a step of the person's hand: done, taken back (⌘Z), done again (⇧⌘Z). `room`: the stage folded it to make room for
   *  this newcomer's title (the person did not press anything, but ⌘Z still brings it back). `lost`: on ⌘Z, the blocks of
   *  the step that were closed since, so nothing came back for them; `closer` says who closed them, when it is known */
  | { who: "you"; how: "did" | "undid" | "redid"; step: Step; room?: string; lost?: string[]; closer?: Closer }
  /** a step of the agent's: it opened, changed or closed these blocks; "elsewhere": closed, not here, by someone unknown */
  | { who: "agent"; act: "opened" | "changed" | "closed"; ids: string[] }
  | { who: "elsewhere"; act: "closed"; ids: string[] }
  /** anything else the stage says (a lens, a carry); its words as they are */
  | { who: "note"; words: string };

export type Closer = "agent" | "elsewhere";

/** the line: what happened, and the way back (empty when there is none) */
export type Sentence = { words: string; back: string; agent: boolean };

/** whether a ledger line is signed by an agent (the engine signs an agent's lines "<login>'s agent · <session>", the
 *  person's press "<login> · <session>", wire.ts) */
export const byAgent = (by: string) => /\bagent\b/i.test(by);

const same = (a: Place, b: Place, k: (keyof Place)[]) => k.every((x) => (a[x] ?? false) === (b[x] ?? false));

/** what a step did to one block */
export function kindOne(before: Place | null, after: Place | null): Kind {
  if (before && !after) return "closed";
  if (!before && after) return "reopened";
  const b = before!, a = after!;
  if (!!b.popped !== !!a.popped) return a.popped ? "popped" : "unpopped";
  if (!!b.folded !== !!a.folded) return a.folded ? "folded" : "opened";
  if (!same(b, a, ["w", "h"])) return "resized";
  return "moved";
}

/** what a step did, as one kind: the blocks' own kinds when they agree; a mix of moves and resizes (a tile, a block
 *  filling the stage while another goes back) is a move; any other mix is said by its first block's kind */
export function kindOf(step: Step): Kind {
  const ks = Object.keys(step.before).map((id) => kindOne(step.before[id] ?? null, step.after[id] ?? null));
  if (!ks.length) return "moved";
  if (ks.every((k) => k === ks[0])) return ks[0];
  if (ks.every((k) => k === "moved" || k === "resized")) return "moved";
  return ks.find((k) => k !== "moved" && k !== "resized") ?? ks[0];
}

/** names joined as a person says them: "Plan", "Plan and Notes", "Plan, Notes and Diff", "Plan, Notes and 2 more" */
export function names(titles: string[]): string {
  const t = titles.map((x) => x.trim() || "an artifact");
  if (t.length <= 1) return t[0] ?? "an artifact";
  if (t.length <= 3) return `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
  return `${t.slice(0, 2).join(", ")} and ${t.length - 2} more`;
}

// each kind as done, taken back and done again; `n` the names, `it` it or them
const DID: Record<Kind, (n: string, it: string) => [string, string]> = {
  moved: (n, it) => [`Moved ${n}`, `⌘Z to put ${it} back`],
  resized: (n, it) => [`Resized ${n}`, `⌘Z to put ${it} back`],
  folded: (n, it) => [`Folded ${n} to the tray`, `⌘Z to bring ${it} back`],
  opened: (n, it) => [`Opened ${n} from the tray`, `⌘Z to fold ${it} again`],
  closed: (n, it) => [`Closed ${n}`, `⌘Z to bring ${it} back`],
  reopened: (n, it) => [`Brought ${n} back`, `⌘Z to close ${it} again`],
  popped: (n, it) => [`Popped ${n} out to ${it === "it" ? "its own window" : "their own windows"}`, `⌘Z to bring ${it} back`],
  unpopped: (n, it) => [`Brought ${n} back to the stage`, `⌘Z to pop ${it} out again`],
};
const UNDID: Record<Kind, (n: string, it: string) => string> = {
  moved: (n, it) => `Put ${n} back where ${it === "it" ? "it was" : "they were"}`,
  resized: (n, it) => `Put ${n} back to ${it === "it" ? "its" : "their"} size`,
  folded: (n) => `Brought ${n} back from the tray`,
  opened: (n) => `Folded ${n} back to the tray`,
  closed: (n) => `Brought ${n} back`,
  reopened: (n) => `Closed ${n} again`,
  popped: (n) => `Brought ${n} back from ${n.includes(" and ") ? "their windows" : "its window"}`,
  unpopped: (n) => `Popped ${n} out again`,
};
const AGAIN: Record<Kind, (n: string) => string> = {
  moved: (n) => `Moved ${n} again`,
  resized: (n) => `Resized ${n} again`,
  folded: (n) => `Folded ${n} to the tray again`,
  opened: (n) => `Opened ${n} from the tray again`,
  closed: (n) => `Closed ${n} again`,
  reopened: (n) => `Brought ${n} back again`,
  popped: (n) => `Popped ${n} out again`,
  unpopped: (n) => `Brought ${n} back to the stage again`,
};

/** the step's blocks a sentence names: those it changed, less any it could not bring back */
const idsOf = (step: Step, lost: string[] = []) => Object.keys(step.before).filter((id) => !lost.includes(id));

/** the line for one thing said. `title` names a block by its id (the stage's memory of every title it has shown) */
export function sentence(s: Said, title: (id: string) => string): Sentence {
  if (s.who === "note") return { words: s.words, back: "", agent: false };
  if (s.who === "agent") {
    const n = names(s.ids.map(title));
    return { words: `The agent ${s.act} ${n}`, back: s.act === "closed" ? "its ledger keeps it" : "", agent: true };
  }
  if (s.who === "elsewhere") return { words: `${names(s.ids.map(title))} was closed in another window`, back: "", agent: false };
  const lost = s.lost ?? [];
  const ids = idsOf(s.step, lost);
  const it = ids.length > 1 ? "them" : "it";
  const n = names(ids.map(title));
  // what could not come back, and the line's second half: on a narrow stage the two stack
  const gone = lost.length ? `${names(lost.map(title))} ${lost.length > 1 ? "were" : "was"} closed ${s.closer === "agent" ? "by the agent " : s.closer === "elsewhere" ? "in another window " : ""}since` : "";
  const none = "nothing to put back";
  if (!ids.length) return { words: gone, back: none, agent: false };
  // a hand's step that also sent others to the tray (a drop or a resize the plan made room for, #1001): the hand's own
  // verb, and the others named as gone to make room, never "Folded <the moved block>"
  const each = ids.map((id) => [id, kindOne(s.step.before[id] ?? null, s.step.after[id] ?? null)] as const);
  const roomed = each.filter(([, k]) => k === "folded").map(([id]) => id), hand = each.filter(([, k]) => k === "moved" || k === "resized" || k === "opened").map(([id]) => id);
  if (roomed.length && hand.length && roomed.length + hand.length === ids.length) {
    const hn = names(hand.map(title)), hk = kindOf({ before: pick(s.step.before, hand), after: pick(s.step.after, hand) }), hi = hand.length > 1 ? "them" : "it", rn = names(roomed.map(title));
    if (s.how === "did") return { words: `${DID[hk](hn, hi)[0]}; ${rn} went to the tray to make room`, back: "⌘Z to undo both", agent: false };
    if (s.how === "undid") return { words: `${UNDID[hk](hn, hi)}; ${rn} came back from the tray`, back: "⇧⌘Z to do it again", agent: false };
    return { words: `${AGAIN[hk](hn)}; ${rn} went to the tray again`, back: "⌘Z to undo it", agent: false };
  }
  const k = kindOf({ before: pick(s.step.before, ids), after: pick(s.step.after, ids) });
  // #1001: a step whose own kind is not a move (a block opened from the tray, closed, popped) and that moved others aside
  // to make room names only its own blocks with that verb, and the others as moved (it said "Opened A and B" for B moved)
  const aside = k !== "moved" && k !== "resized" && !gone ? each.filter(([, x]) => x === "moved" || x === "resized").map(([id]) => id) : [];
  if (aside.length && aside.length < ids.length) {
    const own = ids.filter((id) => !aside.includes(id)), on = names(own.map(title)), oi = own.length > 1 ? "them" : "it", an = names(aside.map(title));
    if (s.how === "did") { const [w] = DID[k](on, oi); return { words: `${w}; ${an} moved to make room`, back: "⌘Z to undo both", agent: false }; }
    if (s.how === "undid") return { words: `${UNDID[k](on, oi)}; ${an} moved back`, back: "⇧⌘Z to do it again", agent: false };
    return { words: `${AGAIN[k](on)}; ${an} moved again`, back: "⌘Z to undo it", agent: false };
  }
  if (s.how === "did") {
    const [w, back] = DID[k](n, it);
    // the stage folded it, not the person: said as what happened to the block, short enough for the narrowest stage
    if (s.room && k === "folded") return { words: `${n} went to the tray to make room`, back, agent: false };
    return { words: w, back, agent: false };
  }
  const w = s.how === "undid" ? UNDID[k](n, it) : AGAIN[k](n);
  if (gone) return { words: `${w}; ${gone}`, back: `${none} for ${lost.length > 1 ? "them" : "it"}`, agent: false };
  return { words: w, back: s.how === "undid" ? "⇧⌘Z to do it again" : `⌘Z to undo it`, agent: false };
}
/** the whole stage's step (stage.whole's undo, geometry.ts Snapshot: the stage before and after one verb) as the line's
 *  Step: only the blocks it changed; a block closed (or not on the stage) is null. Null when nothing changed (#1001: the
 *  whole stage's verbs said nothing on the line) */
export function stepOfShots(before: Snapshot, after: Snapshot): Step | null {
  const at = (s: Snapshot, id: string): Place | null => { const x = s[id]; return x && !x.closed ? { id, ...x.r, z: 0, ...(x.folded ? { folded: true } : {}) } : null; };
  const b: Side = {}, a: Side = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const x = at(before, id), y = at(after, id);
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    b[id] = x; a[id] = y;
  }
  return Object.keys(b).length ? { before: b, after: a } : null;
}
const pick = (side: Side, ids: string[]): Side => Object.fromEntries(ids.map((id) => [id, side[id] ?? null]));

/** on ⌘Z or ⇧⌘Z: the blocks of the side laid back that could not come back, because they were on the stage at both ends
 *  of the step and are closed now (moving.ts applySide leaves them closed, #892). `alive` says a block is open now */
export function lostOf(side: Side, other: Side, alive: (id: string) => boolean): string[] {
  return Object.keys(side).filter((id) => side[id] !== null && other[id] !== null && other[id] !== undefined && !alive(id));
}

/** who closed a block, from its ledger as last seen: the agent when its last "closed" line is the agent's */
export function closerOf(lines: Line[] | undefined): Closer {
  const c = [...(lines ?? [])].reverse().find((l) => l.what === "closed" || l.what.startsWith("closed ·"));
  return c && byAgent(c.by) ? "agent" : "elsewhere";
}

const shown = (s: Seen) => new Set(s.stage.blocks.filter((p) => !p.folded).map((p) => p.id));
const open = (b: Block | undefined) => !!b && b.state !== "dead";
const newLines = (was: Line[] | undefined, now: Line[] | undefined) => {
  const last = Math.max(-Infinity, ...(was ?? []).map((l) => l.at));
  return (now ?? []).filter((l) => l.at > last);
};

/** the agent's step between two reads of the stage, or null: a block it opened (its "composed" line is the agent's),
 *  changed (a new line or version of the agent's, not a wait: a waiting block says so itself, and the line never asks
 *  for the eye) or closed (gone from the stage, not by this window: `mine` the blocks this window closed). A close
 *  comes before an open, an open before a change; one line at a time */
export function agentStep(was: Seen, now: Seen, mine: ReadonlySet<string> = new Set()): Said | null {
  const before = new Map(was.blocks.map((b) => [b.id, b])), after = new Map(now.blocks.map((b) => [b.id, b]));
  const onWas = shown(was), onNow = new Set(now.stage.blocks.map((p) => p.id));
  const closed: string[] = [], elsewhere: string[] = [], opened: string[] = [], changed: string[] = [];
  for (const id of onWas) {
    if (!open(before.get(id)) || mine.has(id)) continue;
    if (onNow.has(id) && open(after.get(id))) continue;
    (closerOf(now.ledger[id] ?? was.ledger[id]) === "agent" ? closed : elsewhere).push(id);
  }
  for (const b of now.blocks) {
    if (!open(b) || !onNow.has(b.id)) continue;
    const lines = newLines(was.ledger[b.id], now.ledger[b.id]).filter((l) => byAgent(l.by));
    if (!before.has(b.id) || !onWasAny(was, b.id)) {
      if ((now.ledger[b.id] ?? []).some((l) => l.what.startsWith("composed") && byAgent(l.by))) opened.push(b.id);
      continue;
    }
    const v0 = before.get(b.id)!.versions, v1 = b.versions;
    const newer = v1.length > v0.length && byAgent(v1[v1.length - 1].by);
    if (newer || lines.some((l) => !/^(waits|yes|frozen|carried|composed|closed)\b/.test(l.what))) changed.push(b.id);
  }
  if (closed.length) return { who: "agent", act: "closed", ids: closed };
  if (opened.length) return { who: "agent", act: "opened", ids: opened };
  if (elsewhere.length) return { who: "elsewhere", act: "closed", ids: elsewhere };
  if (changed.length) return { who: "agent", act: "changed", ids: changed };
  return null;
}
const onWasAny = (s: Seen, id: string) => s.stage.blocks.some((p) => p.id === id);
