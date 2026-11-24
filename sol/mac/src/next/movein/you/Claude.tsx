// "Let Claude read a short summary" (BR1, #1615; decided 2026-11-21 by the BR1 orchestrator: the Claude choice is in BR1,
// drawn as scene 7's switch): one control, on screen 2 and in the circle's panel. Pre-set from what the engine holds (by),
// the engine's own question (suggest.claudeAsk) said word for word under it; the read sends what it says.
// Signed: marcocyl04-ux's agent (builder F).
import type { Words } from "./strings.ts";
import * as Y from "./store.ts";

/** a Claude the person is signed in to (Claude Code, or a Claude account) */
export const hasClaude = (s: Y.St) => (s.accounts?.ais ?? []).some((a) => a.signedIn && (a.id === "claude-code" || a.id === "anthropic"));

export default function ClaudeSwitch({ T, cls = "" }: { T: Words; cls?: string }) {
  const s = Y.useYou((x) => x), can = hasClaude(s), on = can && Y.claudeOn(s), ask = s.suggest?.claudeAsk;
  return (
    <div className={`yc ${cls}`} data-claude={on ? "on" : "off"}>
      <button className={`yc-sw${on ? " on" : ""}`} role="switch" aria-checked={on} disabled={!can} onClick={() => Y.claude(!on)}>
        <span className="yc-tg" aria-hidden="true" /><span>{T.claudeT}</span>
      </button>
      {ask && can ? <p className="yc-ask">{ask}</p> : null}
      <p className="yc-cap">{!can ? `${T.claudeOff} ${T.claudeNo}` : on ? T.claudeOn : T.claudeOff}</p>
    </div>
  );
}
