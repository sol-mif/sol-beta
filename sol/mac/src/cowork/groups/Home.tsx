// The groups home (#1537; docs/cowork-ui-2026-11-18, the eleven screens): what a Sol user who is not on the team sees
// when they open Cowork. The home (a1, a2): one line, one table per group, the talk bar. A table sat at (a3, a5, a6)
// with the left column (a3, a10), the first-time card (a4), my AI at this table (a8), a new table (a7), sit down with
// a code (a9), leave (a11). Nothing here is made up: who sits where is the engine's team.rooms.people, an AI at work
// is team.state's agents (the room in use's only), what waits on me is the hands handed to me and the agents' asks
// (team.chat), my AI's line is this Sol's seat, machine and permission mode, what it reaches is what is connected here.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { useEngine } from "../../useEngine";
import { askEngine } from "../askEngine";
import { Gl } from "./Coin";
import { later, take, useHands } from "../handed";
import { useTeam, type Team } from "../useTeam";
import { Table } from "./Table";
import { Side } from "./Side";
import { Page, type AskNow, type Send } from "./Page";
import { Consent, LeaveSheet, MyAiSheet, type MyAi } from "./Sheets";
import { NewTable, SitDown } from "./New";
import { levelOf, modeOf, tablesOf, titleOf, type Level } from "./view";
import "./groups.css";

type View = { k: "home" } | { k: "table"; id: string } | { k: "new" } | { k: "code" };
type Sheet = "" | "consent" | "myai" | "leave";
const AGREED = "sol.groups.agreed";
const agreed = (id: string) => { try { return !!JSON.parse(localStorage.getItem(AGREED) ?? "{}")[id]; } catch { return false; } };
const agree = (id: string) => { try { localStorage.setItem(AGREED, JSON.stringify({ ...JSON.parse(localStorage.getItem(AGREED) ?? "{}"), [id]: new Date().toISOString() })); } catch { /* private */ } };

/** who sits at each room, asked when the rooms change; until the engine answers, the room in use's members */
function usePeople(team: Team): Record<string, string[]> {
  const rooms = team.state?.settings.rooms ?? [];
  const key = rooms.map((r) => r.id).join(" ");
  const [people, setPeople] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!key) return;
    let gone = false;
    void team.ask<{ rooms?: Record<string, string[]>; error?: string }>("team.rooms.people", {}, 20_000).then((r) => {
      if (!gone && r?.rooms && typeof r.rooms === "object") setPeople(r.rooms);
    });
    return () => { gone = true; };
  }, [key, team.ask]);
  const inUse = team.state?.settings.room ?? "";
  return people[inUse] || !inUse ? people : { ...people, [inUse]: [team.me, ...(team.state?.members ?? [])] };
}

type Block = { id: string; title: string; sessions?: string[]; asks?: { q?: string; choices?: string[]; by?: string; from?: string }; at?: number; project?: string };
/** the agents' asks that wait on me (team.chat `waiting`), read while a table is open; what is connected here (team.connectors) */
function useRoomReads(open: boolean, roomKey: string) {
  const [waiting, setWaiting] = useState<Block[]>([]);
  const [reach, setReach] = useState<{ github: boolean; drive: boolean }>({ github: false, drive: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!open) return;
    let gone = false;
    void askEngine("team.chat", {}, 20_000).then((r: any) => { if (!gone && Array.isArray(r?.waiting)) setWaiting(r.waiting); });   // eslint-disable-line @typescript-eslint/no-explicit-any
    void askEngine("team.connectors", {}, 15_000).then((r: any) => { if (!gone && r?.me) setReach({ github: !!r.me.github?.in, drive: !!r.me.google?.in }); });   // eslint-disable-line @typescript-eslint/no-explicit-any
    return () => { gone = true; };
  }, [open, roomKey, n]);
  return { waiting, reach, again: () => setN((x) => x + 1) };
}

export function GroupsHome({ e }: { e: ReturnType<typeof useEngine> }) {
  const team = useTeam();
  const hands = useHands();
  const people = usePeople(team);
  const me = team.me;
  const rooms = team.state?.settings.rooms ?? [];
  const inUse = team.state?.settings.room ?? "";
  const pending = useMemo(() => hands.pending.filter((h) => !hands.laterOf(h.id) || hands.doingOf(h.id)), [hands]);
  const tables = useMemo(() => tablesOf({ rooms, inUse, me, people, agents: team.state?.agents ?? [], hands: hands.hands, pending, now: Date.now() }), [rooms, inUse, me, people, team.state?.agents, hands.hands, pending]);
  const calling = tables.find((t) => t.ask);

  const [view, setView] = useState<View>({ k: "home" });
  const [sheet, setSheet] = useState<Sheet>("");
  const [menuFor, setMenuFor] = useState("");
  const [note, setNote] = useState("");
  const at = view.k === "table" ? tables.find((t) => t.id === view.id) ?? null : null;
  useEffect(() => { if (view.k === "table" && !at && tables.length) setView({ k: "home" }); }, [view, at, tables.length]);
  const reads = useRoomReads(view.k === "table", at?.id ?? "");

  // the room in use follows the table I sit at: its talk, its asks and its roster are the engine's reads
  const sitAt = useCallback((id: string) => {
    if (id !== inUse) void team.ask("team.settings", { patch: { room: id } }, 20_000);
    setView({ k: "table", id }); setMenuFor(""); setSheet(agreed(id) ? "" : "consent");
  }, [inUse, team]);
  const home = useCallback(() => { setView({ k: "home" }); setSheet(""); setMenuFor(""); }, []);

  // my AI's line: this Sol's machine, seat and permission mode; what is connected here
  const machines = (team.state?.settings.machines ?? []).map((m) => m.name);
  const my: MyAi = { machines, machine: machines[0] ?? "this mac", ai: team.state?.settings.seats.work === "codex" ? "codex" : "claude", level: levelOf(e.settings?.defaults.mode), reaches: { github: reads.reach.github, talk: true, drive: reads.reach.drive } };
  const onAi = (ai: "claude" | "codex") => void team.ask("team.settings", { patch: { seats: { work: ai } } }, 20_000);
  const onLevel = (l: Level) => e.setSettings({ defaults: { mode: modeOf(l) } });
  // each person's line under their seat: the machine the roster saw them on; mine is this Sol's (nothing per table yet)
  const lineOf = (login: string): string[] => {
    if (login.toLowerCase() === me.toLowerCase()) return [`${my.machine} · ${my.ai}`, my.level];
    const m = team.state?.roster.find((r) => r.who.toLowerCase() === login.toLowerCase() && !r.agent);
    return m?.machine ? [m.machine] : [];
  };
  const away = (login: string) => team.state?.roster.some((m) => m.who.toLowerCase() === login.toLowerCase() && !m.agent && m.state === "away") ?? false;

  // what waits on me at the open table: a hand first, else the agents' oldest question
  const askNow: AskNow | null = useMemo(() => {
    if (!at) return null;
    if (at.ask) {
      const h = hands.pending.find((p) => p.id === at.ask!.id);
      return h ? { kind: "hand", id: h.id, from: h.from, title: at.ask.title, at: at.ask.at, take: () => void take(h), later: () => later(h), doing: hands.doingOf(h.id) } : null;
    }
    const b = reads.waiting.find((x) => x.asks);
    if (!b) return null;
    const from = (b.asks?.from ?? b.asks?.by ?? "").replace(/'s agent$/i, "") || "sol";
    return { kind: "block", id: b.id, from, title: b.title, q: b.asks?.q ?? "", choices: b.asks?.choices?.length ? b.asks.choices : ["yes", "not yet"], at: b.at, busy: false,
      press: (choice) => void askEngine("work.stage.press", { sessionId: b.asks?.by ?? b.sessions?.[0], id: b.id, choice }, 20_000).then(() => reads.again()) };
  }, [at, hands, reads]);

  // a line said to a table, or a thing handed to it or to one person: the table's talk (the @ reaches that person's AI)
  const send: Send = async (words, to, thing) => {
    // the talk is the room in use's: the switch to this table is waited for, and nothing goes if it did not take
    if (at && at.id !== inUse) {
      const sw = await team.ask<{ settings?: { room?: string }; error?: string }>("team.settings", { patch: { room: at.id } }, 20_000);
      if (sw?.error || (sw?.settings && sw.settings.room !== at.id)) return { ok: false, said: `not sent: ${sw?.error || "the table did not switch"}` };
    }
    const text = to ? `@${to} ${words}`.trim() : words;
    const r = await team.ask<{ ok?: boolean; error?: string }>("team.talk", { thread: "general", text: text || (thing ? thing.name : ""), ...(thing ? { file: { name: thing.name, bytes: thing.bytes, kind: thing.kind } } : {}) }, thing ? 120_000 : 30_000);
    if (r?.ok) return { ok: true, said: thing ? `handed to ${to || "the table"}` : `said to ${to || "the table"}` };
    return { ok: false, said: `not sent: ${r?.error || "no answer"}` };
  };
  const sendHome = async (words: string, id: string) => {
    if (id !== inUse) { const r = await team.ask<{ error?: string }>("team.settings", { patch: { room: id } }, 20_000); if (r?.error) return { ok: false, said: `not said: ${r.error}` }; }
    return send(words, "", null);
  };

  // the row's menu: copy the code, rename, quiet, leave (team.settings on the rooms; a room left is left on its hub)
  const bare = (rs: typeof rooms) => rs.map(({ id, name, provider, org, repos, hub, quiet }) => ({ id, name, provider, org, repos, hub, ...(quiet ? { quiet } : {}) }));
  const patchRooms = (next: typeof rooms) => team.ask<{ error?: string }>("team.settings", { patch: { rooms: bare(next) } }, 30_000);
  const menuRoom = rooms.find((r) => r.id === menuFor);
  const menu = menuRoom ? {
    code: menuRoom.code ?? "", quietOn: !!menuRoom.quiet, close: () => setMenuFor(""),
    copy: async () => { setMenuFor(""); try { await navigator.clipboard.writeText(menuRoom.code ?? ""); setNote(menuRoom.code ? "code copied" : "this table has no code yet"); } catch { setNote("could not copy"); } },
    rename: () => { setMenuFor(""); const n = window.prompt("rename the table", menuRoom.name)?.trim(); if (n && n !== menuRoom.name) void patchRooms(rooms.map((r) => (r.id === menuRoom.id ? { ...r, name: n } : r))); },
    quiet: () => { setMenuFor(""); void patchRooms(rooms.map((r) => (r.id === menuRoom.id ? { ...r, quiet: r.quiet ? undefined : true } : r))); },
    leave: () => { setMenuFor(""); sitAt(menuRoom.id); setSheet("leave"); },
  } : undefined;
  const [leaving, setLeaving] = useState("");
  const leave = async () => {
    if (!at) return;
    setLeaving("leaving…");
    const r = await patchRooms(rooms.filter((r) => r.id !== at.id));
    setLeaving("");
    if (r?.error) { setNote(`not left: ${r.error}`); return; }
    home();
  };
  const getCode = () => { if (at) void team.ask<{ code?: string; error?: string }>("team.room.share", { id: at.id }, 30_000).then((r) => setNote(r?.code ? `the code is ${r.code}` : `no code: ${r?.error ?? "the cloud did not answer"}`)); };
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(""), 4000); return () => window.clearTimeout(t); }, [note]);

  if (view.k === "home") return <HomeView tables={tables} me={me} calling={calling?.id ?? ""} inUse={inUse} hands={hands} onOpen={sitAt} send={sendHome} note={note} />;
  const others = at ? at.seats.filter((s) => !s.me).map((s) => s.login) : [];
  const backed = sheet !== "";
  return (
    <div className="gh-home sw" data-place="groups">
      <Side tables={tables} me={me} at={at?.id ?? ""} lo={view.k === "new" ? "start" : view.k === "code" ? "code" : ""} menuFor={menuFor}
        onHome={home} onOpen={sitAt} onMenu={(id) => setMenuFor((m) => (m === id ? "" : id))} onStart={() => { setView({ k: "new" }); setSheet(""); }} onCode={() => { setView({ k: "code" }); setSheet(""); }} menu={menu} />
      <div className="gh-body">
        {view.k === "new" && <NewTable me={me} team={team} onMade={() => undefined} onGone={home} onCopied={(ok) => setNote(ok ? "code copied" : "could not copy")} />}
        {view.k === "code" && <SitDown me={me} team={team} onSat={sitAt} onNotNow={home} />}
        {at && (
          <Page t={at} me={me} my={my} lineOf={lineOf} away={away} code={rooms.find((r) => r.id === at.id)?.code || ""} onCode={getCode} ask={askNow} send={send} onChange={() => setSheet("myai")} back={backed}>
            {sheet === "consent" && <Consent me={me} table={at.name} others={others} my={my} onLevel={onLevel} onAgree={() => { agree(at.id); setSheet(""); }} onNotYet={home} />}
            {sheet === "myai" && <MyAiSheet me={me} table={at.name} others={others} my={my} onAi={onAi} onLevel={onLevel} onDone={() => setSheet("")} />}
            {sheet === "leave" && <LeaveSheet me={me} table={at.name} others={others} onLeave={() => void leave()} onStay={() => setSheet("")} busy={leaving} />}
          </Page>
        )}
        {note && <div className="gh-note" role="status">{note}</div>}
      </div>
    </div>
  );
}

function HomeView({ tables, me, calling, inUse, hands, onOpen, send, note }: {
  tables: ReturnType<typeof tablesOf>; me: string; calling: string; inUse: string; hands: ReturnType<typeof useHands>;
  onOpen: (id: string) => void; send: (words: string, id: string) => Promise<{ ok: boolean; said: string }>; note: string;
}) {
  const [picked, setPicked] = useState("");
  const at = tables.some((t) => t.id === picked) ? picked : (tables.some((t) => t.id === inUse) ? inUse : tables[0]?.id ?? "");
  const [text, setText] = useState("");
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  const away = () => false;
  const go = async () => {
    const words = text.trim();
    if (!words || !at) return;
    setText("");
    const r = await send(words, at);
    setSaid({ text: r.ok ? `said at ${tables.find((t) => t.id === at)?.name ?? at}` : r.said, failed: !r.ok });
    if (!r.ok) setText(words);
  };
  return (
    <div className="gh-home" data-place="groups-home">
      <div className="gh-hd"><h1 className="gh-title">{tables.length ? titleOf(tables) : "no tables yet."}</h1></div>
      <div className="gh-tables">
        {tables.map((t) => (
          <Table key={t.id} t={t} me={me} away={away} quiet={!!calling && calling !== t.id} onOpen={() => onOpen(t.id)}
            answer={t.ask && t.id === calling ? {
              take: () => { const h = hands.pending.find((p) => p.id === t.ask!.id); if (h) void take(h); },
              later: () => { const h = hands.pending.find((p) => p.id === t.ask!.id); if (h) later(h); },
              doing: hands.doingOf(t.ask.id),
            } : undefined} />
        ))}
        {!tables.length && <p className="gh-none">when you start a table, or sit down at one with a code, it shows here.</p>}
      </div>
      {note && <div className="gh-note" role="status">{note}</div>}
      {tables.length > 0 && (
        <form className="gh-bar gh-card gh-foot" onSubmit={(ev) => { ev.preventDefault(); void go(); }}>
          <div className="gh-picks" role="radiogroup" aria-label="which table">
            {tables.map((t) => <button key={t.id} type="button" role="radio" aria-checked={t.id === at} className={`gh-pick gh-pill${t.id === at ? " on" : ""}`} data-act="pick" onClick={() => setPicked(t.id)}>{t.name}</button>)}
          </div>
          <label className="gh-in">
            <input value={text} onChange={(ev) => { setText(ev.target.value); setSaid(null); }} placeholder="say it to the table, or hand it a thing" aria-label="say it to the table" />
            {said && <span className="gh-said" style={said.failed ? { color: "var(--ink)" } : undefined}>{said.text}</span>}
          </label>
          <button type="submit" className="gh-send" data-act="send" aria-label="send" disabled={!text.trim()}><Gl d="up" /></button>
        </form>
      )}
    </div>
  );
}
