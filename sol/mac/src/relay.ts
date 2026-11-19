// The relay (relay.mjs, loopback, read only): it follows a folder agent's Codex thread and streams each step on
// /events. Home's folders and Agents mode's desk both listen to it; its address lives here, in no one folder's file.
export const RELAY = "http://127.0.0.1:8799";
