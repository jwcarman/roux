import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { getJson, onSessionLost, useClearQueriesOnIdentityChange } from "@jwcarman/roux-web/api";
import { fetchMe, type Me, type Profile } from "../api";
import { who } from "../who";

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
      update({ profile: await getJson<Profile>("/api/users/me") });
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
    await who.signOut(); // also fetches a fresh XSRF-TOKEN cookie
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session] = useState(createSession);
  const { me, profile } = useSyncExternalStore(session.subscribe, session.state);
  useClearQueriesOnIdentityChange(me === null ? null : me?.identityId);
  const { currentMe, refresh, refreshProfile, signOut } = session;

  return (
    <SessionContext value={{ me, currentMe, profile, refresh, refreshProfile, signOut }}>{children}</SessionContext>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error("useSession outside SessionProvider");
  }
  return session;
}
