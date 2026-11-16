// One shared browser (#805, plan Part C slice 42; flows.md "The shared browser: the contract"; the still
// home/shots/flows-5.png), behind sol.home.whole and browser.shared. Face half; engine half #833. Home's place under
// Sources, "your browser":
// - the one line ("One browser, yours and Sol's. You sign in once.");
// - on the left, the sites you are signed in to and how far Sol's hand may go on each (the ladder, struck rungs it can
//   never take), kept until 30 days after last use; "sign in ›" on a site that is not, opening its sign-in in your hand;
//   banks and money never;
// - on the right, the tabs of the one browser: whose hand each is in, its address, signed in or not, the page (on main
//   the engine's screencast frames; drawn by the stub until #833), and under it what Sol's hand is doing, that it
//   stops before submit, and "take over ›";
// - spawn, one press from a thing: "open" in your hand, "run: …" in Sol's.
// Signing in once, in your hand, signs Sol's tab in too: one jar. What was just done stays at the foot with its undo.
// Drawn from the kit (Glass, Pill, Button, Home's warm answer); whole-browser.css lays it out.
import { Button, Glass, Pill } from "../../kit";
import { deep, dim, ink, mute, on, pearl } from "../../kit/paint";
import { CURVE, JELLY, PEARL, TYPE } from "../../kit/tokens";
import { Glyph, Warm } from "./First";
import { RUNGS } from "./policy";
import { browserLine, keptWord, loginOf, tabFoot, type Site, type Tab } from "./shared";
import { refusalWords } from "./refusals";   // C43
import { front, setSite, signOut, signedInStub, spawn, take, undoBrowser, useBrowser } from "./browserStore";
import { goTo } from "./sourcesStore";
import "../whole-browser.css";

const SUN = JELLY.warm[3], WARM = JELLY.warm[1], RED = JELLY.six[0];
const strike = (w: string) => [...w].map((c) => `${c}̶`).join("");

function SiteRow({ s }: { s: Site }) {
  return (
    <div className="hbr-site" data-site={s.id} data-signed={s.signedIn ? "in" : "out"} data-never={s.never || undefined}>
      <Glass r={CURVE.radius.card} step="card" />
      <span className="hbr-logo" style={{ background: s.never ? on(0.12) : pearl(0.9), color: deep() }}>{s.letter}</span>
      <div className="hbr-site-main">
        <div className="hbr-site-name">
          <b style={{ color: ink }}>{s.name}</b>
          <span style={{ color: mute }}>{s.domains.slice(0, 3).join(", ")}{s.signedIn ? ` · kept until ${keptWord(s.signedIn.keptUntil)}` : ""}</span>
        </div>
        <div className="hbr-scope" style={{ color: s.never ? RED : dim }}>{s.scope}</div>
      <div className="hbr-site-side">
        {s.never ? <span className="hbr-never" style={{ color: RED }}>never</span> : <>
          <Pill words={RUNGS.map((r) => (s.struck.includes(r) ? strike(r) : r))} picked={RUNGS.indexOf(s.rung)} h={28} onPick={(i) => setSite(s.id, RUNGS[i])} />{/* C43: settable, never above a struck rung */}
          {s.signedIn
            ? <button type="button" className="hbr-mini" style={{ color: mute }} onClick={() => signOut(s.id)}>signed in as you · sign out</button>
            : loginOf(s.id) && <button type="button" className="hbr-mini" data-signin={s.id} style={{ color: SUN }} onClick={() => spawn(loginOf(s.id)!, "you")}>not signed in · sign in ›</button>}
        </>}
      </div>
      </div>
    </div>
  );
}

/** the page in a tab: on main the engine's screencast frame; until #833 the stub draws what the site would show */
function Page({ t, site }: { t: Tab; site?: Site }) {
  const paper = { background: PEARL, color: deep() };
  // C43 (#806): refused before the page loaded: nothing was fetched, so there is no page to draw
  if (t.kind === "refused" && t.refused) return (
    <div className="hbr-page hbr-refused" data-page="refused" style={{ background: on(0.04), color: ink, borderColor: RED }}>
      <div className="hbr-ph" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px`, color: RED }}>Refused before it loaded</div>
      <div style={{ color: dim }}>{t.url.replace(/^https?:\/\/(www\.)?/, "")}: {refusalWords(t.refused)}.</div>
      <div style={{ color: dim }}>Nothing was fetched, in any hand. Use your own browser for money. The refusal is in the page ledger.</div>
    </div>
  );
  if (t.kind === "login") return (
    <div className="hbr-page" style={paper} data-page="login">
      <div className="hbr-ph" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>Sign in to {site?.name}</div>
      <label className="hbr-pl">Email<span className="hbr-field" style={{ borderColor: deep(0.2) }}>you@bu.edu</span></label>
      <label className="hbr-pl">Password<span className="hbr-field" style={{ borderColor: deep(0.2), color: deep(0.55) }}>•••••••••• · filled by your Passwords app</span></label>
      <button type="button" className="hbr-pbtn" data-page-signin style={{ background: deep(), color: PEARL }} onClick={() => signedInStub(t.id)}>Sign in</button>
    </div>
  );
  if (t.kind === "profile") return t.signedIn ? (
    <div className="hbr-page" style={paper} data-page="profile-in">
      <div className="hbr-ph" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>{t.title.includes("Sam") ? "Sam Ortiz" : "Your feed"}</div>
      <div style={{ color: deep(0.6) }}>{t.title.includes("Sam") ? "Recruiter · Northwind · Boston" : "signed in as you"}</div>
      {t.title.includes("Sam") && <div className="hbr-pp" style={{ color: deep(0.8) }}>About: hiring new-grad product engineers for the spring. Wrote to you on Nov 2 about the offer.</div>}
    </div>
  ) : (
    <div className="hbr-page" style={paper} data-page="profile-wall">
      <div className="hbr-ph" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>Sign in to see this profile</div>
      <div style={{ color: deep(0.6) }}>LinkedIn shows profiles to signed-in members only.</div>
    </div>
  );
  if (t.kind === "slides") return (
    <div className="hbr-page" style={paper} data-page="slides">
      <div className="hbr-ph" style={{ fontSize: TYPE.title[0], lineHeight: `${TYPE.title[1]}px` }}>Lecture 12 slides</div>
      <div style={{ color: deep(0.6) }}>bio 201 · posted today · 38 slides</div>
    </div>
  );
  return (
    <div className="hbr-page" style={paper} data-page="application">
      <div className="hbr-ph" style={{ fontSize: TYPE.read[0], lineHeight: `${TYPE.read[1]}px`, fontWeight: 600 }}>Product Engineer, New Grad</div>
      <div style={{ color: deep(0.6) }}>Figma · San Francisco · apply</div>
      <div className="hbr-pgrid">
        <label className="hbr-pl">Name<span className="hbr-field" style={{ borderColor: deep(0.2) }}>your name</span></label>
        <label className="hbr-pl">Résumé<span className="hbr-field" style={{ borderColor: deep(0.2) }}>resume-nov.pdf ✓</span></label>
      </div>
      <label className="hbr-pl">Why Figma?<span className="hbr-field hbr-tall" style={{ borderColor: WARM }}>Figma is the tool I learned design in.</span></label>
      <div className="hbr-psub"><span className="hbr-pbtn" aria-disabled style={{ background: deep(0.35), color: PEARL }}>Submit application</span><span style={{ color: deep(0.6) }}>Sol's hand stops here</span></div>
    </div>
  );
}

function TabView({ tabs, frontId, sites }: { tabs: Tab[]; frontId: string | null; sites: Site[] }) {
  const t = tabs.find((x) => x.id === frontId) ?? tabs[0];
  if (!t) return null;
  const site = sites.find((s) => s.id === t.site);
  let host = "", path = "";
  try { const u = new URL(t.url); host = u.hostname.replace(/^www\./, ""); path = u.pathname; } catch { /* none */ }
  return (
    <div className="hbr-tab" data-tab={t.id} data-hand={t.hand} data-tab-signed={t.signedIn ? "in" : "out"}>
      <Glass r={CURVE.radius.card} step="card" />
      <div className="hbr-strip" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === t.id} className="hbr-chip" data-chip={x.id} onClick={() => front(x.id)} style={{ color: x.id === t.id ? ink : dim }}>
            {x.id === t.id && <Glass r={CURVE.radius.chip} step="raised" />}
            <i style={x.hand === "sol" ? { background: WARM } : { borderColor: ink }} className={x.hand === "sol" ? "" : "ring"} />{x.title}
          </button>
        ))}
        {t.kind !== "refused" && <span className="hbr-live" style={{ color: mute }}>live</span>}   {/* a refused tab is not live (R3) */}
      </div>
      <div className="hbr-bar" style={{ color: dim }}>
        <b style={{ color: ink }}>{host}</b><span>{path}</span>
        <span className="hbr-who" data-who={t.kind === "refused" ? "refused" : t.signedIn ? "in" : "out"} style={{ color: t.kind === "refused" ? RED : t.signedIn ? dim : SUN }}>{t.kind === "refused" /* C43 */ ? "refused · not loaded" : t.signedIn ? "signed in as you" : "not signed in"}</span>
      </div>
      <Page t={t} site={site} />
      <div className="hbr-foot" style={{ color: dim }}>
        <i style={t.hand === "sol" ? { background: WARM } : { borderColor: ink }} className={t.hand === "sol" ? "" : "ring"} />
        <span data-foot>{tabFoot(t, site)}</span>
        {t.hand === "sol" && t.kind !== "refused" /* C43: nothing loaded, nothing to take over */ && <button type="button" className="hbr-mini" style={{ color: ink }} onClick={() => take(t.id)}>take over ›</button>}
      </div>
    </div>
  );
}

export function SharedBrowser() {
  const v = useBrowser();
  if (!v) return null;
  const [first, second] = browserLine();
  const done = v.done;
  return (
    <section className="hw hbr" data-place="talk" data-home-whole data-browser>
      <div className="hw-date" style={{ color: mute }}>
        <button type="button" className="hbr-back" style={{ color: dim }} onClick={() => goTo("sources")}>Sources</button> › your browser · one jar, in {v.jar.profile}, sealed with your Keychain{/* C43 (#806) */} · <button type="button" className="hbr-back" data-go="trust" style={{ color: dim }} onClick={() => goTo("trust")}>the trust and the page ledger ›</button>
      </div>
      <h1 className="hw-line t-display" data-line><span style={{ color: ink }}>{first}</span> <span style={{ color: dim }}>{second}</span></h1>
      <div className="hbr-cols">
        <div className="hbr-left">
          <div className="hbr-label" style={{ color: mute }}>signed in, and how far Sol's hand may go on each</div>
          {v.sites.map((s) => <SiteRow key={s.id} s={s} />)}
        </div>
        <div className="hbr-right">
          <TabView tabs={v.tabs} frontId={v.front} sites={v.sites} />
          <div className="hbr-label" style={{ color: mute }}>spawn: a tab or a run, from a thing, one press</div>
          <div className="hbr-thing" data-thing-spawn="t-slides">
            <Glass r={CURVE.radius.row} step="card" />
            <span style={{ color: dim }}><Glyph source="canvas" /></span>
            <span className="hbr-thing-t"><span style={{ color: ink }}>Lecture 12 slides</span><small style={{ color: mute }}>bio 201 · new on Canvas</small></span>
            <Button h={28} onClick={() => spawn("https://canvas.bu.edu/courses/bio201/files/lecture-12", "you", "t-slides")}>open</Button>
            <Warm h={28} onClick={() => spawn("https://canvas.bu.edu/courses/bio201/files/lecture-12", "sol", "t-slides")}>run: save, make notes</Warm>
          </div>
          <div className="hbr-note" style={{ color: mute }}>Open: a tab for your hand, signed in. Run: Sol's hand, in a tab you watch and take over.</div>
          {/* C43 (#806): links in a mail, run in Sol's hand: a bank on the never list, a money site only Jev reads */}
          {[["l-chase", "Your statement is ready", "Chase · a link in a mail", "https://www.chase.com/statement"], ["l-rcu", "Confirm your login", "Riverside Credit Union · a link in a mail", "https://riverside-cu.org/login/confirm"]].map(([id, title, from, url]) => (
            <div key={id} className="hbr-thing" data-thing-spawn={id}>
              <Glass r={CURVE.radius.row} step="card" />
              <span style={{ color: dim }}><Glyph source="mail" /></span>
              <span className="hbr-thing-t"><span style={{ color: ink }}>{title}</span><small style={{ color: mute }}>{from}</small></span>
              <Button h={28} onClick={() => spawn(url, "sol", id)}>run: open it</Button>
            </div>
          ))}
        </div>
      </div>
      {done && done.line && (
        <div className="hbr-receipt" data-receipt="browser" role="status">
          <Glass r={CURVE.radius.row} step="pop" />
          <span style={{ color: dim }}>{done.line}</span>
          {done.ledgerId && <button type="button" className="hbr-mini" style={{ color: ink }} onClick={() => undoBrowser(done.ledgerId)}>undo</button>}
        </div>
      )}
    </section>
  );
}
