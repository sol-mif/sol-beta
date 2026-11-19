// The Agent SDK as test/sdk-stub-hooks.mjs hands it out: everything real except the three calls a Run makes to start a
// session. The servers a Run built are kept on globalThis.__sdk, each with the names of its tools; the query never ends.
export * from "../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs";
const seen = (globalThis.__sdk ??= { servers: [], options: [] });
export const tool = (name, description, shape, handler) => ({ name, description, shape, handler });
export const createSdkMcpServer = (o) => { const s = { type: "sdk", name: o.name, tools: o.tools.map((t) => t.name) }; seen.servers.push(s); return s; };
export const query = ({ options }) => {
  seen.options.push(options);
  const never = new Promise(() => {});
  return { async *[Symbol.asyncIterator]() { await never; }, interrupt: async () => {}, setModel: async () => {}, setPermissionMode: async () => {}, applyFlagSettings: async () => {}, getContextUsage: async () => { throw new Error("no"); }, close() {} };
};
