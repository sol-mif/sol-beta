// Build becomes yours (#1089): a kept tool learns. The Sol user presses a kept tool (its ask fills the box), then edits
// the ask before sending, the same way, three times: the tool offers to take that edit, in one press (no versions: the
// edit is theirs already). Read on this machine only, from the fill and what was sent; nothing of it goes to Jev.
//
// The rule (pure): the sent words are laid against the tool's template, a blank ({name}) standing for a run of words up to the template's next word; what
// lines up keeps the template's words and blanks, what does not is the person's edit. The form of a send is the sent
// words with the blanks put back. The same form three times, and not the template already, is a thing to learn.

/** the words of an ask, kept with the space after each so a form reads as typed */
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const bare = (w: string) => w.toLowerCase().replace(/^[("'`[{]+|[)"'`\]},.;:!?]+$/g, "");
const isBlank = (w: string) => /^\{[^{}\n]{1,30}\}[,.;:!?)]*$/.test(w);
/** a blank token's own name and what follows it ("{hours}," → hours, ",") */
const blankOf = (w: string) => { const m = /^\{([^{}\n]{1,30})\}(.*)$/.exec(w); return m ? { name: m[1], tail: m[2] } : null; };

/** the sent ask with the template's blanks put back where they line up (pure): null when nothing lines up */
export function formOf(template: string, sent: string): string | null {
  const a = words(template), b = words(sent);
  if (!a.length || !b.length || a.length > 400 || b.length > 400) return null;
  // the longest run of words in common, a blank matching any one word (a value is one word: the reader's own rule)
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  const same = (i: number, j: number) => isBlank(a[i]) || bare(a[i]) === bare(b[j]);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = same(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  if (L[0][0] < Math.ceil(a.length / 2)) return null;   // most of the tool must still be there: else it is another ask
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (same(i, j) && L[i][j] === L[i + 1][j + 1] + 1) {
      const k = blankOf(a[i]);
      // a blank holds a run of words up to the template's next word ("Northside Bakery" for {client}), six at most
      const n = k ? runOf(a, b, i, j, L) : 1;
      out.push(k ? `{${k.name}}${b[j + n - 1].replace(/^.*?([,.;:!?)]*)$/, "$1")}` : b[j]);
      i++; j += n;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;   // a template word they took out
    else out.push(b[j++]);                         // a word they added
  }
  while (j < b.length) out.push(b[j++]);
  return out.join(" ");
}

/** how many sent words a blank at a[i] takes, from b[j] (pure): up to the template's next word when it follows within
 *  six, else one. The blank's own trailing mark ("{client}:") ends the run at the word that carries it. A run longer
 *  than one word is taken only when the best alignment still holds after it (L[i+1][j+n] is all of what is left):
 *  "#1049 then post a summary" is never one value when "post" and "summary" line up with the template */
function runOf(a: string[], b: string[], i: number, j: number, L: number[][]): number {
  const keeps = (n: number) => n === 1 || L[i + 1][j + n] === L[i][j] - 1;
  const tail = blankOf(a[i])?.tail ?? "";
  if (tail) { for (let m = 1; m <= 6 && j + m - 1 < b.length; m++) if (b[j + m - 1].endsWith(tail)) return keeps(m) ? m : 1; return 1; }
  const nxt = a[i + 1];
  if (!nxt || isBlank(nxt)) return 1;
  for (let m = 1; m <= 6 && j + m < b.length; m++) if (bare(b[j + m]) === bare(nxt)) return keeps(m) ? m : 1;
  return 1;
}

/** a form as it is compared (pure): case and the marks around words do not make two edits different */
export const formKey = (f: string) => words(f).map(bare).join(" ");

/** the edit in a few words, for the chip's slot: the run of the form between what it shares with the template at its
 *  start and at its end, at most four words (pure); what was only taken out reads "without …" */
export function addedOf(template: string, form: string): string {
  const a = words(template), b = words(form);
  let p = 0; while (p < a.length && p < b.length && bare(a[p]) === bare(b[p])) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && bare(a[a.length - 1 - q]) === bare(b[b.length - 1 - q])) q++;
  // a short edit ("14" to "7") reads with a word each side of it: "in 7 days"
  if (b.length - q - p < 3) { p = Math.max(0, p - 1); q = Math.max(0, q - 1); }
  const add = b.slice(p, b.length - q), gone = a.slice(p, a.length - q);
  if (!add.length) return gone.length ? `without ${gone.slice(0, 3).join(" ")}` : "";
  return add.slice(0, 4).join(" ").replace(/[,.;:]$/, "") + (add.length > 4 ? "…" : "");
}

export const LEARN_AT = 3;   // three of the same edit is a habit; two is a coincidence
export type Edit = { key: string; form: string; at: number };
/** a send heard (pure over the list): the edits kept (the last eight), and the form to offer when the same one has come
 *  LEARN_AT times and is not the template already */
export function heard(template: string, edits: Edit[], sent: string, now = Date.now()): { edits: Edit[]; learn: { form: string; count: number; added: string } | null } {
  const form = formOf(template, sent);
  if (!form || formKey(form) === formKey(template)) return { edits, learn: null };
  const e: Edit = { key: formKey(form), form, at: now };
  const next = [...edits, e].slice(-8);
  const count = next.filter((x) => x.key === e.key).length;
  return { edits: next, learn: count >= LEARN_AT ? { form, count, added: addedOf(template, form) } : null };
}

/** each blank's value in a sent ask, laid against the template the same way (pure): {} when it is another ask */
export function valuesFrom(template: string, sent: string): Record<string, string> {
  const a = words(template), b = words(sent);
  if (!a.length || !b.length || a.length > 400 || b.length > 400) return {};
  const L: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  const same = (i: number, j: number) => isBlank(a[i]) || bare(a[i]) === bare(b[j]);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = same(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  if (L[0][0] < Math.ceil(a.length / 2)) return {};
  // its callers read own keys only (Object.hasOwn): a blank named "constructor" (a person's own noun) reads nothing else
  const out: Record<string, string> = {};
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (same(i, j) && L[i][j] === L[i + 1][j + 1] + 1) {
      const k = blankOf(a[i]);
      // the blank's whole run ("Northside Bakery"), as formOf reads it; its mark is cut only when the run ends with it
      const n = k ? runOf(a, b, i, j, L) : 1;
      if (k) {
        const v = b.slice(j, j + n).join(" ");
        out[k.name] = k.tail && v.endsWith(k.tail) ? v.slice(0, v.length - k.tail.length) || v : v.replace(/[,.;:!?)]+$/, "");
      }
      i++; j += n;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/** a counter: values (newest first) that only ever counted up, three or more, all the same shape ("#1048", "1048"):
 *  the next one, else null (pure). "#1046 #1045 #1044" is "#1047"; "9 3 8" is not a counter */
export function counterNext(values: string[]): string | null {
  if (values.length < 3) return null;
  const m = values.map((v) => /^([#A-Za-z-]*)(\d{1,9})$/.exec(v.trim()));
  if (m.some((x) => !x) || new Set(m.map((x) => x![1])).size !== 1) return null;
  const n = m.map((x) => Number(x![2]));
  for (let k = 1; k < n.length; k++) if (!(n[k - 1] > n[k])) return null;   // newest first: each older one smaller
  return `${m[0]![1]}${n[0] + 1}`;
}
