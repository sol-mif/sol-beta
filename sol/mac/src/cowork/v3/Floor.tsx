// Cowork v3, slice 7 (fr-30, #560): the floor of a project, under its rooms. On top, only when there is one: a conflict
// card (two Sols changed one thing without seeing each other: both versions, one press keeps one, the other stays on
// the trail) and the waiting-to-send card (what this Sol wrote that the cloud has not kept). Then mine: what may
// interrupt me and my quiet hours as one picture (the day as a band, the quiet part dark as the notch, now as a glow;
// press a word to change it), and my devices (a key per machine under my one key; one press says which answers for
// me; another machine paired by a one-time code through Sol's cloud, or vouched for by pasting its key). Then the people: press a face for what breaks if they leave,
// one line each, one press a line. Every press is one trail event (team/v3/floor.ts).
import { useEffect, useState } from "react";
import { Body } from "../bits";
import { ask, useRead, when, who, type ConflictCard, type Floor as FloorT } from "./seven";
import { Leave } from "./Leave";
import "./seven.css";

const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const quietWord = (q: FloorT["interrupt"]["quiet"]) => (q ? `${q.from} to ${q.to}` : "never quiet");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "nothing" : typeof v === "string" ? v : JSON.stringify(v));

export function Floor({ project, name, me }: { project: string; name: string; me: string }) {
  const [leaving, setLeaving] = useState("");
  const { data, setData, error, again } = useRead<FloorT>("team.v3.floor.get", { project, ...(leaving ? { who: leaving } : {}) }, 15_000);
  const [said, setSaid] = useState("");
  const tell = (s: string) => { setSaid(s); window.setTimeout(() => setSaid((x) => (x === s ? "" : x)), 6000); };
  const press = async (type: string, body: object, line: string) => {
    const r = await ask<FloorT>(type, { project, ...body });
    if (r.error) { tell(r.error); return; }
    setData(r); tell(line);
  };
  if (!data) return <div className="s7 s7-room">{error && <p className="s7-none">{error}</p>}</div>;
  const f = data;
  const I = f.interrupt;
  const cycle = (k: "what" | "quiet") => {
    if (k === "what") { const L = f.whats, next = L[(L.indexOf(I.what) + 1) % L.length]; void press("team.v3.floor.interrupt", { value: { what: next, quiet: I.quiet, zone: I.zone } }, `Sol may interrupt you: ${next} (was ${I.what}).`); }
    else { const L = f.quiets, i = L.findIndex((q) => quietWord(q) === quietWord(I.quiet)), next = L[(i + 1) % L.length]; void press("team.v3.floor.interrupt", { value: { what: I.what, quiet: next, zone: I.zone } }, `Quiet ${quietWord(next)} now.`); }
  };
  return (
    <div className="s7 s7-room s7-floor">
      <header className="s7-head">
        <span className="s7-kicker">The floor</span>
        <h1>{name}</h1>
        <p>What may reach you, the machines you run Sol on, and what keeps {name} standing.</p>
      </header>

      {f.conflicts.map((c) => <Conflict key={`${c.collection}:${c.id}:${c.field}`} c={c} me={me} onKeep={(ev, by) => void press("team.v3.floor.keep", { collection: c.collection, id: c.id, field: c.field, event: ev }, by === me ? "Kept yours. The other version stays on the trail." : `Took ${by}'s. Yours stays on the trail.`)} />)}
      {f.waiting.count > 0 && (
        <div className="s7-waiting">
          <span className="s7-pulse" aria-hidden="true" />
          <div className="w">
            <b>{f.waiting.count === 1 ? "One change" : `${f.waiting.count} changes`} waiting to send</b>
            <span>{f.waiting.away || "Written here and folded already; they reach the cloud when it can take them, with no duplicate."}</span>
            <span className="things">{f.waiting.things.map((t) => t.title).slice(0, 5).join(" · ")}{f.waiting.things.length > 5 ? " …" : ""}</span>
          </div>
          <button className="v3s-press ghost" onClick={() => { void again(); tell("Read again."); }}>Look again</button>
        </div>
      )}

      <section className="s7-sec">
        <h2>Sol may interrupt me</h2>
        <p className="s7-sentence">
          <button className="s7-cyc" onClick={() => cycle("what")} title="press to change">{I.what}</button>
          <span className="dot">·</span>
          {I.quiet && <span className="s7-quiet">quiet</span>}
          <button className="s7-cyc" onClick={() => cycle("quiet")} title="press to change">{quietWord(I.quiet)}</button>
          <span className="s7-quiet">{I.layer === "me" ? "yours, in this project" : "the project's default until you change it"}</span>
        </p>
        <Day quiet={I.quiet} quietNow={f.quietNow} zone={I.zone} />
      </section>

      <section className="s7-sec">
        <h2>My devices</h2>
        <p className="s7-quiet">One key for you; each machine has its own, signed under yours, so losing one machine takes one key, never you.</p>
        <div className="s7-devs">
          {f.devices.map((d) => (
            <button key={d.name} className={`s7-dev ${d.answers ? "answers" : ""}`} title={d.answers ? "this one answers for you" : "press: this one answers for you"}
              onClick={() => { if (!d.answers) void press("team.v3.floor.answers", { name: d.name }, `${d.name} answers for you now.`); }}>
              <span className={`s7-dev-dot ${d.here ? "here" : ""}`} />
              <b>{d.name}</b>
              <span className="s7-quiet">{[d.here ? "here" : d.seen ? `seen ${when(d.seen)}` : "away", d.answers ? "answers" : "", d.note ?? "", d.vouched ? "" : "not vouched for"].filter(Boolean).join(" · ")}</span>
              <span className="s7-key" title="its own key, under your one key">{d.key}</span>
            </button>
          ))}
        </div>
        <Pair project={project} onDone={(r, line) => { setData(r); tell(line); }} onError={tell} />
        <Vouch project={project} onDone={(r) => { setData(r); tell("Vouched for: its key is signed under yours now."); }} onError={tell} />
      </section>

      <section className="s7-sec">
        <h2>If someone leaves</h2>
        <p className="s7-quiet">Press a face: what stops, and the one press that keeps it going. Nothing changes until you press.</p>
        <div className="s7-faces">
          {f.people.map((p) => (
            <button key={p} className={`s7-face ${leaving === p ? "on" : ""}`} onClick={() => setLeaving((x) => (x === p ? "" : p))} title={who(p, me) === "you" ? "if you leave" : `if ${p} leaves`}>
              <Body login={p} size={34} /><span>{who(p, me)}</span>
            </button>
          ))}
          {f.people.length === 0 && <span className="s7-none">Nobody has written here yet.</span>}
        </div>
        {leaving && f.leave && f.leave.who === leaving && <Leave card={f.leave} me={me} onPress={(l) => void press("team.v3.floor.leave", { who: leaving, act: l.act, kind: l.kind, id: l.id }, `${l.title}: done. The rest keeps working.`)} />}
      </section>
      {said && <p className="s7-said" role="status">{said}</p>}
      {f.trail === "stand-in" && <p className="s7-foot">This Sol keeps these on a stand-in trail until the signed trail (slice 0) is in.</p>}
    </div>
  );
}

/** the day as a band: midnight to midnight, the quiet hours as the notch's dark slab, now as the seat's glow */
function Day({ quiet, quietNow, zone }: { quiet: FloorT["interrupt"]["quiet"]; quietNow: boolean; zone: string }) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const now = Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const pc = (m: number) => `${(m / 1440) * 100}%`;
  const spans: [number, number][] = !quiet ? [] : hm(quiet.from) <= hm(quiet.to) ? [[hm(quiet.from), hm(quiet.to)]] : [[hm(quiet.from), 1440], [0, hm(quiet.to)]];
  return (
    <div className="s7-day" aria-label={quiet ? `quiet ${quiet.from} to ${quiet.to}, ${zone}` : "never quiet"}>
      <div className="band">
        {spans.map(([a, b], i) => <span key={i} className="q" style={{ left: pc(a), width: pc(b - a) }} />)}
        <span className={`now ${quietNow ? "hush" : ""}`} style={{ left: pc(now) }} title={quietNow ? "quiet now" : "now"} />
      </div>
      <div className="ticks">{[0, 6, 12, 18, 24].map((h) => <span key={h} style={{ left: pc(h * 60) }}>{String(h % 24).padStart(2, "0")}</span>)}</div>
      <div className="s7-quiet z">{zone}{quietNow ? " · quiet now: what comes waits on the front" : ""}</div>
    </div>
  );
}

function Conflict({ c, me, onKeep }: { c: ConflictCard; me: string; onKeep: (event: string, by: string) => void }) {
  const others = c.versions.filter((v) => v.by.person.toLowerCase() !== me.toLowerCase());
  const nm = others[0]?.by.person ?? "another Sol";
  return (
    <div className="s7-conflict">
      <div className="h"><Body login={nm} size={20} /><span className="w">{who(nm, me) === "you" ? "Your other Sol" : nm} changed {c.field} of <b>{c.title}</b> too. {c.versions.length} versions.</span></div>
      <div className="two">
        {c.versions.map((v) => (
          <div key={v.event} className="side">
            <span className="k">{who(v.by.person, me) === "you" ? "yours" : `${v.by.person}'s`}{v.by.machine ? ` · ${v.by.machine}` : ""} · {when(v.at)}</span>
            <span className="t">{show(v.value)}</span>
            <button className="v3s-press" onClick={() => onKeep(v.event, v.by.person)}>{who(v.by.person, me) === "you" ? "Keep mine" : `Take ${v.by.person}'s`}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** another machine of mine: its name and key (it shows them on its own floor), signed under my key here */
/** a second machine by a one-time code: this one shows it, the new one types it; each looks every 3 s until paired */
function Pair({ project, onDone, onError }: { project: string; onDone: (f: FloorT, line: string) => void; onError: (s: string) => void }) {
  const [mode, setMode] = useState<"" | "show" | "type" | "wait">("");
  const [code, setCode] = useState("");
  useEffect(() => {
    if (mode !== "show" && mode !== "wait") return;
    const t = window.setInterval(() => void ask<FloorT & { state?: string; name?: string; by?: string }>("team.v3.floor.paired", { project }).then((r) => {
      if (r.error) { onError(r.error); setMode(""); return; }
      if (r.state === "gone") { onError("The code ran out. Make a new one."); setMode(""); return; }
      if (r.state === "paired") { setMode(""); setCode(""); onDone(r, r.name ? `${r.name} is yours now: its key is signed under yours.` : `This machine writes as you now (paired by ${r.by}).`); }
    }), 3000);
    return () => window.clearInterval(t);
  }, [mode, project]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = async () => {
    const r = await ask<{ code: string }>("team.v3.floor.offer", { project });
    if (r.error) onError(r.error); else { setCode(r.code); setMode("show"); }
  };
  const send = async () => {
    const r = await ask<{ ok?: true }>("team.v3.floor.pair", { project, code });
    if (r.error) onError(r.error); else setMode("wait");
  };
  if (!mode) return (
    <p className="s7-quiet">
      <button className="s7-link" onClick={() => void show()}>+ pair a new machine</button> · <button className="s7-link" onClick={() => setMode("type")}>this machine is new: I have a code</button>
    </p>
  );
  return (
    <div className="s7-vouch">
      {mode === "show" && <p className="s7-quiet">On the new machine, open this floor, press "I have a code" and type <code className="s7-code">{code}</code>. It works for ten minutes, once.</p>}
      {mode === "type" && <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} spellCheck={false}
        placeholder="the code the other machine shows: XXXX-XXXX" aria-label="the pairing code" autoFocus />}
      {mode === "wait" && <p className="s7-quiet">Asked. The other machine signs this one's key the next time it looks (within seconds while its floor is open).</p>}
      <button className="s7-link" onClick={() => { setMode(""); setCode(""); }}>cancel</button>
    </div>
  );
}

function Vouch({ project, onDone, onError }: { project: string; onDone: (f: FloorT) => void; onError: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<{ name: string; pub: string } | null>(null);
  const [line, setLine] = useState("");
  const showMine = async () => {
    setOpen(true);
    const r = await ask<{ name: string; pub: string }>("team.v3.floor.key", { project });
    if (r.error) onError(r.error); else setMine({ name: r.name, pub: r.pub });
  };
  const vouch = async () => {
    const [name, pub] = line.trim().split(/\s+/);
    if (!name || !pub) { onError("its name, a space, then its key"); return; }
    const r = await ask<FloorT>("team.v3.floor.certify", { project, name, pub });
    if (r.error) onError(r.error); else { setLine(""); onDone(r); }
  };
  if (!open) return <button className="s7-link" onClick={() => void showMine()}>or vouch by pasting its key</button>;
  return (
    <div className="s7-vouch">
      {mine && <p className="s7-quiet">This one: <code>{mine.name} {mine.pub}</code> <button className="s7-link" onClick={() => void navigator.clipboard?.writeText(`${mine.name} ${mine.pub}`)}>copy</button></p>}
      <input value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void vouch(); }} spellCheck={false}
        placeholder="paste the other machine's line: its name and its key" aria-label="the other machine's name and key" />
    </div>
  );
}
