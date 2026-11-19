// A test engine's clock (node --import): SOL_TEST_NOW (ms) is "now" when the engine starts, and time runs on from there.
// For a suite whose fake sites carry fixed dates, which the engine's "only what is ahead" drops once the real day passes.
// Not a test file (test/*.test.ts), so the suite does not run it on its own.
const at = Number(process.env.SOL_TEST_NOW);
if (at > 0) {
  const Real = Date, off = Real.now() - at;
  globalThis.Date = class extends Real {
    constructor(...a) { if (a.length) super(...a); else super(Real.now() - off); }
    static now() { return Real.now() - off; }
  };
}
