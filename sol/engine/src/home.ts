// One home on two machines: a path made on the Mac starts /Users/<x>, one made on the NucBox /home/<x>. Records
// cross over Syncthing with the path of the machine that wrote them (One Sol, #62), so anything that compares a
// recorded path to this machine's folders goes through here first.
export type Machine = "mac" | "nucbox";

const HOME = /^\/(Users|home)\/[^/]+(?=\/|$)/;

// whether a path sits in some machine's home, and which machine that is
export const inHome = (p: string) => HOME.test(p);
export const machineOf = (p: string): Machine | undefined => { const m = HOME.exec(p); return m ? (m[1] === "Users" ? "mac" : "nucbox") : undefined; };

// the same folder under another home. A path already in this home stays itself: a home deeper than /home/<x> (a test
// home, a second user's) read as another machine's put its own folders in a made-up twin, listed twice (#1125)
const within = (p: string, home: string) => p === home || p.startsWith(home.replace(/\/+$/, "") + "/");
export const twinIn = (p: string, home: string) => (HOME.test(p) && !within(p, home) ? home + p.replace(HOME, "") : p);
