import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Me } from "../auth";
import { getJson, onSessionLost } from "../api/client";
import { useClearQueriesOnIdentityChange } from "../api/queryClient";
import { auth } from "../signin/auth";

export type { Me };

/** The signed-in person's own profile, from roux-users' `/api/roux/users/me`; `version` goes back with a rename. */
export interface Profile {
  displayName: string;
  email: string;
  version: number;
}

/** The signed-in caller, or null when signed out. */
async function fetchMe(): Promise<Me | null> {
  const result = await auth.me.get();
  return result.ok ? result.value : null;
}

export interface Session {
  /** undefined while loading, null when signed out. */
  me: Me | null | undefined;
  /**
   * The caller as of the last answer from the server, even before React re-renders: route guards
   * read this, so a navigation right after signing in sees the new session.
   */
  currentMe: () => Me | null | undefined;
  /** The user's own profile: undefined while loading, null for a caller with none to show. */
  profile: Profile | null | undefined;
  refresh: () => Promise<Me | null>;
  /** Reloads the profile, for example after a rename. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Both start unset: loading. */
interface SessionState {
  me?: Me | null;
  profile?: Profile | null;
}

/**
 * The session outside React: what it holds, and what changes it. The provider subscribes once it
 * mounts, which loads the caller and starts listening for a session that ended, and unsubscribes
 * when it unmounts, which stops.
 */
function createSession() {
  let state: SessionState = {};
  // Set by subscribe, before anything can update the session (subscribing is what starts it).
  let changed: () => void;

  function update(next: Partial<SessionState>) {
    state = { ...state, ...next };
    changed();
  }

  async function refreshProfile() {
    try {
      update({ profile: await getJson<Profile>("roux/users/me") });
    } catch {
      update({ profile: null });
    }
  }

  async function refresh() {
    const me = await fetchMe();
    update({ me });
    if (me) {
      await refreshProfile();
    } else {
      update({ profile: null });
    }
    return me;
  }

  async function signOut() {
    await auth.signOut(); // also fetches a fresh XSRF-TOKEN cookie
    update({ me: null, profile: null });
  }

  function subscribe(onChange: () => void) {
    changed = onChange;
    // Any API call that answers 401 means the session is gone: refresh, and the guards send the
    // user to sign in.
    const stopListening = onSessionLost(() => {
      void refresh();
    });
    void refresh();
    return stopListening;
  }

  return { subscribe, state: () => state, currentMe: () => state.me, refresh, refreshProfile, signOut };
}

const SessionContext = createContext<Session | null>(null);

/**
 * Who is signed in, for everything below it: it loads the caller from who and their profile from
 * roux-users, asks again whenever an API call answers 401, and empties the query cache when the
 * person changes. Mount it once, inside the query client's provider; `useSession()` reads it.
 */
export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [session] = useState(createSession);
  const { me, profile } = useSyncExternalStore(session.subscribe, session.state);
  useClearQueriesOnIdentityChange(me === null ? null : me?.identityId);
  // A new value only when who is signed in changes, so its readers render only then.
  const value = useMemo(() => {
    const { currentMe, refresh, refreshProfile, signOut } = session;
    return { me, currentMe, profile, refresh, refreshProfile, signOut };
  }, [session, me, profile]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

/** The session `SessionProvider` holds; throws outside one. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error("useSession outside SessionProvider");
  }
  return session;
}
