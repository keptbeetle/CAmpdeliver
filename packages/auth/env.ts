import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function authEnv() {
  return createEnv({
    server: {},
    clientPrefix: "NEXT_PUBLIC_",
    client: {
      NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
