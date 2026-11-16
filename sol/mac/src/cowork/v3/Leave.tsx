// Cowork v3 (fr-30): the one card of what someone leaving would leave behind, slice 7's (engine team/v3/floor.ts
// leaves): what stops, one line each, one press a line (pressLeave writes one event), the rest keeps working. The floor
// draws it under its people; People draws it from a face (slice 3), with no presses for a guest.
import { Body } from "../bits";
import { Glyph } from "../Room";
import { Marks } from "./SevenMarks";
import { placeGlyph, who, type Floor as FloorT, type LeaveLine } from "./seven";
import "./seven.css";

export function Leave({ card, me, onPress }: { card: NonNullable<FloorT["leave"]>; me: string; onPress?: (l: LeaveLine) => void }) {
  const nm = who(card.who, me);
  return (
    <div className="s7-leave">
      <div className="h"><Body login={card.who} size={28} /><div><b>If {nm} {nm === "you" ? "leave" : "leaves"}</b><span className="s7-quiet">What stops, one line each. The rest of the project keeps working.</span></div></div>
      {card.lines.map((l) => (
        <div key={`${l.kind}:${l.id}`} className="r">
          <span className="m">{l.kind === "agent" ? <Body login={card.who} size={18} agent /> : l.kind === "place" ? <Glyph kind={placeGlyph(l.place)} size={18} /> : l.kind === "automation" ? <Glyph kind="automation" size={18} /> : <Marks whose={card.who} place={l.place} me={me} size={16} />}</span>
          <span className="t"><span>{l.title}</span><span className="s7-quiet">{l.line}</span></span>
          {l.press && onPress && <button className="v3s-press" onClick={() => onPress(l)}>{l.press}</button>}
          {l.alt && onPress && <button className="v3s-press" onClick={() => onPress({ ...l, act: l.alt!.act })}>{l.alt.press}</button>}
        </div>
      ))}
      {card.calm && <div className="r calm"><span className="t">{card.calm}</span></div>}
    </div>
  );
}

