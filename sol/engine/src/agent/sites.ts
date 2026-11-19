// The sites a folder's agent reads (step 2), where each one signs in, and when its sign-in is done. Each address can be
// pointed at a fake for the tests: SOL_BLACKBOARD, SOL_OUTLOOK, SOL_GMAIL, SOL_WHATSAPP, SOL_TEAMS.
//   blackboard  learn.bu.edu        the course (sources/blackboard.ts)
//   outlook     outlook.office.com  BU mail (sources/mail.ts)
//   gmail       mail.google.com     Gmail (sources/mail.ts)
//   whatsapp    web.whatsapp.com    the group chat (sources/gc.ts)
//   teams       teams.microsoft.com Teams (sources/teams.ts)
export const SITES = ["blackboard", "outlook", "gmail", "whatsapp", "teams"] as const;
export type Site = (typeof SITES)[number];

const REAL: Record<Site, { env: string; base: string; signin: string; name: string; source: string }> = {
  blackboard: { env: "SOL_BLACKBOARD", base: "https://learn.bu.edu", signin: "/ultra/course", name: "Blackboard", source: "blackboard" },
  outlook: { env: "SOL_OUTLOOK", base: "https://outlook.office.com", signin: "/mail/", name: "BU mail", source: "mail" },
  gmail: { env: "SOL_GMAIL", base: "https://mail.google.com", signin: "/mail/u/0/#inbox", name: "Gmail", source: "mail" },
  whatsapp: { env: "SOL_WHATSAPP", base: "https://web.whatsapp.com", signin: "/", name: "WhatsApp", source: "gc" },
  teams: { env: "SOL_TEAMS", base: "https://teams.microsoft.com", signin: "/v2/", name: "Teams", source: "teams" },
};

export const isSite = (s: unknown): s is Site => SITES.includes(s as Site);
/** where a site is: its fake when the test sets one, else the real address (no trailing slash) */
export const baseOf = (site: Site) => (process.env[REAL[site].env] || REAL[site].base).replace(/\/+$/, "");
export const signinUrl = (site: Site) => baseOf(site) + REAL[site].signin;
export const nameOf = (site: Site) => REAL[site].name;
/** the rule source a site serves */
export const sourceOf = (site: Site) => REAL[site].source;
/** the sites a rule source reads (mail: both inboxes) */
export const sitesOf = (source: string): Site[] => SITES.filter((s) => REAL[s].source === source);

/** the site a page address is on (pure): by its origin, a fake's included; null for anything else */
export function siteAt(url: string): Site | null {
  let o = "";
  try { o = new URL(url).origin; } catch { return null; }
  for (const s of SITES) {
    try { if (new URL(baseOf(s)).origin === o) return s; } catch { /* a bad env */ }
  }
  // the real sites' other doors
  if (/^https:\/\/outlook\.(office365\.com|live\.com)$/.test(o)) return "outlook";
  return null;
}

/** is the sign-in done, by what the window shows (pure)? The page is on the site, past its sign-in */
export function signedInAt(site: Site, url: string, text: string): boolean {
  if (siteAt(url) !== site) return false;
  const t = text.slice(0, 3000);
  switch (site) {
    case "blackboard": return /\/ultra\//.test(url) && !/\b(sign in|log in|password)\b/i.test(t.slice(0, 600));
    case "outlook": return /\/mail\b/.test(url) && /\b(inbox)\b/i.test(t);
    case "gmail": return /\/mail\//.test(url) && /\binbox\b/i.test(t);
    case "whatsapp": return !/\b(scan the qr|link with phone|use whatsapp on your computer|log in)\b/i.test(t) && /\bchats?\b/i.test(t);
    case "teams": return !/\b(sign in|pick an account)\b/i.test(t.slice(0, 600)) && /\b(chat|activity)\b/i.test(t);
  }
}

/** a page on a site that asks to sign in, not the site itself (pure; a look that meets one asks for the sign-in) */
export const signInPage = (site: Site, url: string, text: string) => !signedInAt(site, url, text);
