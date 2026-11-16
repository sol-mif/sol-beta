// Cowork v3, slice 7 (fr-30, #560): the two marks every thing wears, everywhere: whose face (the creature's body, an
// agent's in its ring) and where it lives (the place's glyph). One small component so the shelf, the stage, search
// and the floor say it the same way.
import { Body } from "../bits";
import { Glyph } from "../Room";
import { placeGlyph, placeWord, who } from "./seven";

export function Marks({ whose, place, me, agent, size = 18 }: { whose: string; place: string; me: string; agent?: boolean; size?: number }) {
  return (
    <span className="s7-marks" title={`${who(whose, me) === "you" ? "yours" : `${whose}'s`}${agent ? " agent's" : ""} · in ${placeWord(place)}`}>
      <Body login={whose} size={size} agent={agent} />
      <span className="s7-where"><Glyph kind={placeGlyph(place)} size={Math.round(size * 0.9)} /></span>
    </span>
  );
}
