// See what's at work, read at this moment (BR1 item 7): the view's rows and the sidebar's "At work · 3 running", from
// the store, the Diary's today and what act.ts holds. Light on purpose: the shell's sidebar imports it, not the view.
// Signed: marcocyl04-ux's agent (builder F), BR1 item 7 (#1615).
import { D, open } from "../cv/core.ts";
import * as B from "../diary/book.ts";
import { atWork, countWords, type View } from "./model.ts";
import { st } from "./act.ts";

const asked = (id: string) => open().find((a) => a.piece === id || a.part === id)?.text ?? "";
/** what is at work in `scope` (a folder's id, or null for everything) */
export const viewNow = (scope: string | null): View => atWork(D as never, scope, { runs: st.runs, held: st.held, asked, lines: B.lines(0) });
/** the sidebar's words: "3 running", "No AI is working right now", "Everything holds" */
export const sideWords = (): string => countWords(viewNow(null));
