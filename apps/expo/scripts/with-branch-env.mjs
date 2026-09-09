import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBackendUrl } from "./resolve-backend-url.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const rootEnvPath = resolve(repoRoot, ".env");
const explicitApiUrl = process.env.EXPO_API_URL_OVERRIDE;

if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// EXPO_PUBLIC_API_URL is a generated build input, not configuration. Clear any
// stale value inherited from .env, Playwright, a parent shell, or an older
// branch before resolving the backend for this invocation.
delete process.env.EXPO_PUBLIC_API_URL;

async function resolveApiUrl() {
  if (explicitApiUrl) {
    console.error(`[expo-backend] explicit override -> ${explicitApiUrl}`);
    return explicitApiUrl.replace(/\/$/, "");
  }

  try {
    const result = await resolveBackendUrl();
    console.error(
      `[expo-backend] ${result.source} ${result.sha.slice(0, 12)} -> ${result.url}`,
    );
    return result.url;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not resolve the backend for this branch (${reason}). Authenticate gh or set EXPO_API_URL_OVERRIDE explicitly for this command. EXPO_PUBLIC_API_URL is intentionally generated and ignored as user configuration.`,
    );
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: pnpm with-env <command> [...args]");
  process.exit(2);
}

const apiUrl = await resolveApiUrl();
const child = spawn(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    EXPO_PUBLIC_API_URL: apiUrl,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`[expo-backend] failed to launch ${command}:`, error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
