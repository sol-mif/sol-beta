// The trust and the page ledger (#806, plan Part C slice 43; flows.md "The shared browser: the contract"; the still
// home/shots/flows-5-2.png), behind sol.home.whole and browser.shared. Face half; engine half #834. Home's place under
// your browser: "What it keeps, and what it never touches." Three columns (kept, on this Mac only; never kept; never
// touched), then the page ledger: every page Sol's hand opened today and yours where it mattered, each signed by whose
// hand, what was done there (fields typed, by whom; a submit is always yours; a refusal is a row), and for which flow.
// Drawn from the kit (Glass); whole-browser.css lays it out.
import { Glass } from "../../kit";
import { dim, ink, mute } from "../../kit/paint";
import { CURVE, JELLY } from "../../kit/tokens";
import { ledgerCounts, NEVER, refusalWords, LAPSE_DAYS, submitsAreYours, fieldsBy } from "./refusals";
import { useBrowser } from "./browserStore";
import { goTo } from "./sourcesStore";

const WARM = JELLY.warm[1], RED = JELLY.six[0];
const hm = (t: number) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

export function Trust() {
  const v = useBrowser();
  if (!v) return null;
  const c = ledgerCounts(v.ledger), signed = v.sites.filter((s) => s.signedIn).length;
  const rows = [...v.ledger].sort((a, b) => b.at - a.at);
  return (
    <section className="hw hbr" data-place="talk" data-home-whole data-trust>
      <div className="hw-date" style={{ color: mute }}>
        <button type="button" className="hbr-back" style={{ color: dim }} onClick={() => goTo("sources")}>Sources</button> › <button type="button" className="hbr-back" style={{ color: dim }} onClick={() => goTo("browser")}>your browser</button> › the trust
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>What it keeps,</span> <span style={{ color: dim }}>and what it never touches.</span></h1>
      <div className="htr-cols">
        <div className="htr-col" data-col="kept">
          <Glass r={CURVE.radius.card} step="card" />
          <h5 style={{ color: ink }}>Kept, on this Mac only</h5>
          <p style={{ color: ink }}>Your sessions: the cookies that keep {signed} sites signed in.<small style={{ color: dim }}>In Sol's browser profile on this Mac, sealed with a key in your Keychain. Never synced, never on the NucBox, never in a repo. A site's sign-in lapses {LAPSE_DAYS} days after you last use it.</small></p>
          <p style={{ color: ink }}>The page ledger below.<small style={{ color: dim }}>Every page Sol's hand opened and every field it typed, signed; a submit is always yours.</small></p>
        </div>
        <div className="htr-col" data-col="never-kept">
          <Glass r={CURVE.radius.card} step="card" />
          <h5 style={{ color: ink }}>Never kept</h5>
          <p style={{ color: ink }}>Your passwords.<small style={{ color: dim }}>You sign in once, with your own hand; your Passwords app fills them. Sol's hand never reads or types into a password field.</small></p>
          <p style={{ color: ink }}>Codes and cards.<small style={{ color: dim }}>Two-factor codes and card numbers: the tab is handed to you.</small></p>
        </div>
        <div className="htr-col" data-col="never-touched">
          <Glass r={CURVE.radius.card} step="card" />
          <h5 style={{ color: RED }}>Never touched</h5>
          <p style={{ color: ink }}>{NEVER.map((n) => n.kind.replace(/^an? /, "")).join(", ")}.<small style={{ color: dim }}>Refused before the page loads, in any hand: a list, and Jev's question "is this a money site?" at .45, the lower line because refusing is cheap. The refusal is in the ledger. Use your own browser for money.</small></p>
        </div>
      </div>
      <div className="htr-lh" style={{ color: mute }}>
        <span>every page Sol's hand opened today, and yours where it mattered</span>
        <span data-ledger-counts>Sol {c.sol} · you {c.you} · refused {c.refused} · submits {c.submits}, {submitsAreYours(v.ledger) ? "all yours" : <span style={{ color: RED }}>not all yours</span>}</span>
      </div>
      <div className="htr-rows" data-ledger={v.ledger.length}>
        {rows.map((r) => (
          <div key={r.id} className="htr-row" data-visit={r.id} data-hand={r.hand} data-refused={r.refused ? "yes" : undefined}>
            <span className="htr-tm" style={{ color: mute }}>{hm(r.at)}</span>
            <i className={r.hand === "you" ? "ring" : ""} style={r.refused ? { background: RED } : r.hand === "sol" ? { background: WARM } : { borderColor: ink }} title={r.hand === "sol" ? "Sol's hand" : "your hand"} />
            <span className="htr-what"><span style={{ color: ink }}>{short(r.url)}</span> <span style={{ color: r.refused ? RED : dim }}>· {r.did}{r.refused ? `: ${refusalWords(r.refused)}` : ""}</span>
              {r.fields && <span style={{ color: mute }}> · {r.fields.map((f) => f.name).join(", ")}, by {fieldsBy(r.fields)}</span>}</span>
            <small style={{ color: mute }}>{r.hand === "sol" ? "Sol" : "you"} · {r.flow}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
