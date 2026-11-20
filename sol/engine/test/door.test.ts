// The door (engine/src/door.ts): who may open the engine's socket or fetch its routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { doorOpen, tailnetOk } from "../src/door.ts";

const opts = { port: 7777, owner: "marco@example.com" };
const AWAY = "https://nucbox.example.ts.net";
const owner = { "tailscale-user-login": "marco@example.com", host: "nucbox.example.ts.net" };

test("tailnet: the owner from a foreign page is refused", () => {
  assert.equal(doorOpen({ ...owner, origin: "https://evil.example" }, opts), false);
  assert.equal(doorOpen({ ...owner, origin: "http://nucbox.example.ts.net" }, opts), false);   // not https
  assert.equal(doorOpen({ ...owner, origin: "null" }, opts), false);
});

test("tailnet: the owner from Sol's own away page passes", () => {
  assert.equal(doorOpen({ ...owner, origin: AWAY }, opts), true);
});

test("tailnet: the owner from the Mac app or its hot face passes, the app's pages on the engine's own port do not (#49)", () => {
  assert.equal(doorOpen({ ...owner, origin: "tauri://localhost" }, opts), true);
  assert.equal(doorOpen({ ...owner, origin: "http://tauri.localhost" }, opts), true);
  assert.equal(doorOpen({ ...owner, origin: "https://tauri.localhost" }, opts), true);
  assert.equal(doorOpen({ ...owner, origin: "http://localhost:1420" }, opts), true);
  assert.equal(doorOpen({ ...owner, origin: "http://127.0.0.1:1420" }, opts), true);
  assert.equal(doorOpen({ ...owner, origin: "http://127.0.0.1:7777" }, opts), false);   // that is the NucBox's own loopback page, not an owner device's
  assert.equal(doorOpen({ ...owner, "tailscale-user-login": "other@example.com", origin: "tauri://localhost" }, opts), false);
});

test("tailnet: the owner with no Origin (a program, the phone app) passes", () => {
  assert.equal(doorOpen({ ...owner }, opts), true);
});

test("tailnet: not the owner is refused whatever the Origin", () => {
  assert.equal(doorOpen({ ...owner, "tailscale-user-login": "other@example.com", origin: AWAY }, opts), false);
  assert.equal(doorOpen({ ...owner, "tailscale-user-login": "other@example.com" }, opts), false);
  assert.equal(doorOpen({ ...owner, origin: AWAY }, { ...opts, owner: "" }), false);   // no owner set: nobody over the tailnet
});

test("loopback: Sol's pages pass, a foreign page is refused, no Origin passes unless cross-site", () => {
  assert.equal(doorOpen({ origin: "tauri://localhost" }, opts), true);
  assert.equal(doorOpen({ origin: "http://localhost:1420" }, opts), true);
  assert.equal(doorOpen({ origin: "http://127.0.0.1:7777" }, opts), true);
  assert.equal(doorOpen({ origin: "https://evil.example" }, opts), false);
  assert.equal(doorOpen({}, opts), true);
  assert.equal(doorOpen({ "sec-fetch-site": "cross-site" }, opts), false);
});

test("loopback: the Host must name this Mac; a page whose own name points at 127.0.0.1 is refused (#1715)", () => {
  for (const host of ["127.0.0.1:7777", "localhost:7777", "LOCALHOST", "[::1]:7777"]) {
    assert.equal(doorOpen({ host }, opts), true, host);
    assert.equal(doorOpen({ host, origin: "http://localhost:1420" }, opts), true, host);
  }
  const same = { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" };
  for (const host of ["evil.example:7777", "localhost.evil.example:7777", "127.0.0.1.nip.io:7777", "192.168.1.5:7777", ""]) {
    assert.equal(doorOpen({ ...same, host }, opts), false, host);
    assert.equal(doorOpen({ host, origin: "http://localhost:1420" }, opts), false, host);
  }
});

test("tailnet: a login header from a page pointed at this Mac is refused by its Host; the tailnet name passes (#1715)", () => {
  assert.equal(doorOpen({ ...owner, host: "evil.example:7777" }, opts), false);
  assert.equal(doorOpen({ ...owner, host: "nucbox.example.ts.net.evil.example" }, opts), false);
  assert.equal(doorOpen({ ...owner, host: "nucbox.example.ts.net:443" }, opts), true);
  assert.equal(doorOpen({ ...owner, host: "127.0.0.1:7777" }, opts), true);
});

test("loopback: a subresource of Sol's own page (an image of a page in the pane, #54) passes on its Referer; a foreign page's does not", () => {
  const opts = { port: 7777, owner: "" };
  const sub = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" };
  assert.equal(doorOpen({ ...sub, referer: "tauri://localhost/" }, opts), true);
  assert.equal(doorOpen({ ...sub, referer: "http://localhost:1420/" }, opts), true);
  assert.equal(doorOpen({ ...sub, referer: "https://evil.example/" }, opts), false);
  assert.equal(doorOpen({ ...sub }, opts), false);
  assert.equal(doorOpen({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", referer: "tauri://localhost/" }, opts), false);
});

test("the page pane's keyed assets, which ask only tailnetOk, refuse a foreign Host too; a final dot is the same name (#1715)", () => {
  const opts = { port: 7777, owner: "marco@example.com" };
  assert.equal(tailnetOk({ host: "attacker.example:7777" }, opts), false);
  assert.equal(tailnetOk({ host: "attacker.example:7777", "tailscale-user-login": "marco@example.com" }, opts), false);
  assert.equal(tailnetOk({ host: "127.0.0.1:7777" }, opts), true);
  assert.equal(tailnetOk({ host: "nucbox.example.ts.net", "tailscale-user-login": "marco@example.com" }, opts), true);
  assert.equal(doorOpen({ host: "localhost.:7777" }, opts), true);
  assert.equal(doorOpen({ host: "localhost.attacker.example" }, opts), false);
});
