// owned by slice R8 (fits you can see and take back), docs/port/slices.md
// The fits' phrases for the talk pill, tried before the shared ones (say/index.ts): "who set what", "what have you
// learned", and the reach by its own words ("ask me first", "small things, tell me", "only what I ask").
// Signed: marcocyl04-ux's agent, port slice R8 (#1615).
import { M, done, type Phrase } from "../core.ts";
import { openPage, who } from "../../fits/state.ts";

const page = (p: "fits" | "learned") => (who() ? (openPage(p), done(true, p)) : null);
const phrases: Phrase[] = [
  { hears: /^who set (?:what|my settings)\??$/, run: () => page("fits") },
  { hears: /^what (?:have you|you've) learned(?: about me)?\??$/, run: () => page("learned") },
  { hears: /^(ask me first|small things,? tell me|only what i ask)$/, run: (m) => (who() ? M.set_reach(/^ask/.test(m[1]) ? "ask" : /^small/.test(m[1]) ? "small" : "off") : null) },
];
export default phrases;
