// The conversion steps at engine start (#422): the engine's first import, so they run before any other module of the
// engine loads and reads saved data. The home is the engine's (SOL_HOME, else sol/home, as in index.ts); the engine's
// folder holds settings.json and team.json. It never throws: the state is on /health as `data`.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversions, type ConvertState } from "./run.js";
import { backAtStart } from "./back.js";
import { STEPS } from "./steps.js";
import { NEWER_SAID, newerUnder, nextDir } from "../next/file.js";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");   // src/convert or dist/convert → sol/engine
const HOME = resolve(process.env.SOL_HOME ?? join(ENGINE, "..", "home"));

/** where this engine's saved data is (going back to a release puts copies back here, team/pin.ts, #426) */
export const convertCtx = { home: HOME, dotSol: join(HOME, ".sol"), engine: ENGINE };
// ahead because the keeper went back from a release that did not start: this release puts the data back first (#1820)
export const conversions: ConvertState = backAtStart(convertCtx, runConversions(convertCtx, STEPS));
const newer = newerUnder(nextDir(HOME));   // what is still newer than this build is read-only, and Sol says so
if (newer.length) conversions.newer = { stores: newer, say: NEWER_SAID };
if (conversions.back) console.log("error" in conversions.back
  ? `convert: the data stays at data-version ${conversions.back.from}; going back to ${conversions.back.to} failed (${conversions.back.error})`
  : `convert: the keeper went back, so the data went back from data-version ${conversions.back.from} to ${conversions.back.to}; the files as they were are in ${conversions.back.kept}`);
if (conversions.failed) console.log(`convert: ${conversions.failed.step} failed (${conversions.failed.error}); ` +
  `${conversions.failed.restored ? "its files are as they were" : "its files may be half changed"}, the steps after it did not run, data-version ${conversions.version}`);
else if (conversions.ran.length) console.log(`convert: ran ${conversions.ran.join(", ")}; data-version ${conversions.version}`);
else if (conversions.ahead) console.log(`convert: data-version ${conversions.version} is newer than this build's ${conversions.latest}; nothing ran`);
