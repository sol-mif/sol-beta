// owned by slices 8+9 (Cowork v2 and Social v2, the people), docs/port/slices.md "Night 2, outlined"
// The people's phrases for the talk pill, tried before the shared ones (say/index.ts): each makes one of the 13 moves.
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
import { M, type Phrase } from "../core.ts";

const phrases: Phrase[] = [
  { hears: /^(?:cowork|my groups|groups|see groups)$/, run: () => M.see_groups() },
  { hears: /^(?:open )?group (.+)$/, run: (m) => M.open_group(m[1]) },
  { hears: /^(?:social|friends|my friends)$/, run: () => M.see_social() },
  { hears: /^(?:open )?friend (.+)$/, run: (m) => M.open_friend(m[1].replace(/^./, (c) => c.toUpperCase())) },
  { hears: /^(?:see (?:me |it )?as (?:a friend|(.+)) (?:sees|does)(?: me)?)$/, run: (m) => M.see_as_friend(m[1] ? m[1].replace(/^./, (c) => c.toUpperCase()) : "") },
  { hears: /^(?:make a link|new link|invite link)$/, run: () => M.make_link() },
  { hears: /^make (.+) close$/, run: (m) => M.make_close(m[1].replace(/^./, (c) => c.toUpperCase())) },
  { hears: /^(?:next wait|what waits(?: on me)?)$/, run: () => M.next_wait() },
];
export default phrases;
