// owned by slice 12 (Your own pieces), docs/port/slices.md
// The talk pill's words about changing Sol (merge/pieces.js wrapped CV.voice, so it heard them first): what the person
// says that matches their own ask ("a key that runs /ship in the repo I'm in") is proposed as a piece, a mockup on the
// canvas under the headline. Any other words go on down the chain untouched: the match is read before any move is
// called, so the one voice records no move for words it did not take. Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { M, MODE, type Phrase } from "../core.ts";
import { me } from "../../pieces/model.ts";

const phrases: Phrase[] = [
  { hears: /.+/, run: (_m, words) => { const p = MODE === "fixture" ? me() : null; return p && p.ask.re.test(words) ? M.propose_piece(words) : null; } },
];
export default phrases;
