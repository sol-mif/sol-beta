// A table (#1537; docs/cowork-ui-2026-11-18/a.html `.tb`, ported as drawn): one group. Who sits at it on its edge
// (Seat), its name beside the mark of what it is kept in, one number and one line of what is happening. When someone
// waits on me it is the one lifted thing on the page: the yellow "needs you" sticker on its edge, the question in its
// well, answered there or opened. The others step back (quiet).
// Shared by the home and the group page (#1537's followers): they add, they do not change it.
import { Coin, Sticker } from "./Coin";
import { Seat } from "./Seat";
import { agoOf, nameOn, type TableView } from "./view";

// the three marks of what a table is kept in (kit.js IC: repo, report, event), on a 44 × 28 grid
const IC: Record<TableView["kind"], string> = {
  github: "M6 6v20M6 14c10 0 14-2 14-8M20 6h18M6 22h30",
  drive: "M8 3h20l8 7v15H8zM14 12h14M14 17h14M14 22h8",
  cloud: "M5 7h34v19H5zM5 13h34M13 3v6M31 3v6M14 19h.1M22 19h.1M30 19h.1",
};
const KIND_WORD: Record<TableView["kind"], string> = { github: "kept on GitHub", drive: "kept in Google Drive", cloud: "kept in Sol's cloud" };
const CARD = "#1b1b1e", LIFTED = "#222226";

export type Answer = { take: () => void; later: () => void; doing?: { said: string; failed?: boolean } };

export function Table({ t, me, away, quiet, onOpen, answer }: { t: TableView; me: string; away: (login: string) => boolean; quiet?: boolean; onOpen: () => void; answer?: Answer }) {
  const call = !!t.ask && !!answer;
  const ring = call ? LIFTED : CARD;
  return (
    <div className={`gh-tb${call ? " call" : ""}${quiet ? " quiet" : ""}`} data-table={t.id} data-call={call ? "1" : undefined} data-quiet={quiet ? "1" : undefined}>
      {call && <Sticker y xl>needs you</Sticker>}
      <div className="gh-seats">
        {t.seats.map((s) => {
          const up = call && t.ask?.from === s.login;
          return <Seat key={s.login} login={s.login} me={me} coin={s.coin} ring={ring} up={up} look={up ? 3 : call && s.me ? -3 : 0} sleep={!s.me && away(s.login)} />;
        })}
      </div>
      <div className="gh-top">
        <div className="gh-who">{t.seats.map((s) => <span key={s.login}>{nameOn(s.login, me)}</span>)}{t.more > 0 && <span className="gh-more">+{t.more}</span>}</div>
        <button type="button" className="gh-r gh-open" data-go="table" onClick={onOpen} title={`open ${t.name}`}>
          <span className="gh-kind" title={KIND_WORD[t.kind]}><svg viewBox="0 0 44 28"><path d={IC[t.kind]} /></svg></span>
          <span className="gh-disp d28">{t.name}</span>
          {!call && <><span className="gh-grow" /><span className="gh-col"><span className="gh-num big">{t.count.n}</span><span className="gh-names">{t.count.word}</span></span></>}
        </button>
        {call && t.ask && answer ? (
          <div className="gh-well gh-ask">
            <div className="gh-read">{t.ask.title}</div>
            <div className="gh-names">{answer.doing?.said ?? `${nameOn(t.ask.from, me)} handed it to you${t.ask.at ? ` ${agoOf(t.ask.at, Date.now())}` : ""}.`}</div>
            <div className="gh-row">
              <button type="button" className="gh-pill ctl" data-act="take" onClick={answer.take} disabled={!!answer.doing && !answer.doing.failed}>take it</button>
              <button type="button" className="gh-pill" data-act="later" onClick={answer.later}>not yet</button>
              <span className="gh-grow" />
              <button type="button" className="gh-pill" data-act="open" onClick={onOpen}>open the table</button>
            </div>
          </div>
        ) : !quiet && (
          <div className="gh-now">{t.line.coin && <Coin state={t.line.coin === "work" ? "work" : t.line.coin === "ask" ? "wait" : t.line.coin === "done" ? "done" : "idle"} size={18} />}<span className="gh-cut">{t.line.text}</span></div>
        )}
      </div>
    </div>
  );
}
