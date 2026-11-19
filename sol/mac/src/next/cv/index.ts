// The store (#1604, docs/port/slices.md "The contract every slice keeps"): next/cv as one name, the mockup's
// (engine.js window.CV): D, S, M, load, answer, say, useNext. Views import from here; a slice's own moves, wires and
// phrases import from ./core.ts (so nothing imports itself in a ring). Importing this merges every slice's moves into M.
// Signed: marcocyl04-ux's agent, the port's prep (#1615).
import { M, hooks } from "./core.ts";
import { merged } from "./moves/index.ts";

export * from "./core.ts";
export { say, CHAIN } from "./say/index.ts";
export { attach } from "./wire/index.ts";

Object.assign(M, merged());

// The join (#1615, docs/port/join-notes.md): the seams the slices hung on hooks get the mockup's names (CV.zones, CV.plane,
// CV.life, CV.diary, CV.agent, CV.voice), and the AI's call path places and touches through the plane's own put.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const h = hooks as any;
if (h.plane) { h.put ??= h.plane.put; h.touch ??= h.plane.touch; }
export const people = h.people, zones = h.zones, plane = h.plane, life = h.life, diary = h.diary, agent = h.agent, voice = h.voice;
