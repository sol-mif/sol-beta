// The one card about counting (#356, Frank 2026-10-29): on the first window after the first run, once, over either mode.
// Four lines and one button. It says what Sol counts, what it never records, that it reads Claude Code's and Codex's
// files on this Mac for numbers, that the counts carry the person's name, and where to say no (the beta Discord). The
// press writes settings.track.told; nothing else on the wire. There is no switch in Settings: a tester who wants it off
// or gone says so in Discord and the team does it by hand (engine/src/track.ts, docs/analytics/tracking.md).
// On a Sol that counts its errors (a Sol tester's or developer's, #485), one line more says what each error sends, and
// a tester who pressed OK before that line was there sees the card once more (settings.track.toldErrors).
import "./counts.css";

export const ERRORS_LINE = "When something breaks, Sol sends the team a count: which part of Sol's engine it was in, what type of error, and which Sol version. Never what failed or what you wrote.";

export function CountsCard({ onOk, errors = false }: { onOk: () => void; errors?: boolean }) {
  return (
    <div className="counts" role="dialog" aria-label="Sol counts how it is used">
      <p className="counts-h">Sol counts how it is used</p>
      <p className="counts-p">Which buttons you press, how long a turn takes, which mode and which AI answered, what broke. Never what you type, say, read or open.</p>
      {errors && <p className="counts-p">{ERRORS_LINE}</p>}
      <p className="counts-p">It also reads Claude Code's and Codex's files on this Mac to count tokens and your plan, and sends numbers, not content.</p>
      <p className="counts-p">The counts carry your name and go to the team once a day. To turn it off or delete it, say so in the beta testers' Discord.</p>
      <button className="counts-ok" onClick={onOk} autoFocus>OK</button>
    </div>
  );
}
