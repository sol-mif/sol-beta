// Customize by voice (BR1 people, #1615; customize.html "Say it still works: make sol green, bigger text"), tried
// before every other phrase (say/index.ts): with Customize on, any words are a change for the thing whose bar is open
// (or the thing they name); with it off, only words that ask for a change ("make…", "turn…", "paint…", "change…",
// "colour…") and only when they turn into one, which turns Customize on with the change already tried (cuSay).
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import { M, type Done, type Phrase } from "../core.ts";
import { FMs } from "../moves/fitmode.ts";

const asks = /^(make|turn|paint|change|colou?r)\b/;
const phrases: Phrase[] = [
  { hears: /.+/, run: (_m, t): Done | null => {
    const on = FMs().cu;
    if (!on && !asks.test(t)) return null;
    const r = M.cuSay(t) as Done;
    return r.ok ? r : null;
  } },
];
export default phrases;
