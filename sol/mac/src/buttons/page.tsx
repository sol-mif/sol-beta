import { StageHere, planOf } from "../stage/StageHere";
import { Ink } from "./Ink";
import type { ButtonDef } from "./types";

// the session's stage (#696; the page pane's place, #54, until the swap, #718): the pages it wrote and its task list as
// blocks (stage/StageHere.tsx), kept while another tab shows.
export default {
  id: "page", name: "page", kind: "pane", meant: ["home"], key: "⌘⇧P", kept: true,
  says: "the page this session wrote, live beside the talk",
  glyph: <Ink><rect x="1.5" y="2" width="11" height="10" rx="1.5" /><path d="M4 5h6M4 7.5h4" opacity=".5" /><circle cx="9.5" cy="9.5" r="1.8" fill="currentColor" stroke="none" /></Ink>,
  shows: ({ shell: s }) => !!s && (!!s.pages.length || !!planOf(s.items)),
  where: "in a session that has pages",
  Pane: ({ w, e, session }) => (session ? <StageHere w={w!} subscribe={e.subscribe} session={session} /> : null),
} satisfies ButtonDef;
