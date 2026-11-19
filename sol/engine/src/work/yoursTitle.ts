// Build becomes yours (#1089): a tool's first name, by rule, on this machine (the words never leave it; Jev is never
// asked). A person who does not code types the way they talk: "ok so currently the newsletter goes out friday, i want
// you to…", "can you look at the landing page again". The name is the THING the ask is about, at most two words:
// "Newsletter", "Landing page". When the rule cannot find one it says so (""), and the face shows the title dashed
// with a press to name it: a wrong name is worse than none. Pure; the table of made-up asks is in the test.

/** words a person starts with before they get to it */
const OPEN = /^(ok|okay|so|hey|hi|hello|yo|right|alright|well|now|and|also|then|just|again|currently|basically|actually|quick|quickly|real|more|thing|question|please|pls|thanks|can|could|would|will|you|u|i|we|i'd|i'll|i'm|we're|lets|let's|let|me|us|need|want|wanna|like|to|have|gotta|should|help|with|try|ahead|kindly|for|maybe|hmm|um|uh)$/i;
/** the verb that asks; the name is what follows it */
const VERB = /^(draft|write|rewrite|make|create|give|send|check|book|plan|find|summari[sz]e|prepare|build|fix|update|list|show|tell|get|do|run|read|add|post|reply|answer|look|review|change|move|compare|explain|clean|sort|put|turn|set|open|go|take|pull|generate|design|translate|shorten|edit|proofread|schedule|remind|track|log|start|finish|continue|redo|polish|tidy|organi[sz]e|convert|export|import|print|share|research|search|figure|work|see)$/i;
/** small words before the thing: skipped, never the name */
const SKIP = /^(the|a|an|my|our|your|this|that|these|those|some|any|new|next|last|latest|current|todays?|today's|weeks|week's|months|month's|at|on|up|out|over|into|through|me|us|it|them|him|her|all|every|each|another|same|whole|quick|short|brief)$/i;
/** words that end the thing's phrase */
const END = /^(again|and|or|but|about|from|for|to|in|of|with|since|by|that|which|so|because|if|when|then|is|are|was|were|goes|go|going|needs?|should|will|would|can|could|has|have|had|feels?|looks?|seems?|bigger|smaller|shorter|longer|better|please|i|we|you|it|they|into|before|after|until|as|than|not|only|just|now|today|tomorrow|tonight|yesterday|one|two|three|on|at|out|up)$/i;
const ASK = /^(what|whats|what's|how|why|where|when|who|which|whose|is|are|was|were|do|does|did|has|have|should|shall)$/i;
/** verbs that say nothing alone */
const PLAIN = /^(do|make|get|go|put|take|set|see|work|run|change|fix|redo|continue|give|show|tell|look|check|start|finish|add|open|turn|move|pull|update)$/i;
const WHAT = /^(what|whats|what's)$/i;
const ABOUT = /^(about|on|with|for|of|regarding|around)$/i;
const BLANK = "____";
const clean = (w: string) => w.replace(/^[^\p{L}\p{N}#_]+|[^\p{L}\p{N}_]+$/gu, "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** the thing's phrase from word `i` on: past the small words, then at most two words; a blank, a number, a path, a
 *  comma or an END word ends it */
function thing(raw: string[], i: number): string {
  const out: string[] = [];
  let article = false;
  for (; i < raw.length && out.length < 2; i++) {
    const w = clean(raw[i]);
    if (!w || raw[i].includes(BLANK)) { if (out.length) break; continue; }
    if (!out.length && SKIP.test(w)) { article = true; continue; }
    // "a reply", "the plan": after a small word a verb is the thing itself; bare, it is still the asking
    if (!out.length && !article && VERB.test(w)) continue;
    if (END.test(w) || ASK.test(w) || SKIP.test(w) || /^\d/.test(w) || raw[i].includes("/")) break;
    out.push(w);
    if (/[,.;:?!]$/.test(raw[i])) break;
  }
  const s = out.join(" ");
  if (s.length >= 3 && s.length <= 28) return s;
  return out[0] && out[0].length >= 3 ? out[0].slice(0, 28) : "";
}

/** the name of a tool from its ask (blanks as ____), or "" when the rule cannot tell (the face then asks for one) */
export function titleOf(words: string): string {
  const raw = words.replace(/^(you are|you're)\s+/i, "").replace(/[“”"]/g, "").trim().split(/\s+/).filter(Boolean);
  // 1. past what they start with: "ok so currently", "can you", "i need you to"
  let i = 0;
  while (i < raw.length && OPEN.test(clean(raw[i])) && !/[.?!]$/.test(raw[i])) i++;
  if (i >= raw.length) return "";
  const w0 = clean(raw[i]);
  // 2. a question: "what did we decide about pricing" is "Pricing"; "what's left on the grant application" is "Grant
  //    application"; with nothing to be about ("where does this stand?"), no name
  if (ASK.test(w0)) {
    const a = raw.findIndex((x, k) => k > i && ABOUT.test(clean(x)));
    return a > 0 ? cap(thing(raw, a + 1)) : "";
  }
  // 3. a verb, then the thing: "draft invoice ____" is "Invoice"; "list what changed in the plan" is "What changed"
  if (VERB.test(w0)) {
    const n1 = clean(raw[i + 1] ?? ""), n2 = clean(raw[i + 2] ?? "");
    if (WHAT.test(n1) && n2 && !SKIP.test(n2) && !OPEN.test(n2)) return cap(`what ${n2.toLowerCase()}`);
    // "do it again but shorter": the verb's object is a pronoun, there is no thing
    //  a verb that says what is done names it ("translate this into Spanish" is "Translate")
    if (/^(it|this|that|them)$/i.test(n1)) return PLAIN.test(w0) ? "" : cap(w0.toLowerCase());
    // nothing after the verb but a blank or a path: the verb is the name ("Summarise ____ in ____ lines"), unless it
    // says nothing alone ("continue", "do")
    return cap(thing(raw, i + 1) || (PLAIN.test(w0) ? "" : w0.toLowerCase()));
  }
  // 4. it starts with the thing: "the newsletter goes out friday, i want you to…" is "Newsletter"
  return cap(thing(raw, i));
}
