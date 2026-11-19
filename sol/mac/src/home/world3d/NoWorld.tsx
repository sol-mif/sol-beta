// #1187: what stands where the world was when its chunk does not load (three missing from node_modules: a Sol whose
// update skipped an install). A line, never the whole face; it takes no props, so it fits each place World3D is drawn.
export function NoWorld() {
  return <div className="fh-view" style={{ padding: 24, opacity: 0.7 }}>The world did not load. Restart Sol after its next update.</div>;
}
