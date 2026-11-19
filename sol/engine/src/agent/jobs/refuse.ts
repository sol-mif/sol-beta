// What a run may not do. Every folder in watch mode: the tools that reach past the folder (run.ts watchRefusal). The
// jobs folder, in every mode: browser_type, so a run can never sign in, make an account or fill a form; a search goes
// in the address instead (?q=…). Clicking is still allowed (a careers page's links); the task forbids apply and send.
import { basename } from "node:path";

export const TYPE_REFUSED = "browser_type is refused in the jobs folder: no sign-in, no account and no form is ever filled here. Put search words in the address (?q=…) instead.";

export function refusalFor(folder: string, mode: string, watch: (tool: string) => string | null): ((tool: string) => string | null) | undefined {
  const jobs = basename(folder).toLowerCase() === "jobs";
  if (!jobs) return mode === "watch" ? watch : undefined;
  return (tool) => (tool === "browser_type" ? TYPE_REFUSED : mode === "watch" ? watch(tool) : null);
}
