// The press (#1298): the one constant at the foot of any artifact that asks the person something. The agent makes the
// artifact the ask needs (a card, a table, a diff, stills); this row is the same on all of them: the question in a few
// words, who asks and since when (and the issue), and the choices as pills (#1319's ActionCard look: one pill a choice,
// nothing to type). Answered, it folds to one line, "yes · Marco · 15:52", in place. Pressed later, it says so and keeps
// its pills. Knows no feature's words: the caller says them all. Moves only through motion.ts.
import { Pill } from "./Pill";
import { dim, ink, mute } from "./paint";
import { TYPE } from "./tokens";
import { dur, ease } from "../motion";

export type PressAnswer = { choice: string; by: string; at: number };
const PAD = 12, GAP = 8, CHIP = 24;
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const line = { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

export function Press({ q, choices, said, answer, later, onPress }: {
  q: string; choices: readonly string[];
  /** who asks, since when, the issue: one line, already in words */ said: string;
  answer?: PressAnswer; later?: boolean;
  /** absent: drawn, not pressable (a picture, the Room's settled layer) */ onPress?: (choice: string) => void;
}) {
  if (answer) return (
    <div className="kit-press done" data-press="answered" style={{ flex: "none", padding: `${GAP}px ${PAD}px`, display: "flex", alignItems: "center", gap: GAP, fontFamily: TYPE.family, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px`, transition: `opacity ${dur("reveal")}ms ${ease("reveal")}` }}>
      <span style={{ ...line, flex: "none", color: ink, fontWeight: 600 }}>{answer.choice}</span>
      <span style={{ ...line, flex: 1, color: mute }} title={`${q} · ${said}`}>· {answer.by} · {hhmm(answer.at)} · {q}</span>
    </div>
  );
  return (
    <div className="kit-press" data-press={later ? "later" : "asks"} onPointerDown={(e) => e.stopPropagation()} style={{ flex: "none", padding: `${GAP}px ${PAD}px`, display: "flex", flexDirection: "column", gap: GAP / 2, fontFamily: TYPE.family }}>
      <span style={{ ...line, color: ink, fontSize: TYPE.body[0], lineHeight: `${TYPE.body[1]}px`, fontWeight: 600 }} title={q}>{q}</span>
      <div style={{ display: "flex", alignItems: "center", gap: GAP, minWidth: 0 }}>
        <span style={{ ...line, flex: 1, color: later ? dim : mute, fontSize: TYPE.label[0], lineHeight: `${TYPE.label[1]}px` }} title={said}>{later ? `later · ${said}` : said}</span>
        {choices.map((c) => (
          <span key={c} style={{ flex: "none", ...(onPress ? {} : { pointerEvents: "none" as const }) }} aria-label={c}>
            <Pill words={[c]} picked={-1} h={CHIP} onPick={() => onPress?.(c)} />
          </span>
        ))}
      </div>
    </div>
  );
}
