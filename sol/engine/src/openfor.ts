// Open it for the person (#1521, the third part of #355): when a person asks about a setting or a pane, the seat opens
// it instead of describing the way there. Three tools on the "sol" server, both seats, behind the switch open.for
// (settings.ts openFor, versions.ts: on for the team as a concept, off for a tester until set):
//   open_settings { drawer }    the window opens Settings on that drawer, the way a drawer is asked for by name (#342)
//   open_pane { button }        the window shows that button's pane, as its press does
//   set_setting { patch, yes }  the engine's settings changed, only on the person's word in this very turn: `yes` is
//                               their own words, and they must be in what they said this turn (heard below), else no.
//                               How Sol looks and sounds (the look, the voice, notifications …), which Cowork and which face
//                               (cowork.v3, ui.next), a view's switch, and the mode a new session starts in
//                               (defaults.mode, only ever stricter: a looser one the person turns in Settings, #36): Frank
//                               2026-11-20, Sol ticket #21, so the AI the person talks to can turn what they ask for and
//                               says which one is on; and (the door on #1718) the two reach switches, off only. Never the version, the other engine switches or the tracking
//                               Every answer carries a line on what is on now (nowLine), so the AI never guesses
// The window is told { type: "open.for", what, drawer | button } (the face, openFor.ts); nothing leaves the Mac.
import { z } from "zod";
import type { ToolResult, TurnCtx } from "./browser.js";
import { coworkV3, getSettings, openFor, reachRoom, reachTools, seatSet, uiNext, versionMode, WORK_MODES, type Settings, type WorkMode } from "./settings.js";
import { stageOf, standsOn, WINDOW_SWITCHES } from "./versions.js";

/** Settings' drawers by the id the window opens them with (mac/src/Settings.tsx; "drawn" is "how work is drawn") */
export const DRAWERS = ["work", "look", "voice", "microphone", "defaults", "notifications", "sidebar", "drawn", "home", "me",
  "machine", "sessions", "switches", "yours", "engine"] as const;
/** the buttons that open a pane (mac/src/buttons, kind "pane"); test/openfor.test.ts holds this list to the folder */
export const PANES = ["changes", "files", "browser", "terminal", "page", "pr", "plan", "tasks", "thread", "overview",
  "dashboard", "helpers", "show", "shared", "action-board", "group-chat"] as const;
/** the settings a seat may change for the person: how Sol looks and sounds to them, and (#21) cowork { v3 }, ui { next },
 *  defaults { mode }, own { perDay } (#1476) and switches { <a view's switch> }, each only in that shape (settablePatch). Not the rest of
 *  defaults (seat, model, effort), nor mic, frame, stage, home, onboarding, log, reach, open, version, morning, nor track
 *  (counting stays a hand's choice) */
export const SETTABLE = ["voice", "voiceVendor", "elevenVoice", "patienceMs", "language", "look", "notify", "lens", "cowork", "ui", "defaults", "switches", "own"] as const;
/** the switches a seat may turn by name in `switches`: the views', and Cowork's and the face's by their names */
/** the window switches whose screen follows the person's settings today: the three views (mac/src/spine/views.ts reads
 *  settings.window). The other window cards read the window's own storage, so a seat turning one would change nothing on
 *  screen: they stay by hand in Settings › switches until the window reads the settings for them (#1694's window half),
 *  then they join this list (the door on #1708, question 4) */
export const SEAT_WINDOW_SWITCHES = WINDOW_SWITCHES.filter((n) => n.startsWith("view."));
/** the two engine switches that send the person's words off the machine (reach.ts): at product they are on for a tester
 *  by default, so the person turns them off by asking, not only in a settings file (the door on #1718, question 4). Off
 *  only: back on widens what an AI may do (their words leave again), and like a looser mode (#36) that is never a seat's
 *  to do on quoted words; the person turns it back on by hand */
export const SPOKEN_REACH = { "reach.tools": "tools", "reach.room": "room" } as const;
export const SPOKEN_SWITCHES = ["cowork.v3", "ui.next", ...Object.keys(SPOKEN_REACH) as (keyof typeof SPOKEN_REACH)[], ...SEAT_WINDOW_SWITCHES] as const;
/** how much a mode lets a session do without asking, least first. A seat only ever makes it stricter: an AI never widens
 *  what an AI may do on its own, whatever words it quotes, so a looser mode is the person's own press in Settings (#36,
 *  the security review on #1708; it replaced a second yes that was a keyword match the AI's own quote could satisfy) */
export const LOOSENESS: Record<WorkMode, number> = { plan: 0, default: 1, acceptEdits: 2, auto: 3, bypassPermissions: 4 };

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
      "cheapest model when there is no Jev, 0 never, at most 500, null back to 100). Which Cowork: { cowork: { v3: true } } is the new one, false the old; which " +
      "face: { ui: { next: true } } the new, false the old; the mode new sessions start in: { defaults: { mode: \"" + WORK_MODES.join("\" | \"") +
      "\" } }, only one that asks the same or more than the one now (a mode that asks less the person turns themself: open_settings defaults); which views show: " +
      "{ switches: { \"<name>\": true | false | null } } (null: back to its default), the names " + SEAT_WINDOW_SWITCHES.join(", ") +
      "; asking a teammate's agent and the agents' room, which send the person's words to their teammates: " +
      "{ switches: { \"reach.tools\": false, \"reach.room\": false } } (off only: asked to turn one on, Settings opens at its switch for the person's press)" +
      " (the other cards' switches are turned by the person in Settings: open_settings switches)" +
      ". Every answer says which Cowork, which face and which mode are on now: say it in your reply, so the person never " +
      "wonders which one they are on. `yes` is the person's own words from this turn that ask for it " +
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
const heardIn = new Map<string, { text: string; at: number; n: number }>();
let heardN = 0;   // each turn's words their own number, so a later turn is never taken for this one (#21)
/** a Work turn not started by the person: no words of theirs stand for it */
export const forget = (sessionId: string) => { heardIn.delete(sessionId); };
/** a Work turn's own words, as it starts; the oldest are let go past 200 conversations */
export function heard(sessionId: string | undefined, text: string): void {
  if (!sessionId) return;
  heardIn.delete(sessionId);
  heardIn.set(sessionId, { text, at: Date.now(), n: ++heardN });
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
export function settablePatch(patch: unknown): { patch: Record<string, unknown> } | { why: string; opens?: (typeof DRAWERS)[number] } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { why: "patch is not an object of settings" };
  const keys = Object.keys(patch), not = keys.filter((k) => !(SETTABLE as readonly string[]).includes(k));
  if (not.length) return { why: `${not.join(", ")} ${not.length > 1 ? "are" : "is"} not for a seat to change: the person changes ${not.length > 1 ? "them" : "it"} in Settings (open_settings)` };
  if (!keys.length) return { why: "the patch changes nothing" };
  const out: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  // the switches and defaults only in their one shape: a seat never reaches past them (defaults' seat, model or effort)
  const only = (k: string, key: string, ok: (v: unknown) => boolean, says: string): string | null => {
    if (!(k in out)) return null;
    const v = out[k];
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).join() !== key || !ok((v as Record<string, unknown>)[key])) return `${k} takes only ${says}`;
    return null;
  };
  const bool = (v: unknown) => typeof v === "boolean";
  const why = only("cowork", "v3", bool, "{ v3: true | false }") ?? only("ui", "next", bool, "{ next: true | false }") ??
    only("defaults", "mode", (v) => (WORK_MODES as unknown[]).includes(v), `{ mode: ${WORK_MODES.join(" | ")} }: the rest of the defaults stay by hand in Settings`);
  if (why) return { why };
  if ("switches" in out) {
    const sw = out.switches;
    if (!sw || typeof sw !== "object" || Array.isArray(sw) || !Object.keys(sw).length) return { why: "switches is not { name: true | false | null }" };
    const kept: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(sw)) {
      if (!(SPOKEN_SWITCHES as readonly string[]).includes(name)) return { why: `${name} is not a switch a seat may turn: the person turns it in Settings (open_settings switches)` };
      if (v !== true && v !== false && v !== null) return { why: `${name} takes true, false or null` };
      if (name === "cowork.v3") out.cowork = { v3: v };   // by its name too, the same setting
      else if (name === "ui.next") out.ui = { next: v };
      else if (name in SPOKEN_REACH) {
        // a switch whose card stands short of this Sol's version (reach.room at concept on a tester's): this Sol has none
        // of it yet, so no way to turn it on is offered (the door on #1718, question 4)
        if (v !== false && !standsOn(stageOf(name), versionMode())) return { why: `${name} is not part of this Sol yet: say in a line that their Sol does not have it yet, and offer no way to turn it on` };
        // back on is the person's own press: Settings opens on its switch (Settings › me), as a looser mode opens defaults (#36)
        if (v !== false) return { opens: "me", why: `${name} only turns off by asking: back on sends the person's words to their teammates again, so an AI never turns it on (#36). ` +
          "Settings is open on me in the person's window, at its switch: say in a line that the switch is there and one press turns it on" };
        out.reach = { ...(out.reach as object | undefined), [SPOKEN_REACH[name as keyof typeof SPOKEN_REACH]]: v };
      }
      else kept[name] = v;
    }
    if (Object.keys(kept).length) out.switches = kept; else delete out.switches;
  }
  return { patch: out };
}

/** what is on now, one line every answer of set_setting and open_settings carries (#21): so the AI says which Cowork and
 *  which face the person is on, and never guesses */
export function nowLine(): string {
  const set = getSettings().switches ?? {}, own = Object.entries(set).map(([k, v]) => `${k} ${v ? "on" : "off"}`);
  return `Now: Cowork is the ${coworkV3() ? "new one (v3)" : "old one"}, the face is the ${uiNext() ? "new one (ui.next)" : "old one"}, ` +
    `new sessions start in ${getSettings().defaults.mode}, asking teammates' agents is ${reachTools() ? "on" : "off"}, ` +
    `the agents' room is ${reachRoom() ? "on" : "off"}${own.length ? `; the person set ${own.join(", ")}` : ""}. Say this in your reply.`;
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
    return text(`Settings is open on ${drawer} in the person's window. Say in a line what to change there; change it yourself only when they ask (set_setting).\n${nowLine()}`);
  }
  if (name === "open_pane") {
    const button = String(a.button ?? "").trim().toLowerCase();
    if (!(PANES as readonly string[]).includes(button)) return text(`there is no pane ${button || "(none named)"}; the panes: ${PANES.join(", ")}`, true);
    tell({ type: "open.for", what: "pane", button, ...(turn.sessionId ? { sessionId: turn.sessionId } : {}) });
    return text(`The ${button} pane is shown in the person's window (where it means something: a pane with nothing to show stays empty).`);
  }
  if (name === "set_setting") {
    if (!saidThisTurn(turn, String(a.yes ?? ""))) return text("not changed: those words are not in what the person said this turn. Ask them, and change it when they say so.\n" + nowLine(), true);
    const p = settablePatch(a.patch);
    if ("why" in p) {
      if (p.opens) tell({ type: "open.for", what: "settings", drawer: p.opens, ...(turn.sessionId ? { sessionId: turn.sessionId } : {}) });
      return text(`not changed: ${p.why}\n${nowLine()}`, true);
    }
    const mode = (p.patch.defaults as { mode?: WorkMode } | undefined)?.mode;
    if (mode && LOOSENESS[mode] > LOOSENESS[getSettings().defaults.mode]) {
      tell({ type: "open.for", what: "settings", drawer: "defaults", ...(turn.sessionId ? { sessionId: turn.sessionId } : {}) });
      return text(`not changed: ${mode} asks less than ${getSettings().defaults.mode}, and an AI never loosens what sessions may do on their own. ` +
        "Settings is open on defaults in the person's window: say in a line that they pick it there themself. Nothing else in this patch changed.\n" + nowLine(), true);
    }
    const read = (s: Record<string, unknown>, k: string) => (k === "defaults" ? { mode: (s.defaults as Settings["defaults"]).mode } : s[k] ?? null);
    const before = JSON.stringify(Object.fromEntries(Object.keys(p.patch).map((k) => [k, read(getSettings() as Record<string, unknown>, k)])));
    const after = seatSet(p.patch) as Record<string, unknown>;
    const now = JSON.stringify(Object.fromEntries(Object.keys(p.patch).map((k) => [k, read(after, k)])));
    return text((now === before ? `nothing changed: the settings already read ${now}, or the values were not ones Sol takes` : `changed: ${now} (was ${before}). Every window shows it now.`) + "\n" + nowLine());
  }
  return text(`unknown tool ${name}`, true);
}
