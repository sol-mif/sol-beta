// The first run, step by step, on the new face's paper (Sol ticket #97; in place of #1855's one line).
// Five steps down the left, the one now on the right, in Day's ink and column (startup.css, firstrun.css):
//   install half   while the shell installs (welcome.rs first_run, first_run_state): where Sol goes, Node, the engine, each
//                  from the install's own lines (steps-state.ts); Apple's developer-tools window said where it waits;
//                  stopped, the step it stopped in, why, and 再試一次 (first_run_again)
//   sign-in half   the shell loads "/" once the engine answers; the mark (left.ts) brings this back before the new face:
//                  Google (team.cloud.signin, as the start-up's corner line does) and the AI (claude_login, codex_login,
//                  as the welcome card does; Claude Code got first when missing), each with 之後再說
// Nothing left, the mark goes and the new face takes over: its start-up, then the welcome card. A browser shows the
// install half at ?firstrun=setup (flag.ts demoFirstRun) and the sign-in half at ?firstrun=signin, on a clock.
import { useEffect, useRef, useState } from "react";
import type { FirstRun } from "../../flag.ts";
import { askOf } from "../setup-state.ts";
import { aiPress, currentOf, fracOf, placeOf, seatOf, stepsOf, TITLES, type Ais, type AiSt, type Google, type StepId } from "./steps-state.ts";
import { endSignIns, markSignIns } from "./left.ts";
import { asker } from "../../../agents/model.ts";
import "../startup.css";
import "./firstrun.css";

type Engine = { up: boolean; send: (m: object) => boolean | void; subscribe: (f: (m: unknown) => void) => () => void };
type Props = { f: FirstRun; onAgain: () => void } | { e: Engine | null; onDone: () => void; demo?: boolean };
// how often a sign-in still out is asked again, and the browser still's made-up wait for one (never a motion)
const POLL_MS = 3000, DEMO_MS = 1500;
const inApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export default function Steps(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => el.style.setProperty("--k", String(Math.max(1, Math.min(2.2, el.clientWidth / 1184, el.clientHeight / 600))));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return (
    <div className="sup" data-face="next">
      <div ref={box} className="sup-win sup-day fr" data-firstrun={"f" in p ? "install" : "signin"}>
        {"f" in p ? <Install f={p.f} onAgain={p.onAgain} /> : <SignIns e={p.e} onDone={p.onDone} demo={!!p.demo} />}
      </div>
    </div>
  );
}

function Rail({ steps, now }: { steps: ReturnType<typeof stepsOf>; now: StepId | null }) {
  return (
    <ol className="fr-rail" aria-label="Setting Sol up">
      {steps.map((s, i) => (
        <li key={s.id} className={`fr-st ${s.state}`} data-step={s.id} data-state={s.state} aria-current={s.id === now ? "step" : undefined}>
          <span className="fr-dot" aria-hidden="true"><b>{s.state === "done" ? "✓" : s.state === "stopped" ? "!" : s.state === "skipped" ? "–" : i + 1}</b></span>
          <span className="fr-t">{s.title}{s.state === "skipped" && <small>later</small>}</span>
        </li>
      ))}
    </ol>
  );
}

function Install({ f, onAgain }: { f: FirstRun; onAgain: () => void }) {
  // the last two steps come after the shell's reload; only for a download (the team's build may keep the old face, which
  // would never clear it) and only in Sol.app (a browser's still sets nothing)
  useEffect(() => { if (f.download && inApp()) markSignIns(); }, [f.download]);
  const steps = stepsOf({ lines: f.lines, error: f.error });
  const now = currentOf(steps) ?? "engine";
  const at = steps.findIndex((s) => s.id === now);
  const ask = askOf(f.lines);
  return (
    <div className="fr-cols">
      <Rail steps={steps} now={now} />
      <div className="fr-pane" data-setup={f.error ? "stopped" : "installing"}>
        <p className="sd-step">Step {at + 1} of 5</p>
        {f.error ? <>
          <h2 className="sd-h" role="alert">Setup stopped at “{TITLES[now]}”</h2>
          <p className="sd-sub" data-setup-why>{f.error}</p>
          <p className="sd-note">What’s done stays done; trying again picks up from here.</p>
          <div className="sd-foot"><button type="button" className="sd-btn" data-setup-again onClick={onAgain}>Try again</button></div>
        </> : <>
          {now === "place" && <><h2 className="sd-h" aria-live="polite">Sol goes in <span className="fr-path">{placeOf(f.lines)}</span></h2>
            <p className="sd-sub">A new folder for Sol and your settings. Nothing else on this Mac is touched.</p></>}
          {now === "node" && <><h2 className="sd-h" aria-live="polite">Getting Node</h2>
            <p className="sd-sub">Sol’s engine runs on Node: one pinned version from nodejs.org, checked before it goes into ~/.sol/node.</p></>}
          {now === "engine" && <><h2 className="sd-h" aria-live="polite">Getting Sol and its engine</h2>
            <p className="sd-sub">Sol goes into <span className="fr-path">{placeOf(f.lines)}</span>, with Claude Code and what the engine needs, and the engine starts in the background. A few minutes; you can do something else meanwhile.</p></>}
          <div className="sd-bar" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fracOf(f.lines) * 100)}>
            <i style={{ transform: `scaleX(${fracOf(f.lines)})` }} />
          </div>
          {ask ? <p className="sd-note fr-ask" data-setup-ask role="status">Apple opened a window: click Install. Sol carries on by itself once it’s in.</p> : <p className="sd-note">Then sign in with Google and connect your AI, and you’re in.</p>}
        </>}
      </div>
    </div>
  );
}

/** the engine's answers for Google, Sol.app's for the AI; a browser's are made up and pass on a clock */
function SignIns({ e, onDone, demo }: { e: Engine | null; onDone: () => void; demo: boolean }) {
  const [google, setGoogle] = useState<Google>(demo ? "out" : "?");
  const [ais, setAis] = useState<Ais | "later">({ claude: "?", codex: "?" });
  const [said, setSaid] = useState<string | null>(null);
  const ask = useRef<ReturnType<typeof asker> | null>(null);
  const up = !!e?.up;
  useEffect(() => {
    if (demo || !e || !up) return;
    const a = asker(e.send as never, e.subscribe as never, { prefix: "fr-signin" });
    ask.current = a;
    void a.ask<{ login?: string; cloud?: boolean }>({ type: "team.cloud.me" }, 8000).then((r) =>
      // no answer in time (a cold engine on its first minute): the sign-in is offered all the same, as the old start did
      setGoogle((g) => (g !== "?" ? g : r?.cloud === false ? "none" : r?.login ? "in" : "out")));
    return () => { a.close(); ask.current = null; };
  }, [demo, up]);   // eslint-disable-line react-hooks/exhaustive-deps

  const readAis = async () => {
    if (demo) { setAis((a) => (a === "later" ? a : a.claude === "?" ? { claude: "out", codex: "out" } : a)); return; }
    if (!inApp()) { setAis("later"); return; }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [c, x] = await Promise.all([invoke<AiSt>("claude_status"), invoke<AiSt>("codex_status")]);
      setAis((a) => (a === "later" ? a : { claude: c, codex: x }));
    } catch { setAis((a) => (a === "later" ? a : { claude: "out", codex: "out" })); }
  };
  const lastAis = useRef<Ais | null>(null);   // what the AI step last read, kept past its "later" for the seat
  if (ais !== "later" && ais.claude !== "?") lastAis.current = ais;
  const steps = stepsOf({ lines: null, google, ai: ais });
  const now = currentOf(steps);
  // the AI step: asked when it comes, again when the window comes back from the browser, and on a beat while a sign-in is out
  const [out, setOut] = useState<"claude" | "codex" | null>(null);
  const installing = useRef(false);   // Claude Code being got: the press stays busy, never a second install
  useEffect(() => {
    if (now !== "ai") return;
    void readAis();
    const poll = () => void readAis();
    // back from the browser: asked again, and the press is free again (a tab closed without signing in can be tried again)
    const back = () => { if (!installing.current) setOut(null); poll(); };
    addEventListener("focus", back);
    const t = out && !demo ? setInterval(poll, POLL_MS) : undefined;
    return () => { removeEventListener("focus", back); if (t) clearInterval(t); };
  }, [now, out]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the AI step left with only one of them signed in: new chats start on that one (the old onboarding's seat, One.tsx)
  const seated = useRef(false);
  const seatNow = () => {
    if (seated.current || demo || !e || lastAis.current === null) return;
    const seat = seatOf(lastAis.current);
    seated.current = true;
    if (seat) e.send({ type: "team.settings", rid: `first-seat-${Date.now()}`, patch: { seats: { life: seat } } });
  };
  useEffect(() => { if (now !== "ai") seatNow(); }, [now]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (now === null) { endSignIns(); onDone(); } }, [now]);   // eslint-disable-line react-hooks/exhaustive-deps

  const signGoogle = async () => {
    setSaid(null);
    if (demo) { setGoogle("busy"); setTimeout(() => setGoogle("in"), DEMO_MS); return; }
    const a = ask.current; if (!a) return;
    setGoogle("busy");
    const r = await a.ask<{ ok?: boolean }>({ type: "team.cloud.signin" }, 600_000);
    if (!r?.ok) { setGoogle("failed"); return; }
    const me = await a.ask<{ login?: string }>({ type: "team.cloud.me" }, 8000);
    setGoogle(me?.login ? "in" : "failed");
  };
  const signAi = async (id: "claude" | "codex") => {
    setSaid(null);
    if (demo) { setOut(id); setTimeout(() => { setAis((a) => (a === "later" ? a : { ...a, [id]: "in" })); setOut(null); }, DEMO_MS); return; }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setOut(id);
      if (id === "claude" && ais !== "later" && ais.claude === "missing") { setSaid("Getting Claude Code first, a minute."); installing.current = true; try { await invoke("claude_install"); } finally { installing.current = false; } }
      await invoke(id === "claude" ? "claude_login" : "codex_login");
      setSaid(`${id === "claude" ? "Claude" : "ChatGPT"}’s page is open in your browser; sign in there and come back.`);
    } catch (err) { setOut(null); setSaid(String(err)); }
  };
  const later = () => { seatNow(); endSignIns(); onDone(); };
  const at = steps.findIndex((s) => s.id === now);

  return (
    <div className="fr-cols">
      <Rail steps={steps} now={now} />
      <div className="fr-pane" data-signin={now ?? "done"}>
        <p className="sd-step">Step {Math.max(at, 0) + 1} of 5</p>
        {now === "google" && <>
          <h2 className="sd-h">Sign in with Google</h2>
          <p className="sd-sub">So your team knows this Sol is yours. You sign in in your browser; Sol never sees your password.</p>
          {google === "?" ? <p className="sd-note" role="status">Checking…</p>
            : google === "busy" ? <p className="sd-note" role="status">Finish signing in in your browser…</p>
            : <>{google === "failed" && <p className="sd-note" role="alert">That didn’t go through. Try again, or later from Settings.</p>}
              <div className="sd-foot">
                <button type="button" className="sd-btn" data-signin-google onClick={() => void signGoogle()}>Sign in with Google</button>
                <button type="button" className="sd-ghost" data-signin-later onClick={() => setGoogle("later")}>Later</button>
              </div></>}
        </>}
        {now === "ai" && ais !== "later" && <>
          <h2 className="sd-h">Connect your AI</h2>
          <p className="sd-sub">Sol works through your own accounts, on the plans you already have. One is enough; add the other any time in Settings.</p>
          <div className="fr-ais">
            {([["claude", "Claude", "Claude Code"], ["codex", "ChatGPT", "Codex"]] as const).map(([id, n, tool]) => {
              const st = ais[id];
              return (
                <div key={id} className={`fr-ai ${st}`} data-ai={id} data-ai-state={st}>
                  <span className="fr-ai-n"><b>{n}</b><small>{tool}</small></span>
                  {st === "in" ? <span className="fr-ai-in">Signed in</span>
                    : st === "?" ? <span className="fr-ai-q">Checking…</span>
                    : st === "missing" && id === "codex" ? <span className="fr-ai-q">Not on this Mac</span>
                    : <button type="button" className="sd-btn" disabled={out === id} onClick={() => void signAi(id)}>
                        {out === id ? "Waiting for you…" : st === "missing" ? "Get it and sign in" : "Sign in"}</button>}
                </div>
              );
            })}
          </div>
          {said && <p className="sd-note" role="status">{said}</p>}
          <div className="sd-foot">
            {aiPress(ais) === "Continue" ? <button type="button" className="sd-btn" data-signin-ai-go onClick={() => setAis("later")}>Continue</button>
              : <button type="button" className="sd-ghost" data-signin-ai-go onClick={() => setAis("later")}>Later</button>}
            <span className="sd-r">You can change this in Settings</span>
          </div>
        </>}
        {now === null && <h2 className="sd-h" role="status">All set</h2>}
        {now !== null && <div className="fr-skip"><button type="button" className="sd-ghost" data-signin-skip onClick={later}>Skip the rest and look around</button></div>}
      </div>
    </div>
  );
}
