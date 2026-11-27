// The first-launch start-up (BR1, #1615; mine/look/br1/startup.html, Marco 2026-11-22 13:20 through BR1 rapid): once,
// before the move-in, for every person. It is up when the engine's first word says nothing was ever kept (no
// next/movein.json: next.state's `movein` or the read's `kept` is null) and this Mac has not seen it (SEEN in
// localStorage); after that Sol just opens. It opens on one question, "What do you do, day to day?" (Day.tsx;
// mine/look/br1/migration.html A, Marco 13:45): the person's own words only, asked before any read is shown, so it
// carries no suggestion; Continue keeps them in their You (next.you.day), Skip keeps nothing; then the beats. While it is up the move-in's own opening waits (live.ts heard) and the welcome
// card does not show (welcomeWhen.ts). "Let’s move in" marks it seen and goes straight into the read, today's move-in:
// its page when the read found a folder, else the welcome card; while the read has not answered, the start-up says it is
// having a look around and goes when it answers. The view is Startup.tsx in a root of its own (#sup), over the window.
// The dev page: ?startup=1 brings it up on a scenario, &su=<seconds> starts it at that moment (stills).
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { M, MODE, SCN, hooks, render } from "../cv/core.ts";
import { layerRoot } from "../layers.ts";
import { DATA } from "./data.ts";
import { LIVE, live } from "./state.ts";
import { askRead, link } from "./live.ts";

/** this Mac has seen the start-up (set by "Let’s move in") */
export const SEEN = "sol.next.startup.seen";
/** `up` the start-up is over the window; `day` its first screen, "What do you do, day to day?" (migration.html A), is
 *  up and the beats wait for it; `words` what the person wrote there; `pressed` "Let’s move in" was pressed and the read
 *  has not answered yet; `decided` the engine's first word came (judged once per window); `from` where its beats start (s) */
export const sup = { up: false, day: false, words: "", told: false, pressed: false, decided: false, from: 0, owed: 0 };   // owed: the read answers "Let’s move in" still waits for (read 2, and read 1 before it); told: the words reached the engine

const seen = (): boolean => { try { return globalThis.localStorage?.getItem(SEEN) === "1"; } catch { return false; } };
const markSeen = (): void => { try { globalThis.localStorage?.setItem(SEEN, "1"); } catch { /* a private window: it may play again */ } };

/** the engine's first word on the move-in: `kept` is next/movein.json as the engine read it (null: none yet). Up when
 *  nothing was ever kept and this Mac has not seen it; judged once */
export function firstWord(kept: unknown): void {
  if (sup.decided) return;
  sup.decided = true;
  if (kept == null && !seen()) up();
}

/** up from the day-to-day question (`day`), or straight into the beats at `from` seconds (the dev page's stills) */
export function up(from = 0, day = true): void {
  sup.up = true; sup.day = day; sup.pressed = false; sup.from = from; sup.owed = 0; sup.told = false;
  show(true);
  render();
}

/** Continue (or Skip, with no words): what the person wrote is kept as they wrote it, in their You (next.you.day), and
 *  the beats start. Read 1, asked at attach, never waits for it; with words, read 2 is the same read asked again behind
 *  the beats (migration.html B): the engine looks again knowing them (carry-said.ts), and "Let’s move in" waits for its
 *  answer, read 1's first when it is still on its way (the engine answers in order). Skip keeps nothing and asks nothing */
export function dayDone(words: string): void {
  if (!sup.up || !sup.day) return;
  sup.words = words.trim();
  if (sup.words && MODE === "live" && link.e) {
    sup.told = link.e.send({ type: "next.you.day", words: sup.words }) !== false;
    sup.owed = live.answered ? 1 : 2;
    askRead();   // lost with a link going down, it is asked again when the link is back (live.ts relinked)
  }
  sup.day = false;
  render();
}

/** the read the move-in shows has rows to keep */
const found = (): boolean => (MODE === "live" ? !!live.data[LIVE]?.rows.some((r) => r.k === "place") : !!DATA[SCN]?.rows.some((r) => r.k === "place"));
const answered = (): boolean => MODE !== "live" || (live.answered && sup.owed === 0);

/** how long "Having a look around…" waits for the read before Sol opens without it: a read the engine never answers
 *  (it failed on this Mac) never holds the window; the move-in is then one press away (Settings › Bring in what you have) */
export const LOOK_MS = 30_000;
let looking: ReturnType<typeof setTimeout> | null = null;

/** "Let’s move in": seen from now on; the move-in at once when the read has answered, else when it does, or after
 *  LOOK_MS without it */
export function letsMoveIn(): void {
  if (!sup.up) return;
  markSeen();
  if (answered()) return go();
  sup.pressed = true;
  if (looking) clearTimeout(looking);
  looking = setTimeout(() => { looking = null; if (sup.up && sup.pressed) go(); }, LOOK_MS);
  render();
}

/** the read answered (live.ts heard): one fewer owed; a press waiting for the last goes on */
export function readHeard(): void {
  if (sup.owed > 0) sup.owed--;
  if (sup.up && sup.pressed && sup.owed === 0) go();
}

function go(): void {
  if (looking) { clearTimeout(looking); looking = null; }
  sup.up = false; sup.pressed = false;
  show(false);
  if (found()) M.move_in(MODE === "live" ? LIVE : SCN);
  render();
}

// ---------------------------------------------------------------- its own root, over the window (as the move-in's #mvi)

let root: Root | null = null, loading: Promise<void> | null = null;
function show(on: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("starting", on);
  let d = document.getElementById("sup");
  if (!d) {
    if (!on) return;
    d = document.createElement("div");
    d.id = "sup"; d.className = "sup"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Welcome to Sol"); d.dataset.face = "next";
    layerRoot(d);
    document.body.appendChild(d);
  }
  d.hidden = !on;
  if (on && !root && !loading) {
    const el = d;
    loading = import("./Startup.tsx").then((v) => { root = createRoot(el); root.render(createElement(v.default)); });
  }
}

// the dev page: ?startup=1 (and &su=<seconds>) on the first load
let booted = false;
hooks.onLoad.push(() => {
  if (booted || typeof location === "undefined") return;
  booted = true;
  const U = new URLSearchParams(location.search);
  if (MODE !== "fixture" || !U.get("startup")) return;
  sup.decided = true;
  // &su=<s> is a moment of the beats, so the day-to-day question is passed; without it the start-up opens on the question
  up(Math.max(0, Number(U.get("su")) || 0), !U.has("su"));
});
