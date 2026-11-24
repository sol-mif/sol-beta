// The sieve (BR1 "How Sol sees you", #1615; the brief on #1615, E4): every name the read finds passes through it
// before anything is counted, summed or stored. Five bins: keys, money, health, talk, id. A binned item is dropped and
// only its bin's count is kept; a bin the person ticked "keep" is let through. It starts from what Sol already keeps
// away: the hosts that hold private things (onboard/explore.mjs HOLDS) and the folders that hold secrets
// (inventory.ts SECRET_DIRS), and adds the words and shapes of each bin. Pure: it reads nothing and writes nothing.
// What it judges is a name (a file's, a note's title, a host, a folder, an event's name), never a body: the read
// never has one to give it.
// Signed: marcocyl04-ux's agent (builder E), BR1 (#1615).

export const BINS = ["keys", "money", "health", "talk", "id"] as const;
export type Bin = (typeof BINS)[number];
/** `kind` "app": an installed app's name is judged by its shape only (having Messages or a bank's app is not private) */
export type Item = { name: string; host?: string; path?: string; kind?: "app" | "name" };
export type Thrown = Record<Bin, number>;

/** the folders that hold secrets, relative to the person's home (inventory.ts SECRET_DIRS, without Claude's and Codex's:
 *  their sessions are read by name through carry-apps.ts, never their keys) */
const SECRET_DIRS = [".hermes", ".ssh", ".gnupg", ".aws", ".config/gh", "Library/Keychains", ".password-store", ".kube", ".docker"];

/** hosts, as explore.mjs HOLDS sorts them: private talk, money; then health and identity services */
const HOST: [Bin, RegExp][] = [
  ["talk", /(^|\.)(mail\.|outlook\.|proton|whatsapp|messages\.|messenger|discord|telegram|signal|teams\.|instagram|facebook|chat\.|claude\.ai$|chatgpt\.com$|icloud\.com$|fastmail|hey\.com$|tinder|bumble|hinge\.co$)/i],
  ["money", /(^|\.)(bank|chase\.|paypal|venmo|revolut|wise\.com$|coinbase|binance|kraken\.com$|robinhood|schwab|fidelity|vanguard|monzo|n26\.|cash\.app$|zelle|amex|americanexpress|capitalone|wellsfargo|citi\.com$|hsbc|barclays|santander|ing\.(nl|com|de)$|klarna|creditkarma|mint\.intuit|turbotax|irs\.gov$)|bank[a-z0-9-]*\.[a-z]/i],   // a bank by any name: kakaobank, a-bank
  ["health", /(^|\.)(mychart|zocdoc|teladoc|healthline|webmd|patient|doctolib|onemedical|kaiser|cvs\.com$|walgreens|goodrx|betterhelp|talkspace|headspace|calm\.com$|23andme|ancestry|flo\.health$|clue\.)/i],
  ["id", /(^|\.)(login\.gov$|id\.me$|idme|ssa\.gov$|travel\.state\.gov$|dmv\.|gov\.uk$|digid\.nl$|ameli\.fr$)/i],
];

/** words in a name, by bin; matched on word edges so "Monkey" is not money and "keyboard" not a key */
const WORDS: [Bin, RegExp][] = [
  ["keys", /(^|[^a-z])(pass(word|wd|code|phrase)?s?|pwd|secrets?|tokens?|api[ _-]?keys?|credentials?|creds|private[ _-]?key|keychain|1password|bitwarden|lastpass|dashlane|keepass|otp|2fa|mfa|recovery[ _-]?codes?|seed[ _-]?phrase|mnemonic|pin[ _-]?codes?|id_rsa|id_ed25519|ssh[ _-]?keys?|\.env|\.pem|\.p12|\.pfx|\.key|\.kdbx|\.gpg|\.asc)([^a-z]|$)/i],
  ["money", /(^|[^a-z])(bank(ing)?|invoices?|receipts?|payslips?|pay[ _-]?stubs?|salary|salaries|tax(es)?|w-?2|1099|budget|loan|mortgage|credit[ _-]?card|debit|iban|account[ _-]?numbers?|venmo|paypal|crypto|brokerage|401k|pension|net[ _-]?worth|expenses?|bills?)([^a-z]|$)/i],
  ["health", /(^|[^a-z])(health|medical|medicine|doctors?|dr\.|clinic|hospital|therapy|therapist|psychiatr\w*|psycholog\w*|counsel(l)?ing|pharmacy|prescriptions?|rx|diagnos\w*|lab[ _-]?results?|blood[ _-]?test|vaccin\w*|dentist|dental|insurance[ _-]?claim|mental|meds|medication|symptoms?|pregnan\w*|fertility|ivf|hiv|cancer|surgery|physio\w*)([^a-z]|$)/i],
  ["talk", /(^|[^a-z])(diary|journal|private|personal[ _-]?letters?|love[ _-]?letters?|chat[ _-]?logs?|messages?|whatsapp|imessage|sms|dm|dms|texts? with|breakup|divorce)([^a-z]|$)/i],
  ["id", /(^|[^a-z])(passports?|ssn|social[ _-]?security|driver'?s?[ _-]?licen[cs]e|licen[cs]e[ _-]?scan|id[ _-]?cards?|national[ _-]?id|birth[ _-]?certificate|visa[ _-]?scan|green[ _-]?card|residence[ _-]?permit|tax[ _-]?id|tin[ _-]?number|bsn|nino|personalausweis)([^a-z]|$)/i],
];
/** words in other scripts the panel needs (Korean, Spanish): the same five bins */
const WORDS_INTL: [Bin, RegExp][] = [
  ["keys", /비밀번호|암호|contraseña|clave/i],
  ["money", /은행|계좌|급여|세금|청구서|영수증|banco|factura|nómina|impuestos/i],
  ["health", /병원|건강|진료|처방|약국|salud|médico|clínica|receta/i],
  ["talk", /일기|사적|diario|privado/i],
  ["id", /여권|주민등록|신분증|pasaporte|dni/i],
];
/** shapes that are a secret whatever they are called: a provider's key, a long token, a card number */
const SHAPES = /(sk-(ant-|proj-|or-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b[A-Fa-f0-9]{32,}\b|\b(?:\d[ -]?){13,19}\b)/;

const under = (path: string, dir: string) => new RegExp(`(^|/)${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`).test(path);

/** the bin a name falls in, or null when it is let through to be counted (pure) */
export function binOf(it: Item): Bin | null {
  const name = String(it.name ?? ""), path = String(it.path ?? ""), host = String(it.host ?? "").toLowerCase();
  if (SHAPES.test(name) || SHAPES.test(path)) return "keys";
  if (path && SECRET_DIRS.some((d) => under(path, d))) return "keys";
  if (host) for (const [bin, re] of HOST) if (re.test(host)) return bin;
  if (it.kind === "app") return null;
  const words = `${name} ${path.split("/").slice(-3).join(" ")}`;
  for (const [bin, re] of WORDS) if (re.test(words)) return bin;
  for (const [bin, re] of WORDS_INTL) if (re.test(words)) return bin;
  return null;
}

export const noneThrown = (): Thrown => ({ keys: 0, money: 0, health: 0, talk: 0, id: 0 });
export const okBins = (v: unknown): Bin[] => (Array.isArray(v) ? [...new Set(v.filter((b): b is Bin => (BINS as readonly string[]).includes(b)))] : []);

/** a sieve for one read: `pass` says whether an item may be counted, and counts the ones it drops by bin. A bin in
 *  `keep` is let through (the person ticked it) */
export function makeSieve(keep: Bin[] = []) {
  const thrown = noneThrown(), kept = new Set(keep);
  return {
    thrown,
    /** the item's bin when it was dropped (counted), null when it passes */
    drop(it: Item): Bin | null {
      const b = binOf(it);
      if (!b || kept.has(b)) return null;
      thrown[b] += 1;
      return b;
    },
    pass(it: Item): boolean { return this.drop(it) === null; },
  };
}
