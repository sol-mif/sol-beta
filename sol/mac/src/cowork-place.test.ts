// node --test src/*.test.ts: one way to move between layers (#1416, cowork/whole/place.ts): a place is an address on one
// history; a part a team registers names its children, so its crumbs, back, forward and Esc-up come with no change to
// the mechanism; the project is read, never a constant; a page opened from a place is a layer of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROOT, askedPlace, back, crumbsOf, focusOf, forward, fresh, go, here, keyMove, nameChildren, nameProjects, opensInApp, place, readHistory, registerPart,
  settle, startOf, up, upOf, type History, type Place,
} from "./cowork/whole/place.ts";

// a setup no one here wrote: a band's Cowork, setlist › song › take, and an anchor above its projects
registerPart("setlist", { label: "Setlist", childLabel: (path) => (path.length === 2 ? `take ${path[1]}` : "") });
registerPart("inbox", { label: "Inbox", anchor: true });
nameChildren("setlist", { s1: "The opener" });
nameProjects({ p: "The tour" });

const at = (path: string[], more: Partial<Place> = {}): Place => ({ project: "p", part: "setlist", path, ...more });
const words = (p: Place) => crumbsOf(p).map((c) => c.label);

test("a part a team registers gets crumbs: Cowork › project › part › its children, named by the part", () => {
  assert.deepEqual(words(at(["s1", "3"])), ["Cowork", "The tour", "Setlist", "The opener", "take 3"]);
  // a child the part has no name for yet reads as its id
  assert.deepEqual(words(at(["s9"])), ["Cowork", "The tour", "Setlist", "s9"]);
  // each crumb is a real address: the third goes to the part, the fourth to the song
  assert.deepEqual(crumbsOf(at(["s1", "3"]))[3].to, at(["s1"]));
  assert.deepEqual(crumbsOf(at(["s1", "3"]))[0].to, ROOT);
});

test("the project is the engine's word: one project is still a crumb; not read yet, it waits", () => {
  assert.deepEqual(words({ project: "p", part: "", path: [] }), ["Cowork", "The tour"]);
  assert.deepEqual(words({ project: "", part: "setlist", path: [] }), ["Cowork", "…", "Setlist"]);
  // an anchor stands above every project: no project crumb
  assert.deepEqual(words({ project: "", part: "inbox", path: [] }), ["Cowork", "Inbox"]);
  // once read, every place that waited takes the project in use; an anchor and the root stay as they are
  const h: History = { stack: [ROOT, { project: "", part: "setlist", path: ["s1"] }, { project: "", part: "inbox", path: [] }], i: 2 };
  const s = settle(h, "p");
  assert.deepEqual(s.stack.map((x) => x.project), ["", "p", ""]);
  assert.equal(settle(s, "p"), s, "nothing to settle is no change");
});

test("a page opened from a place is a layer of it: a crumb, and up goes back to the place", () => {
  const p = at(["s1"], { out: { url: "https://example.org/x/1", label: "#1" } });
  assert.deepEqual(words(p), ["Cowork", "The tour", "Setlist", "The opener", "#1"]);
  assert.deepEqual(upOf(p), at(["s1"]));
  assert.equal(crumbsOf(p)[3].to.out, undefined, "the crumb under the page is the place itself");
});

test("Esc goes up one layer at a time, to the root and no further", () => {
  const seen: string[][] = [];
  let p: Place | null = at(["s1", "3"]);
  while (p) { seen.push(words(p)); p = upOf(p); }
  assert.deepEqual(seen.map((w) => w.length), [5, 4, 3, 2, 1]);
  assert.deepEqual(upOf({ project: "", part: "inbox", path: [] }), ROOT);
  assert.equal(upOf(ROOT), null);
});

test("one history: back and forward walk it, a new place drops what was ahead, the same place is no move", () => {
  let h = fresh();
  h = go(h, at([])); h = go(h, at(["s1"])); h = go(h, at(["s1", "3"]));
  assert.equal(h.stack.length, 4);
  h = back(back(h));
  assert.deepEqual(here(h), at([]));
  h = forward(h);
  assert.deepEqual(here(h), at(["s1"]));
  assert.equal(go(h, at(["s1"])), h);
  h = go(h, { project: "", part: "inbox", path: [] });
  assert.equal(forward(h), h, "what was ahead is gone");
  assert.equal(h.stack.length, 4);
  assert.equal(back(fresh()).i, 0);
  // up is a move on the history too, so back returns from it
  const u = up(go(fresh(), at(["s1"])));
  assert.deepEqual(here(u), at([]));
  assert.deepEqual(here(back(u)), at(["s1"]));
});

test("the kept history reads back, and anything else is a fresh one", () => {
  const h = go(fresh(), at(["s1"]));
  assert.deepEqual(readHistory(JSON.stringify(h)), h);
  for (const bad of [null, "", "{", JSON.stringify({ stack: [], i: 0 }), JSON.stringify({ stack: [{ part: 1 }], i: 0 }), JSON.stringify({ stack: [ROOT], i: 3 })])
    assert.deepEqual(readHistory(bad), fresh());
});

test("?cowork= still opens a part (and a path under it); a part nobody registered is no place", () => {
  assert.deepEqual(askedPlace("?cowork=setlist"), { project: "", part: "setlist", path: [] });
  assert.deepEqual(askedPlace("?cowork=setlist/s1/3"), { project: "", part: "setlist", path: ["s1", "3"] });
  assert.equal(askedPlace("?cowork=nothing"), null);
  assert.equal(askedPlace("?x=1"), null);
});

test("the keys: ⌘[ back, ⌘] forward, Esc up, but never while typing or in an open block", () => {
  const k = (key: string, metaKey = false) => ({ key, metaKey, ctrlKey: false, altKey: false, shiftKey: false });
  const free = { typing: false, inBlock: false };
  assert.equal(keyMove(k("[", true), free), "back");
  assert.equal(keyMove(k("]", true), free), "forward");
  assert.equal(keyMove(k("Escape"), free), "up");
  assert.equal(keyMove(k("Escape"), { typing: true, inBlock: false }), null);
  assert.equal(keyMove(k("Escape"), { typing: false, inBlock: true }), null);
  assert.equal(keyMove({ ...k("Escape"), defaultPrevented: true }, free), null);
  assert.equal(keyMove(k("["), free), null);
  assert.deepEqual(focusOf(null), free);
});

test("the store: one history for the window, moved by go, path, open, back, forward and up", () => {
  place.reset();
  place.go(at([]));
  place.path(["s1"]);
  place.open("https://github.com/x/y/issues/2", "#2");
  assert.equal(place.now().out?.label, "#2");
  place.up();
  assert.deepEqual(place.now(), at(["s1"]));
  place.back(); place.back();
  assert.deepEqual(place.now(), at(["s1"]));
  place.forward();
  assert.deepEqual(place.now(), at(["s1"], { out: { url: "https://github.com/x/y/issues/2", label: "#2" } }));
  place.reset();
});

test("a page opens inside Sol only on https on a site Cowork names (GitHub), off any sign-in path; anything else goes to the browser (#1464 review)", () => {
  place.reset();
  place.go(at(["s1"]));
  const sent: string[] = [];
  // the four the review found opening in the app, and their kin
  for (const url of ["http://127.0.0.1/x", "https://github.com/login", "http://localhost:8080/", "https://evil.example/",
    "https://127.0.0.1/x", "https://[::1]/", "https://localhost/", "https://github.com/login/oauth/authorize?x=1", "https://github.com/Sign-In",
    "https://user:pw@github.com/", "https://github.com:8443/", "https://github.com.evil.example/", "javascript:alert(1)", "file:///etc/passwd", "not a url"]) {
    place.open(url, "x", (u) => sent.push(u));
    assert.deepEqual(place.now(), at(["s1"]), `opened in the app: ${url}`);
  }
  assert.equal(sent.length, 15, "each refused page went to the browser");
  for (const url of ["https://github.com/sol-mif/sol-dev/issues/1464", "https://github.com/sol-mif/sol-dev/commit/2bd29d8"]) assert.ok(opensInApp(url), url);
  place.open("https://github.com/sol-mif/sol-dev/issues/1464", "#1464", (u) => sent.push(u));
  assert.equal(place.now().out?.label, "#1464");
  assert.equal(sent.length, 15);
  place.reset();
});

test("a window's first Cowork opens on the first anchor part registered, not on a part named here", () => {
  assert.deepEqual(startOf(), { project: "", part: "inbox", path: [] });
});
