// People (#1297): the definitive state by person, one card each, never a plain list. Drawn from one engine read
// (`team.people`, engine/src/team/people.ts) and from the kit alone (sol/design/system/look.md): a Card each, its rows
// (holds, the one issue · open, a count whose titles wait for the opening · waits on you · agent in flight · landed
// today · minutes coordinating, "—" where not counted) a count and the first two titles; one press on its head
// opens it to the full lists, each item a kit Row whose press opens it on GitHub. On my own card a hand-over or an
// offer has its press ("take", "answer": reach's hand_reply), or says the switch that keeps it off (reach.tools).
// The reader's card first. A person with nothing is one line, never an empty box.
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Button, Card, Pearl, Row } from "../kit";
import { deep, dim, ink, label, mute, TYPE as BODY } from "../kit/paint";
import { CURVE, TYPE } from "../kit/tokens";
import { askEngine } from "./askEngine";
import { outLabel, useOut } from "./whole/out";   // a row opens its issue in the app, a layer of Cowork's place (#1416)
import { linesOf, minutesShown, oldWords, ordered, quiet, quietWords, type Item, type Line, type PeopleRead, type PersonRead } from "./peopleView";

/** a card's width, and the room inside it (look.md: card 26; the inside on the 4 px scale) */
export const CARD_W = 312;
const PAD = 16, INNER = CARD_W - 2 * PAD;
/** the kit Row's own inset of its words (Row.tsx: padding 0 12px) */
const ROW_IN = 12;
/** a closed row shows this many titles under its count */
const FIRST = 2;

export type PeopleAsk = (type: string, body?: Record<string, unknown>, wait?: number) => Promise<any>;

/** the read, asked when People opens and on "read again"; a press that answered something reads again */
export function usePeople(ask: PeopleAsk = askEngine as PeopleAsk) {
  const [data, setData] = useState<PeopleRead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let gone = false;
    setBusy(true);
    void ask("team.people", {}, 45_000).then((r) => {
      if (gone) return;
      setBusy(false);
      const err = r?.error ?? (r?.type === "team.error" ? r.message ?? "could not read" : "");   // an engine before team.people
      if (err) { setError(err === "not connected" ? "Jelly's engine is not running" : err); return; }
      setError(""); setData(r as PeopleRead);
    });
    return () => { gone = true; };
  }, [ask, n]);
  const again = useCallback(() => setN((x) => x + 1), []);
  return { data, error, busy, again };
}

const head: CSSProperties = { fontSize: TYPE.head[0], lineHeight: `${TYPE.head[1]}px`, fontWeight: 600, color: ink };
const count: CSSProperties = { fontSize: TYPE.big[0], lineHeight: `${TYPE.big[1]}px`, fontWeight: 500, fontVariantNumeric: "tabular-nums" };
/** a closed row: the count's column, then the words (the minutes row too) */
const rowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "32px 1fr", columnGap: 12, alignItems: "start", minHeight: 28 };
const one: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** a row's count: a number; what waits on the reader sits on the pearl, the mark of what has you (look.md: the pearl).
 *  A state is its shape first: the pearl is there or not, whatever the colour reads as */
function Count({ n, held }: { n: number | string; held: boolean }) {
  const box = { width: 32, height: 28, display: "grid", placeItems: "center" } as const;
  const some = typeof n === "number" ? n > 0 : n !== "—" && n !== "0";
  if (held && some) return <Pearl w={32} h={28} r={CURVE.radius.chip}><span style={{ ...count, ...box, color: deep() }}>{n}</span></Pearl>;
  return <span style={{ ...count, ...box, color: some ? ink : mute }}>{n}</span>;
}

/** a closed row: the count, its words, the first two titles (none for a row whose titles wait for the opening) */
function Short({ line, held }: { line: Line; held: boolean }) {
  const first = line.hidden ? [] : line.items.slice(0, FIRST);
  return (
    <div style={rowGrid} data-line={line.id}>
      <Count n={line.items.length} held={held} />
      <div style={{ minWidth: 0, paddingTop: 4 }}>
        <div style={{ ...label, color: held && line.items.length ? ink : mute }}>{line.words}</div>
        {first.map((it) => <div key={it.key} style={{ ...one, color: dim }}>{it.title}</div>)}
        {!line.hidden && line.items.length > FIRST && <div style={{ ...label }}>and {line.items.length - FIRST} more</div>}
      </div>
    </div>
  );
}

/** an open row: every item a kit Row; its press opens the issue or the change; a hand or an offer has its own press */
function Full({ line, tools, onAct }: { line: Line; tools: boolean; onAct: (it: Item) => void }) {
  const open = useOut();
  return (
    <section data-line={line.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={label}>{line.words} · {line.items.length}</div>
      {line.items.length === 0 ? <div style={{ ...label, color: dim }}>nothing</div>
        : line.items.map((it) => (
          // the row's own 12 px inset hangs into the card's padding, so its words stand on the head's text edge
          <div key={it.key} style={{ margin: `0 -${ROW_IN}px` }} {...(it.url ? { "data-layer": "page" } : {})}><Row w={INNER + 2 * ROW_IN} h={44} title={it.title} note={it.note} onClick={it.url ? () => open(it.url!, outLabel(it.title)) : undefined}
            aside={it.act ? (
              // the press is its own: the row under it opens the issue (rule: one press, one thing)
              <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }} data-act="its own press, apart from the row">
                {tools ? <Button h={24} flat acts onClick={() => onAct(it)}>{it.act.words}</Button>
                  : <span title="Settings › reach.tools: the tools that answer a hand-over are off">reach.tools is off</span>}
              </span>
            ) : it.url ? "open" : undefined} /></div>
        ))}
    </section>
  );
}

/** the minutes coordinating: a count on my own card, "—" on another's (not counted there), closed or open alike */
function MinutesRow({ p }: { p: PersonRead }) {
  const m = minutesShown(p.minutes);
  return (
    <div style={rowGrid} data-line="minutes">
      <Count n={m.today} held={false} />
      <div style={{ minWidth: 0, paddingTop: 4 }}><div style={label}>{m.words}</div></div>
    </div>
  );
}

/** one person's card: closed, short rows; open, the full lists */
export function PersonCard({ p, mine, tools, names, now, open: opened, onOpen, onAct }: {
  p: PersonRead; mine: boolean; tools: boolean; names: (login: string) => string; now: number; open: boolean; onOpen: () => void; onAct: (it: Item) => void;
}) {
  const lines = linesOf(p, { mine, names, now });
  const empty = quiet(p);
  return (
    <div data-person={p.login} data-open={opened ? "1" : "0"}>
      <Card w={CARD_W}>
        <div style={{ ...BODY, position: "relative", padding: PAD, display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={empty ? undefined : onOpen} aria-expanded={opened} disabled={empty} data-act="opens the card"
            style={{ all: "unset", cursor: empty ? "default" : "pointer", display: "flex", alignItems: "center", height: 20, gap: 8, minWidth: 0 }}>
            <span style={{ ...head, ...one }}>{p.name}</span>
            {mine && <span style={label}>you</span>}
            <span style={{ flex: 1 }} />
            {!empty && <span style={label}>{opened ? "close" : "open"}</span>}
          </button>
          {empty ? <p style={{ margin: 0, color: dim }}>{quietWords(p, mine)}</p>
            : opened ? lines.map((l) => <Full key={l.id} line={l} tools={tools} onAct={onAct} />)
            : lines.map((l) => <Short key={l.id} line={l} held={mine && l.id === "waits"} />)}
          {!empty && <MinutesRow p={p} />}
        </div>
      </Card>
    </div>
  );
}

/** every card, the reader's first; `said` is the last press's answer, one line */
export function PeopleCards({ r, ask = askEngine as PeopleAsk, again, now = Date.now() }: { r: PeopleRead; ask?: PeopleAsk; again?: () => void; now?: number }) {
  const [opened, setOpened] = useState<string>(() => new URLSearchParams(location.search).get("open") ?? "");
  const [said, setSaid] = useState("");
  const names = (l: string) => r.people.find((x) => x.login.toLowerCase() === l.toLowerCase())?.name ?? l;
  const act = async (it: Item) => {
    if (!it.act) return;
    const a = await ask("team.people.reply", { id: it.act.id, accept: true });
    setSaid(a?.said ?? a?.error ?? "");
    if (a?.ok) again?.();
  };
  const old = oldWords(r, now);
  return (
    <div>
      {old && <div role="status" data-old="1" style={{ ...label, color: dim, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span>{old}</span>{again && <span data-act="read again"><Button h={24} flat onClick={again}>read again</Button></span>}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {ordered(r).map((p) => (
          <PersonCard key={p.login} p={p} mine={p.login.toLowerCase() === r.me.toLowerCase()} tools={r.tools} names={names} now={now}
            open={opened === p.login} onOpen={() => setOpened((o) => (o === p.login ? "" : p.login))} onAct={(it) => void act(it)} />
        ))}
      </div>
      {said && <p role="status" style={{ ...label, color: dim, marginTop: 12 }}>{said}</p>}
    </div>
  );
}
