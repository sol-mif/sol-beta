// A code session at Near in a real Sol (#1615, slice 3; map.md "Near, a code session": work.diff, work.term.*,
// work.tree, work.view, all "yes"): today's own panes in the mockup's bound layout, by import and never edited:
// work/DiffPane (Change), WorkTalk with a talk box (Talk), TermPane (Terminal), FileTree with FilePane (Files). They read
// the engine through useWork on the link the Near wire keeps (cv/wire/near.ts). Loaded lazily by Session.tsx, live only.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { useEffect } from "react";
import { hooks, S, type Piece } from "../cv/index.ts";
import { cwdOf, engine } from "../cv/wire/near.ts";
import { useWork, scoped, type Work } from "../../work/useWork";
import { DiffPane } from "../../work/DiffPane";
import { TermPane } from "../../work/TermPane";
import { FileTree } from "../../work/FileTree";
import { WorkTalk } from "../../work/WorkTalk";
import type { Engine } from "../cv/wire/types.ts";
import { TalkBox } from "./Talk.tsx";

const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;
const flash = (t: string) => hooks.flash?.(t);

export default function Live({ p, keysHere, beside, width }: { p: Piece; keysHere: boolean; beside: boolean; width: number }) {
  const e = engine();
  if (!e) return <div className="nr-sess"><div className="nr-pane p-change" data-front data-pane="change"><div className="nr-bar"><b>Change</b><span className="sm">the engine is away</span></div></div></div>;
  return <Panes e={e} p={p} keysHere={keysHere} beside={beside} width={width} />;
}

function Panes({ e, p, keysHere, beside, width }: { e: Engine; p: Piece; keysHere: boolean; beside: boolean; width: number }) {
  const w0 = useWork(e as unknown as Parameters<typeof useWork>[0]);
  const sid = String(p.sessionId ?? p.id), w: Work = scoped(w0, sid);
  useEffect(() => { if (e.up) w0.peek(sid); return () => w0.unpeek(sid); }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const cwd = (p.cwd as string | undefined) ?? cwdOf(sid) ?? w.thread?.cwd;
  const busy = !!w.run?.busy, wide = !beside && width >= 1500;
  const kf = (n: string) => (keysHere && S.pane === n ? " kf" : "");
  const [kC, kT, kR, kF] = ["change", "talk", "terminal", "files"].map(kf);
  return (
    <div className={`nr-sess${wide ? " wide" : ""}`}>
      <div className={`nr-pane p-change${kC}`} data-front data-pane="change">
        <div className="nr-bar"><b>Change</b><span className="sm">{p.copy ? `copy ${p.copy}` : cwd ?? ""}</span><span className="r"><Kbd t="⌥⌘2" /></span></div>
        <div className="nr-old"><DiffPane w={w} cwd={cwd} busy={busy} onSend={(t) => { w.say(t); }} onFile={() => {}} /></div>
      </div>
      <div className={`nr-pane p-talk${kT}`} data-front data-pane="talk">
        <div className="nr-bar"><b>Talk</b><span className="sm">with {p.ai}</span><span className="r"><Kbd t="⌥⌘1" /></span></div>
        <div className="nr-msgs"><WorkTalk items={w.thread?.items ?? []} busy={busy} w={w} view="normal" onFresh={() => {}} onLink={() => {}} /></div>
        <TalkBox pid={p.id} ai={p.ai || ""} />
      </div>
      <div className={`nr-pane p-terminal${kR}`} data-front data-pane="terminal" data-terminal data-copy={p.copy ?? cwd ?? ""}>
        <div className="nr-bar"><b>Terminal</b><span className="sm">{p.copy ? `copy ${p.copy}` : ""}</span><span className="r"><Kbd t="⌥⌘3" /></span></div>
        <div className="nr-old"><TermPane w={w} cwd={cwd} sub={e.subscribe} /></div>
      </div>
      {wide ? (
        <div className={`nr-pane p-files${kF}`} data-front data-pane="files">
          <div className="nr-bar"><b>Files</b><span className="r"><Kbd t="⌥⌘4" /></span></div>
          <div className="nr-old"><FileTree w={w} cwd={cwd} onAttach={() => {}} flash={flash} /></div>
        </div>
      ) : null}
    </div>
  );
}
