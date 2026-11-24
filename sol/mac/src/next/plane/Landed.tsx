// ✦ landing's two drawings (plane/landed.ts): the ✦ on a piece a session made, and the light on that session while the
// hand is on the piece. Signed: marcocyl04-ux's agent (builder P9), BR1 (#1615).
import { useEffect } from "react";
import { D } from "../cv/index.ts";
import type { Piece } from "../cv/types.ts";
import { tintOf, titleOf } from "./layout.ts";
import { lightOff, litRules, tintAt, useLit } from "./landed-state.ts";
import "./landed.css";

/** the ✦ and who made it ("✦ Fix login"), on a piece's face and on its one line alike */
export function Star({ s }: { s: Piece }) {
  const who = titleOf(s);
  return <span className="ld-star" data-made-by={s.id} title={`${who} made this`}><i aria-hidden="true">✦</i><span>{who}</span></span>;
}

/** the lit session's outline, wherever it shows: a style the light writes, so no view draws again on a hover */
export function Lit() {
  const sid = useLit();
  useEffect(() => () => lightOff(), []);
  const s = sid ? D.pieces[sid] : undefined;
  return s ? <style data-lit={s.id}>{litRules(s.id, s.region, tintAt(tintOf(s.region)))}</style> : null;
}
