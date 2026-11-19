// Home, pass 2 (#692), drawn today only inside the stage's Home block (sol://home, HomeBlock.tsx). The main view is
// since you looked, the week, the dump and what came out of it; a folder and world are places of their own; the side (Side2) is the index. Each
// part is one file, built by one slice of the pass 2 build (pass2.ts says who owns what); this file only lays them out.
// Every tile has something real behind it or is absent: a part with nothing to show returns null.
import type { Metas } from "../meta";
import type { Home2Api, Place } from "./pass2";
import { Since } from "./Since";
import { Week } from "./Week";
import { Dump } from "./Dump";
import { Stickies } from "./Stickies";
import { FolderView } from "./FolderView";
import { World } from "./World";
import "./p2.css";

export const meta = {
  Home2: {
    job: "Home's main view: since you looked, the week, the dump and what came out of it; a folder or world in its place",
    flow: "know",
    states: ["engine down", "the main view", "a folder open", "world"],
    keys: [
      { press: "click a folder in the side", does: "opens the folder in this place", opens: "FolderView" },
      { press: "click world in the side", does: "opens world in this place", opens: "World" },
      { press: "Esc", does: "back to the main view" },
    ],
    listens: ["home.state (pass2.ts useHome2)"],
  },
} satisfies Metas;

export function Home2({ h, place, setPlace }: { h: Home2Api; place: Place; setPlace: (p: Place) => void }) {
  if (!h.st) return <div className="p2 p2-down" data-p2="down"><p>{h.up ? "reading Home…" : "Home's engine is not answering (the stand-in on 7791)"}</p></div>;
  if (place.at === "folder") return <div className="p2 p2-place" data-p2="folder" onKeyDown={(ev) => { if (ev.key === "Escape") setPlace({ at: "today" }); }}><FolderView h={h} id={place.id} setPlace={setPlace} /></div>;
  if (place.at === "world") return <div className="p2 p2-place" data-p2="world" onKeyDown={(ev) => { if (ev.key === "Escape") setPlace({ at: "today" }); }}><World h={h} /></div>;
  return (
    <div className="p2 p2-main" data-p2="today">
      <div className="p2-top">
        <Since h={h} setPlace={setPlace} />
        <Week h={h} />
      </div>
      <div className="p2-bottom">
        <Dump h={h} />
        <Stickies h={h} setPlace={setPlace} />
      </div>
    </div>
  );
}
