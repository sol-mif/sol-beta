// The window tells the engine its build.snap (#1701, gate one question 6 for product/build/snap): the switch is this
// window's (fit.ts), but the morning clock runs in the engine (engine work/snap.ts), so every turn of the switch, and
// every time the link comes up, says it: `work.snap.switch { on }`. Off, the clock stops at once. Once the window has
// said it, an opened bench no longer counts as on: the engine goes by this word.

export const snapSwitchMsg = (on: boolean) => ({ type: "work.snap.switch", on });

/** say the switch now and at each turn of it (get and sub: fit.ts buildSnap and subBuildSnap); the answer stops listening */
export function tellSnap(send: (m: object) => unknown, get: () => boolean, sub: (f: () => void) => () => void): () => void {
  let was = get();
  send(snapSwitchMsg(was));
  return sub(() => { const v = get(); if (v === was) return; was = v; send(snapSwitchMsg(v)); });
}
