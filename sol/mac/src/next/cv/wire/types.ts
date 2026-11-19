// The engine a wire reads (#1604): today's face's own link (useEngine), so a wire reads today's messages through
// e.subscribe and sends with e.send, the same meaning as the old face's. Signed: marcocyl04-ux's agent, the port's prep (#1615).
import type { useEngine } from "../../../useEngine.ts";

export type Engine = ReturnType<typeof useEngine>;
