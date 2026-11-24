// Automations on the dev page (BR1 item 2, #1615): three invented ones in the morning's folders, put as pieces the way
// the wire puts the engine's, and the piece's presses played on them, since no engine is there. Only when asked
// (next.html &autos, or &slot=automation): the morning's counts (sol/test/e2e/next) stay as they are.
// Signed: marcocyl04-ux's agent (builder F), BR1 item 2 (#1615).
import { D, MODE, hooks, render, type Piece } from "../cv/index.ts";
import { empty, type Auto, type Last, type Work } from "../work/read.ts";
import { sync } from "./model.ts";

// times back from now, so a run is never later than the dev page's clock
const min = 60000, ago = (m: number) => Date.now() - m * min;
const run = (t: number, state: Last["state"], how: Last["how"], files: string[] = []): Last => ({ at: t, sessionId: `run-${t.toString(36)}`, state, how, files });

function sample(): Auto[] {
  const now = Date.now(), filed = run(ago(2), "working", "event", ["inbox/lease-renewal.pdf"]), tested = run(ago(14), "done", "clock");
  return [
    { id: "auto-tests", name: "Watch the test runs", does: "Look at the latest test run in this folder. If anything failed, say which test and the line it failed on.",
      when: "every 30 min 09:00–17:00", on: true, made: now - 3 * 86400000, model: null, runs: 14, next: "today at 17:00", region: "api", cwd: null,
      last: tested, ran: [tested, run(ago(44), "done", "clock"), run(ago(74), "failed", "clock"), run(ago(290), "done", "now")] },
    { id: "auto-inbox", name: "Sort what comes into inbox/", does: "Read each new file in inbox/, say in one line what it is, and move it to the folder it belongs in.",
      when: "when a new file comes into inbox/", on: true, made: now - 86400000, model: null, runs: 3, next: "when a new file comes in to inbox/", region: "home", cwd: null,
      last: filed, ran: [filed, run(ago(200), "done", "event", ["inbox/water-bill.pdf"]), run(ago(1500), "done", "event", ["inbox/school-trip.pdf", "inbox/form.pdf"])] },
    { id: "auto-week", name: "Sum up the week's spending", does: "Add up what was spent this week from the statements here and say how it compares with last week.",
      when: "on Fri at 17:00", on: false, made: now - 2 * 3600000, model: null, runs: 0, next: "paused", region: "money", cwd: null, last: null, ran: [] },
  ];
}

/** the dev page asks for them: seeded on every load, before the plane's layout */
export function withAutos(): void {
  hooks.onLoad.push((d) => {
    const w = ((d as Record<string, unknown>).work = { ...empty(), autos: sample() }) as Work;
    sync(d, w.autos);
  });
}

/** Add's making, played on the dev page (BR1 item 3): made paused, named from its first words as the engine names it */
export function add(o: { does: string; when: string; cwd?: string; region?: string; in?: string }): boolean {
  if (!o.does || !o.when) return false;
  const d = D as Record<string, unknown>, w = (d.work ??= empty()) as Work;
  w.autos = [...w.autos, { id: `auto-${Date.now().toString(36)}`, name: o.does.split(/[.\n]/)[0].slice(0, 60).trim(), does: o.does, when: o.when, on: false,
    made: Date.now(), model: null, runs: 0, next: "paused", region: o.region ?? null, cwd: o.cwd ?? null, last: null, ran: [], ...(o.in ? { in: o.in } : {}) }];
  if (sync(D, w.autos)) hooks.layout?.();
  render();
  return true;
}

/** Add's Automation, played on the dev page (birth.html row 5): the session it opened answers the first words by making the
 *  automation, paused, on its own table, and says so. The time is the words' own ("every Monday"), else it asks for one */
const DAY = "(?:mon|tues|wednes|thurs|fri|satur|sun)day";
/** a time or an event in the words: "each Monday", "every 30 min", "on Fri at 17:00", "when a new file comes in"; never "every menu's" */
export const WHEN = new RegExp(`\\b(?:every|each)\\s+(?:\\d+\\s*\\w+|other\\s+\\w+|${DAY}|day|weekday|week|month|morning|evening|night|hour)\\b[^,.;]*|\\bon\\s+${DAY}\\b[^,.;]*|\\bwhen(?:ever)?\\b[^,.;]*`, "i");
hooks.born = (p: Piece) => {
  if (MODE !== "fixture" || p.purpose !== "automation") return;
  const words = String(p.words || "").trim(), when = WHEN.exec(words)?.[0].trim();
  const said = (t: string) => { p.talk = [...(p.talk ?? []), `${p.ai}: ${t}`]; render(); };
  if (!when) { said("When should it run: at a time (every Monday at 09:00), or when something happens (when a new file comes into this folder)?"); return; }
  const does = words.replace(when, "").replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "") || words;
  add({ does: does[0].toUpperCase() + does.slice(1), when, region: String(p.region || "") || undefined, in: p.id });
  said(`Made it, paused: it runs ${when}. It sits on this session's table; nothing runs until you press Turn on.`);
};

/** the piece's presses, played on the dev page: on and off, and a run now that works a few seconds, then is done */
export function play(o: { type: string; id?: string; on?: boolean }): boolean {
  const a = ((D as Record<string, unknown>).work as Work | undefined)?.autos.find((x) => x.id === o.id);
  if (!a) return false;
  if (o.type === "next.autos.set" && typeof o.on === "boolean") { a.on = o.on; a.next = o.on ? (a.when.startsWith("when") ? a.when : "on its next day") : "paused"; }
  else if (o.type === "next.autos.run") {
    const r = run(Date.now(), "working", "now");
    a.last = r; a.ran = [r, ...a.ran].slice(0, 5); a.runs++;
    setTimeout(() => { r.state = "done"; a.last = { ...r }; a.ran = a.ran.map((x) => (x.sessionId === r.sessionId ? { ...r } : x)); render(); }, 4000);
  } else return false;
  render();
  return true;
}
