// Hand in by button (#579): the wrap-up box's merge is the person's press, on the face's build against the stub engine.
// One of the gate's end-to-end paths (sol/test/e2e/run.mjs imports it; it sits here, beside the engine's hand-in tests,
// because the guard lets only Sol's own source name the card's messages):
//   node sol/test/e2e/run.mjs --dist <the face's build> --only handin-merge
// A Work session whose last item is a wrap-up box with a merge button for #575. A press asks the engine for the
// session's key (team.handin.key, box) and sends the keyed merge (team.handin.merge, pr 575); nothing is said to the
// agent (no work.say). The first press comes back refused (red checks): the words show under the box and the button
// stays; the second is merged: the button gives way to "merged #575". The engine side (ready, then merge, on GitHub)
// is together-handin-button.test.ts.
const SESSION = { id: "s-merge", title: "fr-30 builders", cwd: "/tmp/sol", project: "sol", updatedAt: Date.now() - 30_000 };
const WRAP = { id: "wrap:1", kind: "wrap", recap: "#575 is green and waits on your press.", ask: "Merge #575?", actions: [{ label: "merge", action: "merge", pr: 575 }] };

let presses = 0;
export const paths = {
  "handin-merge": {
    init: () => { localStorage.setItem("sol.home.open", JSON.stringify({ kind: "session", id: "s-merge" })); },
    answer: (m, send) => {
      if (m.type === "work.list") return send({ type: "work.sessions", sessions: [SESSION], projects: [], groups: [], order: [], roomNames: {}, runs: [] }), true;
      if (m.type === "work.open" && m.sessionId === SESSION.id) return send({ type: "work.thread", sessionId: SESSION.id, cwd: SESSION.cwd, title: SESSION.title, items: [{ id: "u-1", kind: "me", text: "build the gaps" }, WRAP] }), true;
      if (m.type === "team.handin.key") return send({ type: m.type, rid: m.rid, ...(m.box === true && m.sessionId === SESSION.id ? { key: "k-box" } : { error: "no key" }) }), true;
      if (m.type === "team.handin.merge") {
        presses++;
        return send({ type: m.type, rid: m.rid, ...(presses === 1 ? { error: "#575's checks are red: it merges once they are green" } : { ok: true, number: 575, url: "https://github.com/sol-mif/sol-dev/pull/575" }) }), true;
      }
      return false;
    },
    run: async (page, stub, { until, shows, asked }) => {
      presses = 0;
      await asked(stub, (m) => m.type === "work.open" && m.sessionId === SESSION.id, "to open the session");
      await shows(page, WRAP.recap);
      const button = page.locator(".wwrap .choices button", { hasText: "merge" });
      await until(() => button.isVisible(), "the box's merge button");
      await button.click();
      await asked(stub, (m) => m.type === "team.handin.key" && m.sessionId === SESSION.id && m.box === true, "for the box's key");
      await asked(stub, (m) => m.type === "team.handin.merge" && m.key === "k-box" && m.pr === 575 && m.sessionId === SESSION.id, "to merge #575 with the key");
      await shows(page, "checks are red");
      await until(() => button.isEnabled(), "the button back after a refusal");
      await button.click();
      await until(() => stub.got.filter((m) => m.type === "team.handin.merge").length === 2, "the second press");
      await shows(page, "merged #575");
      if (await button.count()) throw new Error("the merge button is still there after the merge");
      if (stub.got.some((m) => m.type === "work.say" || m.type === "say")) throw new Error("the press said words to the agent");
    },
  },
};
