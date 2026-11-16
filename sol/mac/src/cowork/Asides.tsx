// Set aside (#425): Settings' engine drawer lists what this Sol set aside when its own changes would not go onto a
// release (`<login>/aside-YYYYMMDD`), each with how many of its changes this Sol does not have, and "bring back", which
// carries them onto the Sol as it is now by the same steps as an update (the line over the composer says how it goes).
// Nothing shows while there is none. Words people read: change, set aside, bring back; never commit or branch.
import { useEffect, useState } from "react";
import { asides, bringBack, type Aside } from "./stable";

const dayOf = (name: string) => {
  const m = /aside-(\d{4})(\d{2})(\d{2})(?:-(\d+))?$/.exec(name);
  return m ? `${new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${m[4] ? ` (${m[4]})` : ""}` : name;
};

export function AsidesRows({ up }: { up: boolean }) {
  const [list, setList] = useState<Aside[] | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => { if (up) void asides().then(setList); }, [up, asked]);
  if (!list?.length) return null;
  return (
    <>
      <dt>set aside</dt>
      <dd className="asides">
        {list.map((a) => (
          <div key={a.name} className="aside-row" title={`${a.name}${a.pushed ? ", kept on GitHub too" : ", kept on this Mac only"}`}>
            <span>{dayOf(a.name)}: {a.left ? `${a.left} change${a.left === 1 ? "" : "s"} not in your Sol` : "all of it is in your Sol"}</span>
            {a.left > 0 && <button className="link" disabled={asked === a.name} onClick={() => { setAsked(a.name); void bringBack(a.name).finally(() => setAsked(null)); }}>{asked === a.name ? "bringing back…" : "bring back"}</button>}
          </div>
        ))}
      </dd>
    </>
  );
}
