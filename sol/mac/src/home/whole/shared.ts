// One shared browser (#805, plan Part C slice 42; flows.md "The shared browser: the contract", scene 5; the morning
// report's BLOCKED: "one cookie jar between the engine's Chromium and the app's web view; today there are two"), behind
// sol.home.whole and its own switch browser.shared. Face half; the engine half is #833 (Frank's); what may be shared is
// the product decision filed with this PR (browser trust). The pure half and its stub:
// - one jar: the engine's Chromium profile (home/browser-profile on main, one persistent context: every tab in it shares
//   its cookies), sealed with a key in the Keychain; the app shows its tabs by screencast, so there is no second jar;
// - the sites you are signed in to, each with how far Sol's hand may go (the ladder, some rungs struck), kept until 30
//   days after last use; banks and money never, in any hand;
// - tabs, each in a hand: yours (you type, sign in, submit) or Sol's (you watch, you take over; it stops before submit);
// - spawn, one press from a thing: "open" (your hand) or "run: …" (Sol's hand).
// Signing in once, in your hand, signs every tab on that site in: Sol's too. Nothing here draws; SharedBrowser.tsx does.
//
// Stubbed until #833 lands: `stub()` answers `browser.sites`, `browser.spawn {thingId, url, hand}`, `browser.take
// {tabId}`, `browser.signout {siteId}` and `home.undo {ledgerId}` with one `browser.sites` message. The engine sees a
// sign-in itself (the site's cookies arrive in the jar); the stub cannot, so its mock login page has a "sign in" press that
// stands in for you finishing it (`browser.stub.signedin {tabId}`, the stub's only, never the engine's).
import { RUNGS, type Rung } from "./policy.ts";
import { LAPSE_DAYS, lapsed, refusalOf, refusalWords, seedVisits, type Refusal, type Visit } from "./refusals.ts";   // C43 (#806)

export type Hand = "you" | "sol";
export type Site = { id: string; name: string; domains: string[]; letter: string; scope: string; rung: Rung; struck: Rung[]; never?: true;
  signedIn: { as: string; keptUntil: number } | null };
/** a tab of the one browser: whose hand, what it shows, and whether the jar signs it in */
export type Tab = { id: string; thingId?: string; url: string; title: string; hand: Hand; site: string | null; signedIn: boolean;
  kind: "login" | "profile" | "application" | "slides" | "refused"; step?: { n: number; of: number; text: string }; stopsBeforeSubmit?: boolean; waiting?: string;
  refused?: Refusal };   // C43: a tab whose page never loaded
export type BrowserDone = { ledgerId: string; line: string };
/** the engine's message after every ask (#833) */
export type BrowserMsg = { type: "browser.sites"; jar: { sealed: "keychain"; profile: string; sites: string[] }; sites: Site[]; tabs: Tab[]; front: string | null; done: BrowserDone | null;
  ledger: Visit[] };   // C43 (#806): the page ledger, today
export type BrowserAsk =
  | { type: "browser.sites" }
  | { type: "browser.spawn"; thingId?: string; url: string; hand: Hand }
  | { type: "browser.take"; tabId: string }
  | { type: "browser.front"; tabId: string }
  | { type: "browser.signout"; siteId: string }
  | { type: "browser.stub.signedin"; tabId: string }
  | { type: "home.undo"; ledgerId: string }
  | { type: "browser.site.set"; siteId: string; rung: Rung }   // C43: flows.md browser.site.set {domain, rung}
  | { type: "browser.ledger"; day?: number };                  // C43

/** the site a URL belongs to (pure), or null */
export function siteOf(url: string, sites: Site[]): Site | null {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
  return sites.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}
/** the jar's rule (pure): a tab is signed in when its site is in the jar, whoever's hand it is in */
export const signedInAt = (tab: Pick<Tab, "site">, jar: string[]) => !!tab.site && jar.includes(tab.site);
/** may Sol's hand open this URL? (pure): never a site on the never list, in any hand */
export const refused = (url: string, sites: Site[]) => !!siteOf(url, sites)?.never;
const DAY = 864e5;
export const keptWord = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(/^(\d+) (\w+)$/, "$2 $1");

// ── the stub (until #833) ────────────────────────────────────────────────────────────────────────────────────────
export function seedSites(now: number): Site[] {
  const kept = (days: number) => ({ as: "you", keptUntil: now + days * DAY });
  return [
    { id: "linkedin", name: "LinkedIn", domains: ["linkedin.com"], letter: "in", scope: "reads profiles and posts · types messages · sends only on your yes", rung: "draft", struck: [], signedIn: null },
    { id: "handshake", name: "Handshake", domains: ["joinhandshake.com"], letter: "H", scope: "reads postings · saves them to jobs", rung: "draft", struck: [], signedIn: kept(35) },
    { id: "portals", name: "Job portals", domains: ["greenhouse.io", "myworkdayjobs.com", "lever.co"], letter: "G", scope: "fills applications · never presses submit", rung: "draft", struck: ["act"], signedIn: kept(35) },
    { id: "canvas", name: "Canvas", domains: ["canvas.bu.edu"], letter: "C", scope: "reads courses · saves slides · never turns work in", rung: "draft", struck: ["act"], signedIn: kept(23) },
    { id: "github", name: "GitHub", domains: ["github.com"], letter: "GH", scope: "reads the team's PRs · comments only on your yes", rung: "propose", struck: [], signedIn: kept(35) },
    { id: "money", name: "Banks and money", domains: ["chase.com", "paypal.com", "venmo.com", "bankofamerica.com"], letter: "$", scope: "never: Sol's hand cannot open them, here or anywhere", rung: "read", struck: [], never: true, signedIn: null },
  ];
}
export function seedTabs(): Tab[] {
  return [
    { id: "t-sam", thingId: "t-follow-sam", url: "https://www.linkedin.com/in/sam-ortiz", title: "Sam Ortiz · LinkedIn", hand: "sol", site: "linkedin", signedIn: false, kind: "profile",
      step: { n: 1, of: 3, text: "reading Sam Ortiz's profile for the follow-up" } },
    { id: "t-figma", thingId: "t-figma-app", url: "https://boards.greenhouse.io/figma/jobs/5123", title: "Figma · Greenhouse", hand: "sol", site: "portals", signedIn: true, kind: "application",
      step: { n: 4, of: 7, text: "field 4 of 7" }, stopsBeforeSubmit: true },
  ];
}
// every site a tab can wait on has a way to sign in (R2: Handshake and Job portals too, so a waiting tab always has a press)
const LOGIN: Record<string, string> = { linkedin: "https://www.linkedin.com/login", handshake: "https://app.joinhandshake.com/login", portals: "https://my.greenhouse.io/users/sign_in", canvas: "https://canvas.bu.edu/login", github: "https://github.com/login" };
export const loginOf = (siteId: string) => LOGIN[siteId] ?? null;

export function stub(now: () => number = Date.now) {
  let sites = seedSites(now()), tabs = seedTabs(), front: string | null = "t-sam";
  const kept = new Map<string, { sites: Site[]; tabs: Tab[]; front: string | null }>();
  let n = 0;
  let ledger: Visit[] = seedVisits(now());   // C43: the page ledger is a record: an undo never takes a row out
  const visit = (v: Omit<Visit, "id" | "at">) => { ledger = [...ledger, { ...v, id: `v-${ledger.length + 1}`, at: now() }]; };
  const jar = () => sites.filter((s) => s.signedIn).map((s) => s.id);
  // a sign-in past its day lapses (R4): out of the jar, and every tab on it waits again
  const sync = () => {
    if (sites.some((s) => lapsed(s.signedIn, now()))) sites = sites.map((s) => (lapsed(s.signedIn, now()) ? { ...s, signedIn: null } : s));
    const j = jar(); tabs = tabs.map((t) => ({ ...t, signedIn: signedInAt(t, j) }));
  };
  sync();
  // the last receipt stays while you look around (choosing a tab is not an act); an undo or a new act replaces it
  let last: BrowserDone | null = null;
  const msg = (done: BrowserDone | null, keepLast = false): BrowserMsg => {
    last = keepLast ? last : done;
    return { type: "browser.sites", jar: { sealed: "keychain", profile: "home/browser-profile", sites: jar() }, sites, tabs, front, done: last, ledger };
  };
  const keep = () => { const ledgerId = `b${++n}`; kept.set(ledgerId, { sites, tabs, front }); return ledgerId; };
  return (a: BrowserAsk): BrowserMsg => {
    if (a.type === "browser.sites" || a.type === "browser.ledger") return msg(null, true);
    // C43: a site's rung, never above what it may ever take (a struck rung stays struck)
    if (a.type === "browser.site.set") {
      const s = sites.find((x) => x.id === a.siteId);
      if (!s || s.never || s.rung === a.rung) return msg(null, true);
      if (RUNGS.indexOf(a.rung) >= ceilingOf(s))
        return msg({ ledgerId: "", line: `${s.name} can never be at ${a.rung}: ${s.scope.split(" · ").pop()}` });
      const ledgerId = keep();
      sites = sites.map((x) => (x.id === s.id ? { ...x, rung: a.rung } : x));
      return msg({ ledgerId, line: `${s.name}: Sol's hand at ${a.rung} now` });
    }
    if (a.type === "home.undo") { const was = kept.get(a.ledgerId); if (was) ({ sites, tabs, front } = was); kept.delete(a.ledgerId); return msg(null); }
    if (a.type === "browser.front") { if (tabs.some((t) => t.id === a.tabId)) front = a.tabId; return msg(null, true); }
    if (a.type === "browser.spawn") {
      const site = siteOf(a.url, sites);
      // C43 (#806): refused before the page loads, in any hand: the never list, or Jev's money question at .45. The tab
      // shows the refusal; nothing was fetched; the ledger keeps the row
      const refusal: Refusal | null = refusalOf(a.url) ?? (site?.never ? { by: "list", kind: "money" } : null);
      if (refusal) {
        const ledgerId = keep(), id = `t-${n}`, host = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return a.url; } })();
        tabs = [...tabs, { id, thingId: a.thingId, url: a.url, title: `${host} · refused`, hand: a.hand, site: site?.id ?? null, signedIn: false, kind: "refused", refused: refusal }];
        front = id;
        visit({ hand: a.hand, url: a.url, did: "refused before it loaded", flow: a.thingId ? "a link in a mail" : "—", refused: refusal });
        return msg({ ledgerId, line: `Refused before it loaded: ${host}, ${refusalWords(refusal)} · nothing was fetched · in the ledger` });
      }
      const ledgerId = keep(), id = `t-${n}`, login = site && loginOf(site.id) === a.url;
      tabs = [...tabs, { id, thingId: a.thingId, url: a.url, title: login ? `${site!.name} · sign in` : `${site?.name ?? new URL(a.url).hostname}`, hand: a.hand, site: site?.id ?? null, signedIn: false,
        kind: login ? "login" : site?.id === "canvas" ? "slides" : site?.id === "linkedin" ? "profile" : "application",
        ...(a.hand === "sol" ? { step: { n: 1, of: 3, text: "saving the slides to bio 201" } } : {}) }];
      // using a signed-in site keeps it LAPSE_DAYS from now (R4: "kept 30 days after it was last used")
      if (site?.signedIn && !lapsed(site.signedIn, now())) sites = sites.map((x) => (x.id === site.id ? { ...x, signedIn: { ...site.signedIn!, keptUntil: now() + LAPSE_DAYS * DAY } } : x));
      front = id; sync();
      visit({ hand: a.hand, url: a.url, did: a.hand === "you" ? "you opened it" : "Sol's hand opened it", flow: a.thingId ? "from a thing" : "—" });   // C43
      return msg({ ledgerId, line: a.hand === "you" ? `Opened ${login ? `${site!.name}'s sign-in` : a.url.replace(/^https?:\/\/(www\.)?/, "")} in your hand${!login && site?.signedIn ? ", signed in" : ""}` : "Sol's hand is running it; watch it here, take over any time" });
    }
    if (a.type === "browser.take") {
      const t = tabs.find((x) => x.id === a.tabId);
      if (!t || t.hand === "you") return msg(null, true);   // a press that does nothing keeps the receipt (R1)
      const ledgerId = keep();
      tabs = tabs.map((x) => (x.id === t.id ? { ...x, hand: "you", step: x.step ? { ...x.step, text: `${x.step.text} · yours now` } : undefined } : x));
      return msg({ ledgerId, line: `You took over ${t.title}; Sol's hand stopped` });
    }
    if (a.type === "browser.signout") {
      const s = sites.find((x) => x.id === a.siteId);
      if (!s?.signedIn) return msg(null, true);
      const ledgerId = keep();
      sites = sites.map((x) => (x.id === s.id ? { ...x, signedIn: null } : x)); sync();
      return msg({ ledgerId, line: `Signed out of ${s.name}, in every tab` });
    }
    // the stub's stand-in for you finishing a sign-in in your own hand: the site's cookies are in the one jar now
    const t = tabs.find((x) => x.id === a.tabId), s = t?.site ? sites.find((x) => x.id === t.site) : undefined;
    if (!t || !s || t.hand !== "you" || s.signedIn) return msg(null, true);
    const ledgerId = keep();
    sites = sites.map((x) => (x.id === s.id ? { ...x, signedIn: { as: "you", keptUntil: now() + LAPSE_DAYS * DAY } } : x));
    tabs = tabs.map((x) => (x.id === t.id ? { ...x, kind: "profile", title: `${s.name} · you`, url: s.domains[0] ? `https://www.${s.domains[0]}/feed` : x.url }
      : x.site === s.id && x.hand === "sol" ? { ...x, waiting: undefined, step: x.step ? { ...x.step, n: Math.max(2, x.step.n) } : x.step } : x));
    sync();
    visit({ hand: "you", url: t.url, did: `you signed in to ${s.name}`, flow: "—" });   // C43
    const sols = tabs.filter((x) => x.site === s.id && x.hand === "sol");
    if (sols[0]) { front = sols[0].id; kept.get(ledgerId)!.front = front; }   // back to Sol's tab, now signed in; undo leaves it in front, waiting again (R5)
    return msg({ ledgerId, line: `You signed in to ${s.name} once; ${sols.length ? `Sol's tab is signed in too` : "every tab on it is signed in"} · kept until ${keptWord(now() + LAPSE_DAYS * DAY)}` });
  };
}
/** C43: the first rung a site may never take (its lowest struck one), or past act when none is struck (pure) */
export const ceilingOf = (s: Pick<Site, "struck">) => (s.struck.length ? Math.min(...s.struck.map((r) => RUNGS.indexOf(r))) : RUNGS.length);
/** the place's one line (scene 5: "One browser, yours and Sol's. You sign in once.") */
export const browserLine = (): [string, string] => ["One browser, yours and Sol's.", "You sign in once."];
/** what a tab says under it (scene 5: "Sol's hand · field 4 of 7 · stops before submit") */
export function tabFoot(t: Tab, site: Site | undefined): string {
  if (t.kind === "refused") return `${t.hand === "sol" ? "Sol's hand" : "your hand"} · refused before the page loaded; nothing was fetched`;   // C43
  if (t.hand === "you") return t.kind === "login" ? `your hand · sign in to ${site?.name ?? "the site"}; your Passwords app fills it, Sol never types a password` : "your hand";
  if (!t.signedIn) return `Sol's hand · waits: ${site?.name ?? "the site"} is not signed in; sign in once, in your hand`;
  return `Sol's hand · ${t.step?.text ?? "working"}${t.stopsBeforeSubmit ? " · stops before submit" : ""}`;
}
