// Your own pieces among the extra askers (round 6, #1615; people/extra.ts). The mockup's pieces.js puts nothing of its
// own in the one queue: an update's set-aside or remade piece is a card under the headline (pieces/Seen.tsx), and a
// proposal is a card on the canvas, never an ask. So the provider has no open items, and it is not registered on import:
// registered, it would change nothing on screen, yet next-extra.test.ts (the join's) holds EXTRA at exactly the one
// provider it registers itself. `join()` registers it; the join decides (docs/port/requests/pieces.md 3).
// Signed: marcocyl04-ux's agent, port slice 12 (#1615).
import { register, type ExtOpen, type Provider } from "../people/extra.ts";
import { list } from "./model.ts";

export const provider: Provider = {
  /** what it has open: nothing (the mockup's pieces never ask) */
  items: () => [],
  line: (t: ExtOpen, said: string) => {
    const x = list().find((x) => `piece:${x.id}` === t.id);
    return x ? { what: `You said “${said}” about ${x.n}.`, why: "Your own pieces" } : null;
  },
};

/** the provider joins the one queue; the answer takes it out again */
export const join = (): (() => void) => register(provider);
