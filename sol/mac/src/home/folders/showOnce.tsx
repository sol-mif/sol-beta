// "Show me once" (#1054, pass 4; path.md step 7). Its mount went with the folders' Home (#1223); it moves onto the record's Home with #1228.
//   watch      the live window (liveWindow.tsx): a blank tab with an address line, or a place picked
//              in the tour, one touch each. The person has the wheel from the start; the jelly keeps every page the tab
//              lands on, in order, and what was pressed (the engine's browser.inspect at the press: its words)
//   that is it one short turn (Claude seat, effort low) gets the steps and the folders and says back in one line what
//              it saw, and which folder it belongs to. "yes", or "not quite" (one line to correct, then again)
//   when       the one question: "every week" / "when I press"
//   kept       a sticky in that folder's stickies.md (stickies.ts: the line, the steps, the when, shown). It waits there;
//              "every week" is kept and said honestly: nothing runs it by itself yet, on its day it waits for a press
// "Do it" (DoIt below): a press on that sticky opens the same window on its first page and one turn does the steps in
// the tab with the person watching; a press in the window takes the wheel, a sign-in wall is theirs (as in the tour).
// Nothing runs unchosen.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { useEngine } from "../../useEngine";
import { Button, Card, Field } from "../../kit";
import { deep, dim, ink, label } from "../../kit/paint";
import { TYPE as T } from "../../kit/tokens";
import { Body, haloDoing } from "../../Body";
import { click, play } from "../../snap/click";
import { useTalk } from "./talk";
import { FILE, WHEN, shownNotes, stamp, useStickies, waiting, type Made, type Shown } from "./stickies";
import { doItBrief, readBack, sayBackBrief, stepLines, type Folder, type Step } from "./showBriefs";
import { LiveWindow, SIGNIN, Stage, lastWord, pathOf, useOwnTab, useTab, type Words } from "./liveWindow";

type E = ReturnType<typeof useEngine>;
/** a place the person showed before, one touch to open (a site by its address) */
type Place = { id: string; name: string; way: { kind: string; url?: string } };
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""); } };
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
type Ask = <T>(o: object, ms: number) => Promise<T | null>;
type Ph = "watch" | "saying" | "check" | "fix" | "when" | "keeping";

/** the address line over the window: where the tab is; typed or pasted, Enter goes there */
function Address({ w, url, onGo }: { w: number; url?: string; onGo: (u: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  const shown = v ?? (url && url !== "about:blank" ? url : "");
  return (
    <Field w={w} h={40} focus={v !== null}>
      <input value={shown} placeholder="type or paste where it starts, then Enter" aria-label="address" data-address
        onFocus={() => setV(shown)} onBlur={() => setV(null)} onChange={(ev) => setV(ev.target.value)}
        onKeyDown={(ev) => { if (ev.key === "Enter" && v?.trim()) { onGo(v.trim()); setV(null); (ev.target as HTMLInputElement).blur(); } }}
        style={{ all: "unset", flex: 1, minWidth: 0, color: ink, fontSize: T.body[0] }} />
    </Field>
  );
}

export function ShowOnce({ ask, e, home, folders, from, places, onKept, onLeave }: {
  ask: Ask; e: E; home: string; folders: Folder[]; from: Folder | null; places: Place[];
  onKept: (f: Folder, t: string) => void; onLeave: () => void;
}) {
  const talk = useTalk();
  const [ph, setPh] = useState<Ph>("watch");
  const [words, setWords] = useState<Words>({ one: "Show me something you do, once.", two: "type where it starts, or touch a place · you have the wheel, I watch", doing: "rest" });
  const say = (one: string, two?: string, doing: Words["doing"] = "rest") => setWords({ one, two, doing });
  const [draft] = useState(() => `show-${Date.now().toString(36)}`);
  const tab = useTab(e, [draft]);
  const tabRef = useRef(tab); tabRef.current = tab;
  const [steps, setSteps] = useState<Step[]>([]);
  const [back, setBack] = useState<{ line: string; name: string; folder: Folder } | null>(null);
  const [fix, setFix] = useState("");
  const [to, setTo] = useState<Folder | null>(null);
  const board = useStickies(ask, to ? `${home}/${to.rel}` : null, to?.name ?? "");

  // the window: a blank tab under this draft, closed when the screen goes
  useOwnTab(e, draft, "", () => undefined);
  // every page the tab lands on, in order (a page opened twice in a row is one step)
  useEffect(() => {
    const u = tab?.url;
    if (ph !== "watch" || !u || u === "about:blank") return;
    setSteps((s) => (s[s.length - 1]?.url === u ? s : [...s, { url: u, pressed: [] }]));
  }, [tab?.url, ph]);
  useEffect(() => { if (steps.length === 1 && ph === "watch") say("I am watching.", "do it as you always do · touch that is it when it is done"); }, [steps.length]);   // eslint-disable-line react-hooks/exhaustive-deps
  // what a press touched: the engine reads the words under the point (a page that moves away first has no answer)
  const pressed = (at: { x: number; y: number }) => {
    const t = tabRef.current;
    if (ph !== "watch" || !t || !t.url || t.url === "about:blank") return;
    void ask<{ words?: string; url?: string }>({ type: "browser.inspect", tab: t.id, x: Math.round(at.x), y: Math.round(at.y) }, 3000).then((r) => {
      const w = r?.words?.replace(/\s+/g, " ").trim();
      if (!w || w.length > 60) return;
      setSteps((s) => { if (!s.length) return s; const l = s[s.length - 1]; return l.pressed.includes(w) ? s : [...s.slice(0, -1), { ...l, pressed: [...l.pressed, w].slice(-4) }]; });
    });
  };
  const goTo = (u: string) => { const t = tabRef.current; click(); if (t) e.send({ type: "browser.navigate", tab: t.id, action: { url: u } }); };

  // ---- that is it: one short turn says it back ----
  const sayBack = async (correction?: string) => {
    setPh("saying"); click(2);
    say("Saying back what I saw.", "a few seconds", "working");
    const r = await talk.turn({ type: "say", seat: "claude", effort: "low", fresh: true, text: sayBackBrief(stepLines(steps), folders, from, correction && back ? { line: back.line, said: correction } : undefined) });
    const b = r.ok ? readBack(r.text, folders) : null;
    if (!b) { setPh("check"); say("I could not say it back.", "touch that is it again, or not now"); setBack(null); return; }
    setBack(b); setPh("check"); play("seat");
    say("This is what I saw.", `for ${b.folder.name} · is that it?`);
  };
  const yes = () => { if (!back) return; click(2); setPh("when"); say("When is it done?", `${back.name} · for ${back.folder.name}`); };
  const whenRef = useRef<Shown["when"]>("press");
  const keepIt = async (when: Shown["when"]) => {
    if (!back) return;
    whenRef.current = when; click(2); setPh("keeping"); setTo(back.folder);
    say("Keeping it.", `a sticky in ${back.folder.name}`, "working");
  };
  // the board for the folder is there once `to` is set: the sticky is written through it
  useEffect(() => {
    if (ph !== "keeping" || !to || !back) return;
    const when = whenRef.current;
    void board.keep({ done: false, t: back.name, s: back.line, notes: shownNotes(stepLines(steps), when) }).then(async () => {
      // kept is what the file says: read back, never assumed
      const r = await ask<{ text?: string }>({ type: "work.read", cwd: `${home}/${to.rel}`, path: FILE }, 8000);
      if (!r?.text?.includes(back.name)) { setPh("when"); say("It was not kept.", "the engine did not take it · touch one again"); return; }
      play("seat", { level: 0.7 });
      onKept(to, back.name);
    });
  }, [ph, to]);   // eslint-disable-line react-hooks/exhaustive-deps

  const act: ReactNode = ph === "watch" ? <><Button h={32} flat onClick={() => { click(); onLeave(); }}>not now</Button>
    {steps.length > 0 && <Button h={32} acts onClick={() => void sayBack()}>that is it</Button>}</>
    : ph === "check" ? (back ? <><Button h={32} flat onClick={() => { click(); setPh("fix"); say("What is it, then?", "one line, in your words · Enter"); }}>not quite</Button><Button h={32} acts onClick={yes}>yes</Button></>
      : <><Button h={32} flat onClick={() => { click(); onLeave(); }}>not now</Button><Button h={32} acts onClick={() => void sayBack()}>that is it</Button></>)
    : ph === "when" ? <><Button h={32} acts onClick={() => void keepIt("week")}>{WHEN.week}</Button><Button h={32} acts onClick={() => void keepIt("press")}>{WHEN.press}</Button></>
    : null;

  const sites = places.filter((p) => p.way.kind === "site").slice(0, 5);
  /** the address line keeps 320 at least; the places picked in the tour fill what is left, one touch each */
  const fit = (W: number) => sites.slice(0, Math.max(0, Math.floor((W - 320) / 132)));
  return (
    <Stage words={words} act={act} data={{ "data-show": ph }}>
      {(W) => (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, marginBottom: 12, flex: "none" }}>
            <Address w={Math.min(560, W - fit(W).length * 132)} url={tab?.url} onGo={goTo} />
            {fit(W).map((p) => <Button key={p.id} h={40} w={124} flat onClick={() => goTo((p.way as { url: string }).url)}>{cut(p.name, 14)}</Button>)}
          </div>
          <LiveWindow e={e} tab={tab} onGrab={pressed} opening={steps.length ? "opening…" : "a blank page · type where it starts above"} data="show">
            {(ph === "saying" || ph === "check" || ph === "fix" || ph === "when" || ph === "keeping") && (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: deep(0.72) }}>
                <Card w={Math.min(560, W - 80)} h={ph === "fix" ? 200 : 180} step="pop">
                  <div style={{ height: "100%", boxSizing: "border-box", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
                    {ph === "saying" ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Body size={36} state="settled" follow halo={haloDoing("working")} /><span className="t-read" style={{ color: dim }}>{steps.length} {steps.length === 1 ? "page" : "pages"} seen</span></div>
                      : ph === "fix" ? <>
                        <div style={label}>I said: {back?.line}</div>
                        <Field w={Math.min(520, W - 120)} h={40} focus><input autoFocus value={fix} onChange={(ev) => setFix(ev.target.value)} placeholder="what you do, in one line" aria-label="what you do" data-fix
                          onKeyDown={(ev) => { if (ev.key === "Enter" && fix.trim()) void sayBack(fix.trim()); if (ev.key === "Escape") { setPh("check"); say("This is what I saw.", `for ${back!.folder.name} · is that it?`); } }} style={{ all: "unset", flex: 1, minWidth: 0, color: ink, fontSize: T.body[0] }} /></Field>
                      </> : <>
                        <div className="t-read" style={{ fontWeight: 600 }}>{back ? back.line : "I could not say it back."}</div>
                        <div style={label}>{steps.length} {steps.length === 1 ? "page" : "pages"} · {back ? `for ${back.folder.name}` : "nothing is kept"}{ph === "keeping" ? " · keeping it" : ""}</div>
                        <div style={{ ...label, color: dim }}>{stepLines(steps).slice(0, 3).map((s) => cut(`${hostOf(s)}${pathOf(s.split(" · ")[0])}`, 64)).join("  →  ")}{steps.length > 3 ? "  → …" : ""}</div>
                      </>}
                  </div>
                </Card>
              </div>
            )}
          </LiveWindow>
        </>
      )}
    </Stage>
  );
}

type DoPh = "doing" | "signin" | "wheel" | "done" | "stuck";
/** a shown sticky, done now: its first page in the window, one turn does the steps, the person watches */
export function DoIt({ ask, e, home, f, m, onBack }: { ask: Ask; e: E; home: string; f: Folder; m: Made; onBack: () => void }) {
  const talk = useTalk();
  const board = useStickies(ask, `${home}/${f.rel}`, f.name);
  const [ph, setPh] = useState<DoPh>("doing");
  const [said, setSaid] = useState<string | null>(null);
  const [words, setWords] = useState<Words>({ one: `Doing it: ${m.t}.`, two: "you watch · touch the window to take the wheel", doing: "working" });
  const say = (one: string, two?: string, doing: Words["doing"] = "rest") => setWords({ one, two, doing });
  const [draft] = useState(() => `do-${Date.now().toString(36)}`);
  const [sid, setSid] = useState<string | undefined>();
  const tab = useTab(e, [draft, sid]);
  const tabRef = useRef(tab); tabRef.current = tab;
  const sidRef = useRef<string | undefined>(undefined), turning = useRef(false), wheelRef = useRef(false);
  const shown = useRef<string[]>([]), wall = useRef("");
  const first = (m.shown?.steps[0] ?? "").split(" · ")[0];
  const stop = () => e.send({ type: "stop", sessionId: sidRef.current ?? draft });

  const run = async (o: { again?: boolean; shown?: string[] } = {}) => {
    turning.current = true; setPh("doing");
    const s = sidRef.current;
    const r = await talk.turn({ type: "say", seat: "claude", effort: "low", text: doItBrief(m, o), ...(s ? { sessionId: s } : { fresh: true, draft }) },
      s, (id) => { sidRef.current = id; setSid(id); });
    turning.current = false;
    if (!alive.current || wheelRef.current) return;
    const end = lastWord(r.text), said = r.text.trim().replace(/\s*\b(DONE|STUCK|SIGNIN)\W*$/, "").trim();
    if (end === "SIGNIN") {
      wall.current = tabRef.current?.url ?? ""; setPh("signin"); play("part", { level: 0.5 });
      say("This one is yours.", "Sign in, in the window; I never see the password. I carry on when you are in.");
    } else if (end === "DONE" || (r.ok && said && end !== "STUCK")) {
      setPh("done"); play("seat"); setSaid(said || null);
      say(`Done: ${m.t}.`, `what I did is under it in ${f.name}`);
      void board.note(m.t, `did: ${cut(said || "done", 160)} (${stamp()})`);
    } else {
      setPh("stuck"); setSaid(said || r.why || null);
      say("I could not do it.", "do it yourself in the window, or try again");
    }
  };
  // the first page opens once; the turn starts a moment after; leaving stops it and closes the tab
  const alive = useOwnTab(e, draft, first, () => sidRef.current, () => { window.setTimeout(() => { if (alive.current) void run(); }, 400); }, () => { if (turning.current) stop(); });
  // the sign-in wall: carried on once the tab has left the sign-in page
  useEffect(() => {
    if (ph !== "signin" || !tab?.url || tab.url === wall.current || SIGNIN.test(tab.url)) return;
    const t = window.setTimeout(() => { say("You are in. Carrying on.", "touch the window any time to take the wheel", "working"); void run({ again: true }); }, 1500);
    return () => window.clearTimeout(t);
  }, [ph, tab?.url]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the wheel: a press while it works stops it; the pages the person opens are kept
  const grab = () => {
    if (!turning.current || wheelRef.current) return;
    wheelRef.current = true; shown.current = []; setPh("wheel"); stop(); play("part", { level: 0.6 });
    say("You have the wheel. I watch.", "touch carry on when you want me to go on");
  };
  useEffect(() => { if (ph === "wheel" && tab?.url && shown.current[shown.current.length - 1] !== tab.url) shown.current.push(tab.url); }, [ph, tab?.url]);
  const carryOn = (o: { again?: boolean; shown?: string[] } = { again: true }) => {
    if (turning.current) return;
    wheelRef.current = false; click(2);
    say("Carrying on.", "touch the window any time to take the wheel", "working");
    void run(o);
  };

  const act: ReactNode = ph === "wheel" ? <Button h={32} acts onClick={() => carryOn({ again: true, shown: shown.current.length > 1 ? [...shown.current] : undefined })}>carry on</Button>
    : ph === "signin" ? <><Button h={32} flat onClick={() => { click(); onBack(); }}>later</Button><Button h={32} acts onClick={() => carryOn()}>I am in</Button></>
    : ph === "stuck" ? <><Button h={32} flat onClick={() => { click(); onBack(); }}>{`back to ${f.name}`}</Button><Button h={32} acts onClick={() => carryOn({})}>try again</Button></>
    : ph === "done" ? <Button h={32} acts onClick={() => { click(); onBack(); }}>{`back to ${f.name}`}</Button>
    : <Button h={32} flat onClick={() => { click(); stop(); onBack(); }}>stop</Button>;
  return (
    <Stage words={words} act={act} data={{ "data-do": ph }}>
      {() => (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, marginBottom: 12, flex: "none" }}>
            <span className="t-read" style={{ fontWeight: 600, flex: "none" }}>{m.t}</span>
            <span style={{ ...label, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab?.url ? `${hostOf(tab.url)}${pathOf(tab.url)}` : hostOf(first)} · {m.shown ? waiting(m.shown) : ""}</span>
          </div>
          {said && (ph === "done" || ph === "stuck") && <div className="t-read" style={{ marginTop: -4, marginBottom: 12, flex: "none", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} data-said>{said}</div>}
          <LiveWindow e={e} tab={tab} onGrab={grab} opening={`opening ${hostOf(first)}…`} data="do" />
        </>
      )}
    </Stage>
  );
}
