// How Sol sees you, the screens (BR1, #1615): mine/look/br1/you.html ported, its markup and class names kept so you.css
// draws them as the drawing does; what they say comes from the engine (store.ts over next.you.*), never from the drawing.
//   (Here for, the purpose step "What do you want Sol for?", is parked in br1-update: the screens start at Bring)
//   Bring     1  Bring your things in: three shelves, pre-ticked from next.you.suggest; the Mac's switch shown (Guide)
//   Reading   2  Reading, on this Mac: the ledger (rows open in place), Taking shape in words, the thrown count in the foot
//   Seen      3  How Sol sees you: the rows (a real table), the four ways, Open Sol
//   Opened    4  Sol opens: the line over the canvas with Back per item (drawn by mount.ts in its own root)
// Signed: marcocyl04-ux's agent (builder F).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { APPC, IC } from "./icons.ts";
import { EN, KO, READ_EN, READ_KO, type ReadWords, type Words } from "./strings.ts";
import { COL, ago, binWord, connTiles, connVia, dayLine, keyOf, keyShown, macAsks, paint, placesWords, rising, rowName, setupSummary, setupWords, shapes, shelf, strip, toolsOf, tookWords, type Reading as Read } from "./model.ts";
import { asksOf, fitOf, forming, placesOf } from "./circle-state.ts";
import Circle, { type Sel } from "./Circle.tsx";
import Picked from "./Picked.tsx";
import { known as knownOf } from "../../known.ts";
import * as Y from "./store.ts";
import ClaudeSwitch from "./Claude.tsx";
import type { Open, Perm, Question, Source } from "./types.ts";

const SRC_APP: Record<Source, string> = { "claude-sessions": "claudecode", "codex-sessions": "codex", apps: "apps", browser: "browser", "calendar-store": "calendar", notes: "notes", files: "files", projects: "code" };
const AI_APP: Record<string, string> = { "claude-code": "claudecode", codex: "codex", anthropic: "claude", openai: "chatgpt", google: "gemini" };
const CONN_APP: Record<string, string> = { "google drive": "gdrive", "google calendar": "gcal", github: "github", notion: "notion", slack: "slack", dropbox: "dropbox" };

export const words = (ko: boolean): Words => (ko ? KO : EN);
/** the longest How Sol sees you waits unseen for a reply (the picture, the AIs) before it shows what it has (#yu calm) */
export const WAIT = 1500;

// ---- the marks
export function Ic({ k, c = "" }: { k: string; c?: string }) {
  return <svg className={`ic ${c}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[k] ?? "" }} />;
}
export function Jelly({ s }: { s: number }) {
  const id = `yjg${s}`;
  return (
    <svg className="jelly" width={s} height={s} viewBox="0 0 48 48" aria-hidden="true">
      <defs><radialGradient id={id} cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#fff" /><stop offset=".28" stopColor="#FFD58A" /><stop offset=".55" stopColor="#FF8F7A" /><stop offset=".8" stopColor="#C08BFF" /><stop offset="1" stopColor="#6FB8FF" /></radialGradient></defs>
      <path d="M24 4c11 0 20 8.2 20 19.5 0 9.8-7.2 18.5-20 18.5S4 33.3 4 23.5C4 12.2 13 4 24 4z" fill={`url(#${id})`} />
      <ellipse cx="17" cy="15" rx="6" ry="3.4" fill="#fff" opacity=".55" transform="rotate(-24 17 15)" />
    </svg>
  );
}
/** an app's tile (the design's appi): a glyph on its colour, until Sol.app can give the face the real icon */
export function App({ k, sz = 30, name }: { k: string; sz?: number; name?: string }) {
  const c = APPC[k] ?? ["var(--side)", (name ?? "?").slice(0, 1).toUpperCase()];
  const dark = /#1|#0|#111|#D9|#EA|#0061|gradient\(#5|gradient\(#7|gradient\(135deg,#4F/.test(c[0]) && !/#fff$/.test(c[0]);
  const red = k === "calendar" || k === "gcal";
  const st: CSSProperties = { width: sz, height: sz, background: c[0], display: "grid", placeItems: "center", boxShadow: "0 0 0 1px rgba(29,28,26,.12) inset", font: `800 ${Math.round(sz * 0.46)}px var(--disp)`, color: red ? "#C8262C" : dark ? "#fff" : APPC[k] ? "#1D1C1A" : "var(--ink)" };
  return <span className="app" style={st} aria-hidden="true">{c[1]}</span>;
}
const Said = () => { const s = Y.useYou((x) => x.said); return s ? <p className="said" role="status">{s}</p> : null; };

// ------------------------------------------------------------------------------------------------ 1 · Bring your things in
/** the AIs and connectors while their answer is out: "Asking …", and when none came (refused, or none in 15 s), so said with
 *  Ask again, never a card left empty or asking for good (BR1 conform #14) */
function Asking({ s, what }: { s: Y.St; what: string }) {
  return s.accountsNo
    ? <div className="acct" data-asking="no"><span className="tx"><span>Sol could not ask {what}.</span></span><button className="signin ghost" onClick={() => Y.askAccounts()}>Ask again</button></div>
    : <div className="acct" data-asking=""><span className="tx"><span>Asking {what}…</span></span></div>;
}
export function Bring({ T }: { T: Words }) {
  const s = Y.useYou((x) => x);
  const ko = s.ko, rows = shelf(s.suggest, new Set(s.ticked), s.perms, ko), n = Y.count(), asks = macAsks(rows);
  const ais = (s.accounts?.ais ?? []).filter((a) => a.present || a.signedIn);
  const conns = connTiles(s.accounts);
  const [key, setKey] = useState("");
  const tryKey = (k: string) => { const v = k.trim(); if (v) { Y.addKey(v, keyOf(v)?.id ?? null); setKey(""); } };
  return (
    <>
      <div className="bi">
        <div className="bih"><Jelly s={34} /><div><h2>{T.biH}</h2><p>{T.biS}</p></div></div>
        <div className="shelves">
          <div className="shelf" role="group" aria-label={T.onMac}>
            <h3>{T.onMac}</h3><p>{T.onMacS}</p>
            {asks.length ? <button className="perm" title={`${T.macLine(asks.length)}. ${T.showMe}`} onClick={() => Y.guideAll(asks)}><Ic k="lock" />{T.permNeeded(asks.length)}<span aria-hidden="true">›</span></button> : null}
            {s.suggest ? rows.map((r) => (
              <div className="srow" key={r.source}>
                <App k={r.icon} />
                <div className="tx"><b>{r.name}</b><span>{r.gives}</span>
                </div>
                <span className={`tick ${r.on ? "on" : ""}`} role="checkbox" aria-checked={r.on} aria-label={r.name} tabIndex={0}
                  onClick={() => Y.tick(r.source)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); Y.tick(r.source); } }} />
              </div>
            )) : <div className="srow"><span className="tx"><span>Looking at what is on this Mac…</span></span></div>}
          </div>
          <div className="shelf ais" role="group" aria-label={T.aisH}>
            <h3>{T.aisH}</h3><p>{T.aisS}</p>
            <div className="accts">
            {s.accounts ? <ClaudeSwitch T={T} cls="yc-bring" /> : null}
            {s.accounts ? ais.map((a) => (
              <div className="acct" key={a.id}>
                <App k={AI_APP[a.id] ?? a.id} name={a.name} />
                <div className="tx"><b>{a.name}</b>{a.via === "key" && a.signedIn ? <span>key · {T.keyOk}</span> : null}</div>
                {a.signedIn ? <span className="state"><i />{T.connected}</span>
                  : a.via === "sign-in" ? <button className="signin ghost" onClick={() => Y.signIn(a.id)}>{T.signIn}</button>
                  : <button className="signin ghost" onClick={() => document.getElementById("yu-key")?.focus()}>{T.addKey}</button>}
              </div>
            )) : <Asking s={s} what="which AIs are signed in" />}
            </div>
            <div className="keyf">
              <b>{T.keyH}</b><br />{T.keyS}
              <div className="kin">
                {s.key?.state === "ok" ? <><App k={AI_APP[s.key.provider ?? ""] ?? "key"} sz={16} /> {keyShown(s.key.key)}<em><i />{keyOf(s.key.key)?.name} · {T.keyOk}</em></>
                  : <input id="yu-key" value={key} placeholder="sk-…, AIza…, gsk_…" aria-label={T.keyH} spellCheck={false} autoComplete="off"
                      onChange={(e) => setKey(e.target.value)} onPaste={(e) => { const v = e.clipboardData.getData("text"); if (v) { e.preventDefault(); tryKey(v); } }}
                      onKeyDown={(e) => { if (e.key === "Enter") tryKey(key); }}
                      style={{ flex: 1, border: 0, outline: "none", background: "transparent", font: "inherit", color: "inherit", minWidth: 0 }} />}
                {s.key?.state === "checking" ? <em>{keyShown(s.key.key)} · checking…</em> : null}
              </div>
              {s.key?.state === "no" ? <div style={{ color: "var(--hot)", marginTop: 4 }}>{s.key.why}</div> : null}
            </div>
          </div>
          <div className="shelf" role="group" aria-label={T.connH}>
            <h3>{T.connH}</h3><p>{T.connS}</p>
            {/* only what the engine found; a tile not connected only with a way to connect it from here (walk note w2) */}
            <div className="conns">
              {conns.map((c) => (
                <div key={c.name + c.via} className={`conn ${c.connected ? "on" : "to"}`}>
                  <App k={CONN_APP[c.name.toLowerCase()] ?? ""} name={c.name} /><b>{c.name}</b>
                  {c.connected ? <><span>{connVia(c)}</span><span className="state"><i /></span></>
                    : <><span>{connVia(c)}</span><button className="go" onClick={() => Y.connect(c.at!)}>{T.connect}</button></>}
                </div>
              ))}
            </div>
            {!s.accounts ? <Asking s={s} what="which connectors you have" /> : conns.length ? null : <div className="acct" data-none=""><span className="tx"><span>{T.connNone}</span></span></div>}
          </div>
        </div>
        <div className="bif">
          <div className="sv"><Ic k="sieve" /><span dangerouslySetInnerHTML={{ __html: T.sieveL }} /></div>
          <span className="skipw"><button className="btn quiet" aria-describedby="yu-skips" onClick={() => Y.skip()}>{T.skip}</button><span id="yu-skips" role="tooltip">{T.skipS}</span></span>
          <button className="btn primary" disabled={!n} style={n ? undefined : { opacity: 0.5 }} onClick={() => Y.bring()}>{T.bring(n)}</button>
        </div>
      </div>
      {s.guide ? <Guide T={T} p={s.guide} check={s.guideCheck} /> : null}
    </>
  );
}

/** the Mac's switch: System Settings is opened at the pane (by Sol.app) and this shows where to press, beside it */
function Guide({ T, p, check }: { T: Words; p: Perm; check: Y.GuideCheck }) {
  const side = ["Wi-Fi", "Bluetooth", "Network", "Notifications", "Sound", "Focus", "Screen Time", "General", "Appearance", "Accessibility", "Privacy & Security", "Desktop & Dock", "Displays"];
  const why = p.why ? p.why[0].toUpperCase() + p.why.slice(1).replace(/\.+$/, "") + "." : "";
  return (
    <div className="mx" role="dialog" aria-label={`${T.mxH}: ${p.name}`}>
      <div className="sset" aria-hidden="true">
        <div className="dots"><i /><i /><i /></div>
        <div className="side">{side.map((x) => <div key={x} className={x === "Privacy & Security" ? "on" : ""}><i />{x}</div>)}</div>
        <div className="main"><h4>‹ {p.name}</h4><p>{p.opens?.length ? `Sol could not open ${p.opens.join(", ")} without this.` : ""}</p>
          <div className="lst">
            <div className="lr"><App k="files" sz={22} /><span>…</span><i className="mtg on" /></div>
            <div className="lr sol"><App k="sol" sz={22} /><span><b>Sol</b></span><i className="mtg" /></div>
            <div className="lr"><App k="apps" sz={22} /><span>…</span><i className="mtg" /></div>
          </div>
        </div>
      </div>
      <svg className="hand" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2l13 11h-6.5l3.6 7.4-2.6 1.2-3.6-7.4L6 18.6z" fill="#fff" stroke="#1D1C1A" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      <div className="coach">
        <h4><Jelly s={22} />{T.mxH}</h4>
        <p>{why}</p>
        {/* step 3, "Press I did it and Sol checks", only where Sol can see the switch (granted is not null; walk note w1, sweep 1) */}
        <div className="stp now"><b>1</b>{T.mx1}</div><div className="stp"><b>2</b>{T.mx2}</div>{p.granted !== null ? <div className="stp"><b>3</b>{T.mx3}</div> : null}
        {check === "off" ? <p className="off" role="status">{T.stillOff(p.name)}</p> : check === "cant" ? <p role="status">{T.cantTell(p.name)}</p> : null}
        <div className="row">
          {check === "off" ? <button className="btn sm" onClick={() => Y.guide(p)}>{T.openAgain}</button> : null}
          {check === "cant"
            ? <button className="btn primary sm" onClick={() => Y.guideOn()}>{T.gotIt}</button>
            : <button className="btn primary sm" disabled={check === "checking"} onClick={() => Y.guideDone()}>{check === "checking" ? T.checking : T.mxDone}</button>}
          <button className="btn quiet sm" onClick={() => Y.guide(null)}>{T.mxNot}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 2 · Watching Sol read
/** Reading, on this Mac (mine/look/br1/reading.html, BR1 #1615): one focus, the ledger of what Sol reads, headed Read · Sol
 *  noticed · Sol will set up, no cell left blank (a row with nothing set up spans the two and says why); a row opens in
 *  place to what Sol took (looked at · kept · left alone) and the others dim; Taking shape beside it in words; the foot
 *  one row, with the sieve's count said only there. Rows the ledger has no room for fold into "N more read" */
export function Reading({ T }: { T: Words }) {
  const s = Y.useYou((x) => x);
  const [open, setOpen] = useState<number | null>(null);   // the row opened to what Sol took from it
  const [gone, setGone] = useState<string[]>([]);          // kept lines taken out with × (next.you.fact.forget)
  const [all, setAll] = useState(false);                   // the folded older rows opened
  const [room, roomOf] = useRoom<HTMLDivElement>();
  const r = s.read, done = !s.running && !!s.you;
  useEffect(() => {
    if (open == null) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [open]);
  if (s.skip) {
    return (
      <div className="center">
        <h2 className="h">{T.fromWords}</h2><p className="sub">{T.fromWordsS}</p>
        <div className="row"><button className="btn quiet" onClick={() => Y.go(1)}>← {T.back}</button><button className="btn primary" disabled={!done} onClick={() => Y.go(3)}>{done ? T.seeIt : `${T.together}`}</button></div>
      </div>
    );
  }
  const name = (src: Source) => shelf({ sources: [src], order: [], because: null }, new Set(), null, s.ko)[0]?.name ?? src;
  const order = r.order.length ? r.order : (s.suggest?.order ?? []).filter((x) => s.ticked.includes(x));
  // "What you said comes first" only once the person said something: an aim of their own (BR1 order 5; Here for is gone)
  const said = (s.you?.aims ?? []).some((a) => a.said);
  const day = r.day ?? (done && s.you ? s.you.day : null);
  const ais = (s.accounts?.ais ?? []).filter((a) => a.signedIn).map((a) => a.name);
  const R = s.ko ? READ_KO : READ_EN;
  const thrownN = (Object.values(r.thrown) as number[]).reduce((a, v) => a + (v ?? 0), 0);
  const skipped = (Object.entries(r.sources) as [Source, { state: string; line: string; perm?: string }][]).filter(([, v]) => v.state === "skipped");
  // the Mac's switches a skipped source waits on, once each: the foot's one ask (as on Bring your things in)
  const asks = [...new Map(skipped.map(([, v]) => (v.perm ? s.perms?.find((p) => p.id === v.perm) : undefined)).filter((p): p is Perm => !!p && p.granted !== true).map((p) => [p.id, p])).values()];
  const rows = r.lines.filter((l) => !l.bin);   // the sieve's rows are only its count, in the foot
  const cur = order.findIndex((src) => r.sources[src]?.state === "reading");
  const doneN = order.filter((src) => r.sources[src]?.state === "done").length;
  const waitSrc = done || s.stopping ? undefined : order.find((src) => (r.sources[src]?.state ?? "waiting") === "waiting");
  const now = done ? <span className="ok">✓ <b>{R.putTogether}</b> · {R.sourcesN(doneN)} · {tookWords(s.felt.read ?? r.lastAt)}</span>
    : s.stopping ? <b>{T.keeping}</b>
    : r.making ? <><i className="sp" /><b>{r.making}</b></>
    : cur >= 0 ? <><i className="sp" />{T.readingL} <b>{name(order[cur])}</b> · {R.ofN(cur + 1, order.length)}</>
    : <><i className="sp" />{T.readingL}…</>;
  // the rows the ledger has room for (a row is about 40 px); the older ones fold into "N more read", never while one is open
  const cap = roomOf.h ? Math.max(3, Math.floor((roomOf.h - (waitSrc ? 40 : 0)) / 40)) : rows.length;
  const fold = !all && open == null && rows.length > cap ? rows.length - (cap - 1) : 0;
  const shown = fold ? rows.slice(0, cap - 1) : rows;
  const opened = open == null ? null : rows.find((l) => l.n === open) ?? null;
  const q = done && s.you ? asksOf(s.you, new Set(s.dropped))[0] ?? null : null;
  return (
    <div className="wr rd">
      <div className="wrh"><h2>{T.reading2}</h2><div className="now" aria-live="polite">{now}</div></div>
      <div className="steer">{order.length && said && !done ? <>✦ {T.readFirst} <b>{(s.you?.aims ?? []).filter((x) => x.said).slice(0, 3).map((x) => x.w).join(", ")}</b></> : " "}</div>
      <div className="wrb">
        <div className={`rd-ledger ${open != null ? "rd-dim" : ""}`}>
          <div className="rd-lgh" aria-hidden="true"><span>{R.colRead}</span><span>{R.colNoticed}</span><span>{R.colSetup}</span><span /></div>
          <div className="rd-rows" ref={room} aria-live="polite">
            {shown.map((l, i) => {
              const on = open === l.n, nm = rowName(l, name(l.source as Source)), fresh = i === 0 && !done;
              const span = !l.setup, nothing = span && !!l.open && !l.open.kept.length;
              return (
                <div key={l.n} className={`rd-row ${on ? "open" : ""}`}>
                  <button className={`rd-ev ${span ? "span" : ""} ${fresh ? "fresh" : ""}`} aria-expanded={on} onClick={() => setOpen(on ? null : l.n)}>
                    <span className="it"><App k={SRC_APP[l.source as Source]} sz={22} /><span className="nm">{on ? <b>{nm.name}</b> : nm.name}{nm.small ? <small> {nm.small}</small> : null}</span></span>
                    <span className="no">{nothing ? R.nothingKept(l.notice) : l.notice}{fresh || (!done && rising(r, l)) ? <em> · {T.readingL}…</em> : null}</span>
                    {span ? null : <span className="su">{l.colour ? <i style={{ background: paint(l.colour) }} /> : "✦ "}{placeOf(l.setup) ?? l.setup}</span>}
                    <span className="rd-cv" aria-hidden="true">{on ? "⌄" : "›"}</span>
                  </button>
                  {on ? <div ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
                    {l.open ? <Took3 o={l.open} R={R} gone={gone} onX={(x) => { setGone((g) => [...g, x.k]); Y.forget(x.k, x.line); }} onAgain={() => Y.readAgain(l.source as Source, l.item)} />
                      : <Took l={l} R={R} ko={s.ko} />}
                  </div> : null}
                </div>
              );
            })}
            {fold ? <button className="rd-ev span rd-fold" onClick={() => setAll(true)}><span className="it">{R.moreRead(fold)}</span><span className="no" /><span className="rd-cv" aria-hidden="true">⌄</span></button> : null}
            {waitSrc ? <div className="rd-ev span wait"><span className="it"><App k={SRC_APP[waitSrc]} sz={22} /><span className="nm">{name(waitSrc)}<small> · {R.waiting}</small></span></span><span className="no">{R.next}</span><span className="rd-cv" /></div> : null}
            {!rows.length && !waitSrc ? <div className="rd-ev span wait"><span className="it">{done ? T.nothingRead : `${T.readingL}…`}</span></div> : null}
          </div>
          {done && rows.length <= 2 && !skipped.length ? <p className="rd-nearly">{R.nearly}<br />{R.nearly2}</p> : null}
        </div>
        <Shape r={r} day={day} ais={ais} skipped={skipped.map(([src]) => name(src))} done={done} opened={opened} q={q} T={T} R={R} ko={s.ko}
          answered={q ? s.answered[q.n] : undefined} />
      </div>
      <div className="wrf">
        <button className="btn quiet backb" onClick={() => Y.go(1)}>← {T.back}</button>
        <div className="sv"><span className="sg"><Ic k="sieve" /></span><span>{thrownN ? <><b>{R.thrownN(thrownN)}</b>{R.thrownS}</> : done ? R.nothingPrivate : R.nothingYet}</span></div>
        {asks.length ? <button className="perm" title={`${T.macLine(asks.length)}. ${T.showMe}`} onClick={() => Y.guideAll(asks)}><Ic k="lock" />{T.permNeeded(asks.length)}<span aria-hidden="true">›</span></button> : null}
        {done ? <button className="btn primary" onClick={() => Y.go(3)}>{T.seeIt2} →</button>
          : <button className="btn" disabled={s.stopping} onClick={() => Y.stopRead()}>{T.stopKeep}</button>}
      </div>
    </div>
  );
}

/** a read row opened, in three parts the same for every source and person (reading.html screen 2): what Sol looked at, what
 *  it kept (each line with where it came from; × takes it out, and Sol remembers: next.you.fact.forget), what it left alone */
function Took3({ o, R, gone, onX, onAgain }: { o: Open; R: ReadWords; gone: string[]; onX: (x: Open["kept"][number]) => void; onAgain: () => void }) {
  const kept = o.kept.filter((x) => !gone.includes(x.k));
  return (
    <div className="rd-took">
      <div className="c"><div className="k">{R.looked}</div>{o.looked.map((x) => <div className="l" key={x}>· {x}</div>)}</div>
      <div className="c"><div className="k">{R.keptH}</div>
        {kept.length ? kept.map((x) => (
          <div className="kept" key={x.k}><div className="l"><b>{x.line}</b><button className="x" title={R.notThis} aria-label={`${R.notThis}: ${x.line}`} onClick={() => onX(x)}>×</button></div><small>{x.from}</small></div>
        )) : <div className="l">{R.nothingKept("")}</div>}
      </div>
      <div className="c"><div className="k">{R.leftH}</div>{o.left.map((x) => <div className="l" key={x}>· {x}</div>)}</div>
      <div className="foot"><span>{R.xSays}</span><span>·</span><button className="link" onClick={onAgain}>{R.again}</button><span>·</span><span>{R.esc}</span></div>
    </div>
  );
}

/** a box's width and height as laid out, again when it changes (whole pixels, so a picture sized from it settles) */
function useRoom<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null), [room, setRoom] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width), h = Math.floor(e.contentRect.height);
      setRoom((o) => (Math.abs(o.w - w) < 2 && Math.abs(o.h - h) < 2 ? o : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, room];
}

const AI_OF: Record<string, [string, string]> = { claude: ["claudecode", "Claude Code"], codex: ["codex", "Codex"] };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** a read row opened: what Sol took from it, drawn (BR1 rapid 13:05, #1615). A folder: what Sol thinks it is, its kinds
 *  of files, its sessions per AI as bars, when it was last active; a browser: its sites as one bar by what they are for,
 *  each kind with its most visited; a file: its kind as a page with the extension on it, where it is and when it changed
 *  (Sol never opens a file, so it has no "what it said"); a thrown row: what the sieve did. Then, always, the one line it
 *  adds to how Sol sees you */
function Took({ l, R, ko }: { l: Read["lines"][number]; R: ReadWords; ko: boolean }) {
  const m = l.more;
  if (l.bin) return <div className="rtk"><p className="is q">{R.leftS(l.binK ? binWord(l.binK, ko) : "")}</p></div>;
  if (!m) return <div className="rtk"><p className="is">{l.notice}</p>{l.setup ? <p className="adds"><b>{R.adds}</b>{l.setup}</p> : null}</div>;
  const row = (k: string, v: ReactNode) => <div className="tr"><span className="k">{k}</span><span className="v">{v}</span></div>;
  const ss = (Object.entries(m.sessions ?? {}) as [string, number][]).filter(([, n]) => n > 0), top = Math.max(1, ...ss.map(([, n]) => n));
  const gs = m.groups ?? [], all = gs.reduce((a, g) => a + g.n, 0) || 1;
  const ext = /\.([a-z0-9]{1,5})$/i.exec(m.name)?.[1]?.toUpperCase();
  const is = m.is && m.is.toLowerCase() !== l.notice.toLowerCase() ? cap(m.is) : "";   // the row already says its noticed line
  const sub = [m.where ? `${R.where} ${m.where}` : "", m.open ? R.open : ""].filter(Boolean).join(" · ");
  return (
    <div className={`rtk ${m.kind}`}>
      <div className="tkh">
        {m.kind === "file" ? <span className="doc" aria-hidden="true">{ext ?? ""}</span> : null}
        {is || sub ? <p className="is">{is}{sub ? <span className="wh">{is ? " · " : ""}{sub}</span> : null}</p> : null}
      </div>
      {m.kinds?.length ? row(R.kinds, <span className="rchips">{m.kinds.map((k) => <i key={k}>{k}</i>)}</span>) : null}
      {ss.length ? row(R.worked, <span className="rbars">{ss.map(([ai, n]) => { const [app, nm] = AI_OF[ai] ?? [ai, cap(ai)]; return <span className="rbar" key={ai}><App k={app} sz={16} /><b style={{ width: `${Math.max(6, (n / top) * 100)}%` }} /><em>{R.withAi(n, nm)}</em></span>; })}</span>) : null}
      {gs.length ? (
        <div className="sites">
          <div className="stack" role="img" aria-label={gs.map((g) => `${R.group[g.what] ?? g.what} ${g.n}`).join(", ")}>{gs.map((g, i) => <i key={g.what} style={{ flexGrow: g.n / all, background: paint(null, i) }} />)}</div>
          <div className="legend">{gs.map((g, i) => <div key={g.what}><i style={{ background: paint(null, i) }} /><b>{R.group[g.what] ?? cap(g.what)}</b><span>{g.sites.join(", ")}</span></div>)}</div>
        </div>
      ) : null}
      {m.kind === "sites" && m.n ? row(R.sites(m.n), "") : null}
      {m.kind === "notes" && m.n ? row(R.notes(m.n), "") : null}
      {(m.kind === "skill" || m.kind === "tool") && m.n ? row(m.by ?? "", R.used(m.n)) : null}
      {m.at ? row(R.on, new Date(m.at).toLocaleDateString(ko ? "ko" : "en", { weekday: "short", month: "short", day: "numeric" })) : null}
      {m.last ? row(R.last, ago(m.last, ko)) : null}
      {m.kind === "file" ? <p className="never">{R.never}</p> : null}
      <p className="adds"><b>{R.adds}</b>{m.adds}</p>
    </div>
  );
}

/** Taking shape, in words (reading.html): your places in one sentence with their share as one bar; your day in one sentence
 *  with its 24 hours under it; the AIs, skills and tools as chips. While a row is open: what that row added. Done: at most
 *  one question, inside it, never a pop-up. Words come first: the hours are what goes when there is no room */
/** the place a set-up tag names ("Place: Client sites" → "Client sites"); the swatch beside it already says it is a place */
const placeOf = (setup?: string) => /^(?:Place|공간):\s*(.+)$/.exec(setup ?? "")?.[1];

function Shape({ r, day, ais, skipped, done, opened, q, answered, T, R, ko }: {
  r: Read; day: { hours: number[]; quiet: [number, number] | null } | null; ais: string[]; skipped: string[]; done: boolean;
  opened: Read["lines"][number] | null; q: (Question & { n: number }) | null; answered: string | undefined; T: Words; R: ReadWords; ko: boolean;
}) {
  const { shown } = placesOf(forming(shapes(r)), new Set(), false);
  const sentence = placesWords(shown.map(({ part: p }) => ({ name: p.name, share: p.share })), ko);
  const colour = (id: string, i: number) => paint(r.places.find((x) => x.id === id)?.colour, i);
  const g = toolsOf(r, ais);
  // the apps a row named ("Figma, Affinity"), with the tools the sessions used
  const apps = r.lines.filter((l) => l.source === "apps" && l.more?.kind === "app").flatMap((l) => l.more!.name.split(/,\s*/)).filter((x) => x && !/^\d/.test(x) && x.toLowerCase() !== "apps");
  const chips = [...new Set([...g.ais, ...g.tools, ...apps])];
  const hasDay = !!day && day.hours.some((v) => v > 0);
  const top = Math.max(1e-9, ...(day?.hours ?? [0]));
  // a row that made a place says so in a sentence; what else it adds follows when the engine says more than the tag
  const made = placeOf(opened?.setup), adds = opened?.more?.adds && opened.more.adds !== opened.setup ? opened.more.adds : "";
  const from = !opened ? "" : made ? <>{R.madePlace[0]}<b>{made}</b>{R.madePlace[1]}{adds ? ` ${adds}` : ""}</> : adds || opened.setup || opened.notice;
  return (
    <div className="rd-shape">
      <div><div className="k">{R.placesH}</div>
        <div className="sec">{sentence.length ? sentence.map((x, i) => (x.b ? <b key={i}>{x.b}</b> : <span key={i}>{x.t}</span>)) : done ? R.noPlaces : <span className="fill">{T.readingL}…</span>}
          {shown.length ? <div className="share" role="img" aria-label={shown.map(({ part: p }) => `${p.name} ${Math.round((p.share ?? 0) * 100)}%`).join(", ")}>{shown.map(({ part: p }, i) => <i key={p.id} style={{ width: `${(p.share ?? 0) * 100}%`, background: colour(p.id, i) }} />)}</div> : null}
        </div>
      </div>
      {opened ? <div><div className="k">{R.fromRow}</div><div className="sec">{from}</div></div> : <>
        <div><div className="k">{T.dayL}</div>
          <div className="sec">{hasDay ? dayLine(day!.hours, day!.quiet) : done ? T.learns : <span className="fill">{T.readingL}…</span>}
            {hasDay && !q ? <div className="hours" role="img" aria-label={dayLine(day!.hours, day!.quiet)}>{day!.hours.map((v, h) => <i key={h} style={{ height: `${2 + Math.round((v / top) * 16)}px` }} />)}</div> : null}
          </div>
        </div>
        <div><div className="k">{T.aisL}</div>
          <div className="sec"><div className="rd-chips">
            {chips.map((c) => <span key={c}>{c}</span>)}
            {g.skills.length ? <span>{R.skillsN(g.skills.length)}</span> : null}
            {!done ? <span className="fill">{T.readingL}…</span> : !chips.length && !g.skills.length ? <span className="fill">{R.none}</span> : null}
          </div></div>
        </div>
        {skipped.length ? <div><div className="k">{R.notRead}</div><div className="sec">{skipped.join(", ")}</div></div> : null}
      </>}
      {q && !opened ? (
        <div className="ask" role="group" aria-label={q.q}>{R.couldnt} {q.q}{" "}
          {answered ? <b>{answered}</b> : <><button className="link" onClick={() => Y.answer(q.n, "Yes", true)}>Yes</button> · <button className="link" onClick={() => Y.answer(q.n, "No", false)}>No</button></>}
        </div>
      ) : null}
    </div>
  );
}

function Hours({ day, quiet, own, col, label }: { day: number[]; quiet: [number, number] | null; own?: number[]; col?: string; label?: string }) {
  return (
    <div className="hr24" role="img" aria-label={label ?? dayLine(day, quiet)}>
      {strip(day, quiet, own).map((h, i) => (h.q ? <i key={i} className="q" /> : <i key={i} style={{ opacity: h.o, ...(col ? { background: col } : {}) }} />))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ 3 · How Sol sees you
export function Seen({ T, look, big }: { T: Words; look: { swatch: string; name: string }; big: boolean }) {
  const s = Y.useYou((x) => x);
  const y = s.you;
  const [sel, setSel] = useState<Sel>(null);
  const [needs, setNeeds] = useState(false);   // what needs the person, gathered into one line until pressed (#yu calm)
  const [ref, room] = useRoom<HTMLDivElement>();
  // the circle in the room beside the pressed card, as tall as the screen leaves it; every fact by its k
  const pic = useMemo(() => (y && room.w ? fitOf(y, { w: room.w, h: room.h, outside: false, dropped: new Set(s.dropped), more: s.more, levels: s.levels }) : null), [y, room.w, room.h, s.dropped, s.more, s.levels]);
  const known = useMemo(() => new Map(knownOf("you", { you: y, dropped: s.dropped }).map((f) => [f.k, f])), [y, s.dropped]);
  // #yu calm (BR1): drawn once, when settled: the picture and the AIs both come before it shows (WAIT at most), and the
  // page stays unseen until the circle has its room, so nothing fills in or grows after it appears
  const [late, setLate] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLate(true), WAIT); return () => clearTimeout(t); }, []);
  if (!y || (!s.accounts && !late)) return <div className="center"><Jelly s={46} /><h2 className="h">{T.together}</h2></div>;
  const settled = late || !!pic;
  const dropped = new Set(s.dropped), { small } = placesOf(y, dropped, s.more);
  const colour = (id: string, i: number) => paint(s.read.places.find((x) => x.id === id)?.colour, i);
  const madeFolder = new Set(y.setup.filter((x) => x.kind === "place").map((x) => (x as { id: string }).id));
  const asks = asksOf(y, dropped);
  const hasDay = y.day.hours.some((v) => v > 0);
  const ais = (s.accounts?.ais ?? []).filter((a) => a.signedIn);
  const dropName = s.lastDrop ? y.parts.find((p) => p.id === s.lastDrop)?.name : null;
  const Q = ({ q }: { q: Question & { n: number } }) => {
    const yes = "Yes", no = "No";   // a check only: no "Add it as an aim?" (#yu calm; aims parked after BR1)
    // answered, the question leaves with the engine's reply; a word is kept only on an engine with no keys
    const a = s.answered[q.n], wait = !a && !!q.k && s.asking.includes(q.k);
    return (
      <div className={`rq ${a ? "done" : ""}`} role="group" aria-label={q.q} aria-busy={wait}>
        <b aria-hidden="true">?</b><span>{q.q}</span>
        {a ? <span className="picked">{a}</span> : wait ? <span className="picked">{T.telling}</span> : <><button onClick={() => Y.answer(q.n, yes, true)}>{yes}</button><button onClick={() => Y.answer(q.n, no, false)}>{no}</button></>}
      </div>
    );
  };
  const ways: ReactNode[] = [];
  if (hasDay) ways.push(<div className="way" key="days"><h5>{T.daysW}</h5><Hours day={y.day.hours} quiet={y.day.quiet} /><p>{dayLine(y.day.hours, y.day.quiet)}</p></div>);
  ways.push(<div className="way" key="look"><h5>{T.lookW}</h5><div className="lk"><i style={{ background: look.swatch }} />{look.name}</div></div>);
  if (ais.length) ways.push(<div className="way" key="ais"><h5>{T.aisW}</h5>{ais.slice(0, 2).map((a) => <div className="ai2l" key={a.id}><i>{(APPC[AI_APP[a.id] ?? ""]?.[1]) ?? a.name[0]}</i>{a.name} <span>{a.via === "key" ? "key" : "signed in"}</span></div>)}</div>);
  return (
    <>
      <div className={`pv ${big ? "big" : ""}`} aria-busy={!settled} style={settled ? undefined : { visibility: "hidden" }}>
        <div className="pvh"><Jelly s={34} /><div>
          <h1 style={{ font: "900 25px/1.15 var(--disp)", letterSpacing: "-.015em", margin: "0 0 7px", maxWidth: 780 }}>{y.headline}</h1>
        </div></div>
        <div className="pvb">
          <div className="kn-seen">
            <div className="kn-room" ref={ref}>
              {pic ? <Circle size="full" calm={T.picture} pic={pic} sel={sel} colour={colour} claude={false}
                onChip={(id) => setSel((o) => (o && "chip" in o && o.chip === id ? null : { chip: id }))}
                onPlace={(id) => setSel((o) => (o && "place" in o && o.place === id ? null : { place: id }))} /> : null}
            </div>
            <aside className="kn-side" aria-label="How Sol sees you">
              <Picked T={T} sel={sel} setSel={setSel} known={known} made={madeFolder} />
              {small.length && !s.more ? <p className="kn-more"><button className="link" onClick={() => Y.more(true)}>{T.more(small.length)}</button> · {small.map((r) => r.part.name).join(", ")}</p> : null}
              {/* #yu calm (BR1): what needs the person is one line at rest; pressed, its questions unfold */}
              {asks.length ? <button type="button" className="rq-need" aria-expanded={needs} onClick={() => setNeeds((o) => !o)}>
                <b aria-hidden="true">?</b>{T.need(asks.filter((q) => !s.answered[q.n]).length || asks.length)}<i aria-hidden="true">{needs ? "▴" : "▾"}</i></button> : null}
              {needs ? asks.map((q) => <Q key={q.k ?? q.n} q={q} />) : null}
              {/* Your days / look / AIs beside the circle, never under the footer (BR1 first-timer 06:48) */}
              <div className="ways">{ways}</div>
            </aside>
          </div>
        </div>
        <div className="pvf">
          <button className="btn quiet backb" onClick={() => Y.go(2)}>← {T.back}</button>
          <p>{dropName ? <>{dropName} taken out · <button className="link" onClick={() => Y.undrop(s.lastDrop!)}>{T.back}</button></> : T.allSet}{y.read.digest ? <span className="pv-used"> · <button className="link" onClick={() => Y.used(true)}>{T.used}</button></span> : null}</p>
          {y.read.by === "none" ? null : <label className="again" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer" }}>
            <i className={`mini ${s.weekly ? "on" : ""}`} role="switch" aria-checked={s.weekly} tabIndex={0} onClick={() => Y.weekly(!s.weekly)} onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); Y.weekly(!s.weekly); } }} />{T.again}</label>}
          <button className="btn primary big" onClick={() => Y.open()}>{T.open}</button>
        </div>
      </div>
      {s.used ? (
        <div className="modal" style={{ display: "grid" }} role="dialog" aria-label={T.used} onClick={(e) => { if (e.target === e.currentTarget) Y.used(false); }}>
          <div className="box"><h4>{T.used}</h4>
            <p>{y.read.made === "claude" ? "All of this was read on this Mac. Only these lines went to Claude to make the picture. Nothing else left." : "All of this was read and summed up on this Mac. Nothing left it."}</p>
            <pre>{y.read.digest}</pre><button className="btn sm" onClick={() => Y.used(false)}>Close</button></div>
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ 4 · Sol opens
/** the line over Sol's canvas: what was set up, Back per item and for all of it, then gone when closed */
export function Opened({ T, onClose }: { T: Words; onClose: () => void }) {
  const a = Y.useYou((x) => x.applied), you = Y.useYou((x) => x.you);
  if (!a) return null;
  const items = a.items.filter((x) => x.ok), back = new Set(a.back);
  const sum = setupSummary(items.filter((x) => !back.has(x.i)));
  return (
    <div className="strip" role="status" aria-label={T.setFor}>
      <span className="sp">✦</span><b>{T.setFor}</b>
      <span className="t">{sum.length ? sum.join(" · ") : you?.read.by === "none" ? "what you told Sol" : "nothing yet"}</span>
      {items.map((x) => <span key={x.i} className={`it ${back.has(x.i) ? "gone" : ""}`}>{x.label}{back.has(x.i) ? null : <button aria-label={`${T.back}: ${x.label}`} onClick={() => Y.back(x.i)}>↶</button>}</span>)}
      <span className="grow" />
      {items.some((x) => !back.has(x.i)) ? <button className="btn sm" onClick={() => Y.backAll()}><Ic k="back" /> {T.back}</button> : null}
      <button className="btn sm quiet" aria-label="Close" onClick={onClose}>×</button>
    </div>
  );
}

/** the move-in's screens in one frame; `look` is the face's own (dark, big, contrast, calm) */
export default function You({ look }: { look: string }) {
  const step = Y.useYou((s) => s.step), ko = Y.useYou((s) => s.ko);
  const T = words(ko);
  const lk = look.includes("dark") ? { swatch: "#16151A", name: "Dark" } : look.includes("contrast") ? { swatch: "#FFFFFF", name: "High contrast" } : { swatch: "#FBFAF7", name: look.includes("big") ? "Light · large text" : look.includes("calm") ? "Light · calm" : "Light" };
  return (
    <div className="yf">
      {step === 1 ? <Bring T={T} /> : step === 2 ? <Reading T={T} /> : <Seen T={T} look={lk} big={look.includes("big")} />}
      <Said />
    </div>
  );
}
export { COL, setupWords };
