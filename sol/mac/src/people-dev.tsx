// People (#1297), dev only: the cards drawn from a fixture read, so the lead can take stills without the engine. Not in
// the face's build inputs, like kit.html.
//   people.html?state=full | empty | one-waits | agent-busy      ?open=a opens that person's card
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PeopleCards, type PeopleAsk } from "./cowork/People";
import { TYPE } from "./kit/paint";
import { fixtureRead, STATES, type FixtureState } from "./cowork/peopleFixture";
import "./palette.css";
import "./kit/type.css";
import "./cowork/whole/shell.css";

const asked = new URLSearchParams(location.search).get("state") as FixtureState | null;
const state: FixtureState = asked && (STATES as readonly string[]).includes(asked) ? asked : "full";
const NOW = Date.UTC(2026, 10, 16, 18);
// a press answers as the engine would; nothing leaves the page
const ask: PeopleAsk = async (type) => (type === "team.people.reply" ? { ok: true, said: "taken: you hold #21 now; the team's Agents' room says so." } : {});

function Page() {
  return (
    <div className="cw-whole" style={{ ...TYPE, gridTemplateColumns: "1fr" }} data-state={state}>
      <main className="cw-view">
        <div className="cw-pad">
          <p className="cw-lead">What each of you holds, what waits on you, what your agents have in flight, and what landed today. Open a card for the whole of it.</p>
          <PeopleCards r={fixtureRead(state, NOW)} ask={ask} now={NOW} />
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
