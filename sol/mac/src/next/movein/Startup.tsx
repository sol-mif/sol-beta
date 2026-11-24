// The first-launch start-up's view (BR1, #1615; mine/look/br1/startup.html, as drawn): ink on the move-in's paper, no
// jelly and no brand colour. The beats:
//   0 – 1.4 s     18 drawn pieces (folder, chat, file shapes, never the person's files) drift in, tilted and overlapping
//   1.4 – 2.8 s   they straighten into three stacks: folders, chats, files
//   2.8 – 3.8 s   the stacks fold into one dark tile up top (a stand-in until the mark is settled)
//   3.8 s on      "Your AIs, as one.", the sub line, the three promises and one press, "Let’s move in"
// Any key or click skips to the words; reduced motion shows them at once. The scatter is seeded, so every person sees the
// same start-up. After the press, while the reads have not answered: one quiet line, "Having a look around…", never a
// progress screen (startup.ts letsMoveIn; migration.html B).
// Signed: marcocyl04-ux's agent (builder P), BR1 (#1615).
import { useEffect, useRef, useState } from "react";
import { useNext } from "../cv/core.ts";
import { letsMoveIn, sup } from "./startup-state.ts";
import { accountNow, accountPress } from "../cv/wire/account.ts";
import Day from "./Day.tsx";
import "./startup.css";

const INK = "#1d1c1a";
const SHAPES = {
  folder: `<svg width="54" height="42" viewBox="0 0 54 42"><path d="M3 9a4 4 0 0 1 4-4h12l5 5h23a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="#fbfaf7" stroke="${INK}" stroke-width="1.6"/></svg>`,
  chat: `<svg width="56" height="40" viewBox="0 0 56 40"><path d="M7 3h42a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H20l-8 6v-6H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" fill="#fbfaf7" stroke="${INK}" stroke-width="1.6"/><path d="M12 13h26M12 20h18" stroke="#b9b4a9" stroke-width="2" stroke-linecap="round"/></svg>`,
  file: `<svg width="38" height="48" viewBox="0 0 38 48"><path d="M5 3h19l10 10v30a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#fbfaf7" stroke="${INK}" stroke-width="1.6"/><path d="M24 3v10h10" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M9 22h18M9 28h18M9 34h12" stroke="#b9b4a9" stroke-width="2" stroke-linecap="round"/></svg>`,
  tile: `<svg width="64" height="64" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="16" fill="${INK}"/><path d="M19 24h26M19 32h26M19 40h16" stroke="#f6f4ef" stroke-width="3" stroke-linecap="round"/></svg>`,
};
const KINDS = ["folder", "chat", "file"] as const;
/** the beats' starts, in seconds */
const AT = { sorted: 1.4, one: 2.8, said: 3.8 };

type Pos = [number, number, number];
type Piece = { kind: (typeof KINDS)[number]; mess: Pos; sorted: Pos; one: Pos; delay: number };

/** the 18 pieces' places for a window W × H, the drawing's 760 × 470 frame scaled by k (seeded: the same for everyone) */
function pieces(W: number, H: number, k: number): Piece[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Piece[] = [];
  for (let i = 0; i < 18; i++) {
    const kind = KINDS[i % 3], lane = i % 3, n = Math.floor(i / 3);
    out.push({
      kind,
      mess: [W * 0.08 + rnd() * W * 0.74, H * 0.1 + rnd() * H * 0.7, (rnd() - 0.5) * 50],
      sorted: [W / 2 + (-150 + lane * 120 - 26) * k, H / 2 + (-70 - n * 5) * k, 0],
      one: [W / 2 - 28 * k, H * 0.22 - 20 * k, 0],
      delay: rnd() * 0.9,
    });
  }
  return out;
}

export default function Startup() {
  const day = useNext(() => sup.up && sup.day);
  return day ? <Day /> : <Beats />;
}

/** sign-in on the first run (BR1 lane G, 07-start-list §2 item 3): the old face's three steps asked for Google before
 *  anything; the new face opens before them (App.tsx), so a first-timer never saw a sign-in and Settings' Account row was
 *  the only way in. One line in the window's corner: never in the way of moving in, and gone once signed in. Only where there is a
 *  cloud to sign in to (team.cloud.me's cloud) */
function SignIn({ said }: { said: boolean }) {
  const a = useNext(() => accountNow());
  if (!a || !a.cloud) return null;
  const tab = said ? 0 : -1;
  return (
    <div className="sup-sign" data-startup-sign={a.login ? "in" : a.busy ? "busy" : "out"}>
      {a.login ? <span>Signed in as <b>{a.login}</b>.</span>
        : a.busy === "in" ? <span>Finish signing in in your browser…</span>
        : <><button type="button" tabIndex={tab} data-startup-signin="1" onClick={(e) => { e.stopPropagation(); void accountPress("in"); }}>Sign in with Google</button>
            <span>{a.failed ? "That didn’t go through. Try again, or later from Settings." : "so your team knows it’s you. You can do it later in Settings."}</span></>}
    </div>
  );
}

function Beats() {
  const on = useNext(() => sup.up), looking = useNext(() => sup.pressed);
  const box = useRef<HTMLDivElement>(null), go = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState(false), [kb, setKb] = useState(false);
  const skip = useRef<() => void>(() => {});

  useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const W = el.clientWidth, H = el.clientHeight, k = Math.max(1, Math.min(2.2, Math.min(W / 760, H / 470)));   // the drawing's proportions up to 2560 wide
    el.style.setProperty("--k", String(k));
    const ps = pieces(W, H, k), pile = el.querySelector<HTMLElement>(".sup-pile")!;
    pile.replaceChildren();
    const els = ps.map((p) => { const d = document.createElement("div"); d.className = "sup-pc"; d.innerHTML = SHAPES[p.kind]; pile.appendChild(d); return d; });
    const tile = document.createElement("div"); tile.className = "sup-pc sup-tile"; tile.innerHTML = SHAPES.tile; pile.appendChild(tile);
    const put = (d: HTMLElement, [x, y, r]: Pos, s = 1) => { d.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s * k})`; };
    const tileAt: Pos = [W / 2 - 32 * k, H * 0.22 - 24 * k, 0];
    const timers: number[] = [];
    const at = (s: number, from: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, (s - from) * 1000)));
    const play = (from: number) => {
      timers.forEach(clearTimeout); timers.length = 0;
      const phase = from < AT.sorted ? 0 : from < AT.one ? 1 : from < AT.said ? 2 : 3;
      // placed without a transition at the moment asked for, then the rest runs
      for (const d of [...els, tile]) d.style.transition = "none";
      ps.forEach((p, i) => { put(els[i], [p.mess, p.mess, p.one, p.one][phase], phase >= 2 ? 0.6 : 1); els[i].style.opacity = phase === 0 && from < p.delay ? "0" : phase >= 2 ? "0" : "1"; });
      put(tile, tileAt, phase >= 2 ? 1 : 0.5); tile.style.opacity = phase >= 2 ? "1" : "0";
      if (phase === 1) ps.forEach((p, i) => put(els[i], p.sorted));
      setSaid(phase === 3);
      void pile.offsetWidth;
      for (const d of [...els, tile]) d.style.transition = "";
      if (phase === 0) ps.forEach((p, i) => at(p.delay, from, () => { els[i].style.opacity = "1"; }));
      if (phase === 0) at(AT.sorted, from, () => ps.forEach((p, i) => { els[i].style.transitionDelay = `${(i % 6) * 40}ms`; put(els[i], p.sorted); }));
      if (phase <= 1) at(AT.one, from, () => { ps.forEach((p, i) => { els[i].style.transitionDelay = "0ms"; put(els[i], p.one, 0.6); els[i].style.opacity = "0"; }); tile.style.opacity = "1"; put(tile, tileAt, 1); });
      if (phase <= 2) at(AT.said, from, () => setSaid(true));
    };
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    play(reduce ? AT.said : sup.from);
    skip.current = () => play(AT.said);
    return () => timers.forEach(clearTimeout);
  }, [on]);

  // the words: the press takes the focus, so ↩ presses it; before them any key skips to them
  useEffect(() => { if (said) go.current?.focus({ preventScroll: true }); }, [said]);
  useEffect(() => {
    if (!on) return;
    const tab = (e: KeyboardEvent) => { if (e.key === "Tab") setKb(true); };
    window.addEventListener("keydown", tab);
    return () => window.removeEventListener("keydown", tab);
  }, [on]);
  useEffect(() => {
    if (!on || said) return;
    const key = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); skip.current(); };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [on, said]);
  if (!on) return null;

  return (
    <div ref={box} className={`sup-win${said ? " sup-said" : ""}${looking ? " sup-looking" : ""}${kb ? " sup-kb" : ""}`} data-startup={looking ? "looking" : said ? "words" : "beats"}
      onClick={() => { if (!said) skip.current(); }}>
      <div className="sup-pile" aria-hidden="true" />
      <div className="sup-words" aria-hidden={!said}>
        <h2 className="sup-h">Your AIs, as one.</h2>
        <p className="sup-sub">Sol sits on top of the AIs you already use, and learns how you work.</p>
        <div className="sup-promise">
          <div><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="2" y="5" width="18" height="13" rx="3" fill="none" stroke={INK} strokeWidth="1.6" /><path d="M2 8h18" stroke={INK} strokeWidth="1.6" /></svg><b>It looks around first</b>your folders and your AI chats, to set itself up</div>
          <div><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="4" y="9" width="14" height="10" rx="2.5" fill="none" stroke={INK} strokeWidth="1.6" /><path d="M7 9V7a4 4 0 0 1 8 0v2" fill="none" stroke={INK} strokeWidth="1.6" /></svg><b>On this Mac only</b>what it reads stays here</div>
          <div><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M5 11a6 6 0 1 0 2-4.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" /><path d="M4 3.5v4h4" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg><b>Nothing is changed</b>your AI apps work as before; every move can be undone</div>
        </div>
        <div className="sup-go"><button ref={go} type="button" data-startup-go="1" tabIndex={said ? 0 : -1} onClick={(e) => { e.stopPropagation(); letsMoveIn(); }}>Let’s move in</button><small>about two minutes</small></div>
      </div>
      <div className="sup-next" role="status" aria-hidden={!looking}><p>Having a look around…</p></div>
      <span className="sup-skip" aria-hidden="true">any key skips</span>
      <SignIn said={said} />
    </div>
  );
}
