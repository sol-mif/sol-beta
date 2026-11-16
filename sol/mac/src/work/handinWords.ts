// The hand-in card's words (#476, engine team/handin.ts), pure so the face's tests read them without React.
export type CardState = "busy" | "in" | "held" | "gone";
export type HandInCardView = {
  id: string; repo?: string; number?: number; title?: string; url?: string; ask?: string;
  feature?: { id: string; name: string }; issue?: number; state?: CardState; why?: string; error?: string;
};

/** the card still asks: its two buttons show (pure) */
export const asking = (c: Pick<HandInCardView, "state">) => !c.state || c.state === "busy";

/** what the card says once it is answered, or moved on (pure) */
export function cardSaid(c: Pick<HandInCardView, "state" | "why">): string {
  const why = c.why ? `: ${c.why}` : "";
  if (c.state === "in") return `brought in${why}`;
  if (c.state === "held") return `not tonight${why}`;
  if (c.state === "gone") return c.why || "this card no longer asks";
  return "";
}

/** the card's small head (pure): the project's name, and the feature when the map names one */
export function cardHead(c: Pick<HandInCardView, "repo" | "feature">): string {
  const name = String(c.repo ?? "").split("/")[1] || String(c.repo ?? "");
  return c.feature ? `hand in · ${name} · ${c.feature.id} ${c.feature.name}` : `hand in · ${name}`;
}
