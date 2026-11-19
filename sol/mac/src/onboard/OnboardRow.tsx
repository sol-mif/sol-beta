// The one onboarding, one row in Settings under me (#1088): it is how a Home is made (#1223, no switch), so the row only
// shows it again, with a button where the other rows keep their switch. Its words are a person's: what they will see.
import { Button } from "../kit/Button";
import { useShell } from "../settingsShell";
import { againHref } from "./flag";

export function OnboardRow() {
  const sh = useShell();
  if (!sh || sh.sel !== "me") return null;
  return (
    <div className="v3-switch">
      <div className="field-r">
        <div className="lab"><span>your Home</span><small>Tell Sol about your life in a few sentences; it looks at this computer while you watch and makes your Home's folders again. What you answered before is kept.</small></div>
        <span data-onboard-again><Button h={32} onClick={() => location.assign(againHref)}>make my Home again</Button></span>
      </div>
    </div>
  );
}
