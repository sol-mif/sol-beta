// The dashboard (Together, See #31): the view, read first and drawn second. The columns say where each thing stands,
// the gantt says when, the tiles say what the team added. Nothing on it is a button; the action board acts. The board is
// the project's first table (#434, tables/): the columns are its board view and the weeks its timeline view, the same
// rows a list or a calendar of it shows in the tables tab.
import { useLayoutEffect, useRef } from "react";
import { CFG, stagger } from "../motion";
import { leadsOf, type Board, type Card, type Column, type Team } from "./useTeam";
import { PersonDot, Sig, useLift, readAgo } from "./bits";
import { TILES } from "./tiles";
import { useLiveBlocks } from "./blocks";   // team blocks (#429): the tiles live in the project in use
import { boardTableRows, groupsOf, spansOf, across, monday } from "./tables/views";   // tables (#434): the board is a table
import { BOARD_COLS, BOARD_VIEW, BOARD_WEEKS } from "./tables/shapes";

/** the board's one line: the board view's columns, in tables.json's order (closed is hidden) */
export const LINE: { col: Column; name: string }[] = groupsOf([], BOARD_VIEW, BOARD_COLS).map((g) => ({ col: g.id as Column, name: g.name }));

export function CardLine({ c, team, sign, children, onMenu, here }: {
  c: Card; team: Team; sign: "agent" | "always"; children?: React.ReactNode; onMenu?: (ev: React.MouseEvent) => void; here?: boolean;
}) {
  const lift = useLift();
  const s = team.state;
  // felt or silent (#100): one word on a card whose PR is open, from its body or the latest flip; and where that PR
  // holds: the labels of the files it changes (#98), so a second person sees the overlap before building
  const pr = c.pr ? team.board?.prs.find((p) => p.repo === c.repo && p.number === c.pr && p.state === "open") : undefined;
  const holds = pr?.areas;
  return (
    <div className={`ccard ${here ? "here" : ""}`} {...lift} onContextMenu={onMenu} title={`#${c.number} ${c.title}${c.assignees.length ? `\n${c.assignees.join(", ")}` : ""}`}>
      <div className="cl1">
        {c.assignees[0] ? <PersonDot login={c.assignees[0]} roster={s?.roster ?? []} up={!!s?.relay.up} me={team.me} /> : <span className="cnobody" title="nobody on it" />}
        <span className="cnum">#{c.number}</span>
        <span className="ct">{c.title}</span>
        {pr?.mark && <span className={`cmark ${pr.mark}`} title={`${pr.mark === "felt" ? "a person runs it before it is ready" : "ready without a run"}${pr.flippedBy ? `, flipped by ${pr.flippedBy}` : ""}`}>{pr.mark}</span>}
        {children}
      </div>
      {(c.domain || c.sign || holds?.length) && (
        <div className="cl2">
          {c.domain && <span className="ctag" title={leadsOf(team.board, c.domain, c.repo).length ? `${c.domain}, led by ${leadsOf(team.board, c.domain, c.repo).join(" and ")}` : undefined}>{c.domain}</span>}
          {!!holds?.length && <span className="cholds" title="the areas this PR's files are in">holds {holds.join(", ")}</span>}
          {c.sign && (sign === "always" || c.sign.agent) && <Sig s={c.sign} />}
        </div>
      )}
    </div>
  );
}

export function Columns({ board, team, sign, cardExtra, onMenu, cap, here }: {
  board: Board; team: Team; sign: "agent" | "always"; cardExtra?: (c: Card) => React.ReactNode; onMenu?: (ev: React.MouseEvent, c: Card) => void;
  here?: number;   // the open session's issue: its card is marked
  cap?: number;   // the dashboard shows the newest few of a long column and says how many more; the action board shows all
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) stagger(ref.current.querySelectorAll(".ccol"), { y: 16, cfg: CFG.travel, gap: 40 }); }, []);
  return (
    <div ref={ref} className="ccols">
      {groupsOf(boardTableRows(board.cards), BOARD_VIEW, BOARD_COLS).map(({ id: col, name, rows }) => {
        const cards = rows.map((r) => r._card);   // the board view: by where each stands, newest number first
        return (
          <section key={col} className={`ccol ${col}`}>
            <h3><span>{name}</span><small>{cards.length || ""}</small></h3>
            {cards.length ? cards.slice(0, cap ?? cards.length).map((c) => <CardLine key={c.repo + c.number} c={c} team={team} sign={sign} here={c.number === here} onMenu={onMenu && ((ev) => onMenu(ev, c))}>{cardExtra?.(c)}</CardLine>)
              : <p className="cnone">nothing</p>}
            {cap !== undefined && cards.length > cap && <p className="cmorec">and {cards.length - cap} more</p>}
          </section>
        );
      })}
    </div>
  );
}

/** the same cards across the weeks: created to closed (or today), one row each, this week marked; the board table's
 *  timeline view (it hides the closed, as the dashboard always did) */
export function Gantt({ cards }: { cards: Card[] }) {
  const now = Date.now();
  if (!cards.length) return null;
  const { spans, weeks, start, end } = spansOf(boardTableRows(cards), BOARD_WEEKS, BOARD_COLS, now);
  const x = (t: number) => `${across(t, start, end) * 100}%`;
  const week = 7 * 86_400_000, thisWeek = monday(now);
  return (
    <div className="cgantt">
      <div className="cgrow chead">
        <span className="cgl" />
        <div className="cgtrack">
          {weeks.map((t) => <span key={t} className="cgweek" style={{ left: x(t) }}>{new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>)}
        </div>
      </div>
      <div className="cgbody">
        <div className="cgband"><i className="cgnow" style={{ left: x(thisWeek), width: `${(week / (end - start)) * 100}%` }} title="this week" /></div>
        {spans.map(({ row, a, b }) => {
          const c = row._card;
          return (
            <div key={c.repo + c.number} className="cgrow" title={`#${c.number} ${c.title}\n${new Date(a).toLocaleDateString()} to ${c.closed ? new Date(b).toLocaleDateString() : "today"}`}>
              <span className="cgl"><span className="cnum">#{c.number}</span><span className="ct">{c.title}</span></span>
              <div className="cgtrack">
                <i className={`cgbar ${c.column}`} style={{ left: x(a), width: `calc(${x(b)} - ${x(a)} + 3px)` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// a full stage in Cowork, or a pane in Home (buttons/dashboard.tsx); issue: the open session's, its card marked
export function Dashboard({ team, issue }: { team: Team; issue?: number }) {
  const live = useLiveBlocks(team);
  const b = team.board;
  if (!b) return <p className="wpempty">{team.up ? "reading the board…" : "not connected"}</p>;
  const shown = b.cards.filter((c) => c.column !== "closed");
  return (
    <div className="cpage cdash">
      <header className="chead1">
        <h2>the board</h2>
        <span className="cdim">{b.repos.map((r) => r.split("/")[1]).join(" · ")}</span>
        <span className="cdim cat">{readAgo(b.at)}</span>
        {b.error && <span className="cwarn">{b.error}</span>}
      </header>
      <Columns board={b} team={team} sign="agent" cap={7} here={issue} />
      <h4 className="csub">across the weeks</h4>
      <Gantt cards={shown} />
      <h4 className="csub">the team added</h4>
      <div className="ctiles">
        {TILES.filter((t) => live.has(t.id)).map(({ id, name, Tile }) => (
          <section key={id} className="ctile"><h5>{name}</h5><Tile team={team} board={b} /></section>
        ))}
      </div>
    </div>
  );
}
