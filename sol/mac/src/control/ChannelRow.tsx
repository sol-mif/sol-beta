// The updates switch (#1150): one row in Settings › me. A Sol follows dev (main each morning and urgent fixes) or beta
// (what the beta reviewer passed, a day behind). It writes team.json `channel` through team.settings, and the engine
// reads it live (ship.ts channelCheck): dev → beta never moves this Sol backwards, so the row says it stays on its
// release until beta reaches it; beta → dev installs dev at the next quiet minute.
import { useEffect, useState } from "react";
import { Seg } from "../work/WorkSettings";

export const meta = {
  ChannelRow: {
    job: "Updates: which releases this Sol follows, dev or beta, one row in Settings › me",
    flow: "mine",
    states: ["dev", "beta", "beta, staying on a newer release until beta reaches it"],
    keys: [{ press: "click dev or beta", does: "this Sol follows that channel from now on, with no restart" }],
    listens: ["team.channel (the engine's answer to team.channel.get)"],
  },
};

type Channel = "dev" | "beta";
type State = { channel?: Channel; release?: string; stays?: boolean; error?: string };
const WORDS: Record<Channel, string> = {
  dev: "main each morning and urgent fixes",
  beta: "what the beta reviewer passed, a day behind",
};

export function ChannelRow({ ask, set, off }: {
  ask: <T>(type: string, o?: object, ms?: number) => Promise<T>;
  set: (patch: object) => Promise<unknown>;
  off: boolean;
}) {
  const [st, setSt] = useState<State | null>(null);
  const look = () => void ask<State>("team.channel.get", {}, 25_000).then(setSt, () => {});
  useEffect(look, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ch = st?.channel;
  const pick = async (v: Channel) => {
    setSt((s) => ({ ...s, channel: v, stays: false }));
    await set({ channel: v });
    look();   // the engine has read it again: on beta, whether this Sol stays on its release
  };
  return (
    <>
      <div className="field-r" data-channel-row>
        <div className="lab"><span>Updates</span><small>{ch ? `${ch}: ${WORDS[ch]}` : `dev: ${WORDS.dev} · beta: ${WORDS.beta}`}</small></div>
        <Seg<Channel> value={ch ?? "dev"} disabled={off || !ch} options={[["dev", "dev"], ["beta", "beta"]]} onChange={(v) => void pick(v)} />
      </div>
      {ch === "beta" && st?.stays && <p className="hint-line">You stay on {st.release || "your release"} until beta reaches it.</p>}
    </>
  );
}
