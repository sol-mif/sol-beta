// Real friends in BR1's Social (#1615; social/friends.ts; sol/PROTOCOL.md "next.social.friend"):
//   next.social.friends {}                → next.social.friends { ok, me, friends[] (code, name, mine, people[], link, gone?), signIn? }
//   next.social.friend.link {}            → next.social.friend.link { ok, link, code, again? } | { ok:false, why }
//   next.social.friend.add { text }       → next.social.friend.add { ok, friend, already? } | { ok:false, why }; then next.social.friends
//   next.social.friend.peek { text }      → next.social.friend.peek { ok, code, who, name, already? } | { ok:false, why } (never joins)
//   next.social.friend.unfriend { code }  → next.social.friend.unfriend { ok } | { ok:false, why }; then next.social.friends
// Behind ui.next, like the rest of BR1's window: off, nothing here answers. Only Sol's own windows are answered.
// Signed: marcocyl04-ux's agent, BR1 people (#1615).
import type { Parts } from "../parts.js";
import { uiNext } from "../settings.js";
import { addFriend, friendsDeps, friendsNow, makeLink, peekFriend, unfriend } from "../social/friends.js";

const REFUSED = "only Sol's own windows";

export default function (p: Parts) {
  const d = friendsDeps();
  const hear = (type: string, f: (msg: any) => Promise<object>, after = false) =>
    p.on(type, async (msg, h) => {
      if (!uiNext()) return;
      const rid = msg?.rid !== undefined ? { rid: msg.rid } : {};
      if (!h.fromSol) return h.face.send({ type, ...rid, ok: false, why: REFUSED });
      try {
        const out = await f(msg ?? {});
        h.face.send({ type, ...rid, ...out });
        if (after && (out as { ok?: boolean }).ok) h.face.send({ type: "next.social.friends", ...(await friendsNow(d)) });
      } catch (e) { h.face.send({ type, ...rid, ok: false, why: (e as Error).message }); }
    });
  hear("next.social.friends", () => friendsNow(d));
  hear("next.social.friend.link", () => makeLink(d), true);
  hear("next.social.friend.add", (m) => addFriend(d, m.text), true);
  hear("next.social.friend.peek", (m) => peekFriend(d, m.text));
  hear("next.social.friend.unfriend", (m) => unfriend(d, m.code), true);
}
