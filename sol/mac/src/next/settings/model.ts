// Settings' rules (#1604, slice 6; the mockup's redesign/ui.html, its <script>/* Settings */ at the foot), ported as
// they are: every choice as a few takes (K), the words people use for each (SYN, TSYN, PLACES), the find (findAll), a
// change asked in words (parseAsk), "point at it" (POINTS, pointAt), what changes on your own things (cmp), who set
// each choice (setBy), the history read from two snapshots (diffSnap), and the voice's one line (voiceLine).
// Pure: each reads the world it is given (W, the mockup's S, H, U, OWN, WAYS) and the panel's state (UI); nothing here
// touches the store or the page. The pictures of each take are not ported: the visual pass draws them (notes/settings.md).
// Signed: marcocyl04-ux's agent, slice 6 (#1615).
import type { Known } from "../known.ts";

export type Take = { id: string; n: string; s: string; sets?: string; z?: number; look?: string; offered?: boolean; base?: string; mine?: boolean; fresh?: boolean };
export type Knob = { id: string; n: string; s: string; short: string; per?: boolean; def: string; core?: string; takes: Take[] };
/** an AI as Settings knows it: its four jobs (the samples) and what it spent this month */
export type AiW = { id: string; n: string; hue: number; spent: number; m: string[] };
/** the mockup's S: everything Settings keeps, every change a new snapshot of it */
export type Prefs = {
  kept: Record<string, string>; data: Record<string, string>; conns: Record<string, boolean>; tools: Record<string, string>;
  learned: Known[]; learn: boolean; persona: string; personaText: string; whyAsked: boolean; offers: boolean; offerGone: boolean;
  tune: string; keepMine: Record<string, boolean>; quiet?: string | null;
};
export type HistRow = { when: string; label: string; how: string; snap: Prefs; why?: string };
export type Way = { id: string; n: string; sum: string; takes: Record<string, string> };
export type Serv = { id: string; n: string; may: string[]; not: string; by?: string; off?: string };
export type Kind = { id: string; n: string; by: string; here: string; model: string };
export type Tool = { n: string; kind: string; what: string; say: string };
/** the world Settings reads: D.prefs */
export type World = {
  ais: AiW[]; prefs: Prefs; hist: HistRow[]; undo: { prev: Prefs; label: string; scope?: string }[]; own: Record<string, Take[]>; ways: Way[]; eveOk: boolean;
  serv: Serv[]; kinds: Kind[]; tools: Record<string, Tool>; extra: Record<string, Serv>;
  /** a real Sol: the rows whose engine row is "no" (spend, the history, the ways) are not drawn */
  live: boolean;
  /** live: the engine's connections (home.connections), shown as they are */
  connections?: { id: string; name: string; state: string; from: string }[];
  /** live: every fit the engine keeps (next.fits, S15): a take on a knob in a scope, who set it, why, and its history */
  fits?: Fit[];
  /** live: the folder and the session Settings was opened over, the reaches a take can be kept for */
  here?: Here;
};
/** a fit as the engine keeps it (next.fits, engine next/fits.ts) */
export type FitStep = { id: string; at: number; act: "set" | "back" | "release" | "offer" | "keep" | "notnow"; take?: string; author?: "person" | "sol"; reason?: string; count?: number; source?: string; undoes?: string; undone?: true };
export type Fit = { knob: string; scope: string; take: string | null; author: "person" | "sol" | "default"; reason: string | null; count: number | null; source: string | null; change: string | null; held: boolean; history: FitStep[] };
/** where a take is kept: All of Sol ("~"), the folder Settings was opened over, or that one session */
export type Reach = "~" | "folder" | "session";
/** the folder here and the session; `up`: the folder's scope and those above it as the engine walks them (fits.ts upward),
 *  the person's nesting before the path, made by hereNow; without it, the path alone */
export type Here = { folder: { scope: string; name: string; up?: string[] } | null; session: { scope: string; name: string } | null };
export type Trying = { k: string; t: string; ai: string | null; sticky: boolean };
export type Filter = { l: string; k: string[]; p: string[] };
/** the panel's state (the mockup's UI): S.st */
export type Ui = {
  open: string | null; ai: Record<string, string>; trying: Trying | null; q: string; sel: number; filter: Filter | null; pointing: boolean;
  page: "main" | "voice" | "data" | "privacy"; reply: { say?: string; done?: string; miss?: string } | null; hx: number | null; hsee: number | null;
  own: string | null; edit: number | string | null; persona: boolean; why: false | "ask" | "yes"; saveWay: boolean; conn: string | null; tool: string | null;
  hov: { l: string; k: string[]; p: string[]; ai: string | null } | null;
  /** live: where a take pressed now is kept */
  reach: Reach;
};

export const C = <T>(o: T): T => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- the knobs (ui.html K)

export const AUT: Record<string, string[]> = { only: ["wait", "wait", "wait", "wait"], asks: ["ask", "ask", "ask", "ask"], small: ["do", "ask", "ask", "ask"], ahead: ["do", "do", "ask", "ask"] };
export const OUT: Record<string, string> = { do: "Does it, then tells you", ask: "Asks you first", wait: "Waits until you ask" };
export const ATT: Record<string, number[]> = { quiet: [0, 0, 0, 0, 0], money: [1, 1, 0, 0, 0], asksbreaks: [1, 1, 1, 0, 0], needs: [1, 1, 1, 1, 0], all: [1, 1, 1, 1, 1] };
export const LIM: Record<string, number | null> = { c5: 5, c20: 20, c50: 50, none: null };

export const K: Record<string, Knob> = {
  autonomy: { id: "autonomy", n: "How often an AI checks with you", s: "Choose it for each AI. Spending, sending and deleting always ask first.", short: "how far it goes alone", per: true, def: "asks",
    core: "In every take, an AI asks before anything leaves this machine, costs money or deletes. No take changes that.",
    takes: [
      { id: "only", n: "Only when I ask", s: "It does nothing until you ask, then only what you asked.", sets: "Starts nothing alone · does only what you asked · tells you on Home" },
      { id: "asks", n: "Asks first", s: "It says what it would do and waits for your yes, every time.", sets: "Starts nothing alone · shows each change before it lands" },
      { id: "small", n: "Goes ahead on small things", s: "It handles small things by itself and asks before anything bigger.", sets: "Small edits in one place alone · anything bigger asks · a line after each" },
      { id: "ahead", n: "Goes ahead, tells me after", s: "It does the whole job and tells me after. I take back what I don’t want.", sets: "Whole jobs alone · one summary after · every change can be taken back" }] },
  working: { id: "working", n: "Show the AI’s steps", s: "The result always comes. This is how much of the “how” comes with it.", short: "how much of its working you see", def: "folded",
    takes: [
      { id: "result", n: "Just the result", s: "You see what it made, and nothing about how.", sets: "Result only · steps are kept, never shown unless you ask" },
      { id: "folded", n: "Steps hidden until you open them", s: "The result first, with its steps one press below.", sets: "Result first · “Read 3 files” hidden under it · open any time" },
      { id: "every", n: "Every step", s: "You watch each step as it happens.", sets: "Result · every step listed as it happens" }] },
  writing: { id: "writing", n: "AI edits to your writing", s: "Your essays, notes and drafts. Nothing is changed without a way back.", short: "how it touches your writing", def: "flag",
    takes: [
      { id: "leave", n: "Leave it alone", s: "It never touches what you wrote. It may read it.", sets: "Never marks, never suggests, never edits" },
      { id: "flag", n: "Mark problems only", s: "It marks a spot and says why. You fix it.", sets: "Marks a spot with a reason · changes nothing" },
      { id: "suggest", n: "Suggest beside it", s: "It puts a suggestion next to your words. You choose.", sets: "Suggestion beside the line · your words stay until you use it" },
      { id: "edit", n: "Edit", s: "It changes your words and shows what changed, with a way back.", sets: "Edits in place · shows every change · undo on each" }] },
  attention: { id: "attention", n: "Notifications", s: "The island opens at a pause, never mid-sentence. Everything else waits in Waiting on you.", short: "what may open the island", def: "asksbreaks",
    takes: [
      { id: "quiet", n: "Nothing, I’ll look", s: "The island never opens on its own. Everything waits in Waiting on you.", sets: "Never opens on its own · all of it waits in Waiting on you" },
      { id: "money", n: "Money and sending", s: "It opens before a payment or anything that leaves your Mac.", sets: "Opens for money and for anything sent off your Mac · the rest waits" },
      { id: "asksbreaks", n: "Money, sending, a stuck AI", s: "Also when an AI can’t go on without you.", sets: "Money, leaving the Mac, and an AI held up · the rest waits" },
      { id: "needs", n: "Everything but news", s: "Also for what is due today.", sets: "All of the above, and what is due today · news waits" },
      { id: "all", n: "Anything", s: "It opens for all of it, at the next pause.", sets: "Opens for everything, at the next pause" }] },
  marking: { id: "marking", n: "Animation when a task finishes", s: "A small moment at the end of real work, never during it.", short: "how a finished piece is marked", def: "lift",
    takes: [
      { id: "quiet", n: "Quiet", s: "A finished piece just appears in its place.", sets: "No motion · no sound" },
      { id: "lift", n: "A short animation", s: "The piece lifts a little and settles. Once, at the end.", sets: "One lift and settle · no sound" },
      { id: "sound", n: "Animation and sound", s: "The same animation, with one soft sound.", sets: "One lift and settle · one soft sound" }] },
  size: { id: "size", n: "Size of everything you read", s: "Text, lists and buttons, in every view.", short: "the size of text", def: "m",
    takes: [
      { id: "s", n: "A little smaller", s: "More fits on each screen.", z: 0.92, sets: "Everything 8% smaller" },
      { id: "m", n: "As it is", s: "The size it comes in.", z: 1, sets: "Everything at its normal size" },
      { id: "l", n: "Larger", s: "A step up everywhere. Easier on tired eyes.", z: 1.13, sets: "Everything 13% larger" },
      { id: "xl", n: "Largest", s: "Big and clear. Fewer things per screen.", z: 1.3, sets: "Everything 30% larger" },
      { id: "eve", n: "Larger after 8 pm", s: "As it is by day, a step larger from 8 pm.", z: 1.13, offered: true, sets: "Normal by day · 13% larger from 8 pm to 6 am" }] },
  look: { id: "look", n: "The look of the window", s: "Point at one and the whole window changes.", short: "the look of the window", def: "paper",
    takes: [
      { id: "paper", n: "Paper", s: "Warm and quiet, like paper.", look: "paper", sets: "Warm paper · soft ink · one small glow for the AI" },
      { id: "bright", n: "Bright", s: "Clean white with a little more colour.", look: "bright", sets: "White · cooler ink · a stronger glow" },
      { id: "night", n: "Night", s: "Dark and easy on the eyes in the evening.", look: "night", sets: "Dark · soft light ink · the same glow" },
      { id: "back", n: "Steps back", s: "The window goes quiet so your work stands out.", look: "back", sets: "Sidebar, bar and cards fade · the AI’s glow dims · your work stays full strength" }] },
  glance: { id: "glance", n: "Where the glance lives", s: "The slim strip at the side of your screen: what your AIs are on, at a glance.", short: "where the glance lives", def: "over",
    takes: [
      { id: "over", n: "Over windows", s: "At the edge of the screen, above whatever is open.", sets: "At the screen’s edge · above every window" },
      { id: "desk", n: "On the desktop", s: "Behind your windows. You see it when you clear the screen.", sets: "On the desktop · behind every window" },
      { id: "off", n: "Off", s: "No glance. The island and Waiting on you still work.", sets: "No glance · the island and Waiting on you are unchanged" }] },
  // BR1 tabs (#1615): how a click opens a piece, per kind; Sol offers "As a tab" once after four taken out in a day (cv/moves/tabs.ts)
  "open-session": { id: "open-session", n: "Opening a session", s: "A click opens it where it is on the canvas, or as a tab with the whole window.", short: "how a session opens", def: "place",
    takes: [
      { id: "place", n: "In place", s: "It grows where it is and the canvas stays around it.", sets: "A click opens it in place · ⤢ or ⌘-click takes it out to a tab" },
      { id: "tab", n: "As a tab", s: "It opens as a tab with the whole window. Closing the tab puts it back.", sets: "A click opens a tab · it keeps its place on the canvas" }] },
  "open-page": { id: "open-page", n: "Opening a page", s: "Pages, notes, lists and any other piece that isn't a session.", short: "how a page opens", def: "place",
    takes: [
      { id: "place", n: "In place", s: "It grows where it is and the canvas stays around it.", sets: "A click opens it in place · ⤢ or ⌘-click takes it out to a tab" },
      { id: "tab", n: "As a tab", s: "It opens as a tab with the whole window. Closing the tab puts it back.", sets: "A click opens a tab · it keeps its place on the canvas" }] },
  spend: { id: "spend", n: "A monthly limit for each AI", s: "It asks me before it goes past. Each job shows its cost first.", short: "its monthly limit", per: true, def: "c20",
    core: "Every job shows what it will cost before it starts. Past the limit, the AI stops and asks.",
    takes: [
      { id: "c5", n: "$5 a month", s: "It stops and asks me before going past $5.", sets: "Limit $5 · asks to go past it" },
      { id: "c20", n: "$20 a month", s: "It stops and asks me before going past $20.", sets: "Limit $20 · asks to go past it" },
      { id: "c50", n: "$50 a month", s: "It stops and asks me before going past $50.", sets: "Limit $50 · asks to go past it" },
      { id: "none", n: "No limit", s: "No monthly number. It still asks before any one cost over $10.", sets: "No monthly limit · asks before any single cost over $10" }] },
  "v-length": { id: "v-length", n: "How much I say", s: "Short is one fact in one line.", short: "how much I say", def: "short",
    takes: [{ id: "short", n: "Short", s: "One fact, one line.", sets: "One fact" }, { id: "mid", n: "A little more", s: "The fact, and what it means for you.", sets: "Fact + what it unlocks" }, { id: "full", n: "Full", s: "The fact, why, and what I used.", sets: "Fact + why + what I used" }] },
  "v-register": { id: "v-register", n: "How I sound", s: "The words I choose, not what I say.", short: "how I sound", def: "plain",
    takes: [{ id: "plain", n: "Plain", s: "Everyday words, no fuss.", sets: "Everyday words" }, { id: "warm", n: "Warm", s: "Friendly, like a flatmate who knows your week.", sets: "Friendly, first names" }, { id: "brisk", n: "Brisk", s: "Fewest words. Straight to it.", sets: "Shortest wording" }] },
  "v-humour": { id: "v-humour", n: "A little humour", s: "Always about the work, never about you.", short: "humour", def: "none",
    takes: [{ id: "none", n: "None", s: "I stay serious.", sets: "No jokes" }, { id: "dry", n: "A dry line now and then", s: "Now and then, about the work.", sets: "A dry line on some results" }, { id: "play", n: "Playful", s: "Light and a bit cheeky about the work.", sets: "Playful on most results" }] },
};
export const VOICE = ["v-length", "v-register", "v-humour"];
/** how the voice would say a line, in each register and humour (the register's and humour's own pictures) */
export const BUB: Record<string, Record<string, string>> = { "v-register": { plain: "Your bill is ready.", warm: "Good news, Sam: your bill is ready.", brisk: "Bill ready. $42." }, "v-humour": { none: "The bill is ready.", dry: "The bill is ready. It will not pay itself.", play: "Bill’s ready. Your wallet is bracing itself." } };

export const GROUPS: { n: string; s: string; knobs?: string[]; custom?: "voice" | "money" }[] = [
  { n: "How your AIs work", s: "What they do on their own, and how much you see.", knobs: ["autonomy", "working", "writing"] },
  { n: "What reaches you", s: "When the island may open, and how work ends.", knobs: ["attention", "marking"] },
  { n: "How it looks and reads", s: "The whole window changes at once.", knobs: ["size", "look", "glance"] },
  { n: "How things open", s: "A click opens in place. A tab gives a piece the whole window.", knobs: ["open-session", "open-page"] },
  { n: "Your AI’s voice", s: "How I talk to you.", custom: "voice" },
  { n: "Money and your data", s: "What it costs, and where things go.", knobs: ["spend"], custom: "money" }];

/** the knobs whose engine row is "no" (map.md): spend; live they are not drawn and cannot be kept */
export const NOT_LIVE = new Set(["spend"]);

// ---------------------------------------------------------------- the words for each choice (ui.html SYN, TSYN, PLACES)

export const SYN: Record<string, string> = { autonomy: "how far goes on its own permission permissions alone automatic approve approval allow trust independent control",
  working: "how much of its working you see steps details log logs transparency process show work how",
  writing: "how it touches your own writing essay essays edit grammar spelling suggestions drafts notes autocorrect rewrite",
  attention: "what may open the island on its own notifications notification ping pings tap taps alerts alert interrupt disturb quiet focus dnd badge island pop up popup open",
  glance: "glance side edge desktop overlay over windows float floating widget",
  marking: "how a finished piece is marked done finish finished sound animation celebrate confetti motion",
  size: "font text bigger larger smaller zoom read eyes scale tiny",
  look: "theme dark light mode colour color night bright white contrast appearance",
  spend: "money cost costs budget limit price pay spending cap dollars",
  "v-length": "voice talk chatty long short brief verbose wordy",
  "v-register": "voice tone friendly polite formal warm blunt",
  "v-humour": "voice humour humor jokes funny joke personality serious" };
export const TSYN: Record<string, string> = { "look:night": "dark black evening dim", "look:bright": "light white", "look:back": "minimal distraction calm hide fade quiet focus", "look:paper": "warm default",
  "size:s": "smaller compact dense zoom out", "size:l": "bigger larger zoom in", "size:xl": "biggest huge accessibility", "size:eve": "evening night later",
  "attention:quiet": "do not disturb dnd silent mute off none", "attention:all": "every all", "attention:needs": "today urgent important due deadline", "attention:asksbreaks": "questions errors broken held stuck waiting blocked", "attention:money": "money pay payment spend send email leave", "glance:desk": "desktop wallpaper behind", "glance:off": "off hide none",
  "marking:sound": "chime ding", "marking:quiet": "no animation reduce motion off", "working:every": "verbose all", "working:result": "answer only minimal hide",
  "writing:edit": "rewrite autocorrect fix", "writing:leave": "never off hands", "autonomy:only": "manual never", "autonomy:ahead": "autopilot everything trust", "autonomy:asks": "approve confirm check",
  "spend:none": "unlimited no limit", "v-length:short": "terse concise brief", "v-length:full": "detailed explain verbose", "v-humour:play": "funny cheeky jokes", "v-humour:none": "serious no jokes", "v-register:warm": "friendly kind", "v-register:brisk": "blunt direct fast" };
export type Place = { id: string; n: string; w: string; where: string; page: "voice" | "data" | "privacy" | "main"; anchor?: string };
export const PLACES: Place[] = [
  { id: "voice", n: "How your AI talks", w: "your ai’s voice personality persona tone talk sound", where: "The voice, and your own personality", page: "voice" },
  { id: "privacy", n: "Privacy", w: "privacy private erase forget reads read sources consent what sol knows", where: "What Sol may read, and everything it has learned", page: "privacy" },
  { id: "learned", n: "What I’ve learned about you", w: "memory memories remember forget learned know facts about me", where: "Each line, where Sol learned it, and Forget", page: "privacy", anchor: "st-learned" },
  { id: "data", n: "Where your data goes", w: "private data local cloud model machine", where: "Stays on this machine, or goes to the model", page: "data" },
  { id: "conn", n: "Connected services", w: "connect connections accounts gmail calendar bank portal school wispr granola dictation reminders integrations apps", where: "Gmail, Calendar, your bank, your own dictation", page: "data", anchor: "st-conn" },
  { id: "history", n: "History of changes", w: "history undo revert changes turn back earlier previous", where: "Every change, and a way back to any of them", page: "main", anchor: "st-history" },
  { id: "worked", n: "How Sol worked", w: "worked log logs trace traces runs ran happened activity did tokens cost tools permissions waits observability", where: "What ran each day, with what, and how it went", page: "main", anchor: "st-worked" },
  { id: "ways", n: "Ways of working", w: "ways modes mode focus study exam preset presets profile", where: "Several choices in one press", page: "main", anchor: "st-ways" }];
/** places whose engine row is "no" live */
export const PLACES_NOT_LIVE = new Set(["ways"]);

// ---------------------------------------------------------------- reading the state

export const kk = (k: Knob, ai: string | null | undefined) => (k.per ? `${k.id}:${ai}` : k.id);
export const aiOf = (W: World, id: string | null | undefined): AiW => W.ais.find((a) => a.id === id) || W.ais[0];
export function allTakes(W: World, U: Ui, k: Knob): Take[] {
  const list = k.takes.filter((t) => !t.offered || (t.id === "eve" && (W.eveOk || W.prefs.kept.size === "eve" || (U.trying?.t === "eve"))));
  return list.concat(W.own[k.id] || []);
}
export function takeOf(W: World, k: Knob, id: string | undefined): Take {
  const t = k.takes.find((x) => x.id === id);
  if (t) return t;
  const o = (W.own[k.id] || []).find((x) => x.id === id);
  return o ? { ...k.takes.find((x) => x.id === o.base)!, ...o } : k.takes.find((x) => x.id === k.def)!;
}
export const tryOn = (U: Ui, kid: string, ai: string | null | undefined) => (U.trying && U.trying.k === kid && (U.trying.ai || null) === (ai || null) ? U.trying.t : null);
/** the take in effect: the one being tried, else the one kept */
export function eff(W: World, U: Ui, kid: string, ai?: string | null): string {
  const k = K[kid]; const a = k.per ? (ai || U.ai[kid]) : null;
  return tryOn(U, kid, a) || W.prefs.kept[kk(k, a)];
}
/** a choice's takes over time, from the history */
export function trail(W: World, k: Knob, ai: string | null): { t: string; when: string }[] {
  const key = kk(k, ai), out: { t: string; when: string }[] = [];
  W.hist.forEach((h) => { const v = h.snap.kept[key]; if (!out.length || out[out.length - 1].t !== v) out.push({ t: v, when: h.when }); });
  return out;
}
/** who set a choice last: the history row that changed it */
export function setBy(W: World, key: string): HistRow | null {
  let by: HistRow | null = null;
  for (let i = 1; i < W.hist.length; i++) if (W.hist[i].snap.kept[key] !== W.hist[i - 1].snap.kept[key]) by = W.hist[i];
  return by;
}
export const byAI = (h: HistRow | null) => !!h && /^your AI/.test(h.how);
export const day = (w: string) => (w || "").split(",")[0];
export function whoText(W: World, k: Knob): string {
  if (k.per) { const u = new Set(W.ais.map((a) => W.prefs.kept[kk(k, a.id)])); if (!W.ais.length) return "the default"; return u.size === 1 ? (W.ais.length === 1 ? "Your one AI" : `All ${W.ais.length} AIs`) : `${u.size} different ways`; }
  const h = setBy(W, k.id); if (!h) return "the default";
  return byAI(h) ? `your AI tuned it · ${day(h.when)}` : `you · ${day(h.when)}`;
}
export function curName(W: World, k: Knob): string | null {
  if (!k.per) return null;
  const u = [...new Set(W.ais.map((a) => W.prefs.kept[kk(k, a.id)]))];
  return u.length === 1 ? takeOf(W, k, u[0]).n : "Varies by AI";
}

// ---------------------------------------------------------------- the voice's one line

export function voiceLine(len: string, reg: string, hum: string): string {
  const F = ({ plain: ["Biology chapter 4 is on one page.", " It is in School, ready before class.", " I used your notes from 12 Nov and kept the three terms you underlined."],
    warm: ["Good news, Sam: Biology chapter 4 is on one page.", " It is in School, ready before your class.", " I used your notes from 12 Nov and kept the three terms you underlined."],
    brisk: ["Biology ch. 4: one page.", " In School.", " Built from your 12 Nov notes."] } as Record<string, string[]>)[reg] || [];
  const n = ({ short: 1, mid: 2, full: 3 } as Record<string, number>)[len] || 1;
  return F.slice(0, n).join("") + (({ none: "", dry: reg === "brisk" ? " No cramming." : " Cramming is optional now.", play: reg === "brisk" ? " Shortened politely." : " The textbook has been politely shortened." } as Record<string, string>)[hum] || "");
}
export const voiceNow = (W: World, U: Ui) => voiceLine(takeOf(W, K["v-length"], eff(W, U, "v-length")).base || eff(W, U, "v-length"), eff(W, U, "v-register"), eff(W, U, "v-humour"));

// ---------------------------------------------------------------- now against with this (ui.html cmpHTML), as data

export type Cmp = { head: [string, string]; labels: [string, string]; lead?: string; rows?: { m: string; n: string; w: string; chg: boolean }[]; count?: string; two?: [string, string]; live?: boolean };
export function cmp(W: World, k: Knob, a: string, b: string, ai: string | null, L: [string, string] = ["Now", "With this"]): Cmp {
  const A = takeOf(W, k, a), B = takeOf(W, k, b), x = A.base || A.id, y = B.base || B.id, id = k.id;
  const out: Cmp = { head: [A.n, B.n], labels: L };
  const rows = (items: string[], f: (i: number) => string, g: (i: number) => string, lab: string) => {
    out.rows = items.map((m, i) => ({ m, n: f(i), w: g(i), chg: f(i) !== g(i) }));
    const n = out.rows.filter((r) => r.chg).length;
    out.count = n ? `${n} of ${items.length} ${lab} change.` : `Nothing on these ${items.length} ${lab} changes.`;
  };
  if (id === "autonomy") { const P = AUT[x], Q = AUT[y], z = aiOf(W, ai); out.lead = `${z.n}, on four of its jobs:`; rows(z.m, (i) => OUT[P[i]], (i) => OUT[Q[i]], "jobs"); return out; }
  if (id === "attention") {
    const P = ATT[x] || ATT.asksbreaks, Q = ATT[y] || ATT.asksbreaks, c = (f: number[]) => f.reduce((s, v) => s + v, 0);
    out.lead = `Yesterday, five things happened. The island would have opened ${c(P)} → ${c(Q)} time${c(Q) === 1 ? "" : "s"}.`;
    rows(ATT_ITEMS, (i) => (P[i] ? "Opens" : "Waits"), (i) => (Q[i] ? "Opens" : "Waits"), "things"); return out;
  }
  if (id === "spend") {
    const z = aiOf(W, ai), sp = z.spent, L1 = LIM[x], L2 = LIM[y];
    const say = (l: number | null) => (l ? (sp > l ? `Already past $${l}: it asks before its next job.` : `$${(l - sp).toFixed(2)} left before it asks.`) : "No monthly number. Asks before any one cost over $10.");
    out.lead = `${z.n} has spent $${sp.toFixed(2)} this month.`; out.two = [say(L1), say(L2)]; return out;
  }
  if (id.startsWith("v-")) {
    const key = ({ "v-length": "len", "v-register": "reg", "v-humour": "hum" } as Record<string, "len" | "reg" | "hum">)[id];
    const v = { len: W.prefs.kept["v-length"], reg: W.prefs.kept["v-register"], hum: W.prefs.kept["v-humour"] }, w = { ...v, [key]: y }; v[key] = x;
    const line = (o: typeof v) => voiceLine(takeOf(W, K["v-length"], o.len).base || o.len, o.reg, o.hum);
    out.lead = "How I would tell you the Biology summary is ready:"; out.two = [line(v), line(w)]; return out;
  }
  out.live = (id === "look" || id === "size") && L[0] === "Now";
  out.two = [A.sets || "", B.sets || ""];
  return out;
}
export const ATT_ITEMS = ["Bill watcher wants to pay the phone bill, $42", "Inbox keeper wants to send the reply to Ms. Lee", "Course catch-up is held up: which chapter?", "Your history essay is due today", "Biology summary is ready"];

/** a knob's sample, as lines of words (ui.html k.sample: the pictures are the visual pass's) */
export function sample(W: World, U: Ui, k: Knob, T: Take, ai: string | null): { lead: string; rows: { m: string; w: string }[]; line?: string } {
  const t = T.base || T.id;
  if (k.id === "autonomy") { const a = aiOf(W, ai), row = AUT[t]; return { lead: `On ${a.n}’s own work, four jobs:`, rows: a.m.map((m, i) => ({ m, w: OUT[row[i]] })) }; }
  if (k.id === "attention") { const f = ATT[t] || ATT.asksbreaks; return { lead: "Five things happened today. What opens the island:", rows: ATT_ITEMS.map((m, i) => ({ m, w: f[i] ? "Opens the island" : "Waits in Needs you" })) }; }
  if (k.id === "spend") { const a = aiOf(W, ai), lim = LIM[t], sp = a.spent;
    return { lead: `${a.n}, this month so far:`, rows: [], line: lim ? (sp > lim ? `$${sp.toFixed(2)} this month. It is already past $${lim}, so it asks before its next job.` : `$${sp.toFixed(2)} of $${lim} used. $${(lim - sp).toFixed(2)} left before it asks.`) : `$${sp.toFixed(2)} this month. It asks before any one cost over $10.` }; }
  if (k.id.startsWith("v-")) {
    const v = { len: eff(W, U, "v-length"), reg: eff(W, U, "v-register"), hum: eff(W, U, "v-humour") };
    const key = ({ "v-length": "len", "v-register": "reg", "v-humour": "hum" } as Record<string, "len" | "reg" | "hum">)[k.id]; v[key] = t;
    return { lead: "Here is how I would tell you about the Biology summary:", rows: [], line: voiceLine(takeOf(W, K["v-length"], v.len).base || v.len, v.reg, v.hum) };
  }
  if (k.id === "working") return { lead: "Course catch-up, on this morning’s Biology lecture:", rows: [], line: `I put chapter 4 on one page. It is in School.${t === "folded" ? " · Read 3 files · wrote 1" : t === "every" ? " · Opened chapter 4 · picked out the key terms · wrote the summary · checked it · saved it in School" : ""}` };
  if (k.id === "writing") return { lead: "In your history essay, for example:", rows: [], line: ({ leave: "Course catch-up reads this and says nothing about it.", flag: "Flagged: too casual for an essay? Nothing is changed.", suggest: "Maybe: “The weakness was clear from the start.”", edit: "Changed by Course catch-up: “It was kinda obvious” became “The weakness was clear”." } as Record<string, string>)[t] };
  if (k.id === "marking") return { lead: "A piece has just finished:", rows: [], line: `History essay outline · ${T.sets}` };
  if (k.id === "glance") return { lead: t === "off" ? "With the glance off:" : t === "desk" ? "On the desktop:" : "Over your windows:", rows: [], line: T.s };
  return { lead: "Look at the window around this: it changes while you try.", rows: [] };
}

// ---------------------------------------------------------------- finding (ui.html norm, whoKnows, findAll)

const STOP = new Set("the a an to my me i it of for on in please make turn set want can be is so with and".split(" "));
export const norm = (s: string) => (s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$' ]+/g, " ").replace(/\s+/g, " ").trim();
export function whoKnows(W: World, q: string): { ai: string | null; rest: string } {
  const s = " " + norm(q) + " "; let ai: string | null = null, rest = s;
  W.ais.forEach((a) => { const n = norm(a.n), w = n.split(" ")[0];
    if (s.includes(" " + n + " ")) { ai = a.id; rest = rest.replace(" " + n + " ", " "); } else if (w.length > 3 && s.includes(" " + w + " ")) { ai = a.id; rest = rest.replace(" " + w + " ", " "); } });
  return { ai, rest: rest.trim() };
}
export type Res = { type: "take" | "knob" | "place" | "way"; k?: string; t?: string; ai?: string | null; p?: string; w?: string; sc?: number; said?: boolean };
/** the knobs Settings draws here: live, the "no" ones are left out */
export const knobsHere = (W: World) => Object.values(K).filter((k) => !(W.live && NOT_LIVE.has(k.id)));
export function findAll(W: World, U: Ui, q: string): Res[] {
  const { ai, rest } = whoKnows(W, q), toks = norm(rest).split(" ").filter((t) => t && !STOP.has(t)), out: Res[] = [];
  const score = (title: string, words: string) => {
    if (!toks.length) return 0; let sc = 0, miss = 0; const tw = norm(title).split(" "), ww = norm(words).split(" ");
    toks.forEach((t) => { if (tw.some((w) => w.startsWith(t))) sc += 3; else if (ww.some((w) => w.startsWith(t))) sc += 1; else miss++; });
    return miss > (toks.length > 2 ? 1 : 0) ? -1 : sc;
  };
  knobsHere(W).forEach((k) => {
    const g = GROUPS.find((g) => (g.knobs || []).includes(k.id)) || { n: "Your AI’s voice" }, a = k.per ? (ai || U.ai[k.id]) : null;
    if (ai && !k.per && !toks.length) return;
    const ks = score(k.n, k.s + " " + (SYN[k.id] || "") + " " + g.n);
    if (ks > 0 || (ai && k.per && !toks.length)) out.push({ type: "knob", k: k.id, ai: a, sc: (ks > 0 ? ks : 2) + (ai && k.per ? 2 : 0) });
    allTakes(W, U, k).forEach((t) => { const ts = score(t.n, t.s + " " + (t.sets || "") + " " + (TSYN[k.id + ":" + (t.base || t.id)] || "") + " " + k.n + " " + (SYN[k.id] || "")); if (ts > 0) out.push({ type: "take", k: k.id, t: t.id, ai: a, sc: ts + (ai && k.per ? 2 : 0) + 0.5 }); });
  });
  if (!ai || toks.length) PLACES.filter((p) => !(W.live && PLACES_NOT_LIVE.has(p.id))).forEach((p) => { const ps = score(p.n, p.w); if (ps > 0) out.push({ type: "place", p: p.id, sc: ps }); });
  if (!W.live) W.ways.forEach((w) => { const ws = score(w.n, "way of working mode " + w.sum); if (ws > 0) out.push({ type: "way", w: w.id, sc: ws }); });
  out.sort((x, y) => (y.sc || 0) - (x.sc || 0));
  const p = toks.length ? parseAsk(W, U, q) : null;
  if (p && !(W.live && NOT_LIVE.has(p.k))) {
    const i = out.findIndex((r) => r.type === "take" && r.k === p.k && r.t === p.t); if (i >= 0) out.splice(i, 1);
    out.unshift({ type: "take", k: p.k, t: p.t, ai: K[p.k].per ? (p.ai || ai || U.ai[p.k]) : null, said: true });
  }
  return out.slice(0, 8);
}

// ---------------------------------------------------------------- asking in words (ui.html amt, parseAsk)

function amt(s: string): string | null { const m = s.match(/\$?\s?(\d+)/); if (!m) return null; const n = +m[1]; return n <= 12 ? "c5" : n <= 35 ? "c20" : "c50"; }
export function parseAsk(W: World, U: Ui, q: string): { k: string; t: string; ai?: string | null } | null {
  const s = q.toLowerCase().replace(/[’']/g, "'"); let ai: string | null = null;
  // which AI the words name: the mockup's five by their own words, and any AI by its first word
  ([["inbox", /inbox/], ["shift", /shift/], ["bill", /bill/], ["course", /course|catch/], ["weekly", /weekly/]] as [string, RegExp][]).forEach(([id, re]) => { if (re.test(s) && W.ais.some((a) => a.id === id)) ai = id; });
  if (!ai) { const w = whoKnows(W, q).ai; if (w) ai = w; }
  if (/\b(smaller)\b/.test(s)) return { k: "size", t: "s" };
  if (/(bigger|larger|enlarge|can't read|too small|text up)/.test(s)) return { k: "size", t: /(much|huge|biggest|largest|way )/.test(s) ? "xl" : "l" };
  if (/(night|dark)/.test(s)) return { k: "look", t: "night" };
  if (/(bright|white|light mode)/.test(s)) return { k: "look", t: "bright" };
  if (/(step back|out of the way|out of my way|get quiet|focus mode)/.test(s)) return { k: "look", t: "back" };
  if (/\bpaper\b/.test(s)) return { k: "look", t: "paper" };
  if (/(limit|cap|budget|spend|\$\s?\d|no limit|unlimited)/.test(s)) { const t = /(no limit|unlimited|no cap)/.test(s) ? "none" : amt(s) || "c20"; return { k: "spend", t, ai: ai || U.ai.spend }; }
  if (/(only when i look|don't (ping|tap|bother)|silent|nothing taps)/.test(s)) return { k: "attention", t: "quiet" };
  if (/(quiet|calm|fewer|less (noise|pings|often)|only what (needs|matters)|leave me alone)/.test(s)) return { k: "attention", t: "money" };
  if (/(everything|tell me all|all of it).*(ping|tap|tell|know)|ping me (for )?everything/.test(s)) return { k: "attention", t: "all" };
  if (/(just the result|hide.*(steps|working)|no steps)/.test(s)) return { k: "working", t: "result" };
  if (/(every step|show.*(every|all).*step|\bwatch\b)/.test(s)) return { k: "working", t: "every" };
  if (/(fold|show.*steps)/.test(s)) return { k: "working", t: "folded" };
  if (/(leave|don't touch).*(writing|essay|notes)/.test(s)) return { k: "writing", t: "leave" };
  if (/(edit|rewrite).*(writing|essay)/.test(s)) return { k: "writing", t: "edit" };
  if (/(suggest)/.test(s)) return { k: "writing", t: "suggest" };
  if (/(sound|celebrate)/.test(s)) return { k: "marking", t: /(no|without|off)/.test(s) ? "lift" : "sound" };
  if (/(ask me (first|before)|check with me)/.test(s)) return { k: "autonomy", t: "asks", ai: ai || U.ai.autonomy };
  if (/(only when i ask|do nothing)/.test(s)) return { k: "autonomy", t: "only", ai: ai || U.ai.autonomy };
  if (/(go ahead|alone|on its own|do more|handle|small things)/.test(s)) return { k: "autonomy", t: /(everything|whole|all of it|tell me after|after)/.test(s) ? "ahead" : "small", ai: ai || U.ai.autonomy };
  return null;
}

// ---------------------------------------------------------------- pointing (ui.html POINTS, pointAt)

/** what each part of the window is, and the settings that change it. The mockup's selectors read its own page; here
 *  each reads the next face's DOM hook for that part: the shell's ids, and the hooks the other slices' views carry
 *  (data-draft, data-proof, data-ask, data-done, data-night, data-front, data-region). The order is the mockup's: the
 *  first that holds the thing pointed at wins */
export type Point = { q: string; l: string; k: string[]; p?: string[] };
export const POINTS: Point[] = [
  { q: "#talk", l: "the talk bar", k: ["v-length", "v-register", "v-humour"], p: ["voice"] },
  { q: "[data-draft]", l: "a draft waiting to be sent", k: ["writing", "autonomy"] },
  { q: "[data-proof],[data-steps]", l: "how a job was done", k: ["working"] },
  { q: "#line [data-ask],[data-ask],[data-row]", l: "a question for you", k: ["attention", "autonomy"] },
  { q: "[data-done]", l: "a finished piece", k: ["marking"] },
  { q: "#needsrow,[data-needs]", l: "Waiting on you", k: ["attention"] },
  { q: "#top", l: "the top bar", k: ["look", "size"] },
  { q: "#side", l: "the sidebar", k: ["look", "size"] },
  { q: "[data-night],[data-seen]", l: "what happened overnight", k: ["attention", "v-length", "working"] },
  { q: "[data-front]", l: "a line of work", k: ["working", "autonomy", "attention"] },
  { q: "[data-region]", l: "a place and its news", k: ["attention", "v-length"] },
  { q: "h1,h2,p", l: "the words you read", k: ["size", "look"] },
  { q: "#main", l: "the window", k: ["look", "size"] }];
/** the parts Settings itself draws over, never pointed at */
export const NOT_POINTED = "#v-settings,#st-pbox,.nx-say";
export type Hit = { el: Element; l: string; k: string[]; p: string[]; ai: string | null; i: number };
/** what a thing in the window is (ui.html pointAt): an AI's name first (its own two choices), else the first POINT that
 *  holds it. Live, a "no" knob is left out of what it changes */
export function pointAt(W: World, el: Element | null): Hit | null {
  if (!el || !el.closest || el.closest(NOT_POINTED)) return null;
  const drop = (k: string[]) => k.filter((x) => !(W.live && NOT_LIVE.has(x)));
  const ain = el.closest("[data-ai]") as HTMLElement | null;
  if (ain) { const a = W.ais.find((x) => x.id === ain.dataset.ai || x.n === ain.dataset.ai); if (a) return { el: ain, l: a.n, k: drop(["autonomy", "spend"]), p: [], ai: a.id, i: -1 }; }
  for (let i = 0; i < POINTS.length; i++) {
    const p = POINTS[i], t = el.closest(p.q);
    if (t) return { el: t, l: p.l, k: drop(p.k), p: p.p || [], ai: null, i };
  }
  return null;
}

// ---------------------------------------------------------------- the history, drawn (ui.html diffSnap, WHO)

export const WHO = (h: HistRow) => (/^your AI/.test(h.how) ? "ai" : /set up for you/.test(h.how) ? "def" : "you");
export const WHON: Record<string, string> = { you: "You", ai: "Your AI", def: "The default" };
export type Change = { key: string; kid: string; ai: string | null; from: string; to: string };
/** every change is read from the two snapshots around it, never from its label */
export function diffSnap(a: Prefs, b: Prefs): { k: Change[]; more: string[] } {
  const k: Change[] = [];
  Object.keys(b.kept).forEach((key) => { if (a.kept[key] !== b.kept[key]) { const [kid, ai] = key.split(":"); if (K[kid]) k.push({ key, kid, ai: ai || null, from: a.kept[key], to: b.kept[key] }); } });
  const more: string[] = [], J = JSON.stringify;
  if (J(a.data) !== J(b.data)) more.push("where your data goes"); if (J(a.conns) !== J(b.conns)) more.push("your connected services"); if (J(a.tools) !== J(b.tools)) more.push("your own tools");
  if (J(a.learned) !== J(b.learned)) more.push("what I’ve learned about you"); if (a.persona !== b.persona || a.personaText !== b.personaText) more.push("your own personality"); if (a.tune !== b.tune) more.push("how I keep your settings fitting");
  return { k, more };
}
/** what a change means, in one line (ui.html meanHTML, as words) */
export function mean(W: World, c: Change): string {
  const k = K[c.kid], A = takeOf(W, k, c.from), B = takeOf(W, k, c.to), x = A.base || A.id, y = B.base || B.id;
  if (c.kid === "autonomy") { const n = (r: string[]) => r.filter((v) => v === "do").length; return `It does ${n(AUT[x])} → ${n(AUT[y])} of its 4 jobs without asking you.`; }
  if (c.kid === "attention") { const t = (v: string) => (ATT[v] || ATT.asksbreaks).reduce((a, b) => a + b, 0); return `On a day like yesterday, the island opens on its own ${t(x)} → ${t(y)} times.`; }
  if (c.kid === "spend") { const L = (v: string) => (LIM[v] ? `$${LIM[v]} a month` : "no monthly number"); return `It asks you once it passes ${L(x)} → ${L(y)}.`; }
  return `${A.sets || ""} → ${B.sets || ""}`;
}
/** a change's name in the history: the AI and the knob, or the knob */
export const changeName = (W: World, c: Change) => (c.ai ? `${aiOf(W, c.ai).n} · ${K[c.kid].n.replace(/^How far an AI goes/, "How far it goes")}` : K[c.kid].n);

/** what a kept way would change from now */
export function wayDiff(W: World, w: Way): { key: string; name: string; from: string; to: string }[] {
  return Object.keys(w.takes).filter((key) => W.prefs.kept[key] !== w.takes[key]).map((key) => {
    const [kid, ai] = key.split(":"), k = K[kid];
    return { key, name: ai ? aiOf(W, ai).n : k.n, from: takeOf(W, k, W.prefs.kept[key]).n, to: takeOf(W, k, w.takes[key]).n };
  });
}
export const wayOn = (W: World) => W.ways.find((w) => Object.keys(w.takes).every((k) => W.prefs.kept[k] === w.takes[k]));
export const TUNE = [{ id: "ask", n: "Ask me first" }, { id: "small", n: "Small things, tell me" }, { id: "off", n: "Only what I ask" }];
export function tuneKey(W: World, i: number): string | undefined { const a = W.hist[i - 1].snap.kept, b = W.hist[i].snap.kept; return Object.keys(b).find((x) => a[x] !== b[x]); }

/** the label a kept change carries (ui.html keepTry) */
export function keepLabel(W: World, kid: string, ai: string | null, t: string): string {
  const k = K[kid], a = ai ? aiOf(W, ai) : null;
  return (a ? a.n + ": " : k.n + ": ") + takeOf(W, k, t).n;
}

/** the new panel's state, as it opens (ui.html UI) */
export function freshUi(W: World): Ui {
  const first = W.ais[0]?.id ?? "";
  return { open: null, ai: { autonomy: W.ais.find((a) => a.id === "inbox")?.id ?? first, spend: W.ais.find((a) => a.id === "course")?.id ?? first }, trying: null, q: "", sel: 0, filter: null, pointing: false, page: "main",
    reply: null, hx: null, hsee: null, own: null, edit: null, persona: false, why: false, saveWay: false, conn: null, tool: null, hov: null, reach: "~" };
}
/** the defaults: every knob at its default for every AI (ui.html DEF) */
export function defaults(ais: AiW[], learned: Known[] = []): Prefs {
  const p: Prefs = { kept: {}, data: { writing: "here", mail: "model", cal: "model", bills: "here", voice: "here" }, conns: { gmail: true, cal: true, portal: true, bank: true }, tools: { dictation: "built", notes: "built" },
    learned, learn: true, persona: "default", personaText: "", whyAsked: false, offers: true, offerGone: false, tune: "small", keepMine: {} };
  Object.values(K).forEach((k) => { if (k.per) ais.forEach((a) => { p.kept[kk(k, a.id)] = k.def; }); else p.kept[k.id] = k.def; });
  return p;
}
/** the window's look and size while a take is tried or kept (ui.html applyFx): the attributes the visual pass reads */
export function fx(W: World, U: Ui, snap?: Prefs): { look: string; z: number; size: string } {
  const size = snap ? snap.kept.size : eff(W, U, "size"), look = snap ? snap.kept.look : eff(W, U, "look");
  const sz = takeOf(W, K.size, size), lk = takeOf(W, K.look, look);
  return { look: lk.look || "paper", z: sz.z || 1, size: sz.base || sz.id };
}

// ---------------------------------------------------------------- kept for a place (next.fits, S15; BR1 #1615)
// Live, each knob not per AI is a fit the engine keeps: a take in a scope, read nearest first (this session, then its
// folder and the folders above it, then All of Sol), with who set it, why, and whether the person held it by taking it
// back. The take that stands here is what the panel shows as in use. How far an AI goes stays agents.mode.

/** a knob kept as a fit: not per AI, and live */
export const fitKnob = (k: Knob | undefined): k is Knob => !!k && !k.per && !NOT_LIVE.has(k.id);
/** a folder's scope from its region: a work folder by its path, a Home place by its id (no empty segment) */
export function scopeOfRegion(id: string): string | null {
  const p = id.startsWith("w:") ? id.slice(2) : id.startsWith("h:") ? "home/" + id.slice(2) : "";
  const s = p.split("/").filter((x) => x && x !== "." && x !== "..").join("/");
  return s || null;
}
/** a scope and the scopes above it, nearest first, ending at All of Sol: as the engine's (fits.ts upward, P's 399004f8a5),
 *  a folder the person nested in another (`inOf`) goes up to that one, else to its path's parent; null: nothing above */
export function upward(scope: string, inOf?: (s: string) => string | null | undefined): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (let s: string | null = scope, n = 0; s && s !== "~" && !seen.has(s) && n < 64; n++) {
    out.push(s); seen.add(s);
    const said: string | null | undefined = inOf?.(s);
    s = said === null ? null : said ? said : s.includes("/") ? s.slice(0, s.lastIndexOf("/")) : null;
  }
  return [...out, "~"];
}
/** the person's nesting by scope (Region.parent, parentBy "person": pos.json's `in`, M.nest), for upward's `inOf`;
 *  a folder they took out of every other is null; nesting by a rule or by Sol is the path's or not the person's */
export function nestingOf(regions: readonly { id: string; parent?: string; parentBy?: string }[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const r of regions) {
    const s = scopeOfRegion(r.id);
    if (s && r.parentBy === "person") m.set(s, r.parent ? scopeOfRegion(r.parent) : null);
  }
  return m;
}
/** where a take is looked for here: the session, the folder and those above it, All of Sol */
export function chainHere(W: World): string[] {
  const h = W.here, f = h?.folder ? h.folder.up ?? upward(h.folder.scope) : ["~"];
  return h?.session ? [h.session.scope, ...f] : f;
}
/** the scope a press keeps for, by the reach chosen; a reach with nothing here is All of Sol */
export function reachScope(W: World, r: Reach): string {
  return r === "session" && W.here?.session ? W.here.session.scope : r === "folder" && W.here?.folder ? W.here.folder.scope : "~";
}
/** a scope in words */
export function scopeName(W: World, scope: string): string {
  if (scope === "~") return "All of Sol";
  if (W.here?.session?.scope === scope) return `This session, ${W.here.session.name}`;
  if (W.here?.folder?.scope === scope) return W.here.folder.name;
  if (scope.startsWith("session:")) return "Another session";
  return scope.split("/").pop() || scope;
}
export const fitOf = (W: World, knob: string, scope: string) => W.fits?.find((f) => f.knob === knob && f.scope === scope) ?? null;
/** the fit that decides a knob here: the nearest with a take standing, or held with none (what was taken back is not
 *  handed back from above); null: the default */
export function standing(W: World, knob: string): Fit | null {
  for (const s of chainHere(W)) { const f = fitOf(W, knob, s); if (f && (f.take !== null || f.held)) return f; }
  return null;
}
/** the takes in use here, folded from the fits (the panel's kept) */
export function applyFits(W: World): void {
  for (const k of Object.values(K)) if (fitKnob(k)) { const f = standing(W, k.id); W.prefs.kept[k.id] = f?.take ?? k.def; }
}
/** one line of who set a fit and why */
export function fitWho(f: Fit): string {
  if (f.take === null) return f.held ? "You took it back" : "Not set here";
  if (f.author === "sol") return `Sol fit it${f.reason ? `: ${f.reason}` : ""}`;
  return `Set by you${f.reason ? `: ${f.reason}` : ""}`;
}
export const when = (at: number) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
