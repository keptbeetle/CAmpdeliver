import type { Session } from "@supabase/supabase-js";
import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { focusManager } from "@tanstack/react-query";

import { queryClient } from "~/utils/api";
import { cacheAuthSession, supabase } from "~/utils/auth";

interface AuthSessionContextValue {
  isLoading: boolean;
  session: Session | null;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    let restoreInFlight: Promise<void> | null = null;

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;
      const nextUserId = nextSession?.user.id ?? null;
      const previousUserId = activeUserIdRef.current;
      if (previousUserId !== undefined && previousUserId !== nextUserId) {
        // Never reuse authenticated query data across identities. Besides being
        // safer, this prevents a cached "no profile" result from a just-created
        // account from bouncing the next authenticated session back to signup.
        queryClient.removeQueries();
      }
      activeUserIdRef.current = nextUserId;
      cacheAuthSession(nextSession);
      void supabase.realtime.setAuth(nextSession?.access_token ?? null);
      setSession(nextSession);
    };

    const restoreSession = (initial: boolean) => {
      if (restoreInFlight) return restoreInFlight;

      restoreInFlight = supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          applySession(data.session);
        })
        .catch((error: unknown) => {
          // A transient refresh/storage failure must not discard the in-memory
          // session. Supabase will retry auto-refresh while the app is active.
          console.warn("Unable to refresh the saved session:", error);
        })
        .finally(() => {
          restoreInFlight = null;
          if (initial && isMounted) setIsLoading(false);
        });

      return restoreInFlight;
    };

    const activate = async (initial: boolean) => {
      void supabase.auth.startAutoRefresh();
      await restoreSession(initial);
      if (isMounted && AppState.currentState === "active") {
        focusManager.setFocused(true);
      }
    };

    const handleAppState = (state: string) => {
      if (state === "active") {
        focusManager.setFocused(false);
        void activate(false);
      } else {
        focusManager.setFocused(false);
        void supabase.auth.stopAutoRefresh();
      }
    };

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === "INITIAL_SESSION") {
        if (nextSession) applySession(nextSession);
        return;
      }

      if (event === "SIGNED_OUT") {
        applySession(null);
      } else if (nextSession) {
        applySession(nextSession);
      }

      setIsLoading(false);
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppState,
    );

    if (AppState.currentState === "active") {
      focusManager.setFocused(false);
      void activate(true);
    } else {
      focusManager.setFocused(false);
      void supabase.auth.stopAutoRefresh();
      void restoreSession(true);
    }

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      authSubscription.unsubscribe();
      void supabase.auth.stopAutoRefresh();
      focusManager.setFocused(undefined);
    };
  }, []);

  const value = useMemo(() => ({ isLoading, session }), [isLoading, session]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return context;
}
