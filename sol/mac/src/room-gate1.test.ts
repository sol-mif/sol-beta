// node --test src/*.test.ts (npm test here): gate one on the card product/cowork/room (#1740). q2, a Sol with no table and
// not on the team reaches the Agents' room from its own groups home and a table's side, and with an identity one press
// hands my AI the words to set up a table just for me. q3, the empty room with no identity: a local "me", my own AI in
// the @ list, and plain words on how to start, never a blank name. q6, the room follows its switch, reach.room, as the
// engine reads it: off, no page, no rail row, no place, no way in, no agents' asks lifted on a table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askMineSolo, atOptions, emptyWords, JUST_ME, LOCAL_ME, nameOf, namesMyAgent, withMe } from "./cowork/whole/room-chat.ts";
import { roomOnOf } from "./cowork/whole/roomSwitch.ts";
import { askedPlace, partsOf, registerPart } from "./cowork/whole/place.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("q3: with no identity the room is a local me and my own AI, and my AI is in the @ list", () => {
  for (const me of ["", undefined, "not a login!"]) {
    const w = withMe(me, []);
    assert.equal(w.me, LOCAL_ME);
    assert.equal(w.local, true);
    assert.deepEqual(w.members.map(nameOf), ["me", "me's agent"], "never 0 members");
    assert.deepEqual(atOptions(w.members, w.me, "").map(nameOf), ["me's agent"], "my own AI can be @'d, never me as a person");
    assert.equal(namesMyAgent("@me's agent what is on my plate?", w.me), true);
  }
  const g = withMe("frank", [{ login: "frank", agent: false }, { login: "frank", agent: true }, { login: "noa", agent: false }, { login: "noa", agent: true }]);
  assert.equal(g.local, false);
  assert.deepEqual(g.members.map(nameOf), ["frank", "frank's agent", "noa", "noa's agent"], "a login keeps the read's members, me first, once");
  assert.deepEqual(withMe("frank", []).members.map(nameOf), ["frank", "frank's agent"], "an empty read still has me and my AI");
});

test("q3: the empty room says how to start in plain words, never a blank name", () => {
  const local = emptyWords({ me: LOCAL_ME, local: true, solo: true, alone: true });
  assert.match(local, /@me's agent/);
  assert.match(local, /sign in to Sol \(Settings › me › Sol\)/, "how to bring people in");
  const solo = emptyWords({ me: "frank", local: false, solo: true, alone: true });
  assert.match(solo, /@frank's agent/);
  assert.match(solo, /set up a table just for you/);
  assert.match(emptyWords({ me: "frank", local: false, solo: false, alone: true }), /Just you here so far. Write @frank's agent/);
  for (const w of [local, solo]) assert.doesNotMatch(w, /@'s|@ 's|undefined|null/);
  assert.match(askMineSolo("  @me's agent hi  "), /no table yet[\s\S]*@me's agent hi\n\nAnswer me here/);
});

test("q3: with no table the room sends nothing to a group, and a line to my own AI opens a talk of mine", () => {
  const room = src("./cowork/whole/RoomChat.tsx");
  const solo = room.slice(room.indexOf("if (solo) {"), room.indexOf("const r: any = await askEngine(\"team.talk\""));
  assert.ok(solo.length > 0, "the solo branch comes before team.talk");
  assert.doesNotMatch(solo, /team\.talk/, "nothing goes to team.talk with no table");
  assert.match(solo, /namesMyAgent\(text, who\.me\)/);
  assert.match(solo, /toMyAi\(askMineSolo\(text\)\)/);
  assert.match(room, /type: "work\.say", sessionId, text, fresh: true/, "a talk of mine, opened as any new talk");
  assert.match(room, /data-layer="session" onClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\("sol:open-work", \{ detail: l\.session \}/, "the line opens that talk");
});

test("q2: a Sol not on the team reaches the room from its groups home and a table's side, the same page as the shell's", () => {
  const home = src("./cowork/groups/Home.tsx"), side = src("./cowork/groups/Side.tsx");
  assert.match(home, /import \{ RoomChat \} from "\.\.\/whole\/RoomChat"/, "the one room, never a second");
  assert.match(home, /data-go="room"/, "a way in on the home, with or without a table");
  assert.match(home, /\{view\.k === "room" && room && <div className="gh-room" data-page="room"><RoomChat \/><\/div>\}/);
  assert.match(side, /onRoom && <button[^>]*data-go="room"/, "a row on a table's side");
  const view = src("./cowork/groups/view.ts");
  assert.match(view, /return version === "concept" \|\| onTeam === true;/, "the groups home is the way in for every Sol but the team's own (concept, or a member of the team's own org: #1541)");
});

test("q2: with an identity and no table, one press hands my AI the words that let its open_table make it", () => {
  const room = src("./cowork/whole/RoomChat.tsx");
  assert.match(room, /justMe=\{solo && !who\.local \? justMe : undefined\}/, "offered with an identity and no table only");
  assert.match(room, /data-act="set up a table just for me"/);
  assert.match(room, /toMyAi\(JUST_ME\)/);
  assert.match(JUST_ME, /^start a Cowork table just for me/, "the person's own words for the turn: open_table's yes is copied from them");
  assert.ok(JUST_ME.split(/\s+/).length >= 2);
});

test("q6: the face reads reach.room as the engine sends it; anything else is off", () => {
  assert.equal(roomOnOf({ reach: { room: true } }), true);
  for (const s of [undefined, null, {}, { reach: {} }, { reach: { room: false } }, { reach: { room: "on" } }, { window: { "reach.room": true } }]) assert.equal(roomOnOf(s), false, JSON.stringify(s));
});

test("q6: a part registered off has no rail row, no tile and no place, and keeps its spot when it comes back", () => {
  registerPart("t-a", { label: "A" }); registerPart("t-room", { label: "Room", off: true }); registerPart("t-b", { label: "B" });
  const ids = () => partsOf().map(([p]) => p).filter((p) => p.startsWith("t-"));
  assert.deepEqual(ids(), ["t-a", "t-b"]);
  assert.equal(askedPlace("?cowork=t-room"), null, "no place while off");
  registerPart("t-room", { label: "Room" });
  assert.deepEqual(ids(), ["t-a", "t-room", "t-b"], "back in its spot");
  assert.deepEqual(askedPlace("?cowork=t-room"), { project: "", part: "t-room", path: [] });
});

test("q6: the page, its ways in and the agents' asks on a table all follow the switch", () => {
  const room = src("./cowork/whole/RoomChat.tsx"), home = src("./cowork/groups/Home.tsx"), ours = src("./cowork/whole/ours.tsx"), cw = src("./cowork/whole/Cowork.tsx");
  assert.match(cw, /roomOn\(e\.settings\)/, "Cowork feeds the switch from the engine's settings");
  assert.match(room, /if \(!on\) return null;/, "the page draws nothing while off");
  assert.match(ours, /registerPart\("room", \{ label: "Agents' room", off: !roomOn\(\) \}\)/);
  assert.match(ours, /onRoomSwitch\(room\)/, "the shell's row follows each turn of it");
  assert.match(home, /onRoom=\{room \? openRoom : undefined\}/);
  assert.match(home, /const b = room \? reads\.waiting\.find/, "the agents' asks are the room's: off, not lifted on a table");
  assert.match(home, /if \(view\.k === "room" && !room\) setView\(\{ k: "home" \}\)/, "turned off while open, it goes");
});
