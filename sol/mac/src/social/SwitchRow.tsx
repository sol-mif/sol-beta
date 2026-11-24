// Social's switch in Settings (fr-31): one row under "me", off by default, beside new Cowork's. Turning it on puts Social
// on the spine's fourth view; "use everything" sits in Social's own settings. SOL_SOCIAL on the engine wins: then the
// row says so and does not move. The row's words are a person's: what they will see, nothing of how it is built.
import { Switch, useShell } from "../settingsShell";

export function SocialRow({ s, off, onSet }: { s: unknown; off: boolean; onSet: (patch: object) => void }) {
  const sh = useShell();
  if (!sh || sh.sel !== "me") return null;
  const v = s as { social?: { on?: boolean }; socialEnv?: string } | null;
  const on = v?.social?.on === true, env = v?.socialEnv;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>Social</span>
          <small>{env ? "set on this computer, so it can't be changed here" : "Your jelly as your profile, friends and what each may see, and the market. It is the fourth view in the column on the left, which shows while Social is on. Nothing is shared until you say yes, per friend."}</small></div>
        <Switch on={on} set={(x) => onSet({ social: { on: x } })} disabled={off || !!env} label="Social" />
      </div>
    </div>
  );
}
