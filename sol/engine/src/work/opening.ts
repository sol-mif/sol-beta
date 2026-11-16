// What a Work session's system prompt says about the person's own part of the work, set by the team's wire (#480,
// team/area.ts: a Sol developer's "your area" line). A small module of its own, so runs.ts reads it without importing
// the team's settings and the team's wire never imports runs.ts. None set: nothing is said.
let said: (cwd: string) => string = () => "";
export const setOpening = (fn: (cwd: string) => string) => { said = fn; };
/** the words for a session in `cwd`, "" when none; never throws */
export const opening = (cwd: string): string => { try { return said(cwd); } catch { return ""; } };
