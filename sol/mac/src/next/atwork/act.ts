// See what's at work's state and presses (BR1 item 7): the scope it is opened on, what the engine said of each run (its
// helpers, since when, held) and of Pause everything, and the one line that says what the last press did, with Back.
// Pause: a session finishes its step, then waits (next.atwork.pause); an automation skips its runs (next.autos.set off).
// Stop: a session or a run ends now and keeps what it made (work.stop). Live, every press goes to the engine
// (cv/wire/atwork.ts sets `eng`); on the dev page (no engine) it is played on the store. Signed: marcocyl04-ux's agent
// (builder F), BR1 item 7 (#1615).
import { D, S, render } from "../cv/core.ts";
import type { Engine } from "../cv/wire/types.ts";
import type { Auto } from "../work/read.ts";
import type { Held, Row, RunBits, View } from "./model.ts";

export const st = {
  scope: null as string | null,
  runs: {} as Record<string, RunBits>,
  held: null as Held | null,
  said: null as { words: string; back: (() => void) | null } | null,
  open: null as string | null,
};

let eng: Engine | null = null;
export const setEngine = (e: Engine | null) => { eng = e; };
const send = (o: object) => (eng ? (eng.send(o), true) : false);
const autos = (): Auto[] => ((D as { work?: { autos?: Auto[] } }).work?.autos ?? []);
const say = (words: string, back: (() => void) | null) => { st.said = { words, back }; render(); };

/** At work opened: a folder's own (from its page), or everything (the sidebar) */
export function openAt(scope: string | null): void {
  st.scope = scope; st.said = null; st.open = null;
  S.page = "atwork";
  render();
}

function hold(r: Row, on: boolean): void {
  if (r.kind === "auto" && r.autoId) {
    if (!send({ type: "next.autos.set", id: r.autoId, on: !on })) { const a = autos().find((x) => x.id === r.autoId); if (a) a.on = !on; }
  } else if (r.sessionId) {
    if (!send({ type: on ? "next.atwork.pause" : "next.atwork.go", sessionId: r.sessionId })) {
      const was = st.runs[r.sessionId] ?? { tasks: r.helpers, since: r.since ?? Date.now(), paused: false };
      st.runs = { ...st.runs, [r.sessionId]: { ...was, paused: on } };
    }
  }
}

/** ‖ on a row */
export function pause(r: Row): void {
  hold(r, true);
  say(r.kind === "auto" ? `“${r.name}” skips its runs until you resume.` : `“${r.name}” finishes this step, then waits.`, () => { hold(r, false); st.said = null; render(); });
}

/** Resume, on a held row */
export function goOn(r: Row): void { hold(r, false); st.said = null; render(); }

/** ■ on a row: it ends now and keeps what it made; Back starts it again from there */
export function stop(r: Row): void {
  const p = D.pieces[r.id];
  if (!r.sessionId) return;
  if (!send({ type: "work.stop", sessionId: r.sessionId })) {
    if (p) p.state = "idle";
    const a = autos().find((x) => x.id === r.autoId);
    if (a?.last) a.last = { ...a.last, state: "done" };
  }
  const back = () => {
    if (r.kind === "auto" && r.autoId) send({ type: "next.autos.run", id: r.autoId });
    else if (!send({ type: "work.say", sessionId: r.sessionId, text: "Go on from where you stopped." }) && p) p.state = "working";
    st.said = null; render();
  };
  say(`“${r.name}” stopped. What it made is kept.`, back);
}

/** Pause everything shown: the sessions working, the automations running and due */
export function holdAll(v: View): void {
  const sessions = v.now.filter((r) => r.kind === "session" && r.stand === "working").map((r) => r.sessionId!);
  const ids = [...v.now.filter((r) => r.autoId).map((r) => r.autoId!), ...v.next.map((x) => x.id)];
  if (!send({ type: "next.atwork.hold", ...(st.scope ? { folder: st.scope } : {}), sessions, autos: ids })) {
    for (const r of v.now) if (r.kind === "session" && r.stand === "working") hold(r, true);
    for (const a of autos()) if (ids.includes(a.id)) a.on = false;
    st.held = { at: Date.now(), folder: st.scope, sessions, autos: ids };
  }
  st.said = sessions.length || ids.length ? null : { words: "Nothing was running or due.", back: null };   // the held line says the rest
  render();
}

/** Resume everything: what Pause everything held */
export function goAll(): void {
  const h = st.held;
  if (!send({ type: "next.atwork.go" }) && h) {
    for (const id of h.sessions) if (st.runs[id]) st.runs = { ...st.runs, [id]: { ...st.runs[id], paused: false } };
    for (const a of autos()) if (h.autos.includes(a.id)) a.on = true;
    st.held = null;
  }
  st.said = null;
  render();
}

export const unfold = (id: string) => { st.open = st.open === id ? null : id; render(); };
