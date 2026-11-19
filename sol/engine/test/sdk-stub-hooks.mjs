// A loader hook for a test that must see what a Run hands the Agent SDK without starting a CLI: the SDK's bare name
// resolves to test/sdk-stub.mjs, which keeps the real SDK's other exports and replaces query, createSdkMcpServer, tool.
// Not a test file (test/*.test.ts), so the suite does not run it on its own.
const STUB = new URL("./sdk-stub.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "@anthropic-ai/claude-agent-sdk") return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
