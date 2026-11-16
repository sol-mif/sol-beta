import { Talk } from "../cowork/Talk";
import { WithTeam } from "./Team";
import type { ButtonDef } from "./types";

// the team's own talk, human to human (#37)
export default {
  id: "group-chat", name: "project chat", kind: "pane", meant: ["cowork"], glyph: "project chat",
  says: "the team talking, people only: say it here and it reaches everyone's Sol",
  Pane: (c) => <WithTeam c={c}>{(team) => <Talk team={team} flash={c.flash} />}</WithTeam>,
} satisfies ButtonDef;
