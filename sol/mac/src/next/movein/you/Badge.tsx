// What Sol knows in one folder of the plane, as the circle's badge (BR1 root part 5, #1615): the folder card's tab says
// "N facts about this folder · ◑" with its sources' dots; a press opens Settings › You on this place. N is what the opened
// folder lists under "What every session here knows" (folder/knows.ts: its place, rules, pages, notes, what finished
// sessions wrote back), the same number in both ("one place, one summary"), and the badge is nothing when that is
// nothing. Signed: marcocyl04-ux's agent (builder F).
import { useNext } from "../../cv/index.ts";
import { openLens, youNow } from "../../cv/wire/you.ts";
import Circle from "./Circle.tsx";
import { folderKnows } from "../../folder/knows.ts";

export default function Badge({ rid }: { rid: string }) {
  const v = useNext((d) => {
    const { ks, n } = folderKnows(rid), you = youNow();
    const part = you?.parts.find((p) => ks.some((f) => f.place === p.id));
    return { ks, n, level: part ? part.level : undefined, name: d.regions.find((r) => r.id === rid)?.name };
  });
  return <Circle size="badge" known={v.ks} n={v.n} level={v.level} label={v.name} onOpen={() => openLens(rid)} />;
}
