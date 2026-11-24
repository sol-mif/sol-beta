// Mark up on the dev page (BR1, #1615): &markup=on turns it on, as the attach menu's entry will; &markup=<id>:<words>,…
// also marks those things (a folder's or a piece's id), each as soon as it is drawn, for a still that only loads.
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { elOf, markUp, mu, press, selOf, thingAt, words } from "./model.ts";

export function devMarkUp(arg: string | null): void {
  if (!arg) return;
  markUp(true);
  if (arg === "on") return;
  const left = arg.split(",").map((s) => { const [id, ...w] = s.split(":"); return { id, w: w.join(":") }; });
  const tryMark = (n = 0) => {
    for (const m of [...left]) {
      const t = thingAt(elOf(selOf({ thing: m.id, kind: "piece" })) ?? elOf(selOf({ thing: m.id, kind: "folder" })));
      if (!t) continue;
      left.splice(left.indexOf(m), 1);
      const j = press(t);
      if (j >= 0 && m.w) words(j, m.w);
    }
    if (left.length && mu.on && n < 60) setTimeout(() => tryMark(n + 1), 50);
  };
  setTimeout(() => tryMark(), 100);
}

/** &attach=on | open | shot: the attach menu drawn at the start of the talk pill, as the chat bar's <Attach /> will be;
 *  open shows its menu, shot takes the fixture's screenshot (a still that only loads) */
export function devAttach(arg: string | null, n = 0): void {
  if (!arg) return;
  const talk = typeof document !== "undefined" ? document.getElementById("talk") : null;
  if (!talk) { if (n < 100) setTimeout(() => devAttach(arg, n + 1), 50); return; }
  const host = document.createElement("span");
  host.style.display = "contents";
  talk.insertBefore(host, talk.firstChild);
  void Promise.all([import("react"), import("react-dom/client"), import("./Attach.tsx"), import("./attach-state.ts")]).then(([R, D, A, at]) => {
    D.createRoot(host).render(R.createElement(A.default, { open: arg === "open" }));
    if (arg === "shot") void at.shoot();
  });
}
