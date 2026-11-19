// Releases (#1299): the dev page, releases.html. Draws Cowork › Releases from a fixture, without the engine, so the lead
// can take a still of each state: ?state=line (the line as it opens), open (the newest release opened: what joined by
// person, its knots), behind (I am behind main: my row's press), decision (a decision card on the line, its proof
// open), press (the newest release waits on the beta pass: the press card).
import { createRoot } from "react-dom/client";
import { ReleasesView } from "./cowork/Releases";
import { fixture, STATES, type State } from "./cowork/releasesFixture";
import { TYPE } from "./kit/tokens";
import "./tokens.css";
import "./palette.css";
import "./cowork/whole/shell.css";

const asked = new URLSearchParams(location.search).get("state") as State | null;
const state: State = asked && STATES.includes(asked) ? asked : "line";
const read = fixture(state);
const newest = read.releases.find((r) => r.latest)?.tag ?? "";
const opened = state === "open" ? [newest] : [];

function Page() {
  return (
    <div className="cw-whole" data-place="cowork" style={{ gridTemplateColumns: "1fr" }}>
      <main className="cw-view">
        <ReleasesView read={read} opened={opened} proofs={state === "decision"} again={() => location.reload()} />
      </main>
    </div>
  );
}

document.body.style.fontFamily = TYPE.family;   // the face's own type, as the app's body sets it (face.css)
createRoot(document.getElementById("root")!).render(<Page />);
