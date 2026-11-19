// The jelly's role across the window (#1245, item 1): what it does, as eight acts. A stable window answers four
// questions; the frame answers "where am I" and "what did I just do", the jelly answers the other two: "what is
// happening" and "what needs me" (brand.md, the personality: the jelly is where the three layers meet, it does work and
// carries the vibe). Each act names the reason it exists, the question it answers, the motion it uses (motion.ts's
// duration and curve by name, so the slow toggle and reduced motion reach it), the halo's state while it does it
// (tokens.json palette.looks.halo.states), its depth (palette.system.depth) and its colour role (palette.system.role),
// never a meaning colour (rules 16, 17, 33): the yellow stays on the block, the red on the steady part.
// The names are the API: the day's builder and Bodies.tsx import them; once pushed they stay.
import type { Ease, Timed } from "../motion.ts";
import { LOOKS, SYSTEM } from "../kit/tokens.ts";
import type { BodyDoing } from "./variants.ts";

export type Act = "arrive" | "sit" | "carry" | "work" | "point" | "land" | "wait" | "mark";
/** the two of the four questions that are the jelly's to answer */
export type Question = "what is happening" | "what needs me";
/** the halo's state (look.md, the halo's states): rest, working, arriving */
export type HaloState = keyof typeof LOOKS.halo.states;
export type Depth = keyof typeof SYSTEM.depth;
export type Role = keyof typeof SYSTEM.role;

export type ActInfo = {
  readonly name: Act;
  /** why the act exists, one line, in plain words */
  readonly reason: string;
  readonly answers: Question;
  /** where on the window it happens */
  readonly where: string;
  /** its motion: a duration and a curve by motion.ts's names; `loop` when it repeats until the act ends */
  readonly dur: Timed;
  readonly ease: Ease;
  readonly loop: boolean;
  /** the halo's state while it does this */
  readonly state: HaloState;
  /** how high it stands: card at rest, lifted in hand or asking, well when it sits lower (the engine down) */
  readonly depth: Depth;
  /** its colour's role: the jelly's own bands (sol), or the mark's grey ink (rest); never done, ask or wrong */
  readonly role: Role;
  /** the ladder state it shares with the rest of the face (variants.ts BodyDoing, rule 33) */
  readonly doing: BodyDoing;
  /** whether its eyes (and for carry, its body) go toward a target */
  readonly toward: boolean;
};

/** the acts, in the order of a day */
export const ACTS: readonly ActInfo[] = [
  { name: "arrive", reason: "Sol is here before any window is: it drops from the notch, the first time and every morning.",
    answers: "what is happening", where: "the notch", dur: "pour", ease: "pour", loop: false,
    state: "arriving", depth: "card", role: "sol", doing: "rest", toward: false },
  { name: "sit", reason: "Nothing is happening, and you can see that: it breathes in its seat and nothing else moves (rule 20).",
    answers: "what is happening", where: "its seat on the stage, or in the bar", dur: "breath", ease: "breath", loop: true,
    state: "rest", depth: "card", role: "sol", doing: "rest", toward: false },
  { name: "carry", reason: "What you gave it is in its hands until it lands, so you never lose a thing in a transition.",
    answers: "what is happening", where: "from the bar to the place on the stage", dur: "pour", ease: "pour", loop: false,
    state: "working", depth: "lifted", role: "sol", doing: "work", toward: true },
  { name: "work", reason: "Sol is doing something: its bands drift beside the block that runs, never on it (rule 27).",
    answers: "what is happening", where: "beside the running block", dur: "cycle", ease: "drift", loop: true,
    state: "working", depth: "card", role: "sol", doing: "work", toward: true },
  { name: "point", reason: "Something waits on you: it lifts and looks at the block with the sticker until you answer (rule 33).",
    answers: "what needs me", where: "beside the block that asks, or at the notch when you are elsewhere", dur: "glass", ease: "reveal", loop: false,
    state: "rest", depth: "lifted", role: "sol", doing: "needs", toward: true },
  { name: "land", reason: "A result is in: it sets the sticker or the coin down on the block, then goes back to sit (rule 26).",
    answers: "what is happening", where: "on the block that finished", dur: "land", ease: "pour", loop: false,
    state: "arriving", depth: "card", role: "sol", doing: "rest", toward: true },
  { name: "wait", reason: "Nothing can happen now: it sits lower, eyes half shut, still; the steady parts say why (rule 37).",
    answers: "what is happening", where: "its seat, while the engine is down", dur: "glass", ease: "leave", loop: false,
    state: "rest", depth: "well", role: "sol", doing: "rest", toward: false },
  { name: "mark", reason: "Where Sol is tiny it is one flat shape that still reads as Sol (rule 34).",
    answers: "what is happening", where: "the notch when idle, the menu bar, a message's author", dur: "reveal", ease: "arrive", loop: false,
    state: "rest", depth: "card", role: "rest", doing: "rest", toward: false },
];

export const ACT_NAMES = ACTS.map((a) => a.name) as readonly Act[];
export const actInfo = (a: Act): ActInfo => ACTS.find((x) => x.name === a)!;
export const isAct = (s: string | null | undefined): s is Act => !!s && (ACT_NAMES as readonly string[]).includes(s);

/** the face's three ladder states as acts: rest sits, work works, needs points */
export const ACT_OF: Record<BodyDoing, Act> = { rest: "sit", work: "work", needs: "point" };
export const actOf = (d: BodyDoing): Act => ACT_OF[d];

/** the day in order, which act at each moment (the sheet's strip, and the day builder's script) */
export const DAY: readonly { readonly at: string; readonly act: Act; readonly moment: string }[] = [
  { at: "8:58", act: "arrive", moment: "You open the lid. It drops from the notch before anything else." },
  { at: "9:00", act: "sit", moment: "Nothing yet. It breathes in its seat." },
  { at: "9:02", act: "carry", moment: "You ask for the release notes. It takes your words to their place on the stage." },
  { at: "9:03", act: "work", moment: "It writes them, sitting beside the card." },
  { at: "9:05", act: "point", moment: "It needs your yes to post. It looks at the card and waits." },
  { at: "9:06", act: "land", moment: "Posted. It sets the stamp on the card." },
  { at: "13:10", act: "wait", moment: "The engine is down. It sits lower; the card says why." },
  { at: "18:30", act: "mark", moment: "You close the window. It is the small mark in the menu bar." },
];

/** the jelly in each scene of the day (#1245, acts): it is never a picture. Every scene it does acts you can name, at
 *  the working size the stage uses, and the heading takes its place by where the jelly comes from: centred under the
 *  notch when it drops from there (the morning), left at the stage's edge when the window is already open. The day
 *  builder's scenes.ts plays these acts in this order (role.test.ts holds the two together); jelly-role.html prints
 *  one line per scene: scene, act, why */
export const IN_SCENES: readonly { readonly scene: string; readonly acts: readonly Act[]; readonly heading: "centred" | "left" | "none"; readonly why: string }[] = [
  { scene: "Arrival", acts: ["arrive", "point"], heading: "centred",
    why: "It drops from the notch to the greeting, then points at the folder you left off in: the first thing it does is show you where to start." },
  { scene: "Home", acts: ["sit", "carry", "land", "sit"], heading: "none",
    why: "The folder's stickies get done; it carries what was made into the folder and sets it down." },
  { scene: "Build", acts: ["sit", "carry", "work", "land", "sit"], heading: "none",
    why: "It carries the spec it wrote to the new block, works beside it on its seat, and sets the done sticker down." },
  { scene: "Your call", acts: ["sit", "point", "sit"], heading: "none",
    why: "The run stops on a question; it points at the block until you answer." },
  { scene: "Cowork", acts: ["sit", "carry", "work", "land", "sit"], heading: "none",
    why: "It carries the other agent's handover in and works beside it on its seat while it composes." },
  { scene: "Customize", acts: ["sit", "carry", "sit"], heading: "left",
    why: "It sits on the card your picks re-light, and carries a new set's band from its swatch to the window." },
  { scene: "Evening", acts: ["carry", "land", "sit", "mark"], heading: "left",
    why: "It brings the day's count and sets it down as the big number, then rests at the notch as the window closes." },
];
