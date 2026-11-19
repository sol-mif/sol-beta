// As you left it, for another session of the same project (#1090, design JEV 3): when Jev is asked and what its answer
// does. The question itself is screensJevKept.ts (as designed). Pure but for the ask, which is handed in.
//   the same session      no Jev: the record's lines already put each block where it was left (null)
//   nothing kept by kind   no Jev (null)
//   act                    the kinds and the window each lived on (live windows only): new blocks of a kind open there
//   ghost                  the kept arrangement offered on the map, dashed (the face's arrange offer)
import type { Arrangement, Win } from "./screens.js";
import type { Pick } from "./screensJev.js";

export type KeptAnswer = { pick: "act"; kinds: Record<string, string> } | { pick: "ghost" };

export async function keptAnswer(k: Arrangement, session: string, live: Win[], ask: (body: unknown) => Promise<unknown>,
  body: (k: { kinds: Record<string, string>; talk: string; at: number }) => unknown, read: (answers: unknown) => Pick, name: (win: string) => string): Promise<KeptAnswer | null> {
  if (k.session && k.session === session) return null;
  const kinds = k.kinds ?? {};
  if (!Object.keys(kinds).length) return null;
  const named = Object.fromEntries(Object.entries(kinds).map(([kind, win]) => [kind, name(win)]));
  const pick = read(await ask(body({ kinds: named, talk: name(k.talk ?? ""), at: k.at })));
  if (pick === "none") return null;
  if (pick === "ghost") return { pick: "ghost" };
  const here = new Set(live.map((w) => w.win));
  const now = Object.fromEntries(Object.entries(kinds).filter(([, win]) => here.has(win)));
  return Object.keys(now).length ? { pick: "act", kinds: now } : { pick: "ghost" };
}

/** a window as the person calls it: the larger screen of the live ones is the monitor, the others the laptop */
export function winName(live: Win[], win: string): string {
  const area = (w?: Win) => (w?.screen ? w.screen.w * w.screen.h : 0);
  const me = live.find((w) => w.win === win);
  if (!me) return "window that is gone";
  return live.every((w) => w === me || area(me) > area(w)) && live.length > 1 ? "monitor" : "laptop";
}
