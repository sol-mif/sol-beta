// Home's world (#1093): the sounds of the hand, made in the browser (no files). Off until he turns it on.
//   Four sounds, each under a fifth of a second, all quiet: a thing picked up (a soft tick), a thing snapped into a
//   place (two plastic clicks, the brick going home), a thing done (two notes, a fourth apart), a thing that wants
//   him (one low note). Nothing loops, nothing plays by itself except `ask` (once per thing that comes to the front
//   edge) and `done` (once per thing that lands on the shelf).
//     const sound = makeSound(() => settingIsOn);          // asked at every sound, so the switch works at once
//     onCarry: (t) => t && sound.pick()                   onDrop / onTie / onShelve / onArrange: sound.snap()
//     a thing's mood turns "done": sound.done()            a thing's mood turns "ask": sound.ask()
export type Sound = { pick: () => void; snap: () => void; done: () => void; ask: () => void; dispose: () => void };

export function makeSound(on: () => boolean): Sound {
  let ctx: AudioContext | null = null, noise: AudioBuffer | null = null, lastAt = 0;
  const still = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
  const ready = (): AudioContext | null => {
    if (!on() || still) return null;
    try {
      ctx ??= new AudioContext(); if (ctx.state === "suspended") void ctx.resume();
      if (!noise) { noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      return ctx;
    } catch { return null; }   // no audio here: silent, never an error
  };
  /** one soft note: a sine with a quick start and an even fall */
  const note = (c: AudioContext, hz: number, at: number, len: number, vol: number) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = hz;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(c.destination); o.start(at); o.stop(at + len + 0.02);
  };
  /** one plastic click: a few milliseconds of noise through a narrow band */
  const click = (c: AudioContext, hz: number, at: number, vol: number) => {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise; f.type = "bandpass"; f.frequency.value = hz; f.Q.value = 6;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    s.connect(f).connect(g).connect(c.destination); s.start(at); s.stop(at + 0.05);
  };
  /** never two sounds within 60 ms: a re-read that moves six things makes one sound, not six */
  const once = (f: (c: AudioContext, at: number) => void) => { const c = ready(); if (!c) return; const now = performance.now(); if (now - lastAt < 60) return; lastAt = now; f(c, c.currentTime + 0.005); };
  return {
    pick: () => once((c, at) => note(c, 880, at, 0.06, 0.035)),
    snap: () => once((c, at) => { click(c, 2400, at, 0.16); click(c, 1500, at + 0.028, 0.22); note(c, 190, at + 0.028, 0.07, 0.05); }),
    done: () => once((c, at) => { note(c, 659.25, at, 0.14, 0.045); note(c, 880, at + 0.09, 0.2, 0.045); }),
    ask: () => once((c, at) => note(c, 392, at, 0.22, 0.04)),
    dispose: () => { void ctx?.close().catch(() => {}); ctx = null; },
  };
}
