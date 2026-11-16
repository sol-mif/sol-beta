// node --test src/*.test.ts: the one socket a page keeps to the engine (socket.ts, #17), read as a hostile reader (#892).
// Its promise: one link per url; a socket that goes silent after its engine has answered a ping is dropped and a new
// one opened; a dropped socket is replaced on the backoff; up and down are told on every change. Here on a fake
// WebSocket, a fake window and document, and node's mocked timers, with the wall clock skewable on its own (a browser's
// timers keep running when the clock is set back; only Date.now jumps).
import { test, mock } from "node:test";
import assert from "node:assert/strict";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: { type?: string }[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; FakeSocket.all.push(this); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  say(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const g = globalThis as Record<string, unknown>;
g.window = Object.assign(new EventTarget(), {
  setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (t: number) => clearTimeout(t),
  setInterval: (f: () => void, ms: number) => setInterval(f, ms), clearInterval: (t: number) => clearInterval(t),
});
g.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
g.WebSocket = FakeSocket;
const { link } = await import("./socket.ts");

/** mocked timers, and a wall clock that can be set back while the timers run on */
function clock() {
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 10_000_000 });
  const base = Date.now;
  let skew = 0;
  Date.now = () => base() + skew;
  return { back: (ms: number) => { skew -= ms; }, tick: (ms: number) => { for (let t = 0; t < ms; t += 1000) mock.timers.tick(1000); } };
}

test("pin: a silent socket whose engine answers pings is dropped and replaced", () => {
  const c = clock();
  try {
    FakeSocket.all = [];
    const l = link("ws://pin-silent");
    const s = FakeSocket.all[0];
    s.open();
    s.say({ type: "pong" });
    assert.equal(l.up(), true);
    c.tick(70_000);   // nothing heard: pinged at 15 s, dead 25 s after
    assert.ok(FakeSocket.all.length >= 2, "the silent socket was never replaced");
    (l as unknown as { close: () => void }).close();
  } finally { mock.timers.reset(); }
});

test("defect: a clock set back never blinds the heartbeat: a silent socket is still replaced", () => {
  const c = clock();
  try {
    FakeSocket.all = [];
    const l = link("ws://clock-back");
    const s = FakeSocket.all[0];
    s.open();
    s.say({ type: "pong" });
    c.tick(5_000);
    c.back(3_600_000);   // the machine's clock corrected an hour back (a wake, a time zone, the network time)
    c.tick(70_000);   // the socket says nothing from here on
    assert.ok(FakeSocket.all.length >= 2, "after the clock went back the dead socket was kept for the hour");
    (l as unknown as { close: () => void }).close();
  } finally { mock.timers.reset(); }
});

test("pin: one link per url; up and down are told; a closed socket is replaced on the backoff", () => {
  const c = clock();
  try {
    FakeSocket.all = [];
    const l = link("ws://pin-one");
    assert.equal(link("ws://pin-one"), l);
    const said: boolean[] = [];
    l.onLink((up) => said.push(up));
    FakeSocket.all[0].open();
    FakeSocket.all[0].readyState = 3;
    FakeSocket.all[0].onclose?.();
    assert.equal(l.send({ type: "x" }), false, "nothing is queued while down");
    c.tick(1_000);
    assert.equal(FakeSocket.all.length, 2);
    assert.deepEqual(said, [false, true, false]);
    (l as unknown as { close: () => void }).close();
  } finally { mock.timers.reset(); }
});

test("pin: a clock set back never drops a socket that still answers", () => {
  const c = clock();
  try {
    FakeSocket.all = [];
    const l = link("ws://clock-back-alive");
    const s = FakeSocket.all[0];
    s.open();
    // an engine that answers every ping at once
    const send = s.send.bind(s);
    s.send = (raw: string) => { send(raw); if (JSON.parse(raw).type === "ping") s.say({ type: "pong" }); };
    s.say({ type: "pong" });
    c.tick(5_000);
    c.back(3_600_000);
    c.tick(70_000);
    assert.equal(FakeSocket.all.length, 1, "a live socket was replaced because the clock went back");
    (l as unknown as { close: () => void }).close();
  } finally { mock.timers.reset(); }
});
