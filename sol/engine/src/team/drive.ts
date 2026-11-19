// Google Drive on this Sol (#152), for a Drive room's record (record/drive.ts): the first row of the grant module
// (grant.ts, #1230), which connects it, keeps it and refreshes it the way it does every provider. Google's consent page
// asks for Drive alone (and who you are, so Sol can say which of a folder's people is you): offline, so a refresh token
// comes; consent, so it comes every time; the person's choice of account. The cloud's half is sol/cloud/src/drive.ts.
// The grant is kept in `<state>/drive/account.json`, the file #152 made, and revoked at Google with its refresh token.
import { AUTH_URL, page } from "./cloud.js";
import type { Grant, Provider } from "./grant.js";

export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const WHOLE = "https://www.googleapis.com/auth/drive";

export const drivePage = (email: string) => page("Google Drive is connected", `<p>Sol can now read and write a Drive room's record${email ? ` as <b>${email.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</b>` : ""}. This tab can close.</p>`);

export const DRIVE: Provider = {
  id: "drive",
  name: "Google Drive",
  short: "Drive",
  by: "Google",
  authUrl: AUTH_URL,
  consent: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "false" },
  scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.file", WHOLE],
  path: "/drive",
  revoke: { url: REVOKE_URL },
  page: drivePage,
};

/** what a face may know (pure): connected or not, the email and whether the scope reaches a pasted folder */
export const driveForFace = (a: Grant | null) => a ? { connected: true, email: a.email, whole: a.scope.split(/\s+/).includes(WHOLE) } : { connected: false, email: "", whole: false };
