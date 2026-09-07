import type { Session } from "@supabase/supabase-js";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { supabase } from "~/utils/auth";

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

  useEffect(() => {
    let isMounted = true;

    const syncTokenRefresh = (state: string) => {
      if (state === "active") {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    };

    syncTokenRefresh(AppState.currentState);
    const appStateSubscription = AppState.addEventListener(
      "change",
      syncTokenRefresh,
    );
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        // Keep the app usable if local storage is temporarily unavailable. A
        // future auth state event can still restore the persisted session.
        console.warn("Unable to restore the saved session:", error);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      authSubscription.unsubscribe();
      void supabase.auth.stopAutoRefresh();
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
