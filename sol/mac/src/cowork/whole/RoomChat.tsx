// Cowork › Agents' room as the group's chat (#1417, objective 1 step 11; the picture agreed in the review of 2026-11-17).
// On top the members: each person and their agent, from the team's read (never a list here), an agent ringed in its
// person's colour (the palette set's six, through the kit). Under it, slim, what waits on me with the same press as on
// its stage. Then the chat: the group's lines and the agents' thread in time order, a settled ask one line each, and
// under every line its read rule as the engine says it happened (team.chat `said`). An artifact on a line is a chip
// that opens it, with a review press. The box at the foot completes an @ over the members and can put a PR link or a
// block of my stage on the line. Live: read again every 10 s while it is open (the engine reads the group's store
// quicker for as long), and at once when a line comes.
// Gate one (#1740): the room follows its switch, reach.room (roomSwitch.ts): off, nothing of it is drawn. With no table
// yet, or no identity (no GitHub, not signed in to Sol's cloud), it is a room of me and my own AI: a local "me" when there
// is no login, a line naming my AI opens a talk of mine with it (nothing goes to a group there is not), the empty page
// says how to start, and while there is an identity, one press hands my AI the words to set up a table just for me.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_SET, Press, litOf } from "../../kit";
import { askedBy } from "../../stage/kinds/Frame";
import type { Block } from "../../stage/model";
import { CFG, enter, follow, type Follow } from "../../motion";
import { composing } from "../../ime";
import { link } from "../../socket";
import { ENGINE } from "../../useEngine";
import { askEngine } from "../askEngine";
import { openUrl } from "../util";
import { Who } from "../bits";
import { alone, answers, artifactOfUrl, askMine, askMineSolo, atOptions, atQuery, colourIndex, emptyWords, JUST_ME, nameOf, namesMyAgent, pickAt, reviewOf, withMe, type Artifact, type ChatLine, type Member } from "./room-chat";
import { useRoomOn } from "./roomSwitch";
import "./room-chat.css";

type RoomBlock = Block & { project: string };
// table: whether this Sol sits at any table (the engine's team.chat; absent from an older engine, read as yes)
export type ChatRead = { me: string; group?: string; table?: boolean; members: Member[]; waiting: RoomBlock[]; lines: ChatLine[]; stage?: { id: string; title: string }[]; readAt: number };
/** how often the room reads again while it is open: the engine's quick read of the group's store is as often (#1417) */
const EVERY = 10_000;
const SIX = litOf(DEFAULT_SET).jelly.six;   // the pieces' set (rules.md 15), never the jelly's pure six
const KIND: Record<Artifact["kind"], string> = { pr: "PR", diff: "diff", file: "file", block: "block" };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** the Room tab: reads team.chat while open, says plainly when the engine could not read */
export function RoomChat() {
  const on = useRoomOn();
  const [d, setD] = useState<ChatRead | null>(null);
  // my lines to my own AI while the room has no table (solo): kept in this window only, the talk with my AI is the record
  const [mine, setMine] = useState<ChatLine[]>([]);
  const [setting, setSetting] = useState("");
  const [error, setError] = useState("");
  const [n, setN] = useState(0);
  const [pressing, setPressing] = useState("");
  useEffect(() => {
    if (!on) return;
    let gone = false;
    const read = () => void askEngine("team.chat", { open: true }, 20_000).then((r: any) => {
      if (gone) return;
      if (r?.error) { setError(r.error === "not connected" ? "the engine is not running" : r.error); return; }
      setError(""); setD(r as ChatRead);
    });
    read();
    const t = window.setInterval(read, EVERY);
    // a line said anywhere in the group comes at once; the agents' answers with the next read
    const off = link(ENGINE).on((m: any) => { if (m?.type === "team.talk.line" && m.thread === "general") read(); });
    return () => { gone = true; window.clearInterval(t); off(); };
  }, [n, on]);
  const press = (b: RoomBlock, choice: string) => {
    setPressing(b.id);
    // the same press as on the stage (work.stage.press), in the session the artifact sits in: answered once by the engine
    void askEngine("work.stage.press", { sessionId: b.asks?.by ?? b.sessions[0], id: b.id, choice }, 20_000).then(() => { setPressing(""); setN((x) => x + 1); });
  };
  const who = withMe(d?.me, d?.members ?? []);
  const solo = who.local || d?.table === false;
  // a talk of mine with my own AI on these words (#1677), its session opened by the engine as any new talk's
  const toMyAi = (text: string) => { const sessionId = crypto.randomUUID(); return link(ENGINE).send({ type: "work.say", sessionId, text, fresh: true, mode: "default" }) ? sessionId : ""; };
  const say = async (text: string, artifact?: Artifact) => {
    if (solo) {
      // no table to say it at: only my own AI can read it, so a line without its @ goes nowhere and says so
      if (!namesMyAgent(text, who.me)) return `there is no table yet, so a line reaches nobody: write @${who.me}'s agent for your own AI`;
      const sessionId = toMyAi(askMineSolo(text));
      if (!sessionId) return "your AI could not be reached: the engine is not answering";
      setMine((m) => [...m, { id: `mine-${sessionId}`, at: Date.now(), from: who.me, agent: false, text, kind: "said", session: sessionId,
        rule: { read: [who.me], pinged: [], refused: [], runs: 1 }, said: ["read by your agent in a talk of yours · your usage"] }]);
      return "";
    }
    const r: any = await askEngine("team.talk", { thread: "general", text, ...(artifact ? { artifact: { kind: artifact.kind, ref: artifact.ref, title: artifact.title } } : {}) }, 30_000);
    if (!r?.ok) return String(r?.error ?? "that did not go out");
    // a line naming my own agent (#1677): a talk of mine with my AI on those words, which answers in the room (the
    // engine's rule under the line says my agent read it, team/chatline.ts chatOf)
    if (d && namesMyAgent(text, d.me) && !link(ENGINE).send({ type: "work.say", sessionId: crypto.randomUUID(), text: askMine(text, d.group), fresh: true, mode: "default" })) {
      setN((x) => x + 1);
      return "said in the room, but your AI could not be reached: the engine is not answering";
    }
    setN((x) => x + 1);
    return "";
  };
  // the press "set up a table just for me" (gate one q2): my own words to my AI, which makes it on Sol's cloud
  const justMe = () => { setSetting(toMyAi(JUST_ME) ? "your AI is setting up a table just for you; it shows here once made" : "your AI could not be reached: the engine is not answering"); setN((x) => x + 1); };
  if (!on) return null;
  if (!d) return <div className="cw-pad">{error ? <p className="cw-dim">Could not read the room: {error}. <button className="cw-link" data-act="read again" onClick={() => setN((x) => x + 1)}>read again</button></p> : <p className="cw-dim">reading the room…</p>}</div>;
  return <RoomChatView d={{ ...d, me: who.me, members: who.members, lines: solo ? [...d.lines, ...mine] : d.lines }} local={who.local} solo={solo} pressing={pressing} press={press} say={say}
    justMe={solo && !who.local ? justMe : undefined} setting={setting} />;
}

/** the room from one read (a picture of it takes a fixture) */
export function RoomChatView({ d, pressing = "", press, say, local = false, solo = false, justMe, setting = "" }: {
  d: ChatRead; pressing?: string; press?: (b: RoomBlock, choice: string) => void; say?: (text: string, a?: Artifact) => Promise<string>;
  local?: boolean; solo?: boolean; justMe?: () => void; setting?: string;
}) {
  const colour = (login: string): CSSProperties => ({ ["--ring" as string]: SIX[colourIndex(d.members, login) % SIX.length] });
  const scroller = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), seen = useRef<Set<string> | null>(null);
  const [flw, setFlw] = useState<Follow | null>(null);
  useEffect(() => {
    if (!scroller.current || !inner.current) return;
    const f = follow(scroller.current, inner.current);
    setFlw(f); f.jump();
    return () => { f.destroy(); setFlw(null); };
  }, []);
  // a line that just came slides in (motion.ts); the first read only lays them down
  useLayoutEffect(() => {
    const had = seen.current;
    seen.current = new Set(d.lines.map((l) => l.id));
    if (!had || !inner.current) return;
    inner.current.querySelectorAll<HTMLElement>("[data-line]").forEach((el) => { if (!had.has(el.dataset.line!)) enter(el, { y: 10, cfg: CFG.travel }); });
  }, [d.lines]);
  useEffect(() => { flw?.jump(); }, [flw]);
  const people = d.members.filter((m) => !m.agent).length;
  return (
    <div className="rc" data-room="chat">
      <header className="rc-members" aria-label="members">
        {d.members.map((m) => (
          <span key={nameOf(m)} className={`rc-member ${m.agent ? "agent" : ""}`} style={colour(m.login)} title={nameOf(m)}>
            <span className="rc-face"><Who login={m.login} size={16} /></span>
            <span className="rc-member-name">{nameOf(m)}</span>
          </span>
        ))}
        <span className="rc-count">{solo ? "just you and your AI" : <>{d.group ? `${d.group} · ` : ""}{d.members.length}{people ? ` · ${people} people and their agents` : ""}</>}</span>
      </header>
      {(justMe || setting) && (
        <div className="rc-start" data-room="start">
          {setting ? <p className="cw-dim" role="status">{setting}</p>
            : <button className="rc-go" data-act="set up a table just for me" onClick={justMe}>set up a table just for me</button>}
        </div>
      )}
      {d.waiting.length > 0 && (
        <div className="rc-strip" data-room="waiting" aria-label="waits on you">
          {d.waiting.map((b) => (
            <div key={b.id} className="rc-wait" data-block={b.id} data-act="the press answers it" aria-busy={pressing === b.id}>
              <span className="rc-wait-title">{b.title}</span>
              <Press q={b.asks!.q} choices={b.asks!.choices} said={askedBy(b)} later={!!b.asks!.later} onPress={pressing || !press ? undefined : (c) => press(b, c)} />
            </div>
          ))}
        </div>
      )}
      <div className="rc-scroll" ref={scroller}>
        <div className="rc-lines" ref={inner} data-room="thread">
          {d.lines.length === 0 && (() => {
            // alone at the table (#1677), no table, or no identity (#1740): my own AI is the one who can read a line, so
            // the page says how to reach it, and how to start, in plain words
            const lone = alone(d.members, d.me);
            return <p className="cw-dim rc-empty" data-room={local ? "local" : solo ? "solo" : lone ? "alone" : "empty"}>{emptyWords({ me: d.me, local, solo, alone: lone })}</p>;
          })()}
          {d.lines.map((l) => l.kind === "settled" ? (
            <p key={l.id} data-line={l.id} className="rc-settled"><span className="cw-dim">{time(l.at)}</span> {l.text}</p>
          ) : (
            <section key={l.id} data-line={l.id} className={`rc-line ${l.agent ? "agent" : ""} ${!l.agent && l.from.toLowerCase() === d.me.toLowerCase() ? "mine" : ""}`} style={colour(l.from)}>
              <span className="rc-face"><Who login={l.from} size={16} /></span>
              <div className="rc-col">
                <div className="rc-who">
                  <span className="rc-name">{l.agent ? `${l.from}'s agent` : l.from}</span>
                  <time className="rc-at" title={new Date(l.at).toLocaleString()}>{time(l.at)}</time>
                  {l.re && <span className="rc-re">{answers(d.lines, l.re)}</span>}
                </div>
                {l.text && <p className="rc-text">{l.text}</p>}
                {l.artifact && <Chip a={l.artifact} />}
                <p className="rc-rule" data-runs={l.rule.runs}>{l.said.join(" · ")}</p>
                {l.session && <button className="rc-open" data-layer="session" onClick={() => window.dispatchEvent(new CustomEvent("sol:open-work", { detail: l.session }))}>open the talk</button>}
              </div>
            </section>
          ))}
        </div>
      </div>
      {say && <Composer d={d} say={say} />}
    </div>
  );
}

/** an artifact on a line: its kind and title, open, and review (a PR's diff on GitHub's review; a block on its stage) */
function Chip({ a }: { a: Artifact }) {
  const [reviewed, setReviewed] = useState(false);
  const go = (url: string) => {
    if (a.kind === "block") { if (a.session) window.dispatchEvent(new CustomEvent("sol:open-work", { detail: a.session })); return; }
    openUrl(url);
  };
  return (
    <div className="rc-art" data-kind={a.kind}>
      <span className="rc-art-kind">{KIND[a.kind]}</span>
      <span className="rc-art-title" title={a.ref}>{a.title}</span>
      <button className="cw-btn" {...(a.kind === "block" ? { "data-layer": "session" } : { "data-out": "open" })} onClick={() => go(a.ref)}>open</button>
      <button className="cw-btn" {...(a.kind === "block" ? { "data-layer": "session" } : { "data-out": "review" })} aria-pressed={reviewed} onClick={() => { setReviewed(true); go(reviewOf(a)); }}>{reviewed ? "reviewing" : "review"}</button>
    </div>
  );
}

/** the box: Enter sends, an @ completes over the members, a PR link or a block of my stage goes on the line */
function Composer({ d, say }: { d: ChatRead; say: (text: string, a?: Artifact) => Promise<string> }) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [art, setArt] = useState<Artifact | null>(null);
  const [adding, setAdding] = useState<"" | "link" | "block">("");
  const [url, setUrl] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const q = atQuery(text.slice(0, caret));
  const [shut, setShut] = useState(false);   // Esc closed the @ list until the words change
  const options = q === null || shut ? [] : atOptions(d.members, d.me, q).slice(0, 8);
  const choose = (m: Member) => {
    const r = pickAt(text, caret, m);
    setText(r.text); setCaret(r.caret); setPick(0);
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(r.caret, r.caret); });
  };
  const send = async () => {
    const t = text.trim();
    if ((!t && !art) || busy) return;
    setBusy(true);
    const no = await say(t, art ?? undefined);
    setBusy(false);
    if (no) { setSaid(no); return; }
    setText(""); setArt(null); setSaid("");
  };
  const takeUrl = () => {
    const a = artifactOfUrl(url);
    if (!a) { setSaid("a PR, a diff, a commit or a file on GitHub, like https://github.com/<owner>/<repo>/pull/12"); return; }
    setArt(a); setAdding(""); setUrl(""); setSaid("");
  };
  return (
    <div className="rc-foot">
      {said && <p className="rc-said" role="status">{said}</p>}
      {art && <p className="rc-chip" role="status"><span className="rc-art-kind">{KIND[art.kind]}</span><span className="rc-art-title">{art.title}</span>
        <button className="cw-link" data-act="take it off" aria-label="take it off" onClick={() => setArt(null)}>×</button></p>}
      {adding === "link" && <div className="rc-add"><input className="rc-url" autoFocus value={url} placeholder="a PR, a diff or a file on GitHub" onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); takeUrl(); } if (e.key === "Escape") setAdding(""); }} /><button className="cw-btn" data-act="put the link on" onClick={takeUrl}>put on</button></div>}
      {adding === "block" && <div className="rc-menu" role="listbox" aria-label="a block of your stage">
        {(d.stage ?? []).length === 0 ? <p className="cw-dim">No block on your stage yet.</p> : (d.stage ?? []).map((b) => (
          <button key={b.id} role="option" aria-selected={false} className="rc-option" data-act="put the block on" onClick={() => { setArt({ kind: "block", ref: b.id, title: b.title }); setAdding(""); }}>{b.title}</button>))}
      </div>}
      {options.length > 0 && <div className="rc-menu" role="listbox" aria-label="who reads it">
        {options.map((m, i) => (
          <button key={nameOf(m)} role="option" aria-selected={i === pick} className={`rc-option ${i === pick ? "on" : ""}`} data-act="@ who reads it" onMouseDown={(e) => { e.preventDefault(); choose(m); }}>
            <span>@{nameOf(m)}</span><span className="cw-dim">{m.agent ? `${m.login}'s usage` : "a notification, no usage"}</span>
          </button>))}
      </div>}
      <div className="rc-box">
        <button className="rc-att" data-act="a PR link" title="put a PR link on the line" aria-label="put a PR link on the line" onClick={() => setAdding((a) => (a === "link" ? "" : "link"))}>PR</button>
        <button className="rc-att" data-act="a block" title="put a block of your stage on the line" aria-label="put a block of your stage on the line" onClick={() => setAdding((a) => (a === "block" ? "" : "block"))}>block</button>
        <textarea ref={box} rows={1} value={text} placeholder="@ who should read it… nobody's agent reads a line without one" spellCheck
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setPick(0); setShut(false); if (said) setSaid(""); }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (options.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % options.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p - 1 + options.length) % options.length); return; }
              if ((e.key === "Enter" || e.key === "Tab") && !composing(e)) { e.preventDefault(); choose(options[Math.min(pick, options.length - 1)]); return; }
              if (e.key === "Escape") { e.preventDefault(); setShut(true); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !composing(e)) { e.preventDefault(); void send(); }
          }} />
        <button className="cw-btn" data-act="send" disabled={(!text.trim() && !art) || busy} onClick={() => void send()}>send</button>
      </div>
    </div>
  );
}
