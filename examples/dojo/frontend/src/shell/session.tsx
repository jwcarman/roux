import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { get, getJson, onSessionLost, send, useClearQueriesOnIdentityChange } from "@jwcarman/roux-web/api";
import { fetchMe, MEMBERS_PROFILE, type Me, type Profile } from "../api";

export interface Session {
  /** undefined while loading, null when signed out. */
  me: Me | null | undefined;
  /**
   * The caller as of the last answer from the server, even before React re-renders: route guards
   * read this, so a navigation right after signing in sees the new session.
   */
  currentMe: () => Me | null | undefined;
  /** The member's own profile: undefined while loading, null for a caller with none to show. */
  profile: Profile | null | undefined;
  refresh: () => Promise<Me | null>;
  /** Reloads the profile, for example after a rename. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const meNow = useRef<Me | null | undefined>(undefined);
  const currentMe = useCallback(() => meNow.current, []);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useClearQueriesOnIdentityChange(me === undefined ? undefined : (me?.identityId ?? null));

  const refresh = useCallback(async () => {
    const current = await fetchMe();
    meNow.current = current;
    setMe(current);
    return current;
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getJson<Profile>("/api/members/me"));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (me?.permissions.includes(MEMBERS_PROFILE)) {
      void refreshProfile();
    } else if (me !== undefined) {
      setProfile(null);
    }
  }, [me, refreshProfile]);

  const signOut = useCallback(async () => {
    await send("POST", "/who/logout");
    await get("/who/me"); // sets a fresh XSRF-TOKEN cookie
    meNow.current = null;
    setMe(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any API call that answers 401 means the session is gone: refresh, and the signed-out pages send
  // the user to sign in.
  useEffect(
    () =>
      onSessionLost(() => {
        void refresh();
      }),
    [refresh],
  );

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
