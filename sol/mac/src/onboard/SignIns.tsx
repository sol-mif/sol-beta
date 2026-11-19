// The places under the box (#1423, Marco's pick A, 2026-11-17): what is reached ("reading"), what needs signing in
// again, the two at most suggested with their reason, the rest behind "+ n more". A press opens the place's card: what
// it would read, through what, and its one sign-in press: GitHub's code (team.github.connect), Claude's or Codex's own
// page (Sol.app's claude_login, codex_login), or the Claude account's connectors page, until Sol's own sign-ins for
// those places land (#1222). Never in the way of "look around": nothing here has to be pressed, but one (#1608): the
// first row is "Sol", the Google sign-in on Sol's cloud that says whose Home this is, and "go" waits for it (`want`
// counts the presses that met its door; each opens Sol's card). The states are places.ts's; what a press does is One.tsx's (`onSign`),
// which says back what happened (`said`).
import { useEffect, useState } from "react";
import { placesLine, type Place } from "./places";

export const CONNECTORS_PAGE = "https://claude.ai/settings/connectors";

export function SignIns({ places, busy, said, want, onSign }: { places: readonly Place[]; busy: string | null; said: Record<string, string>; want?: number; onSign: (p: Place) => void }) {
  const [open, setOpen] = useState<string | null>(null), [all, setAll] = useState(false);
  const sol = places.find((p) => p.way === "google"), others = places.filter((p) => p.way !== "google");
  useEffect(() => { if (want && sol) setOpen(sol.id); }, [want]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = others.filter((p) => all || p.st !== "off"), rest = others.length - shown.length;
  const on = shown.filter((p) => p.st === "on"), ask = shown.filter((p) => p.st !== "on");
  // a new Mac with nothing reached: the places are the way to start, so they are all out, none pushed
  const none = !others.some((p) => p.st !== "off");
  const sel = places.find((p) => p.id === open);
  const chip = (p: Place) => (
    <button key={p.id} type="button" className={`osi-chip ${p.st} ${p.shut ? "shut" : ""} ${busy === p.id ? "busy" : ""} ${open === p.id ? "sel" : ""}`} data-place={p.id} data-st={p.st} onClick={() => setOpen((o) => (o === p.id ? null : p.id))}>
      <i />{p.name}
    </button>
  );
  return (
    <div className="osi" data-signins>
      {/* one row per group, so a label never ends a line apart from its chips */}
      {sol && <div className="osi-row" data-sol-row><span className="osi-lbl">{sol.st === "on" ? "signed in" : "first"}</span>{chip(sol)}</div>}
      {on.length > 0 && <div className="osi-row"><span className="osi-lbl">reading</span>{on.map(chip)}</div>}
      {(ask.length > 0 || rest > 0 || none) && (
        <div className="osi-row">
          <span className="osi-lbl">{none ? "nothing signed in here yet · sign in to" : on.length ? "sign in?" : "places you can sign in to"}</span>
          {(none ? others : ask).map(chip)}
          {!none && rest > 0 && <button type="button" className="osi-chip more" data-more onClick={() => setAll(true)}>+ {rest} more</button>}
          {!none && all && <button type="button" className="osi-chip more" data-fewer onClick={() => { setAll(false); setOpen(null); }}>fewer</button>}
        </div>
      )}
      {!sel && <span className="osi-lbl" data-places-line>{placesLine(places)}</span>}
      {sel && <Card p={sel} busy={busy === sel.id} said={said[sel.id]} onSign={() => onSign(sel)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Card({ p, busy, said, onSign, onClose }: { p: Place; busy: boolean; said?: string; onSign: () => void; onClose: () => void }) {
  const account = p.way === "account", google = p.way === "google";
  const line = said ?? (google ? (p.st === "on" ? `Signed in with Google as ${p.via}. This Home is yours.` : "Sign in with Google first, so I know whose Home this is. Your browser opens Google; you come back here after.")
    : p.shut ? `You closed ${p.stop === "tools" ? "connections" : p.stop} above, so I leave ${p.name} alone.`
    : p.st === "on" ? `I read ${p.what} through ${p.via}. Only reading; nothing is sent or changed.`
    : p.st === "late" ? `${p.why}. Sign in there and I read ${p.what}.`
    : account ? `Sol's own ${p.name} sign-in is coming. Today: connect ${p.name} in your Claude account and I read ${p.what} through it.`
    : p.way === "app" ? `Sign in from ${p.name} itself; I read it the next time I look.`
    : `Sign in and I read ${p.what}. Only reading; your browser asks you first.`);
  const press = google ? (p.st === "on" ? null : "sign in with Google") : p.shut || p.st === "on" || p.way === "app" ? null : account ? "open Claude's connectors" : p.st === "late" ? "sign in again" : "sign in";
  return (
    <div className="osi-card" data-place-card={p.id}>
      <div className="osi-text">
        <b>{p.name}</b>
        <span>{line}</span>
        {p.why && p.st === "hint" && !said && <em>{p.why}</em>}
      </div>
      <div className="osi-acts">
        {press && <button type="button" className="osi-press" data-sign disabled={busy} onClick={onSign}>{busy ? "waiting…" : press}</button>}
        <button type="button" className="ob-quiet" data-not-now onClick={onClose}>{press ? "not now" : "close"}</button>
      </div>
    </div>
  );
}
