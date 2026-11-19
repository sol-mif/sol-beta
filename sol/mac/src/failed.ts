// A turn that failed, said once in short plain words (#1125). Codex says a refused sign-in several times before the turn
// fails (a note per reconnect, one for the fallback, then the failure itself), each a long line with "401 Unauthorized:
// Missing bearer…": the walk of 2026-11-13 saw three. The talk shows one line; the full text is the step's detail, one
// click away. Pure, so the face's tests reach it.
import type { Msg } from "./useEngine";

// what a refused sign-in looks like, from either seat
const SIGN_IN = /\b401\b|unauthori[sz]ed|bearer|not (logged|signed) in|authenticat|oauth|log ?in again|sign ?in again/i;

/** the one line a failure is said in: a refused sign-in in plain words, else the first line that carries a word */
export function failWords(text: string): string {
  if (SIGN_IN.test(text)) return "it could not sign in, so nothing was done. Sign in again in Settings, then ask again.";
  const line = text.split("\n").map((l) => l.trim()).find((l) => /[a-z]/i.test(l)) ?? "";
  return line.replace(/^(error|Error|ERROR)[:\s]+/, "").slice(0, 160) || "something went wrong";
}

/** the talk with a failure added: a refused sign-in takes in the notes that said it already (their text goes into its
 *  detail), and the same failure said again is not a second line */
export function withFailure(prev: Msg[], text: string): Msg[] {
  const words = failWords(text);
  const said = (m: Msg) => m.who === "tool" && (m.kind === "error" ? m.text === words : SIGN_IN.test(words) && m.kind === "note" && SIGN_IN.test(m.text));
  // only the turn's own lines: from the last thing the person said on
  let from = prev.length;
  while (from > 0 && prev[from - 1].who !== "me") from--;
  const before = prev.slice(from).filter(said);
  const detail = [...new Set([...before.flatMap((m) => [m.detail ?? m.text]), text])].join("\n");
  return [...prev.slice(0, from), ...prev.slice(from).filter((m) => !said(m)), { who: "tool", kind: "error", text: words, detail: detail === words ? undefined : detail, done: true, ok: false }];
}
