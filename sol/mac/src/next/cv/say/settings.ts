// owned by slice 6 (Settings), docs/port/slices.md
// Settings' phrases (#1604): open it, find in it, point at it, turn the last change back, the way back to the old Sol,
// and, while Settings is open, any change asked in words (ui.html: "the talk pill asks too, while Settings is open").
// Tried before the shared phrases. Signed: marcocyl04-ux's agent, slice 6 (#1615).
import { M, S, type Phrase } from "../core.ts";
import { W, U } from "../moves/settings.ts";
import { parseAsk } from "../../settings/model.ts";

const phrases: Phrase[] = [
  { hears: /^(?:open )?settings$/, run: () => M.stOpen() },
  { hears: /^(?:open )?(?:your ai'?s |my ai'?s |the )?voice settings$/, run: () => M.stOpen("voice") },
  { hears: /^(?:close settings|leave settings)$/, run: () => M.stClose() },
  { hears: /^(?:find|search) (?:a )?setting(?:s)? (?:for )?(.+)$/, run: (m) => { if (S.page !== "settings") M.stOpen(); return M.stFind(m[1]); } },
  { hears: /^point at it$/, run: () => { if (S.page !== "settings") M.stOpen(); return M.stPoint(); } },
  { hears: /^(?:back to the old sol|the old sol|turn the new sol off)$/, run: () => M.oldSol() },
  { hears: /^(?:turn (?:that|it) back|undo that)$/, run: () => (S.page === "settings" ? M.stUndo() : null) },
  { hears: /^keep it$/, run: () => (S.page === "settings" ? M.stKeep() : null) },
  // while Settings is open, words that name a change are asked for; any other words go on to the shared phrases
  { hears: /^(.{3,})$/, run: (m) => (S.page === "settings" && parseAsk(W(), U(), m[1]) ? M.stAsk(m[1]) : null) },
];
export default phrases;
