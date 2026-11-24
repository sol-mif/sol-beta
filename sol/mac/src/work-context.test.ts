// node --test src/*.test.ts: the folder context before a session's first words (engine next/folders.ts contextText) is not
// what the person said (BR1 gate 3, #1615): split off whole, raw or already escaped; his words stay as he wrote them; the
// engine's "moved into the folder" line after it reads as one line of the talk.
// Signed: marcocyl04-ux's agent (builder P).
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitContext } from "./work/folderContext.ts";
import { engineSaid } from "./one/engineSaid.ts";

const CTX = "<folder context>\nFolder: api (~/api; its CLAUDE.md holds its rules)\nWhat the person keeps here:\n- deploys on Fridays\n</folder context>";

test("the folder context is split off a first message; his words are what is left", () => {
  assert.deepEqual(splitContext(`${CTX}\n\nfix the login bug`), { context: "Folder: api (~/api; its CLAUDE.md holds its rules)\nWhat the person keeps here:\n- deploys on Fridays", rest: "fix the login bug" });
  const esc = CTX.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  assert.equal(splitContext(`${esc}\n\nfix it`).rest, "fix it", "escaped once on the way, still split");
  assert.equal(splitContext(CTX).rest, "", "the context alone leaves nothing of his");
});

test("words that only mention a folder context stay his, whole", () => {
  for (const t of ["what is a <folder context>?", "fix it\n<folder context>\nx\n</folder context>", "<folder context> never closed"]) assert.deepEqual(splitContext(t), { context: "", rest: t });
});

test("the engine's move into a folder, after its context, is one line of the talk", () => {
  const said = `${CTX}\n\nThe person moved this session into the folder api. From now on, work with what that folder knows (above). Answer with one line saying the session is now in api.`;
  assert.equal(engineSaid(splitContext(said).rest), "moved into api: it works with what that folder knows");
  assert.equal(engineSaid("please move this into the folder api"), null);
});
