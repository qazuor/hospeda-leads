import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useEffect,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "../endpoints/auth/session_GET.schema";
import { postLogout } from "../endpoints/auth/logout_POST.schema";
import { User } from "./User";
import { CrmApiError, SESSION_EXPIRED_EVENT } from "./apiClient";
import { authNavigation, broadcastLogout, onLogoutElsewhere } from "./authSync";

// React Query key for auth session. Make sure to optimistically update user infos using this.
export const AUTH_QUERY_KEY = ["auth", "session"] as const;

// session_GET re-signs the 1-day JWT cookie, so refetching well inside that window keeps visible tabs signed in.
export const SESSION_STALE_MS = 5 * 60_000;
export const SESSION_REFRESH_INTERVAL_MS = 30 * 60_000;
/** After a re-login, 401s from requests sent before it are late answers, not a new expiry. */
export const RELOGIN_GRACE_MS = 2_000;
/** True for the server's "no valid session" answer; transient failures (network, 400, 5xx) are not an expiry. */
export const isSessionExpiredError = (error: unknown): boolean => error instanceof CrmApiError && error.status === 401;

// Do not use this state in login/register UI because it's irrelevant. Only use it in UI that requires authentication.
// For pages that requires authentication only in parts of the UI (e.g. typical home page with a user avatar), the loading
// state should not apply to the full page, only to the parts that require authentication.
// Also, global context providers should not be blocked on auth states as it will block the whole page.
type AuthState =
  | {
      // Make sure to display a nice loading state UI when loading authentication state
      type: "loading";
    }
  | {
      type: "authenticated";
      user: User;
    }
  | {
      // Make sure to redirect to login or show auth error UI
      type: "unauthenticated";
      errorMessage?: string;
    };

type AuthContextType = {
  // Use this to display the correct UI based on auth state
  authState: AuthState;
  // Notify the auth provider that we have logged in
  onLogin: (user: User) => void;
  // Clear the auth state and perform the logout request
  logout: () => Promise<void>;
  // The known user's session ended (a request got 401). The page stays mounted under a re-login dialog so drafts survive.
  sessionExpired: boolean;
  // Re-login from the session-expired dialog. Same user: keeps page data and reloads failed reads. Another user: clears every cache and reloads the app at home.
  onRelogin: (user: User) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Add this to components/_globalContextProviders but not any pageLayout files.
// Make sure it's within the QueryClientProvider
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();

  const { data, error, status, dataUpdatedAt } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => (await getSession()).user,
    retry: 1,
    enabled: true,
    staleTime: SESSION_STALE_MS,
    refetchInterval: SESSION_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Any request answering 401 fires the event (live polling plus every page query), so the flag dedupes them into one dialog.
  const [expiredByRequest, setExpiredByRequest] = useState(false);
  // Last user confirmed by the server; frozen while expired so re-login compares against who was signed in at expiry.
  const knownUserIdRef = useRef<User["id"] | null>(null);
  const expiredUserIdRef = useRef<User["id"] | null>(null);
  // A late 401 from a request sent before re-login must not reopen the dialog.
  const ignoreExpiryUntilRef = useRef(0);
  const expiredAtRef = useRef(0);
  const markExpired = useCallback(() => {
    if (knownUserIdRef.current === null || Date.now() < ignoreExpiryUntilRef.current) return;
    if (expiredUserIdRef.current === null) { expiredUserIdRef.current = knownUserIdRef.current; expiredAtRef.current = Date.now(); }
    setExpiredByRequest(true);
  }, []);
  // Another account now owns this browser: nothing from the previous user may survive, in memory or on screen.
  const switchUser = useCallback(() => {
    queryClient.getMutationCache().clear();
    queryClient.clear();
    authNavigation.assign("/");
  }, [queryClient]);
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, markExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, markExpired);
  }, [markExpired]);
  useEffect(() => {
    if (status === "error" && isSessionExpiredError(error) && data) markExpired();
  }, [status, error, data, markExpired]);
  useEffect(() => {
    if (!data) return;
    if (knownUserIdRef.current !== null && data.id !== knownUserIdRef.current) return switchUser();
    knownUserIdRef.current = data.id;
    // A session answer received after the expiry, for the same user (renewed in another tab): nothing to re-enter.
    if (expiredUserIdRef.current !== null && dataUpdatedAt > expiredAtRef.current) { expiredUserIdRef.current = null; setExpiredByRequest(false); }
  }, [data, dataUpdatedAt, switchUser]);
  // Logout in another tab: drop every cached record and start over on the login page, without the re-login dialog.
  useEffect(() => onLogoutElsewhere(() => {
    // Nobody signed in here (login, register, password reset): nothing to clear, and a reload would drop a reset token.
    // Also makes repeated signals idempotent: acting clears the known user first.
    if (knownUserIdRef.current === null) return;
    knownUserIdRef.current = null;
    queryClient.getMutationCache().clear();
    queryClient.clear();
    authNavigation.assign("/login");
  }), [queryClient]);
  // A known user stays signed in on the page while expired; without one (first load, after logout) there is nothing to preserve.
  const sessionExpired = Boolean(data) && expiredByRequest;

  const authState: AuthState =
    status === "pending"
      ? { type: "loading" }
      : status === "error" && !data // a failed background refresh keeps the known user; a 401 is surfaced through sessionExpired

        ? {
            type: "unauthenticated",
            errorMessage:
              error instanceof Error ? error.message : "No se pudo verificar la sesión.",
          }
        : data
          ? { type: "authenticated", user: data }
          : { type: "unauthenticated" };

  const logout = useCallback(async () => {
    // Cancel any in-flight session refresh so it cannot restore the user after logout
    await queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
    // Optimistically update UI
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    knownUserIdRef.current = null; expiredUserIdRef.current = null;
    setExpiredByRequest(false);
    // Make the actual API call; 401 means the server session is already gone, which is what logout wants.
    try { await postLogout(); } catch (e) { if (!isSessionExpiredError(e)) throw e; }
    broadcastLogout();
    // Invalidate all queries after login so previous user's state don't corrupt new user state.
    queryClient.resetQueries();
  }, [queryClient]);

  // This should only be used for login. For user profile changes, create separate endpoints and react query hooks
  // and update the data linked to AUTH_QUERY_KEY.
  const onLogin = useCallback(
    (user: User) => {
      // Do not reuse administrative or business data from the previous session.
      const otherQueries={predicate:(query:{queryKey:readonly unknown[]})=>query.queryKey[0]!==AUTH_QUERY_KEY[0]};
      void queryClient.cancelQueries(otherQueries);
      queryClient.removeQueries(otherQueries);
      knownUserIdRef.current = user.id; expiredUserIdRef.current = null;
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      setExpiredByRequest(false);
    },
    [queryClient]
  );

  const onRelogin = useCallback(
    (user: User) => {
      // Compare with who was signed in when the session expired, not with the cache (another tab may have changed it).
      const expiredUserId = expiredUserIdRef.current ?? knownUserIdRef.current;
      if (expiredUserId === null || expiredUserId !== user.id) return switchUser();
      // Same user: keep every cached page and draft; only reload what failed while signed out.
      expiredUserIdRef.current = null;
      ignoreExpiryUntilRef.current = Date.now() + RELOGIN_GRACE_MS;
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      setExpiredByRequest(false);
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] && query.state.status === "error" });
    },
    [queryClient, switchUser]
  );

  return (
    <AuthContext.Provider value={{ authState, logout, onLogin, sessionExpired, onRelogin }}>
      {children}
    </AuthContext.Provider>
  );
};

// Prefer using protectedRoutes instead of this hook unless the route doesn't need to be protected (e.g. login/register)
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a AuthProvider");
  }
  return context;
};
