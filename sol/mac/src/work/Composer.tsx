import { stageWhole } from "../flag";
import { heardAtSend } from "../yours/Offer";   // #1089: a send heard by Build's yours (build.yours)
import { store as stageStore } from "../stage/engineStore";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { composing } from "../ime";
import { anyWhole } from "../flag";   // #1001
import type { FileOut, Seat } from "../useEngine";
import type { useEngine } from "../useEngine";
import { EngineBack } from "../EngineBack";
import { Picker } from "../Picker";
import { prettyModel } from "../models";
import { Aurora } from "../creature/indicators";
import { CFG, enter, reducedMotion, useSpring } from "../motion";
import { startRecording, type Recorder } from "../voice";
import { AsideCard, PermCard } from "./Cards";
import { Menu, type MenuItem } from "./Menu";
import { LeashWheel } from "./LeashWheel";
import { ModePick, BYPASS_SURE } from "./ModePick";
import { useLevel } from "./Listen";
import { Button, Field, Pill } from "../kit";
import type { Usage } from "./Context";
import { tooLarge } from "../socket";
import { FolderPick, type Place } from "./FolderPick";
import { Chips } from "./Chips";
import { VoiceBody } from "../creature/Voice";
import { forcedState } from "../creature/state";
import type { Mode, Work } from "./useWork";
import { HELD } from "./WorkSidebar";
import { StableLine } from "../cowork/StableLine";   // Ship (#33): a new stable is out, over the composer
import { FileLine } from "../FileLine";               // File it (#119): the field and the receipt, over the composer
import { Plus } from "./Plus";
import { textW, useSize } from "../kit/paint";
import { TYPE as KT } from "../kit/tokens";
import { useShown } from "../shown/flag";
import { ModeMark } from "../shown/marks";   // show, don't say (#1020): the mode as its mark
import { CallKey } from "../buttons/call";
import { v3On, v3Make, V3Stage } from "../cowork/v3/hooks";   // Cowork v3 (fr-30): the stage, only with the switch on
import { BarChips, OnToken } from "../stage/BarChips";                // the stage's bar (#698): the chips and "on ·"
import { askStage, preview } from "../stage/ask";
import { useCross } from "../cross/flag";   // #1031: Home's pieces and "say it" sit in the box itself
import { Pieces } from "../cross/Pieces";
import { Say } from "../cross/Say";
import { barState, sent as barSent, setThings, useBar } from "../stage/bar";
import { BarMoment } from "../notify/InPlace";                  // the one notification (#845): the bar's jelly and line
import { seenSession } from "../notify/moments";
import { sayInBox } from "../screens/sayBox";   // #1090: "the plan to the big one" moves it, not sent

// Work's box: the words, and around them what Claude Code's composer has. + opens attach / mention / command; @
// lists the folder's files as you type, / the session's commands and skills; under the box the model, effort, the
// mode (the permission pick; cmd+shift+M) and the folder a new session starts in. Which engine runs Work moved to the
// overview pane (2026-10-15). Dictation is Life's, the same recorder.
export type Att = FileOut & { thumb?: string };
const readFile = (f: File): Promise<Att> => new Promise((ok) => {
  const r = new FileReader();
  r.onload = () => {
    const url = String(r.result);
    ok({ name: f.name || "pasted", mime: f.type || "application/octet-stream", dataBase64: url.split(",")[1] ?? "", thumb: f.type.startsWith("image/") ? url : undefined });
  };
  r.readAsDataURL(f);
});

type Pop = { kind: "at" | "slash"; q: string; start: number; end: number };
type Hit = { key: string; label: string; dim?: string; put: string };

// the same five as Claude Code's app, in its order and words (Marco, 2026-10-15); 1–5 pick in the menu
export const MODES: { m: Mode; label: string; short: string; note: string; risky?: string }[] = [
  { m: "auto", label: "Auto", short: "Auto", note: "Claude handles permission decisions" },
  { m: "default", label: "Manual", short: "Manual", note: "Always ask before making changes" },
  { m: "acceptEdits", label: "Accept edits", short: "Edits", note: "Automatically accept all file edits" },
  { m: "plan", label: "Plan", short: "Plan", note: "Create a plan before making changes" },
  { m: "bypassPermissions", label: "Bypass permissions", short: "Bypass", note: "Accepts all permissions", risky: "everything runs unasked" },
];   // `short`: the word the row shows when it narrows (home.css, the row squishes by shortening)
const BUILTIN = ["compact", "context", "cost", "init", "review", "security-review"];
const tilde = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || "~";
// commands Sol answers itself (the SDK's session runs none of these)
const LOCAL: Record<string, string> = { btw: "ask on the side", clear: "a fresh talk, same folder", resume: "an older session", fork: "a copy of this talk" };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const knownCommands = (): string[] => { try { return JSON.parse(localStorage.getItem("sol.work.commands") ?? "null") ?? BUILTIN; } catch { return BUILTIN; } };

export type Draft = { text: string; atts: Att[] };

/** #954 (whole.html's .send): the round send arrow at the row's end, always there; lit by the jelly when the box holds
 *  something to send, dim and pressing nothing when it is empty */
function GoKey({ go, busy, onSend, onStop }: { go: boolean; busy: boolean; onSend: () => void; /** at work with nothing typed: the key stops the turn (as Esc does) */ onStop?: () => void }) {
  const what = busy ? "send now: this turn stops first (enter)" : "send (enter)";
  if (!go && onStop) return (
    <button className="wgo stop" onClick={onStop} title="stop this turn (esc)" aria-label="stop">
      <svg viewBox="0 0 14 14" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /></svg>
    </button>
  );
  return (
    <button className={`wgo${go ? " go" : ""}`} onClick={go ? onSend : undefined} aria-disabled={!go} title={go ? what : "nothing to send yet"} aria-label={busy ? "queue" : "send"}>
      <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 11.5V2.5M3 6.5l4-4 4 4" /></svg>
    </button>
  );
}
// what the empty box says, longest first: a box the space made narrow (a chat column of 360) says the one that fits whole,
// never a sentence cut at its edge
const ASK = ["tell Claude what to do  ·  @ a file  ·  / a command", "tell Claude what to do  ·  @  ·  /", "tell Claude what to do", "tell Claude"];
export function Composer({ w, e, busy, working, cwd, asideOn, setAsideOn, box, onSent, onRec, d, setD, cowork, toChat, switchTo, clean, staged, hint }: {
  w: Work; e: ReturnType<typeof useEngine>; busy: boolean; working?: boolean; cwd?: string; asideOn: boolean; setAsideOn: (v: boolean) => void;
  box: React.RefObject<HTMLTextAreaElement | null>; onSent: () => void; onRec: (on: boolean) => void;
  d: Draft; setD: React.Dispatch<React.SetStateAction<Draft>>;   // kept by WorkApp: the words outlive a trip to Settings
  cowork?: boolean;   // Cowork's session: file it labels it cowork
  toChat?: (s: Seat, m?: string) => void;   // Home: a session runs on Claude Code; picking Codex in a new one opens a GPT talk (#141, #182)
  switchTo?: (s: Seat, m?: string) => void; // the same pick in a running session: a GPT talk carries it on in its folder (#182)
  hint?: string;   // the box's words at rest, in place of the session's (Home's pass 1: the bar writes a sticky, #692)
  clean?: boolean;   // the clean Home (#589, Marco 2026-11-02): clicks only (no hold, right-click or keys on the mode), no
                     // codex | claude until it works (#590), the engine dots only in the title bar
  staged?: boolean;  // the stage is the session's main column (#698; a session not started has none): the words split into chips as you type, and
                     // the chips and what you point at go with them (useWork say's `stage`)
}) {
  const [boxW] = useSize(box);
  // #954, stage.whole: the box's words as whole.html draws them, one short line (a new session, at work, next)
  const whole = stageWhole() && !cowork;
  // #954 (scene 14): the box of whole.html: the words the whole width, under them one row, the + first and a round send
  // arrow last (lit by the jelly when there is something to send); what you point at is the words' first token
  const wbox = whole && !!clean;
  const draft = d.text, atts = d.atts;
  const crossOn = useCross();
  const cross = crossOn && !!clean;
  // #1045: Build's own box (not the clean Home's, whose bar wrapper is the drop place) takes a piece carried from Home too
  const crossBox = crossOn && !clean;
  const held = w.live ? w.sessions.find((s) => s.id === w.live)?.held : undefined;
  const [forking, setForking] = useState(false);
  const forkFrom = useRef<string | null>(null);
  // the words stay in the box until the fork opens (they went with it); a failed fork leaves them there
  useEffect(() => {
    if (forkFrom.current && w.live !== forkFrom.current) { setDraft(""); setAtts([]); requestAnimationFrame(grow); }
    forkFrom.current = null; setForking(false);
  }, [w.live, w.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const copyOut = async () => {
    try { await navigator.clipboard.writeText(draft); e.flash("copied: paste it in " + HELD[held!.who]); } catch { e.flash("could not copy"); }
  };
  const forkHere = () => {
    if (!w.live) return;
    const big = tooLarge(atts);
    if (big) { w.warn(big, 8000); return; }
    setForking(true);
    forkFrom.current = w.live;
    w.forkHere(w.live, draft, atts);
  };
  const setDraft = (v: string | ((s: string) => string)) => setD((x) => ({ ...x, text: typeof v === "function" ? v(x.text) : v }));
  // #1090: a said move taken back (⌘Z): its words come back into the box
  useEffect(() => { const f = (ev: Event) => { const d = (ev as CustomEvent<string>).detail; if (typeof d === "string") setDraft(d); }; window.addEventListener("sol:box-words", f); return () => window.removeEventListener("sol:box-words", f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setAtts = (v: Att[] | ((a: Att[]) => Att[])) => setD((x) => ({ ...x, atts: typeof v === "function" ? v(x.atts) : v }));
  const [boxFocus, setBoxFocus] = useState(false);   // the box knows its focus (the engine asks); on the clean Home the kit Field deepens with it (#647)
  const [pop, setPop] = useState<Pop | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [hitsFor, setHitsFor] = useState("");   // the query the hits answer: older ones show, but Enter waits
  const [sel, setSel] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [drop, setDrop] = useState(false);
  // the row (#647, clean Home): words sent while it works wait under the box, one line each, editable (a click puts them
  // back in the box) and removable; the first goes the moment the run settles, then the next. Per session: a switch clears it.
  const [queue, setQueue] = useState<(Draft & { stage?: object })[]>([]);
  // the stage's bar (#698, play.html's preview): the chips follow the words; the slot a chip was dropped on stays with it
  const bar = useBar();
  useEffect(() => { if (staged) setThings(preview(draft, barState().things, barState().room?.size, barState().room?.places)); }, [draft, staged]);
  const stageOf = () => (staged ? askStage(bar.things, bar.on.map(({ id, part }) => ({ id, ...(part ? { part } : {}) }))) : undefined);
  useEffect(() => { setQueue([]); }, [w.live]);

  // the box grows on a spring; sending presses it down and lets it come back past rest
  const boxH = useSpring(0, CFG.settle, (v) => { if (box.current) box.current.style.height = `${v}px`; });
  const grow = () => {
    const t = box.current;
    if (!t) return;
    const prev = boxH.v || t.offsetHeight;
    t.style.height = "auto";
    // #1001 (the run's switches): an empty box is measured without its placeholder, which Chromium counts in scrollHeight
    // wrapped; the box grew a line after each send in a narrow talk, and stood one line before the first
    const ph = anyWhole() && !t.value ? t.placeholder : null;
    if (ph) t.placeholder = "";
    const nat = Math.min(240, Math.max(t.scrollHeight, mirror.current?.scrollHeight ?? 0));
    if (ph) t.placeholder = ph;
    t.style.overflowY = nat >= 240 ? "auto" : "hidden";
    t.style.height = `${prev}px`;
    if (!boxH.v || reducedMotion()) boxH.set(nat); else boxH.to(nat);
  };
  // words put in from outside (a brief from Life, a review remark) grow the box too; typing grows it in onChange
  useEffect(() => { if (document.activeElement !== box.current) requestAnimationFrame(grow); }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const askBox = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // the mirror under the box scrolls with it, so the words not final yet stay after the box's own (#647)
  const follow = () => { const t = box.current, m = mirror.current; if (t && m) m.scrollTop = t.scrollTop; };
  const sendP = useSpring(0, CFG.settle, (v) => { const el = askBox.current; if (el) el.style.scale = v === 0 ? "" : `${1 - 0.012 * v} ${1 - 0.075 * v}`; });
  const attach = async (fs: File[]) => { const got = await Promise.all(fs.map(readFile)); setAtts((a) => [...a, ...got]); };
  const attachRef = useRef(attach);
  attachRef.current = attach;

  // while a turn runs, enter interrupts: the turn stops and the words go the moment it has (Marco 2026-11-07: every
  // message auto-queued and could only queue). Option-enter, or the queue button, puts them behind the turn instead.
  // #1089 (build.yours): a send in Build's box is heard by yours at the send, whether its turn comes back or not
  // with the folder it opens in: a new session's run is still opening when the engine hears it (#1131)
  const yoursHear = (text: string) => { const sid = w.saidIn?.(); if (!cowork && sid) heardAtSend(sid, text, cwd); };
  const send = (how: "auto" | "queue" = "auto") => {
    seenSession(w.live);   // words sent in the session in front: its moment is answered (#845)
    // an aside (cmd+; or /btw): asked on the side, the session's task untouched
    const btw = /^\/btw\s+/i.exec(draft);
    if (asideOn || btw) {
      if (!w.live) { e.flash("an aside needs an open session"); return; }
      if (w.aside(btw ? draft.slice(btw[0].length) : draft.trim())) { setDraft(""); setAsideOn(false); setPop(null); requestAnimationFrame(grow); }
      return;
    }
    // a session open elsewhere is read-only here: never two writers on one transcript
    if (held) { e.flash(`it is open in ${HELD[held.who]}: fork here, or copy it there`); return; }
    // /clear, /new, /resume, /fork: Sol's own, never sent
    const cmd = /^\/(clear|new|resume|fork)(?:\s+(.*))?$/i.exec(draft.trim());
    if (cmd && !atts.length) {
      const k = cmd[1].toLowerCase();
      setDraft(""); setPop(null); requestAnimationFrame(grow);
      if (k === "clear" || k === "new") w.fresh(cwd);
      else if (k === "fork") { if (w.live) w.fork(w.live); else e.flash("a new session has nothing to fork yet"); }
      else resume(cmd[2] ?? "");
      return;
    }
    // #1090 (screens.two, two windows): a short line naming an open block and a screen moves it there, not sent
    if (!atts.length && sayInBox(draft.trim(), w.live)) { setDraft(""); setPop(null); requestAnimationFrame(grow); return; }
    // Cowork v3 (fr-30): in a session with a project chip, words that make a thing go to the stage, not the session
    if (v3On(e.settings) && !atts.length && v3Make(w, e, draft.trim(), (t) => w.say(t, []))) { setDraft(""); setPop(null); requestAnimationFrame(grow); onSent(); return; }
    // #1448: files over what the engine takes are not sent; the words and files stay in the box and a line says why
    const big = tooLarge(atts);
    if (big) { w.warn(big, 8000); return; }
    if (clean && busy && !held && w.live) {
      if (!draft.trim() && !atts.length) return;
      const d = { text: draft.trim(), atts, stage: stageOf() };
      if (how === "queue") setQueue((q) => [...q, d]);
      else { setQueue((q) => [d, ...q]); w.stop(); }   // interrupt: it goes first, as soon as the turn has stopped
      if (staged) barSent();
      setDraft(""); setAtts([]); setPop(null); requestAnimationFrame(grow);
      sendP.set(1); sendP.to(0, { cfg: CFG.settle, delay: 60 });
      return;
    }
    if (w.say(draft.trim(), atts.map(({ name, mime, dataBase64 }) => ({ name, mime, dataBase64 })), stageOf())) {
      yoursHear(draft.trim());
      if (staged) barSent();
      setDraft(""); setAtts([]); setPop(null); requestAnimationFrame(grow);
      sendP.set(1); sendP.to(0, { cfg: CFG.settle, delay: 60 });
      onSent();
    }
  };
  // the queue's head goes when the run settles (busy falls and nothing is asked)
  useEffect(() => {
    if (busy || !queue.length || !w.live) return;
    const [h, ...rest] = queue;
    if (w.say(h.text, h.atts.map(({ name, mime, dataBase64 }) => ({ name, mime, dataBase64 })), h.stage)) { yoursHear(h.text); setQueue(rest); onSent(); }
  }, [busy, queue.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const unqueue = (i: number, back: boolean) => {
    const h = queue[i];
    setQueue((q) => q.filter((_, j) => j !== i));
    if (back && h) { setDraft((d) => (d.trim() ? d + "\n" : "") + h.text); setAtts((a) => [...a, ...h.atts]); requestAnimationFrame(() => { grow(); box.current?.focus(); }); }
  };
  useEffect(() => { if (!busy) box.current?.focus(); }, [busy, w.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- @ and /: what the caret sits after opens a list over the box ----
  const scan = (t: HTMLTextAreaElement) => {
    const caret = t.selectionStart ?? t.value.length;
    if (caret !== t.selectionEnd) { setPop(null); return; }
    const upto = t.value.slice(0, caret), after = t.value.slice(caret);
    const qt = /(?:^|\s)@"([^"@]*)$/.exec(upto);
    const at = qt ? null : /(?:^|\s)@([^\s@"]*)$/.exec(upto);
    // a / at the start or after a space, up to the caret: a command anywhere in the words (#647, Marco 2026-11-06; #655 for the engine's side)
    const sl = /(?:^|\s)\/([\w:.-]*)$/.exec(upto);
    // the rest of the token after the caret goes too when a hit replaces it
    const tail = (re: RegExp) => caret + (re.exec(after)?.[0].length ?? 0);
    setPop(qt ? { kind: "at", q: qt[1], start: caret - qt[1].length - 2, end: tail(/^[^"\n]*"?/) }
      : at ? { kind: "at", q: at[1], start: caret - at[1].length - 1, end: tail(/^[^\s@"]*/) }
      : sl ? { kind: "slash", q: sl[1], start: caret - sl[1].length - 1, end: tail(/^[\w:.-]*/) } : null);
  };
  const cmds = w.run?.commands;
  useEffect(() => { if (cmds?.length) try { localStorage.setItem("sol.work.commands", JSON.stringify(cmds)); } catch { /* private window */ } }, [cmds]);
  useEffect(() => {
    if (!pop) { setHits([]); return; }
    if (pop.kind === "slash") {
      const q = pop.q.toLowerCase(), skills = new Set(w.run?.skills ?? []);
      const all = [...new Set([...Object.keys(LOCAL), ...(cmds?.length ? cmds : knownCommands()), ...skills])];
      const fit = all.filter((c) => c.toLowerCase().includes(q)).sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)));
      setHits(fit.slice(0, 12).map((c) => ({ key: c, label: "/" + c, dim: LOCAL[c] ?? (skills.has(c) ? "skill" : ""), put: `/${c} ` })));
      setHitsFor("/" + pop.q); setSel(0);
      return;
    }
    let gone = false;
    const q = pop.q;
    const t = window.setTimeout(async () => {
      const r = await w.files(cwd || "~", q);
      if (gone) return;
      setHits(r.files.map((p) => {
        const dir = p.endsWith("/"), name = p.replace(/\/$/, "").split("/").pop()!;
        // a path with a space is quoted; a folder stays open (no closing quote, no space) so the list goes on inside it
        const quote = /\s/.test(p);
        return { key: p, label: name + (dir ? "/" : ""), dim: p.slice(0, p.length - name.length - (dir ? 1 : 0)).replace(/\/$/, ""),
          put: quote ? (dir ? `@"${p}` : `@"${p}" `) : dir ? `@${p}` : `@${p} ` };
      }));
      setHitsFor("@" + q); setSel(0);
    }, 70);
    return () => { gone = true; window.clearTimeout(t); };
  }, [pop?.kind, pop?.q, cwd]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (h: Hit) => {
    if (!pop) return;
    const caret = pop.start + h.put.length;
    setDraft((d) => d.slice(0, pop.start) + h.put + d.slice(pop.end));
    requestAnimationFrame(() => { const t = box.current; if (t) { t.focus(); t.setSelectionRange(caret, caret); scan(t); } grow(); });
  };
  const insert = (s: string, at?: number) => {
    const t = box.current;
    const p = at ?? t?.selectionStart ?? draft.length;
    const pad = s === "@" && p > 0 && !/\s/.test(draft[p - 1]) ? " " : "";
    setDraft((d) => d.slice(0, p) + pad + s + d.slice(p));
    requestAnimationFrame(() => { if (t) { t.focus(); t.setSelectionRange(p + pad.length + s.length, p + pad.length + s.length); scan(t); } grow(); });
  };
  const popRef = useRef<HTMLDivElement>(null);
  const shown = !!pop && hits.length > 0;
  const current = !!pop && hitsFor === (pop.kind === "at" ? "@" : "/") + pop.q;
  useLayoutEffect(() => { if (shown && popRef.current) enter(popRef.current, { y: 8, cfg: CFG.settle }); }, [shown, pop?.kind]);

  // ---- dictation: Life's recorder, the words landing at the caret ----
  const [rec, setRec] = useState<"off" | "on" | "ending">("off");
  const listening = rec !== "off" || forcedState === "listening";   // forcedState: dev ?creature=listening, shown without a microphone
  const [heard, setHeard] = useState({ kept: "", open: "" });
  // the words not final yet grow the box as they come (the mirror is taller than the box's own words), and the mirror keeps its place
  useEffect(() => { if (listening) requestAnimationFrame(() => { grow(); follow(); }); }, [heard.open, listening]); // eslint-disable-line react-hooks/exhaustive-deps
  const settledWords = useRef("");
  // the live transcript (#647 round 3): words the recognizer has settled go into the box as they settle, so they are
  // the person's to edit at once; the words still open show after them in a lighter tone (the mirror under the box)
  const keptIn = useRef("");
  const land = (words: string) => {
    if (!words) return;
    setDraft((d) => d + (d && !/\s$/.test(d) ? " " : "") + words);
    requestAnimationFrame(grow);
  };
  const recorder = useRef<Recorder | null>(null);
  const recStart = useRef(0);
  useEffect(() => () => { const r = recorder.current; recorder.current = null; void r?.stop().catch(() => {}); }, []);
  useEffect(() => { onRec(rec === "on"); }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps
  const micStop = async () => {
    const r = recorder.current;
    recorder.current = null;
    if (!r) return;
    setRec("ending");
    settledWords.current = r.settled();
    try { const audio = await r.stop(); if (audio) e.hear(audio); else e.heardCb.current(""); }
    catch (err) { setRec("off"); e.flash("could not read that recording: " + ((err as Error).message ?? err)); }
  };
  const micDown = async () => {
    if (recorder.current) { await micStop(); recStart.current = -1; return; }
    if (rec === "ending") return;
    try {
      recorder.current = await startRecording(e.settings?.mic, (clip, tag) => e.hear(clip, false, tag));
      recStart.current = Date.now();
      setHeard({ kept: "", open: "" }); keptIn.current = ""; setRec("on");
    } catch (err) { e.flash((err as Error).message || "the microphone is not available"); }
  };
  const micUp = () => { if (recStart.current > 0 && Date.now() - recStart.current > 500) void micStop(); };
  e.partialCb.current = (text, tag) => {
    const r = recorder.current;
    if (!r) return;
    const h = r.heard(tag, text);
    if (clean && h.kept.length > keptIn.current.length && h.kept.startsWith(keptIn.current)) { land(h.kept.slice(keptIn.current.length).trim()); keptIn.current = h.kept; }
    setHeard(h);
    requestAnimationFrame(grow);
  };
  e.heardCb.current = (last) => {
    const settled = settledWords.current;
    settledWords.current = "";
    setRec("off"); setHeard({ kept: "", open: "" });
    if (clean) {
      // what settled and is not in the box yet, then the last open stretch read once more: all of it normal text now
      const rest = settled.startsWith(keptIn.current) ? settled.slice(keptIn.current.length).trim() : "";
      land([rest, last].filter(Boolean).join(" "));
      keptIn.current = "";
      requestAnimationFrame(() => { grow(); const t = box.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } });
      return;
    }
    const text = [settled, last].filter(Boolean).join(" ");
    if (text) {
      const t = box.current, at = t?.selectionStart ?? draft.length, end = t?.selectionEnd ?? at;
      setDraft((d) => d.slice(0, at) + (at > 0 && d[at - 1] && !/\s/.test(d[at - 1]) ? " " : "") + text + d.slice(end));
    }
    requestAnimationFrame(() => { grow(); box.current?.focus(); });
  };

  // files dropped anywhere on the window become chips
  useEffect(() => {
    let depth = 0;
    const over = (ev: DragEvent) => ev.preventDefault();
    const into = (ev: DragEvent) => { ev.preventDefault(); depth++; setDrop(true); };
    const leave = () => { if (--depth <= 0) { depth = 0; setDrop(false); } };
    const dropped = (ev: DragEvent) => {
      ev.preventDefault(); depth = 0; setDrop(false);
      const fs = Array.from(ev.dataTransfer?.files ?? []);
      if (fs.length) void attachRef.current(fs);
    };
    window.addEventListener("dragover", over); window.addEventListener("dragenter", into);
    window.addEventListener("dragleave", leave); window.addEventListener("drop", dropped);
    return () => {
      window.removeEventListener("dragover", over); window.removeEventListener("dragenter", into);
      window.removeEventListener("dragleave", leave); window.removeEventListener("drop", dropped);
    };
  }, []);

  // ---- the leash: cmd+shift+M steps through it ----
  const info = e.models.seats.find((s) => s.seat === "claude");
  const mode = MODES.find((x) => x.m === w.mode) ?? MODES[0];
  const shownOn = useShown();
  const cycle = useRef(() => {});
  cycle.current = () => {   // the key steps through the modes; bypass only from the menu
    const safe = MODES.filter((x) => !x.risky);
    w.adjust({ mode: safe[(safe.findIndex((x) => x.m === w.mode) + 1) % safe.length].m });
  };
  // cmd+shift+I and cmd+shift+E: the model and the effort as a menu over the box (1–9 pick)
  const pickMenu = useRef((_k: "model" | "effort") => {});
  pickMenu.current = (k) => {
    const r = askBox.current?.getBoundingClientRect();
    const items: MenuItem[] = k === "model"
      ? [{ head: "the model" }, ...(info?.models ?? []).map((m) => ({ label: prettyModel(m, "claude"), on: m === w.model, run: () => w.adjust({ model: m }) }))]
      : [{ head: "the effort" }, ...(info?.efforts ?? e.efforts).map((x) => ({ label: String(x), on: x === w.effort, run: () => w.adjust({ effort: String(x) }) }))];
    setMenu({ x: (r?.left ?? 40) + 10, y: (r?.top ?? 400) - 6, items });
  };
  const cleanR = useRef(clean);
  cleanR.current = clean;
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (!ev.metaKey || !ev.shiftKey) return;
      const k = ev.key.toLowerCase();
      if (k === "m") { if (!cleanR.current) { ev.preventDefault(); cycle.current(); } }
      else if (k === "i" || k === "e") { ev.preventDefault(); pickMenu.current(k === "i" ? "model" : "effort"); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const at = (ev: React.MouseEvent, items: MenuItem[]) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6, items }); };
  // the +'s rows after "attach files" (Plus.tsx): what Claude Code's box has and a chat's has not
  const skills = w.run?.skills ?? [];
  const plusMore: MenuItem[] = [
      { label: "mention a file", key: "@", run: () => insert("@") },
      { label: "a command", key: "/", run: () => { setDraft((d) => (d.startsWith("/") ? d : "/" + d)); requestAnimationFrame(() => { const t = box.current; if (t) { t.focus(); t.setSelectionRange(1, 1); scan(t); } }); } },
      ...(skills.length ? [{ label: "a skill", sub: skills.slice(0, 14).map((s) => ({ label: s, run: () => { setDraft((d) => `/${s} ${d}`); requestAnimationFrame(() => box.current?.focus()); } })) }] : []),
      ...(whole ? [{ sep: true } as MenuItem, { label: "a browser on the stage", disabled: !w.live, run: () => { const id = w.live; if (!id || stageStore.read(id).blocks.some((x) => x.kind === "browser" && x.state !== "dead")) return; void stageStore.link()?.ask("work.stage.compose", { sessionId: id, block: { kind: "browser", title: "browser", body: JSON.stringify({ url: "", hand: "you" }) } }); } }] : []),
      { sep: true },
      { label: "ask on the side", key: clean ? undefined : "⌘;", disabled: !w.live, run: () => { setAsideOn(true); box.current?.focus(); } },
  ];
  // the mode chip: a click opens the wheel and it stays; a hold (350 ms) or a right-click opens it for a release-pick (LeashWheel.tsx)
  const leashBtn = useRef<HTMLButtonElement>(null);
  const [wheel, setWheel] = useState<null | { kind: "hold" | "stick"; r: DOMRect }>(null);
  const leashHeld = useRef(false), leashTimer = useRef<number | undefined>(undefined);
  const leashOpen = (kind: "hold" | "stick") => { const r = leashBtn.current?.getBoundingClientRect(); if (r) setWheel({ kind, r }); };
  const leashStop = () => { window.clearTimeout(leashTimer.current); leashTimer.current = undefined; };
  const leashDown = (ev: React.PointerEvent) => { if (ev.button !== 0) return; leashHeld.current = false; leashStop(); leashTimer.current = window.setTimeout(() => { leashHeld.current = true; leashOpen("hold"); }, 350); };
  const leash = () => { if (leashHeld.current) { leashHeld.current = false; return; } if (wheel) setWheel(null); else leashOpen("stick"); };
  // the clean Home: the mode chip lifts the ladder (ModePick), the folder chip the folder card (FolderPick)
  const folderBtn = useRef<HTMLButtonElement>(null);
  const [lift, setLift] = useState<null | { kind: "mode" | "folder"; r: DOMRect }>(null);
  const lifted = (kind: "mode" | "folder", el: HTMLElement | null) => setLift((x) => (x?.kind === kind || !el ? null : { kind, r: el.getBoundingClientRect() }));
  // the folders a new session can start in: the engine's projects; else the folders the sessions ran in, counted;
  // the side's "new in" and the current folder always among them
  const places = useMemo<Place[]>(() => {
    const m = new Map<string, Place>();
    for (const p of w.projects) m.set(p.path, { name: p.name || base(p.path), path: p.path, count: p.count });
    if (!w.projects.length) for (const x of w.sessions) { const k = x.project || x.cwd; if (!k) continue; const p = m.get(k); if (p) p.count++; else m.set(k, { name: base(k), path: k, count: 1 }); }
    for (const k of [w.prefs.newIn, w.freshCwd, cwd]) if (k && k !== "~" && !m.has(k)) m.set(k, { name: base(k), path: k, count: 0 });
    return [...m.values()];
  }, [w.projects, w.sessions, w.prefs.newIn, w.freshCwd, cwd]);
  const folder = (ev: React.MouseEvent) => at(ev, [
    { head: "a new session starts in" },
    ...[...w.projects].sort((a, b) => b.count - a.count).slice(0, 8).map((p) => ({ label: p.name || base(p.path), on: p.path === w.freshCwd, run: () => w.fresh(p.path) })),
    { label: "home folder", on: !w.freshCwd, run: () => w.fresh("~") },
    { sep: true },
    { label: "in a side copy", on: w.copy, run: () => w.setCopy(!w.copy) },
    { label: "another folder…", ask: "", hint: "~/path/to/folder", run: async (v?: string) => {
      const r = await w.files(v ?? "", "");
      if (r.missing || !r.cwd) e.flash(`no folder at ${v}`); else w.fresh(r.cwd);
    } },
  ]);
  // /resume: the folder's older sessions (words search every folder), newest first; a pick opens it where it was
  const resume = (q: string) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const project = w.sessions.find((s) => s.id === w.live)?.project ?? w.projects.find((p) => cwd && (cwd === p.path || cwd.startsWith(p.path + "/")))?.path;
    const list = w.sessions.filter((s) => !s.archived && s.id !== w.live && (words.length ? words.every((x) => `${s.title} ${s.cwd}`.toLowerCase().includes(x)) : !project || s.project === project))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 9);
    const r = askBox.current?.getBoundingClientRect();
    setMenu({ x: (r?.left ?? 40) + 10, y: (r?.top ?? 400) - 6, items: list.length
      ? [{ head: words.length ? `sessions with “${q.trim()}”` : "pick up where it was" }, ...list.map((s) => ({ label: s.title, key: ago(s.updatedAt), run: () => w.open(s.id) }))]
      : [{ head: "no older session here" }] });
  };
  // the next prompt Claude Code suggests after a turn: shown in the empty box, Tab or → takes it
  const its = w.thread?.items ?? [];
  let sugAt = -1, meAt = -1;
  its.forEach((i, n) => { if (i.kind === "suggest") sugAt = n; else if (i.kind === "me") meAt = n; });
  const ghost = !busy && !asideOn && !draft && sugAt > meAt && its[sugAt]?.text && localStorage.getItem("sol.work.suggest") !== "0" ? String(its[sugAt].text) : "";
  const atLabel = w.freshCwd && w.freshCwd !== "~" ? base(w.freshCwd) : "~";
  // the row (#647): a question Claude asks (a permission, a plan, a choice) stands in the bar, over the words, not in
  // the talk; ↑ in an empty box brings the last thing you said back. (The busy line went, Marco 2026-11-06: "unhelpful".)
  const asking = clean ? its.find((i) => i.kind === "perm" && i.state === "ask") : undefined;
  // the clean Home's field: the box over its mirror (the words still being heard, in a lighter tone)
  useLevel(askBox, !!clean && listening);
  const wrapField = (x: React.ReactNode) => (clean ? <div className={`wtype${listening ? " hearing" : ""}`}>{x}</div> : x);
  // bypass sticks (#647 round 3): once confirmed, the person's default mode for every new session
  const def = e.settings?.defaults?.mode;
  const sureBypass = () => { try { localStorage.setItem(BYPASS_SURE, "1"); } catch { /* private window */ } setDefaultMode("bypassPermissions"); w.adjust({ mode: "bypassPermissions" }); };
  const setDefaultMode = (m: string) => e.setSettings({ defaults: { mode: m } });
  const turns = its.filter((i) => i.kind === "me").length;
  const usage = (w.run as (typeof w.run & { usage?: Usage }) | undefined)?.usage;
  // compact: sent, the ring drains (Context.tsx) until the count lands lower or 40 s pass (a compact that never answers)
  const [compacting, setCompacting] = useState(false);
  const ctxNow = w.run?.context ?? 0, ctxAt = useRef(0);
  const compact = w.live ? () => { e.send({ type: "work.compact", sessionId: w.live, model: w.model, effort: w.effort, mode: w.mode, fast: w.fast }); ctxAt.current = ctxNow; setCompacting(true); } : undefined;
  useEffect(() => { if (compacting && ctxNow < ctxAt.current) setCompacting(false); }, [compacting, ctxNow]);
  useEffect(() => { if (!compacting) return; const t = window.setTimeout(() => setCompacting(false), 40_000); return () => window.clearTimeout(t); }, [compacting]);
  const lastSaid = clean && meAt >= 0 ? String(its[meAt]?.text ?? "") : "";
  return (
    <div className="ask">
      <div className="ask-col">
        <StableLine />
        {v3On(e.settings) && <V3Stage w={w} e={e} />}
        <FileLine mode={cowork ? "cowork" : "work"} page={`${cowork ? "Cowork" : "Home"} · ${w.live ? "session" : "new session"} · ${cwd ? base(cwd) : "~"}`} conversation={w.live} />
        <BarMoment live={w.live} onOpen={(id) => window.dispatchEvent(new CustomEvent("sol:open-work", { detail: id }))} />
        {held && !asideOn && (
          <div className="wheld">
            <span className="who"><i className={held.status} />open in <b>{HELD[held.who]}</b> · {held.status}{held.waitingFor ? ` (${held.waitingFor})` : ""} · read-only here</span>
            <span className="moves">
              <button onClick={forkHere} disabled={forking || !e.up} title="go on in a new session here, from where it is now; your words go with it">{forking ? "forking…" : "fork here"}</button>
              <button onClick={() => void copyOut()} disabled={!draft.trim()} title="Sol can't deliver into another app's session: copy, then paste it there">copy</button>
            </span>
          </div>
        )}
        {w.sideAnswer && <AsideCard key={w.sideAnswer.id} a={w.sideAnswer} onClose={() => w.dropAside()} />}
        <EngineBack up={e.up} />
        {clean && staged && <BarChips noOn={wbox} />}
        {cross && <Say text={draft} onSet={(p) => e.setSettings(p)} clear={() => setDraft("")} />}{/* #1031: say it and Settings moves */}
        <div className={`ask-inner${wbox ? " wbox" : ""} ${asideOn ? "aside" : ""} ${drop ? "drop" : ""} ${(busy || working) && !held ? "running" : ""}${clean ? " kit" : ""}${clean && listening ? " listening" : ""}`} ref={askBox} {...(crossBox ? { "data-cross-drop": "talk" } : {})} onFocus={() => setBoxFocus(true)} onBlur={() => setBoxFocus(false)}>
          {clean && <Field focus={boxFocus || listening} />}
          {shown && (
            <div ref={popRef} className={`wpop ${pop!.kind}`} role="listbox">
              {hits.map((h, i) => (
                <button key={h.key} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""}
                  onMouseDown={(ev) => ev.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
                  <b>{h.label}</b>{h.dim && <span>{h.dim}</span>}
                </button>
              ))}
            </div>
          )}
        {crossOn && <Pieces />}{/* #1031: what a Home folder handed this talk, in the box like a file */}
        {atts.length > 0 && <Chips atts={atts} onRemove={(i) => setAtts((x) => x.filter((_, j) => j !== i))} />}
          {asking && <div className="wask"><PermCard key={asking.id} it={asking} w={w} /></div>}
          <div className="ask-line">
          {wbox ? null : clean ? <Plus kit more={plusMore} onFiles={(fs) => void attach(fs)} />
            : listening ? <span className="wlisten" title="listening: say it, the words land here"><VoiceBody kind="listening" size={24} /></span>
            : <Plus more={plusMore} onFiles={(fs) => void attach(fs)} />}
          {!clean && rec !== "off" && (
            <p className="live" aria-live="polite">
              {draft.trim() || heard.kept || heard.open ? <>{[draft.trim(), heard.kept].filter(Boolean).join(" ")}{heard.open && <span className="said">{(draft.trim() || heard.kept) ? " " : ""}{heard.open}</span>}{rec === "ending" && <span className="said">…</span>}</>
                : <span className="said">{rec === "ending" ? "…" : "listening…"}</span>}
            </p>
          )}
          {wrapField(<>
          {wbox && staged && <OnToken onClear={() => box.current?.focus()} />}
          {clean && listening && (
            <div ref={mirror} className="wmirror" aria-hidden="true"><span className="wsaid">{draft}</span>{heard.open && <span className="wunsure">{draft && !/\s$/.test(draft) ? " " : ""}{heard.open}</span>}{rec === "ending" && <span className="wunsure"> …</span>}</div>
          )}
          <textarea ref={box} rows={1} value={draft} disabled={!e.up}
            className={ghost ? "ghost" : undefined}
            placeholder={hint && e.up && !listening ? hint : clean && listening ? (heard.open ? "" : "listening: say it, the words land here") : !e.up ? "engine is starting" : held && !asideOn ? `words for it: fork here takes them along; copy puts them on the clipboard` : ghost ? `${ghost}   ⇥` : asideOn ? "ask on the side: the task goes on (esc to leave)" : busy ? "say more: it waits for the next step" : ASK.find((t) => !boxW || textW(t, KT.read[0]) <= boxW) ?? ASK[ASK.length - 1]}
            onChange={(ev) => { setDraft(ev.target.value); grow(); scan(ev.target); }}
            onScroll={follow}
            onSelect={(ev) => scan(ev.currentTarget)}
            onBlur={() => setPop(null)}
            onPaste={async (ev) => { const fs = Array.from(ev.clipboardData.files); if (fs.length) { ev.preventDefault(); await attach(fs); } }}
            onKeyDown={(ev) => {
              if (shown && !composing(ev)) {
                if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => (s + (ev.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length); return; }
                if ((ev.key === "Enter" && !ev.shiftKey) || ev.key === "Tab") { ev.preventDefault(); if (current) pick(hits[sel]); return; }
                if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); setPop(null); return; }
              }
              if (ghost && (ev.key === "Tab" || ev.key === "ArrowRight") && !ev.shiftKey) { ev.preventDefault(); setDraft(ghost); requestAnimationFrame(grow); return; }
              if (clean && ev.key === "ArrowUp" && !draft && lastSaid && !composing(ev)) { ev.preventDefault(); setDraft(lastSaid); requestAnimationFrame(() => { grow(); const t = box.current; if (t) t.setSelectionRange(lastSaid.length, lastSaid.length); }); return; }
              if (clean && ev.key === "Escape" && !composing(ev)) {
                // esc: an aside closes; a turn at work stops; an empty box lets the keys go
                if (asideOn) { ev.preventDefault(); setAsideOn(false); return; }
                if (busy && !held) { ev.preventDefault(); w.stop(); return; }
                if (!draft) { ev.preventDefault(); box.current?.blur(); return; }
              }
              if (clean && listening && ev.key === "Enter" && !ev.shiftKey && !composing(ev)) { ev.preventDefault(); void micDown(); return; }   // enter ends the dictation; the next enter sends
              if (ev.key === "Enter" && !ev.shiftKey && !composing(ev)) { ev.preventDefault(); send(ev.altKey ? "queue" : "auto"); }
            }} />
          </>)}
          {/* send acts: the kit's flat Button, the rest pick at rest, the jelly's wash on hover and its fill on press (#647 round 5) */}
          {!wbox && clean && (draft.trim() || atts.length > 0) && !held && !asideOn && <span className="wsend kit" title={busy ? "send now: this turn stops first (enter)" : "send (enter)"}><Button h={24} flat acts label="send" onClick={() => send("auto")}>send</Button></span>}
          {!wbox && clean && busy && (draft.trim() || atts.length > 0) && !held && !asideOn && <span className="wsend kit" title="queue it: it goes when this turn ends (option-enter)"><Button h={24} flat label="queue" onClick={() => send("queue")}>queue</Button></span>}
          {!wbox && (busy || working) && !held && (clean
            ? <span className="stop kit" title="stop (esc)"><Button h={24} flat acts label="stop" onClick={() => w.stop()}>stop</Button></span>
            : <button className="stop" onClick={() => w.stop()}>stop</button>)}
          </div>
          {queue.length > 0 && (
            <div className="wqueue" aria-label="waiting to be sent">
              {queue.map((q, i) => (
                <div className="wq" key={i}>
                  <button className="wq-text" onClick={() => unqueue(i, true)} title="back in the box">{q.text || `${q.atts.length} file${q.atts.length === 1 ? "" : "s"}`}{q.text && q.atts.length ? ` · ${q.atts.length} file${q.atts.length === 1 ? "" : "s"}` : ""}</button>
                  <span className="wq-when">{i === 0 ? "next" : `then`}</span>
                  <button className="wq-x" onClick={() => unqueue(i, false)} title="drop it">×</button>
                </div>
              ))}
            </div>
          )}
        {/* the same bar as a chat's (#24): the seat switch is always there; in Cowork it stays on Claude, a group's
            sessions being Claude Code ones, and says so */}
        <Picker locked={!toChat} lockedWhy={toChat ? undefined : "a project's session runs on Claude Code; Codex talks live in Home"} seat="claude" info={info} seats={e.models.seats} model={w.model} effort={w.effort as never} efforts={info?.efforts ?? e.efforts}
          up={e.up} health={e.health} context={w.run?.context ?? 0} win={w.run?.window || 200000} rec={rec !== "off"} notice={w.error || e.notice}
          onSeat={(s) => { if (s !== "claude") (w.live ? switchTo : toChat)?.(s); }} onModel={(m) => w.adjust({ model: m })} onEffort={(v) => w.adjust({ effort: v })}
          onSeatModel={toChat ? (w.live ? switchTo : toChat) : undefined}
          onMicDown={micDown} onMicUp={micUp} call={clean ? undefined : <CallKey e={e} at={w.live ? { work: true, session: w.live } : null} />} noSeat={clean} noEngine={clean} row={clean}
          usage={usage} turns={turns} busy={busy} compacting={compacting} onCompact={compact} ctxKit={{ skills: w.run?.skills?.length ?? 0, commands: w.run?.commands?.length ?? 0 }} ctxPart={(p) => w.contextPart(p)}
          lead={wbox ? <Plus kit more={plusMore} onFiles={(fs) => void attach(fs)} /> : undefined}
          tail={wbox ? <GoKey go={!!(draft.trim() || atts.length > 0) && !held && !asideOn} busy={busy} onSend={() => send("auto")} onStop={(busy || working) && !held ? () => w.stop() : undefined} /> : undefined}>
          <button ref={leashBtn} className={`wchip leash ${w.mode}${clean ? " kit" : ""}${wheel || lift?.kind === "mode" ? " lifted" : ""}`} onClick={clean ? () => lifted("mode", leashBtn.current) : leash} onPointerDown={clean ? undefined : leashDown} onPointerUp={leashStop} onPointerLeave={leashStop}
            onContextMenu={clean ? undefined : (ev) => { ev.preventDefault(); leashStop(); leashOpen("stick"); }} title={clean ? "mode: what Claude may do without asking" : "mode: what Claude may do without asking (hold it for the wheel; cmd+shift+M steps)"}>
            {clean && shownOn
              ? <ModeMark mode={w.mode} label={mode.label} lit={lift?.kind === "mode"} />
              : clean
              ? <>
                  <span className="wlong"><Pill words={[mode.label]} picked={-1} up={lift?.kind === "mode"} h={24} wash={w.mode === "bypassPermissions" ? 0.9 : 0} /></span>
                  <span className="wshort"><Pill words={[mode.short]} picked={-1} up={lift?.kind === "mode"} h={24} wash={w.mode === "bypassPermissions" ? 0.9 : 0} /></span>
                </>   // Bypass: the pill lit by the jelly's heat, never a warning mark; the short word when the row narrows
              : <>{w.mode === "bypassPermissions" && <Aurora />}<span className="leash-w">{mode.label}</span></>}
          </button>
          {wheel && createPortal(<LeashWheel r={wheel.r} kind={wheel.kind} items={MODES} mode={w.mode} onPick={(m) => w.adjust({ mode: m as Mode })} onClose={() => setWheel(null)} chip={leashBtn.current} />, document.body)}
          {clean && lift?.kind === "mode" && <ModePick r={lift.r} items={MODES} mode={w.mode} def={def} onPick={(m) => w.adjust({ mode: m as Mode })} onSure={sureBypass} onDefault={setDefaultMode} onClose={() => setLift(null)} chip={leashBtn.current} />}
          {clean && lift?.kind === "folder" && <FolderPick r={lift.r} places={places} cwd={w.freshCwd} copy={w.copy} onPick={(p) => w.fresh(p)} onCopy={w.setCopy} chip={folderBtn.current} onClose={() => setLift(null)}
            onOther={async (v) => { const r = await w.files(v, ""); return r.missing || !r.cwd ? null : r.cwd; }} />}
          {!w.live && <button ref={folderBtn} className={`wchip folder${clean ? " kit" : ""}${lift?.kind === "folder" ? " lifted" : ""}`} onClick={clean ? () => lifted("folder", folderBtn.current) : folder} title={(w.freshCwd ? tilde(w.freshCwd) : "your home folder") + (w.copy ? "\nin a side copy of its repo (its own branch)" : "")}>
            {clean ? <Pill words={[`in ${atLabel}${w.copy ? " · side copy" : ""}`]} picked={-1} up={lift?.kind === "folder"} h={24} /> : <>in {atLabel}{w.copy ? " · side copy" : ""}</>}</button>}
        </Picker>
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
