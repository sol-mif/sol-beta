// The lean list (#870 item 3): work.sessions is the whole side (every row, every run), and it went to every face on
// any change, changed or not. A face that asks `work.list { lean: true }` is not sent a list that says what the last
// one it was sent said. A face that never asks gets every list, as before. What is sent is always the whole list:
// lean cuts what is compared, never what is sent. Nothing here reads the disk or knows the wire: wire.ts calls it.

/** the word a face puts on work.list to ask for the lean list (our pick, #870: the face half follows) */
export const LEAN = "lean";
// A run's facts that move at every step of a turn. The face has them from work.run, which goes out with each of them
// (runs.ts tell), so a list that differs only here tells a face nothing. Every other fact of a run is compared: some
// are set after the run's last work.run (its mode when a plan is approved, the count of asks waiting) and reach the
// face by the list alone.
const MOVING = ["usage", "context", "cost"];
// A row's facts that no face draws: `seen` is written each time a session is opened or looked at (wire.ts work.open,
// work.view) and read by nothing, so opening a session that was read already would send the whole list for it.
const UNDRAWN = ["seen"];

/** what the engine keeps for one face: whether it asked for the lean list, and the last list it was sent, as compared */
export type Lean = { lean?: boolean; sent?: string };

const without = (o: unknown, keys: string[]) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) : o);

/** the list as a lean face compares it: two lists with the same key say the same to a face */
export function rowKey(msg: object): string {
  const m = msg as { type?: unknown; sessions?: unknown; runs?: unknown };
  if (m.type !== "work.sessions") return JSON.stringify(msg);
  return JSON.stringify({
    ...m,
    sessions: Array.isArray(m.sessions) ? m.sessions.map((s) => without(s, UNDRAWN)) : m.sessions,
    runs: Array.isArray(m.runs) ? m.runs.map((r) => without(r, MOVING)) : m.runs,
  });
}

/** a face asked for the list (work.list) and is answered with `answer`: it is lean from `lean: true` until it says
 *  `lean: false` (an ask without the word changes nothing), and what it is answered with is what it holds now */
export function listAsked(face: Lean, ask: object, answer: object) {
  const said = (ask as Record<string, unknown>)[LEAN];
  if (said === true) face.lean = true;
  else if (said === false) face.lean = false;
  face.sent = face.lean ? rowKey(answer) : undefined;
}

/** the list to every face; to a lean one only when it is not what it was sent last */
export function tellList(faces: Iterable<[{ send: (m: object) => void }, Lean]>, msg: object) {
  let key: string | undefined;
  for (const [w, f] of faces) {
    if (f.lean) {
      key ??= rowKey(msg);
      if (f.sent === key) continue;
      f.sent = key;
    }
    w.send(msg);
  }
}
