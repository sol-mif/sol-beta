// A face and a row of faces (slices 8+9, #1615; merge/people.js face, faces): the jelly in the person's own turn of the
// aura's colours, with a dot for their AI's state or "by link". Shared by Cowork, Social, the sidebar and Needs.
// Signed: marcocyl04-ux's agent, port slice 8+9 (#1615).
export type FaceOf = { n?: string; h?: string; me?: boolean; reach?: string; ai?: string | null; st?: string };

export function Face({ p, cls = "" }: { p: FaceOf; cls?: string }) {
  const dot = p.reach === "link" ? <i className="st s-link" title="by link" /> : p.ai ? <i className={`st s-${p.st}`} /> : null;
  const h = p.me || p.h === "sam" ? "me p-me" : "p-" + p.h;
  return <span className={`face ${cls} ${h}`} title={`${p.n ?? ""}${p.ai ? " · " + p.ai : ""}`}>{dot}</span>;
}

/** up to `max` faces, the person's own first, then "+N" */
export function Faces({ ps, max = 4, cls = "" }: { ps: FaceOf[]; max?: number; cls?: string }) {
  const order = [...ps].sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  return <span className="faces">{order.slice(0, max).map((p, i) => <Face key={i} p={p} cls={cls} />)}{ps.length > max ? <span className="more">+{ps.length - max}</span> : null}</span>;
}
