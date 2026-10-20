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

// React Query key for auth session. Make sure to optimistically update user infos using this.
export const AUTH_QUERY_KEY = ["auth", "session"] as const;

// session_GET re-signs the 1-day JWT cookie, so refetching well inside that window keeps visible tabs signed in.
export const SESSION_STALE_MS = 5 * 60_000;
export const SESSION_REFRESH_INTERVAL_MS = 30 * 60_000;
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
  // Re-login from the session-expired dialog. Same user: keeps page data and reloads failed reads. Another user: behaves like onLogin.
  onRelogin: (user: User) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Add this to components/_globalContextProviders but not any pageLayout files.
// Make sure it's within the QueryClientProvider
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queryClient = useQueryClient();

  const { data, error, status, refetch } = useQuery({
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
  useEffect(() => {
    const listener = () => { if (queryClient.getQueryData(AUTH_QUERY_KEY)) setExpiredByRequest(true); };
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  }, [queryClient]);
  // A known user stays signed in on the page while expired; without one (first load, after logout) there is nothing to preserve.
  const sessionExpired = Boolean(data) && (expiredByRequest || (status === "error" && isSessionExpiredError(error)));

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
    setExpiredByRequest(false);
    // Make the actual API call; 401 means the server session is already gone, which is what logout wants.
    try { await postLogout(); } catch (e) { if (!isSessionExpiredError(e)) throw e; }
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
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      setExpiredByRequest(false);
    },
    [queryClient]
  );

  const onRelogin = useCallback(
    (user: User) => {
      const previous = queryClient.getQueryData<User | null>(AUTH_QUERY_KEY);
      if (!previous || previous.id !== user.id) return onLogin(user);
      // Same user: keep every cached page and draft; only reload what failed while signed out.
      queryClient.setQueryData(AUTH_QUERY_KEY, user);
      setExpiredByRequest(false);
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] && query.state.status === "error" });
    },
    [queryClient, onLogin]
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
