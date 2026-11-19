// The seam for sign-in and the Sol ID (#1320; seams/README.md). Who I am to a cloud, the ticket a Sol shows a hub, and
// the hub's own question "who is this token". Every caller asks identity(), never team/cloud.ts or team/identity.ts, so
// what is behind it (today: Google sign-in on Sol's cloud, kept in <state>/cloud/accounts.json, and gh for GitHub) can
// be swapped for another sign-in by one file, with nothing else in Sol changed and nobody signing in again.
// Behind it now: exactly what was there before; the calls are the old ones, in one place.
import { STATE_DIR } from "../work/state.js";
import { accountOn, accounts, accountsFile, cloudTicket, dropTicket, signIn, signOut, type SignedIn } from "../team/cloud.js";
import { ghToken, ghVerify, type Verify } from "../team/identity.js";
import { accessToken, dropSupabaseTicket, supabaseAccount, supabaseAccounts, supabaseFile, supabaseSignIn, supabaseSignOut, supabaseTicket, type Project } from "../team/supabase.js";
import { identitySupabase } from "../settings.js";

export type { SignedIn, Verify };

export interface Identity {
  /** every cloud I have an account on, with my name there (names and hubs only, never a token) */
  accounts(): { hub: string; login: string }[];
  /** my name on one cloud (its http address), or null when I have no account there */
  on(hub: string): { login: string } | null;
  /** my Sol ID, the one id for every cloud (#1351: Supabase's user id), "" when this sign-in has none or I am signed in nowhere */
  id(): string;
  /** my sign-in's own token for Sol's data store, so a post that names me is proved mine (#1607: Supabase's access token, renewed
   *  as needed); "" for the cloud's own sign-in, or signed in nowhere. Never kept by the caller */
  bearer(): Promise<string>;
  /** sign in to a cloud, in the system browser; done when the person finished, or ran out of time */
  signIn(hub: string): Promise<SignedIn>;
  /** this machine signs out of a cloud; false when the cloud did not answer (kept, to be tried again) */
  signOut(hub: string): Promise<boolean>;
  /** my ticket for a cloud, "" when there is none */
  ticket(hub: string): Promise<string>;
  /** a cloud refused my ticket: the next ask renews instead of using it again */
  forget(hub: string): void;
  /** my GitHub token for one connect, "" when not signed in; never kept */
  github(): Promise<string>;
  /** the hub's question, for a hub this engine runs: who a token is (and whether that login is in the org) */
  verifier(): Verify;
}

/** where my accounts on clouds are kept */
export const CLOUD_FILE = process.env.SOL_CLOUD_ACCOUNTS ?? accountsFile(STATE_DIR);

/** today's: Sol's cloud with Google, the accounts in `file`; GitHub through gh */
export function cloudIdentity(file = CLOUD_FILE): Identity {
  return {
    accounts: () => accounts(file),
    on: (hub) => { const a = accountOn(hub, file); return a ? { login: a.login } : null; },
    id: () => "",   // the cloud's own accounts have a name per cloud, no one id
    bearer: () => Promise.resolve(""),
    signIn: (hub) => signIn(hub, { file }),
    signOut: (hub) => signOut(hub, { file }),
    ticket: (hub) => cloudTicket(hub, { file }),
    forget: (hub) => dropTicket(hub),
    github: () => ghToken(),
    verifier: () => ghVerify(),
  };
}

/** where my Supabase sign-in is kept (#1351) */
export const SUPABASE_FILE = process.env.SOL_SUPABASE_ACCOUNT ?? supabaseFile(STATE_DIR);

/** Supabase's (#1351): one sign-in with Google (GitHub linked) and its Sol ID for every cloud, kept in `file`; a cloud
 *  shown its token gives its own ticket. GitHub for this engine's own calls is still gh: Supabase keeps no GitHub token */
export function supabaseIdentity(file = SUPABASE_FILE, o: { project?: Project; fetch?: typeof fetch; open?: (url: string) => void; now?: () => number } = {}): Identity {
  const d = { file, ...o };
  return {
    accounts: () => supabaseAccounts(file),
    on: (hub) => { const a = supabaseAccount(file); return a?.hubs.includes(hub) ? { login: a.login } : null; },
    id: () => supabaseAccount(file)?.id ?? "",
    bearer: () => accessToken(d),
    signIn: (hub) => supabaseSignIn(hub, d),
    signOut: (hub) => supabaseSignOut(hub, d),
    ticket: (hub) => supabaseTicket(hub, d),
    forget: (hub) => dropSupabaseTicket(hub),
    github: () => ghToken(),
    verifier: () => ghVerify(),
  };
}

/** which is in front: SOL_IDENTITY=supabase is Supabase's and any other word there is today's (a developer's own run, the
 *  tests); unset, the switch decides (`on`: settings.ts identitySupabase, the setting identity.supabase else the card's
 *  station, product since #1607, so a tester's Sol signs in on Supabase) */
export const identityOf = (env: NodeJS.ProcessEnv = process.env, on: () => boolean = identitySupabase): Identity => {
  const e = (env.SOL_IDENTITY ?? "").trim().toLowerCase();
  const supabase = e ? e === "supabase" : on();
  return supabase ? supabaseIdentity(env.SOL_SUPABASE_ACCOUNT ?? SUPABASE_FILE) : cloudIdentity();
};

let current: Identity | null = null;
/** the sign-in in use */
export const identity = (): Identity => (current ??= identityOf());
/** another sign-in behind the seam (the tests, and later another backend); null is today's again */
export const useIdentity = (i: Identity | null) => { current = i; };
