// Build as one space, driven through its store (mine, 2026-11-12, dev only like pieces.html): the same BuildSpace Build
// mounts behind build.space, on a LocalStore that forgets, so the stage tools' moves (compose, place with fold, close,
// the slot "full") are tried without touching a real session. The chat is plain paragraphs and the box a still one:
// what is tried here is the space, not WorkTalk or the Composer (those are shot in real Build).
//   buildspace.html       window.__dev = { store, session, blocks, say } for the shooter
import { StrictMode, useCallback, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { Item } from "../work/useWork";
import { LocalStore } from "../stage/store";
import { fixture } from "../stage/fixture";
import { BuildSpace } from "./BuildSpace";
import "../face.css";
import "../palette.css";
import "../kit/type.css";
import "../work/work.css";
import "../home/home.css";
import "../stage/stage.css";
import "../stage/space.css";
import "./pieces.css";

const SESSION = "dev-space";
const store = new LocalStore("dev.space.", null);
let items: Item[] = [{ id: "m1", kind: "me", text: "Make me the four pages for the sidebar sitting." }];
const subs = new Set<() => void>();
const say = (kind: string, text: string) => { items = [...items, { id: `i${items.length + 1}`, kind, text }]; subs.forEach((f) => f()); };
void fixture().then((f) => { (window as unknown as { __dev: object }).__dev = { store, session: SESSION, blocks: f.blocks, say }; document.body.dataset.devReady = "1"; });

function Page() {
  const said = useSyncExternalStore(useCallback((f: () => void) => { subs.add(f); return () => { subs.delete(f); }; }, []), () => items);
  const talk = useCallback((shown: Item[]) => <div className="talk"><div className="talk-inner">{shown.map((i) => <p key={i.id} className={i.kind === "me" ? "dev-me" : ""}>{i.text}</p>)}</div></div>, []);
  const [box] = useState(() => <div className="hc-barbox" style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 14, color: "var(--mute)" }}>tell Claude what to do</div>);
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex" }}>
      <div style={{ width: 320, flex: "none", borderRight: "1px solid var(--line)" }} />
      <div style={{ flex: 1, position: "relative", display: "flex" }}>
        <BuildSpace store={store} session={SESSION} items={said} busy={false} talk={talk} box={box} />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
