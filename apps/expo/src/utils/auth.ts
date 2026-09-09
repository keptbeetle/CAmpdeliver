import type { Session } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

import { authStorage } from "~/platform/auth-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let cachedSession: Session | null | undefined;

export function cacheAuthSession(session: Session | null) {
  cachedSession = session;
}

export async function getAuthAccessToken(): Promise<string | undefined> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    cachedSession?.access_token &&
    (cachedSession.expires_at ?? 0) > nowSeconds + 30
  ) {
    return cachedSession.access_token;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (
      cachedSession?.access_token &&
      (cachedSession.expires_at ?? 0) > nowSeconds
    ) {
      return cachedSession.access_token;
    }
    throw error;
  }

  cachedSession = data.session;
  return data.session?.access_token;
}
