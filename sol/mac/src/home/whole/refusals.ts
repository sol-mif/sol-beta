// Site scopes, the money refusal, the page ledger (#806, plan Part C slice 43; flows.md "The shared browser: the
// contract": "Never touched: banks and money … refused before the page loads, in any hand. A domain list plus Jev noul
// 'is this a money site?' at .45 (the lower line, because refusing is cheap)"; "The page ledger: every visit and every
// field typed, by whom, with which flow … a submit is always his row"; "Kept until <date>: a site's sign-in lapses after
// 30 days unless used"; scene 5 step 2), behind sol.home.whole and browser.shared. Face half; engine half #834. Pure:
// the never list, the money check, the ledger's shape and its seed, the lapse. shared.ts's stub uses them (`// C43`);
// SharedBrowser.tsx and Trust.tsx draw them.

/** what is never touched, in any hand (scene 5 step 2, "Never touched"): banks, brokerages, payments, health portals,
 *  the Apple and Google account pages, password managers. The engine keeps this list (#834); a URL not on it still goes
 *  through Jev's money question. */
export const NEVER: { kind: string; domains: string[] }[] = [
  { kind: "a bank", domains: ["chase.com", "bankofamerica.com", "wellsfargo.com", "citi.com", "capitalone.com", "usbank.com", "tdbank.com"] },
  { kind: "a brokerage", domains: ["fidelity.com", "schwab.com", "robinhood.com", "vanguard.com", "etrade.com"] },
  { kind: "a payment", domains: ["paypal.com", "venmo.com", "cash.app", "stripe.com", "zellepay.com"] },
  { kind: "a health portal", domains: ["mychart.com", "patient.portal"] },
  { kind: "your account page", domains: ["appleid.apple.com", "myaccount.google.com"] },
  { kind: "a password manager", domains: ["1password.com", "bitwarden.com", "lastpass.com"] },
];
/** Jev's line for the money question: the lower one, because refusing is cheap */
export const MONEY_LINE = 0.45;

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** on the never list (pure): the kind it is, or null */
export function listed(url: string): string | null {
  const h = hostOf(url);
  return NEVER.find((n) => n.domains.some((d) => h === d || h.endsWith(`.${d}`)))?.kind ?? null;
}
/** Jev's `noul` "is this a money site?" (a stand-in until #834 asks Jev): the page's host and path read for money words */
export function moneyP(url: string): number {
  const s = (() => { try { const u = new URL(url); return `${u.hostname} ${u.pathname}`; } catch { return url; } })().toLowerCase();
  return /bank|credit-?union|\bf?cu\b|statement|wallet|payment|\bpay\b|loan|brokerage|invest|savings|mortgage|crypto/.test(s) ? 0.72 : 0.06;
}
export type Refusal = { by: "list"; kind: string } | { by: "jev"; p: number };
/** may any hand open this URL? (pure): refused when it is on the never list, or Jev reads it a money site at .45 or more */
export function refusalOf(url: string): Refusal | null {
  const kind = listed(url);
  if (kind) return { by: "list", kind };
  const p = moneyP(url);
  return p >= MONEY_LINE ? { by: "jev", p } : null;
}
/** the refusal in words (scene 5: "refused before it loaded: on the never list") */
export const refusalWords = (r: Refusal) => (r.by === "list" ? `on the never list (${r.kind})` : `Jev read it as a money site (${r.p.toFixed(2).replace(/^0/, "")}, refused from ${MONEY_LINE.toFixed(2).replace(/^0/, "")})`);

/** a visit in the page ledger (flows.md Visit {at, tab, hand, flowId?, fields:[{name, by}], submit?}): who opened what,
 *  what was done there, for which flow or thing; a refusal is a row too */
export type Visit = { id: string; at: number; hand: "you" | "sol"; url: string; did: string; flow: string;
  fields?: { name: string; by: "you" | "sol" }[]; submit?: true; refused?: Refusal };
/** scene 5 step 2's day, up to now */
export function seedVisits(now: number): Visit[] {
  const d = new Date(now), at = (h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  const sol7 = ["name", "email", "phone", "résumé", "links", "why Shopify", "start date"].map((name) => ({ name, by: "sol" as const }));
  const all: Visit[] = [
    { id: "v1", at: at(9, 0), hand: "sol", url: "https://www.linkedin.com/jobs", did: "3 searches · read 29 postings", flow: "applications" },
    { id: "v2", at: at(9, 2), hand: "sol", url: "https://boards.greenhouse.io/shopify", did: "typed 7 fields · did not submit", flow: "Shopify application", fields: sol7 },
    { id: "v3", at: at(9, 14), hand: "you", url: "https://boards.greenhouse.io/shopify", did: "you pressed submit", flow: "Shopify application", submit: true },
    { id: "v4", at: at(10, 21), hand: "sol", url: "https://boards.greenhouse.io/figma", did: "typed 4 fields · stopped", flow: "Figma application", fields: sol7.slice(0, 4) },
    { id: "v5", at: at(11, 2), hand: "sol", url: "https://canvas.bu.edu/courses/bio201", did: "saved lecture 11 slides", flow: "school" },
    { id: "v6", at: at(13, 40), hand: "sol", url: "https://www.chase.com/statement", did: "refused before it loaded", flow: "a link in a mail", refused: { by: "list", kind: "a bank" } },
    { id: "v7", at: at(17, 55), hand: "you", url: "https://canvas.bu.edu", did: "you signed in again (expired)", flow: "—" },
  ];
  return all.filter((v) => v.at <= now);
}
/** a sign-in lapses 30 days after it was last used (pure) */
export const LAPSE_DAYS = 30;
export const lapsed = (signedIn: { keptUntil: number } | null, now: number) => !!signedIn && signedIn.keptUntil < now;
/** the ledger's head line (scene 5 step 2: "every page Sol's hand opened today, and yours where it mattered") */
export function ledgerCounts(vs: Visit[]) {
  return { sol: vs.filter((v) => v.hand === "sol" && !v.refused).length, you: vs.filter((v) => v.hand === "you").length, refused: vs.filter((v) => v.refused).length, submits: vs.filter((v) => v.submit).length };
}
/** whose hands typed a visit's fields: Sol, you, or you and Sol (pure) */
export const fieldsBy = (fs: NonNullable<Visit["fields"]>) => (fs.every((f) => f.by === "sol") ? "Sol" : fs.every((f) => f.by === "you") ? "you" : "you and Sol");
/** every submit is yours (flows.md: "a submit is always his row") (pure) */
export const submitsAreYours = (vs: Visit[]) => vs.every((v) => !v.submit || v.hand === "you");
