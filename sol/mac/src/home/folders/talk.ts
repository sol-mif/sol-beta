// One turn at a time on the talk's own socket (#957), for show-once (showOnce.tsx): it was the folder setup's (Setup.tsx,
// gone with #1223), kept here for show-once alone until it moves onto the record's Home (#1228).
import { useCallback, useEffect, useRef, useState } from "react";
import { ENGINE } from "../../useEngine";

type Turn = { text: string; sessionId?: string; ok: boolean; why?: string };
export function useTalk() {
  const sock = useRef<WebSocket | null>(null);
  const subs = useRef(new Set<(m: any) => void>());
  const [steps, setSteps] = useState<string[]>([]);
  const open = useCallback(() => new Promise<WebSocket | null>((res) => {
    const s = sock.current;
    if (s && s.readyState === WebSocket.OPEN) return res(s);
    let n: WebSocket;
    try { n = new WebSocket(ENGINE); } catch { return res(null); }
    sock.current = n;
    const t = window.setTimeout(() => res(null), 8000);
    n.onopen = () => { window.clearTimeout(t); res(n); };
    n.onerror = () => { window.clearTimeout(t); res(null); };
    n.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); subs.current.forEach((f) => f(m)); } catch { /* a torn line */ } };
  }), []);
  useEffect(() => () => { sock.current?.close(); }, []);
  /** one turn: deltas gathered, the steps shown as they come, the answer when it is done (the text after its last step) */
  const turn = useCallback(async (send: object, sessionId?: string, onSid?: (id: string) => void): Promise<Turn> => {
    const s = await open();
    if (!s) return { text: "", ok: false, why: "The engine did not answer." };
    setSteps([]);
    return new Promise<Turn>((res) => {
      let text = "", after = "", sid = sessionId;
      const f = (m: any) => {
        if (m.type === "start" && m.sessionId) { sid = m.sessionId; onSid?.(m.sessionId); return; }
        if (m.type === "delta" && typeof m.text === "string") { text += m.text; after += m.text; return; }
        if (m.type === "tool" && m.text) { after = ""; if (!m.done) setSteps((x) => [...x.slice(-4), String(m.text).slice(0, 90)]); return; }
        if (m.type === "error") { subs.current.delete(f); res({ text: "", sessionId: sid, ok: false, why: String(m.message ?? "it stopped") }); return; }
        if (m.type === "done" && (!m.sessionId || !sid || m.sessionId === sid)) {
          subs.current.delete(f);
          const said = (after.trim() || text.trim());
          res({ text: said, sessionId: m.sessionId ?? sid, ok: m.ok !== false || !!said, why: m.stopped ? "stopped" : undefined });
        }
      };
      subs.current.add(f);
      s.send(JSON.stringify(send));
    });
  }, [open]);
  /** a turn the window lost on a reload: the thread, and the turn still running there if there is one */
  const recover = useCallback(async (seat: string, sessionId: string): Promise<Turn> => {
    const s = await open();
    if (!s) return { text: "", ok: false, why: "The engine did not answer." };
    const thread = () => new Promise<{ who: string; text: string }[]>((res) => {
      const f = (m: any) => { if (m.type === "thread" && m.sessionId === sessionId) { subs.current.delete(f); res(m.msgs ?? []); } };
      subs.current.add(f);
      window.setTimeout(() => { subs.current.delete(f); res([]); }, 8000);
    });
    let running = false;
    const r = (m: any) => { if (m.type === "resumed" && m.sessionId === sessionId) running = !!m.running; };
    subs.current.add(r);
    const first = thread();
    s.send(JSON.stringify({ type: "open", seat, sessionId, resume: true }));
    let msgs = await first;
    await new Promise((ok) => setTimeout(ok, 800));
    subs.current.delete(r);
    if (running) {
      await new Promise<void>((ok) => { const f = (m: any) => { if (m.type === "done") { subs.current.delete(f); ok(); } }; subs.current.add(f); });
      const again = thread();
      s.send(JSON.stringify({ type: "open", seat, sessionId }));
      msgs = await again;
    }
    const last = msgs[msgs.length - 1];
    return last?.who === "you" ? { text: last.text, sessionId, ok: true } : { text: "", sessionId, ok: false, why: "lost" };
  }, [open]);
  return { turn, recover, steps };
}
