import { Ink } from "./Ink";
import type { ButtonCtx, ButtonDef } from "./types";
import { useEffect } from "react";
import { store } from "../stage/engineStore";

// the pane (#699; the old browser pane went with the swap, #718): a browser block in your hand on the session's stage, made once
function OnStage({ session }: { session?: string }) {
  useEffect(() => {
    if (!session) return;
    const seen = store.read(session);
    if (seen.blocks.some((b) => b.kind === "browser" && b.state !== "dead")) return;
    void store.link()?.ask("work.stage.compose", { sessionId: session, block: { kind: "browser", title: "browser", body: JSON.stringify({ url: "", hand: "you" }) } });
  }, [session]);
  return <p className="st-note">{session ? "the browser is an artifact on the stage" : "a new session has no stage yet"}</p>;
}
const Choose = (p: ButtonCtx) => <OnStage session={p.session} />;

export default {
  id: "browser", name: "browser", kind: "pane", meant: ["home"], key: "⌘⇧B",
  says: "a browser beside the talk; drag over a page to hand Sol just that piece",
  glyph: <Ink><rect x="1.5" y="2.5" width="11" height="9" rx="1.5" /><path d="M1.5 5h11" /></Ink>,
  Pane: Choose,
} satisfies ButtonDef;
