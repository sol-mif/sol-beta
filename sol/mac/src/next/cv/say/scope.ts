// owned by slice R9 (why your AI used that, links, the done fold, Far at 500), docs/port/slices.md
// Round 9's phrases for the talk pill, tried before the shared ones (say/index.ts): "why did <AI> use that" opens the
// brief of the result here (the first one of the piece at Near), "show its links" draws the focused thing's links, "what
// is done here" opens the folder's Done list. Signed: marcocyl04-ux's agent, port slice R9 (#1615).
import { D, M, S, type Phrase } from "../core.ts";
import { results } from "../../scope/rules.ts";

const here = () => S.part || S.piece;
const phrases: Phrase[] = [
  { hears: /^why did (?:you|it|[a-z][\w’' -]*) use (?:that|this|those)\??$/, run: () => { const p = here(), r = p ? results().find((x) => x.piece === p || x.part === p) : null; return r ? M.why(r.id) : null; } },
  { hears: /^(?:show )?(?:its |the )?links$/, run: () => { const p = here() || (S.dist === "middle" ? Object.values(D.pieces).find((x) => x.region === S.region)?.id : null); return p ? M.show_links(p) : null; } },
  { hears: /^what(?:'s| is) done here\??$/, run: () => (S.region ? M.open_done(S.region) : null) },
];
export default phrases;
