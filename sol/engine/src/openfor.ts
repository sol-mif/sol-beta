// Open it for the person (#1521, the third part of #355): when a person asks about a setting or a pane, the seat opens
// it instead of describing the way there. Three tools on the "sol" server, both seats, behind the switch open.for
// (settings.ts openFor, versions.ts: on for the team as a concept, off for a tester until set):
//   open_settings { drawer }    the window opens Settings on that drawer, the way a drawer is asked for by name (#342)
//   open_pane { button }        the window shows that button's pane, as its press does
//   set_setting { patch, yes }  the engine's settings changed, only on the person's word in this very turn: `yes` is
//                               their own words, and they must be in what they said this turn (heard below), else no.
//                               Only how Sol looks and sounds (the look, the voice, notifications …), never defaults, a switch,
//                               the version or the tracking: those stay by hand in Settings
// The window is told { type: "open.for", what, drawer | button } (the face, openFor.ts); nothing leaves the Mac.
import { z } from "zod";
import type { ToolResult, TurnCtx } from "./browser.js";
import { getSettings, openFor, seatSet } from "./settings.js";

/** Settings' drawers by the id the window opens them with (mac/src/Settings.tsx; "drawn" is "how work is drawn") */
export const DRAWERS = ["work", "look", "voice", "microphone", "defaults", "notifications", "sidebar", "drawn", "home", "me",
  "machine", "sessions", "switches", "yours", "engine"] as const;
/** the buttons that open a pane (mac/src/buttons, kind "pane"); test/openfor.test.ts holds this list to the folder */
export const PANES = ["changes", "files", "browser", "terminal", "page", "pr", "plan", "tasks", "thread", "overview",
  "dashboard", "helpers", "show", "shared", "action-board", "group-chat"] as const;
/** the settings a seat may change for the person: how Sol looks and sounds to them. Not defaults (it holds what a session
 *  may do without asking: a seat must never raise its own leash), nor mic, cowork, frame, stage, home, onboarding, log,
 *  reach, open, version, morning (switches), nor track (counting stays a hand's choice) */
export const SETTABLE = ["voice", "voiceVendor", "elevenVoice", "patienceMs", "language", "look", "notify", "lens", "own"] as const;

export const OPEN_TOOLS = [
  {
    name: "open_settings",
    description: "Open Sol's Settings on one drawer in the person's window, when a setting does what they asked about " +
      "(\"can I make the text bigger?\": look). Open it instead of describing the way there. Drawers: " + DRAWERS.join(", ") +
      " (drawn is how work is drawn; me holds their accounts and tools).",
    shape: { drawer: z.string().max(40) },
  },
  {
    name: "open_pane",
    description: "Show one pane in the person's window, when a pane does what they asked (\"show me the diff\": changes). " +
      "Open it instead of describing the way there. Panes: " + PANES.join(", ") + ".",
    shape: { button: z.string().max(40) },
  },
  {
    name: "set_setting",
    description: "Change one of the person's settings, only when they asked for that change or said yes to it in this " +
      "very turn; never before, never on a guess. `patch` is the part of the settings that changes (look: { text: 18 }; " +
      "voice: \"Kore\"; notify, language, lens …; own: { perDay: 20 } is how many times a day Agents may ask the person's own " +
      "cheapest model when there is no Jev, 0 never, at most 500, null back to 100). `yes` is the person's own words from this turn that ask for it " +
      "or agree to it, two words at least (in Chinese or Japanese, four characters), copied exactly: the change is refused when those words are not in what they said this turn.",
    shape: { patch: z.record(z.string(), z.unknown()), yes: z.string().min(2).max(400) },
  },
] as const;
export const OPEN_NAMES = new Set<string>(OPEN_TOOLS.map((t) => t.name));
/** the three while the switch is on, none while it is off (read at each turn's start) */
export const openToolsNow = () => (openFor() ? [...OPEN_TOOLS] : []);

// ---- what the person said this turn ----
// A Home turn carries its own words (TurnCtx.said, index.ts handleSay). A Work run's are kept here by its id as the turn
// starts (work/runs.ts): only when the person said them in their window (wire.ts work.say); a turn Sol, another
// session or an agent starts forgets them. Only the last: a word said turns ago is not this turn's yes.
const heardIn = new Map<string, { text: string; at: number }>();
/** a Work turn not started by the person: no words of theirs stand for it */
export const forget = (sessionId: string) => { heardIn.delete(sessionId); };
/** a Work turn's own words, as it starts; the oldest are let go past 200 conversations */
export function heard(sessionId: string | undefined, text: string): void {
  if (!sessionId) return;
  heardIn.delete(sessionId);
  heardIn.set(sessionId, { text, at: Date.now() });
  if (heardIn.size > 200) heardIn.delete(heardIn.keys().next().value!);
}
// Chinese and Japanese put no spaces between words (#1639): a character of theirs is matched alone, a space beside it
// does not count, and it weighs half a word, so "改成18" or "文字を大きく" asks while a bare "好" or "はい" does not
const CJK = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u;
const plain = (s: string) => s.toLowerCase().replace(/[\s\p{P}]+/gu, " ").trim()
  .replace(/ (?=[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}])|(?<=[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]) /gu, "");
/** how many words `y` (plain) holds: a run of other letters is one, a Chinese or Japanese character half */
const weight = (y: string) => [...y.matchAll(/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]|[^ \p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]+/gu)]
  .reduce((n, [m]) => n + (CJK.test(m) ? 0.5 : 1), 0);
/** a word's edge at `i` of `s`: the start or end, a space, or a Chinese or Japanese character on either side */
const edge = (s: string, i: number) => i <= 0 || i >= s.length || s[i - 1] === " " || s[i] === " " || CJK.test(s[i - 1]) || CJK.test(s[i]);
/** whether `yes` is in what was said this turn (pure but for the map): case, spacing and punctuation aside, as whole
 *  words in a row. Two words at least, so a bare "ok" or "yes" (an answer to anything) is never taken as asking for a change */
/** what the person said this turn: a Home turn's own words, else a Work run's heard as it started; none for a turn they did not start */
export const wordsThisTurn = (turn: TurnCtx): string | undefined => turn.said ?? (turn.sessionId ? heardIn.get(turn.sessionId)?.text : undefined);
export function saidThisTurn(turn: TurnCtx, yes: string): boolean {
  const words = wordsThisTurn(turn), y = plain(yes);
  if (typeof words !== "string" || !y || weight(y) < 2) return false;
  const w = plain(words);
  for (let i = w.indexOf(y); i >= 0; i = w.indexOf(y, i + 1)) if (edge(w, i) && edge(w, i + y.length)) return true;   // whole words only
  return false;
}

/** a patch the seat may make (pure): only SETTABLE keys; the reason when nothing of it is */
export function settablePatch(patch: unknown): { patch: Record<string, unknown> } | { why: string } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { why: "patch is not an object of settings" };
  const keys = Object.keys(patch), not = keys.filter((k) => !(SETTABLE as readonly string[]).includes(k));
  if (not.length) return { why: `${not.join(", ")} ${not.length > 1 ? "are" : "is"} not for a seat to change: the person changes ${not.length > 1 ? "them" : "it"} in Settings (open_settings)` };
  if (!keys.length) return { why: "the patch changes nothing" };
  return { patch: patch as Record<string, unknown> };
}

// ---- the window ----
let tell: (m: object) => void = () => {};
/** how every face is told (parts/openfor.ts: everyone); a changed setting is told by settings.ts seatSet's hearers */
export function setOpenForFaces(everyone: (m: object) => void): void { tell = everyone; }

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

export async function runOpenTool(name: string, args: unknown, turn: TurnCtx = {}): Promise<ToolResult> {
  if (!openFor()) return text(`${name} is not on in this Sol`, true);   // the switch read again at each call
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "open_settings") {
    const drawer = String(a.drawer ?? "").trim().toLowerCase();
    if (!(DRAWERS as readonly string[]).includes(drawer)) return text(`there is no drawer ${drawer || "(none named)"}; the drawers: ${DRAWERS.join(", ")}`, true);
    tell({ type: "open.for", what: "settings", drawer, ...(turn.sessionId ? { sessionId: turn.sessionId } : {}) });
    return text(`Settings is open on ${drawer} in the person's window. Say in a line what to change there; change it yourself only when they ask (set_setting).`);
  }
  if (name === "open_pane") {
    const button = String(a.button ?? "").trim().toLowerCase();
    if (!(PANES as readonly string[]).includes(button)) return text(`there is no pane ${button || "(none named)"}; the panes: ${PANES.join(", ")}`, true);
    tell({ type: "open.for", what: "pane", button, ...(turn.sessionId ? { sessionId: turn.sessionId } : {}) });
    return text(`The ${button} pane is shown in the person's window (where it means something: a pane with nothing to show stays empty).`);
  }
  if (name === "set_setting") {
    if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.", true);
    const p = settablePatch(a.patch);
    if ("why" in p) return text(`not changed: ${p.why}`, true);
    const before = JSON.stringify(Object.fromEntries(Object.keys(p.patch).map((k) => [k, (getSettings() as Record<string, unknown>)[k]])));
    const after = seatSet(p.patch) as Record<string, unknown>;
    const now = JSON.stringify(Object.fromEntries(Object.keys(p.patch).map((k) => [k, after[k]])));
    return text(now === before ? `nothing changed: the settings already read ${now}, or the values were not ones Sol takes` : `changed: ${now} (was ${before}). Every window shows it now.`);
  }
  return text(`unknown tool ${name}`, true);
}
