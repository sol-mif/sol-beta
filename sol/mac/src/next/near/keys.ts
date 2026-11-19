// The keys at Near (#1615, slice 3; the mockup's engine.js onKey, paneKey and runs.js's keydown): which keys are ours and
// which reach the pane. Pure: a key and where the person is in, a verdict out; the terminal's own lines change in typeInto.
// At Near a plain key always reaches the pane (the terminal is the shell's, a page is the person's); only ⌘ chords are
// Sol's, and ⌘K is left to the terminal, where it clears (round 1: go to is ⌘P). The starter's words and a split job's
// part choice take plain keys only while they are open.
// Signed: marcocyl04-ux's agent, slice 3 (#1615).

export type KeyLike = { code: string; key?: string; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; repeat?: boolean };
/** where the keys go: the shell's (a ⌘ chord it knows), the starter card's, a split job's part choice, or the pane */
export type Route = "shell" | "starter" | "parts" | "pane" | "none";
export type At = { dist: string; starter: boolean; parts: "none" | "choosing" | "open"; ans: boolean; beside: boolean };

/** the ⌘ chords the shell answers (Next.tsx), so the count knows a chord never reaches a pane; ⌘K is not one */
export function shellChord(e: KeyLike, ans: boolean): boolean {
  if (!e.metaKey) return false;
  const c = e.code, sh = !!e.shiftKey;
  if ((c === "Enter" || c === "Backspace" || c === "Slash") && ans) return true;
  if (["BracketLeft", "BracketRight", "KeyP", "KeyJ", "ArrowUp", "ArrowDown", "Digit0", "KeyE", "Backslash", "Comma"].includes(c)) return true;
  if (sh && (c === "KeyH" || c === "KeyF")) return true;
  return /^Digit[1-9]$/.test(c);
}

/** who takes this key (pure): the shell's chords, ⌘N and the open starter, a split job's parts, else the pane at Near */
export function route(e: KeyLike, at: At): Route {
  if (e.metaKey && e.code === "KeyN" && !e.shiftKey && at.dist !== "near" && at.dist !== "needs") return "starter";
  if (at.dist === "near" && !at.beside && at.parts !== "none") {
    if (at.parts === "open") { if (e.metaKey && !e.shiftKey && (e.code === "ArrowUp" || e.code === "BracketLeft")) return "parts"; }
    else if ((/^Arrow(Left|Right|Up|Down)$/.test(e.code) && !e.metaKey && !e.altKey) || (e.code === "Enter" && !e.metaKey) || (e.metaKey && e.code === "ArrowDown")) return "parts";
  }
  if (at.starter) {
    if (e.metaKey && e.code === "Enter") return "starter";
    if (!e.metaKey && !e.ctrlKey) return "starter";
  }
  if (e.metaKey) return shellChord(e, at.ans) ? "shell" : "none";
  return at.dist === "near" ? "pane" : "none";
}

/** a terminal on the fixture: its lines, what is typed, and whether vim holds it */
export type FakeTerm = { lines: string[]; vim: boolean; buf: string; mode?: string };
/** a key typed into the fixture's terminal (engine.js paneKey): the new terminal and whether a command started */
export function typeInto(t: FakeTerm, e: KeyLike): { term: FakeTerm; started: string | null; saved: boolean } {
  const term: FakeTerm = { ...t, lines: [...t.lines] };
  let started: string | null = null, saved = false;
  if (term.vim) {
    if (e.code === "Escape") term.mode = "normal";
    else if (e.key === ":") term.buf = ":";
    else if (term.buf.startsWith(":") && e.code !== "Enter") term.buf += e.key ?? "";
    else if (e.code === "Enter" && term.buf === ":wq") { saved = true; term.vim = false; term.buf = ""; term.lines.push("~ $ _"); }
    return { term, started, saved };
  }
  if (e.code === "Enter") {
    const cmd = term.buf.trim();
    term.lines.push("$ " + cmd); term.buf = "";
    if (cmd.startsWith("vim")) { term.vim = true; term.lines.push("-- vim: " + cmd.slice(4) + " --"); }
    if (cmd) started = cmd;
  } else if (e.code === "Backspace") term.buf = term.buf.slice(0, -1);
  else if (e.altKey && e.code === "Period") term.buf += " <last-arg>";
  else if (e.key && e.key.length === 1) term.buf += e.key;
  return { term, started, saved };
}

/** a key typed into a life page on the fixture (engine.js paneKey, a piece that is not a session) */
export function typeIntoPage(text: string, e: KeyLike): string {
  if (e.code === "Enter") return text + "\n";
  if (e.code === "Backspace") return text.slice(0, -1);
  if (e.key && e.key.length === 1) return text + e.key;
  return text;
}
