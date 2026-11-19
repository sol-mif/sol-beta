// A code session at Near (#1615, slice 3; the mockup's views/near.js session(), its layout as it is): one bound piece.
// Change across the width (the diff gets every column), Talk and Terminal under it, Files at the right on a wide screen,
// the blocks it made in a pane of its own when there are some. Keys switch panes inside the piece only.
// Live (a real Sol) the panes are today's own, by import and never edited (Live.tsx: work/DiffPane, TermPane,
// FileTree/FilePane, WorkTalk), loaded only then, so the dev page never loads the old face's engine code. On the fixture
// the panes draw the scenario's words, as the mockup did, so the counts measure the same layout.
// DOM hooks the counts read: data-front, data-pane, data-terminal, data-copy, data-ask.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).
import { lazy, Suspense } from "react";
import { D, MODE, S, asksOn, lineAsk, useNext, type Ask, type Piece } from "../cv/index.ts";
import { asksFor } from "./runs.ts";
import { AskCard, TalkBox } from "./Talk.tsx";

const Live = lazy(() => import("./Live.tsx"));
const Kbd = ({ t }: { t: string }) => <span className="nr-kbd">{t}</span>;

/** the diff the prototype draws for a session of n files (the same words, so the counts compare) */
export function diffRows(files: number) {
  const n = Math.min(files, 40), out: { path: string; a: number; r: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ path: `src/${["auth", "api", "ui", "db"][i % 4]}/file${i + 1}.ts`, a: (i * 7) % 23 + 1, r: (i * 3) % 9 });
  return out;
}
/** which ask sits inside this piece now: the one ⌘J opened here (an ask on the line stays on the line: one place for an ask) */
export function asksInside(pid: string): Ask[] {
  const a = S.askHere ? D.asks[S.askHere] : undefined;
  return a && !a.answered && a.piece === pid && a.id !== lineAsk() ? [a] : [];
}

function Bar({ title, sm, k, right }: { title: string; sm?: string; k: string; right?: string }) {
  return <div className="nr-bar"><b>{title}</b>{sm ? <span className="sm">{sm}</span> : null}<span className="r">{right}<Kbd t={k} /></span></div>;
}

export function Session({ p, keysHere, beside, width }: { p: Piece; keysHere: boolean; beside: boolean; width: number }) {
  useNext((d, s) => [s.term[p.id], s.pane, d.pieces[p.id]]);
  if (MODE === "live") return <Suspense fallback={null}><Live p={p} keysHere={keysHere} beside={beside} width={width} /></Suspense>;
  return <Fixture p={p} keysHere={keysHere} beside={beside} width={width} />;
}

function Fixture({ p, keysHere, beside, width }: { p: Piece; keysHere: boolean; beside: boolean; width: number }) {
  const term = (S.term[p.id] as { lines: string[]; vim: boolean; buf: string } | undefined) || { lines: p.term?.lines ?? [], vim: false, buf: "" };
  const wide = !beside && width >= 1500, narrow = width < 760;
  const kf = (n: string) => (keysHere && S.pane === n ? " kf" : "");
  const [kC, kT, kR, kF] = ["change", "talk", "terminal", "files"].map(kf);
  const rows = diffRows(p.files || 0), plus = rows.reduce((s, x) => s + x.a, 0), minus = rows.reduce((s, x) => s + x.r, 0);
  const inside = p.part ? asksFor(p) : asksInside(p.id);
  const tAsk = asksOn(p.id).find((a) => /terminal/i.test(a.source));
  const last = term.lines[term.lines.length - 1], running = last === "running…";
  const blk = !narrow && Array.isArray(p.arrivals) && p.arrivals.length ? (p.arrivals as { id: string; kind: string; title: string; text?: string; by?: string; placed?: boolean }[]) : null;
  return (
    <>
      {narrow ? inside.map((a) => <AskCard key={a.id} a={a} />) : null}
      <div className={`nr-sess${wide ? " wide" : ""}${narrow ? " narrow" : ""}${blk ? " blocks" : ""}`}>
        <div className={`nr-pane p-change${kC}`} data-front data-pane="change">
          <Bar title="Change" sm={`${p.files} files · +${plus} −${minus} · copy ${p.copy} · ${p.branch}`} k="⌥⌘2" />
          <div className="nr-diff">{rows.map((x) => (
            <div key={x.path}><span className="nr-fh">{x.path}<small>+{x.a} −{x.r}</small></span><span className="nr-hk">@@ -12,6 +12,8 @@</span>
              <span className="rm">-  const s = load(id)</span><span className="ad">+  const s = await load(id, {"{"} keep: true {"}"})</span></div>
          ))}</div>
        </div>
        <div className={`nr-pane p-talk${kT}`} data-front data-pane="talk">
          <Bar title="Talk" sm={`with ${p.ai}`} k="⌥⌘1" />
          <div className="nr-msgs">
            {(p.talk || []).map((l, i) => {
              const at = l.indexOf(": "), who = l.slice(0, at), t = l.slice(at + 2);
              return who === "you" ? <div key={i} className="nr-me">{t}</div> : <div key={i} className="nr-ai"><span className="nr-aura" /><div>{t}</div></div>;
            })}
            {!narrow ? inside.map((a) => <div key={a.id} className="nr-ai"><span className="nr-aura" /><div className="nr-grow"><AskCard a={a} /></div></div>) : null}
          </div>
          <TalkBox pid={p.id} ai={p.ai || ""} />
        </div>
        <div className={`nr-pane p-terminal${kR}`} data-front data-pane="terminal" data-terminal data-copy={p.copy}>
          <Bar title="Terminal" sm={`copy ${p.copy}${term.vim ? " · vim" : ""}`} k="⌥⌘3" right={running ? "running · " : p.term?.waiting ? "waits for you · " : `${p.term?.stateWord ?? ""} · `} />
          <div className="nr-term">
            {term.lines.map((l, i) => <span key={i} className={/^\s*✕/.test(l) ? "rm" : /^\s*✓/.test(l) ? "ad" : "ln"}>{l.replace(/_$/, "") || " "}{/_$/.test(l) ? <span className="cur">▍</span> : null}</span>)}
            {term.buf ? <span className="ln">{term.buf}<span className="cur">▍</span></span> : null}
            {p.term?.waiting ? (
              <div className="nr-twait" data-ask={tAsk?.id} data-front>
                <div className="nr-wait">Its terminal waits for you: <code>{p.term.waiting}</code></div>
                <span className="nr-k">Type the answer in the terminal; it is the shell's, not ours.</span>
              </div>
            ) : null}
          </div>
        </div>
        {wide ? (
          <div className={`nr-pane p-files${kF}`} data-front data-pane="files">
            <Bar title="Files" sm={`${p.files} changed`} k="⌥⌘4" />
            <div className="nr-files">{Array.from({ length: p.files || 0 }, (_, i) => { const x = rows[i] || { path: `file${i + 1}.ts`, a: 0, r: 0 }; return <div key={i}>{x.path.split("/").pop()}<small>+{x.a} −{x.r}</small></div>; })}</div>
          </div>
        ) : null}
        {blk ? (
          <div className="nr-pane p-blocks" data-front data-pane="blocks">
            <div className="nr-bar"><b>Blocks</b><span className="sm">{blk.length} from {p.ai}</span></div>
            <div className="nr-blocks">{blk.map((x) => (
              <article key={x.id} className="nr-blk"><span className="nr-bk">{x.kind}{x.by && x.by !== p.ai ? ` · by ${x.by}` : ""}</span><h3>{x.title}</h3>{x.text ? <p>{x.text}</p> : null}
                {x.placed ? <span className="nr-bon">On the plane, beside this session</span> : <button className="nr-btn" data-act={`place:${x.id}`}>Place beside</button>}</article>
            ))}</div>
          </div>
        ) : null}
      </div>
    </>
  );
}
