// owned by slice 6b (Seats and sign-ins), docs/port/slices.md
// The blocked AI on Needs you (round 6 · M2, #1615; merge/seats.js's CV.people.EXTRA provider): an AI that can't work
// until a sign-in is renewed is the first ask of Needs you, ringed, at the top; its button opens Seats at that row. A
// sign-in that blocks no AI adds nothing to Needs you (it is a Diary line ahead of time only). Registered once with the
// extra-askers seam (people/extra.ts). Signed: marcocyl04-ux's agent, slice 6b (#1615).
import { createElement, lazy, Suspense } from "react";
import { register, type ExtOpen } from "../../people/extra.ts";
import { blockedNow } from "../../cv/moves/seats.ts";
import type { Blocked } from "./model.ts";

// the row is drawn lazily, so the store (and the tests that read it in node) never loads a view
const SeatAsk = lazy(() => import("./Ask.tsx").then((m) => ({ default: m.SeatAsk })));
const B = (t: ExtOpen) => t as unknown as Blocked;

export const off = register({
  items: () => blockedNow(),
  /** the Diary's and Far's "The first …" when this ask stands first */
  first: (t) => `holds ${B(t).ai} up, in Seats`,
  line: (t, said) => ({ what: `You said “${said}”: ${B(t).words.replace(/\.$/, "")}.`, why: `${B(t).ai} asked` }),
  done: () => {},
  row: (t, focus) => createElement(Suspense, { fallback: null }, createElement(SeatAsk, { t: B(t), focus })),
});
