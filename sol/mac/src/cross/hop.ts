// Turning the window to a view from inside Home or Build (#1031): App listens (cross/hand.ts onHop). With a session, Build
// opens on it (sol:open-work).
export function hopTo(view: string, session?: string) {
  if (session) { try { localStorage.setItem("sol.home.open", JSON.stringify({ kind: "session", id: session })); } catch { /* private */ } }
  window.dispatchEvent(new CustomEvent("sol:cross-hop", { detail: view }));
  if (session) window.setTimeout(() => window.dispatchEvent(new CustomEvent("sol:open-work", { detail: session })), 80);
}
