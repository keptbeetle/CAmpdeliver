import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_PRODUCTION_API_URL = "https://c-ampdeliver-nextjs.vercel.app";
const DEFAULT_HISTORY_LIMIT = 30;
const DEFAULT_WAIT_MS = process.env.CI ? 180_000 : 0;
const POLL_INTERVAL_MS = 5_000;
const BACKEND_PROBE_TIMEOUT_MS = 8_000;
const BACKEND_PROBE_ATTEMPTS = 2;
const BACKEND_PROBE_PATH = "/api/trpc/auth.signInWithIdentifier?batch=1";
const BACKEND_PROBE_BODY = JSON.stringify({
  0: {
    json: {
      identifier: "network-probe@example.invalid",
      password: "not-a-real-password",
    },
  },
});
const BACKEND_RELEVANT_PREFIXES = [
  "apps/nextjs/",
  "packages/api/",
  "packages/auth/",
  "packages/db/",
  "packages/ui/",
  "packages/validators/",
  "tooling/",
];
const BACKEND_RELEVANT_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
]);

function command(commandName, args) {
  return execFileSync(commandName, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function git(args) {
  return command("git", args);
}

function mayAffectBackend(path) {
  return (
    BACKEND_RELEVANT_FILES.has(path) ||
    BACKEND_RELEVANT_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function commitAffectsBackend(sha) {
  const output = git(["show", "--format=", "--name-only", "--no-renames", sha]);
  return output.split(/\r?\n/).filter(Boolean).some(mayAffectBackend);
}

function workingTreeAffectsBackend() {
  const output = git(["status", "--porcelain=v1"]);
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => line.slice(3).split(" -> "))
    .some(mayAffectBackend);
}

function ghJson(path) {
  return JSON.parse(command("gh", ["api", path]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function repositorySlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  const remote = git(["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) {
    throw new Error(
      `Cannot determine GitHub repository from origin: ${remote}`,
    );
  }
  return `${match[1]}/${match[2]}`;
}

function isProductionRef() {
  if (process.env.GITHUB_EVENT_NAME === "merge_group") return true;
  if (process.env.GITHUB_REF)
    return process.env.GITHUB_REF === "refs/heads/main";
  return git(["branch", "--show-current"]) === "main";
}

function validVercelUrl(value) {
  return /^https:\/\/[A-Za-z0-9.-]+\.vercel\.app$/.test(value);
}

function latestStatus(statuses) {
  return [...statuses]
    .sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    )
    .at(-1);
}

export function extractVercelPreviewAlias(value) {
  const match = String(value ?? "").match(
    /https:\/\/vercel\.live\/open-feedback\/([A-Za-z0-9.-]+\.vercel\.app)(?:[/?#]|$)/i,
  );
  if (!match?.[1]) return null;

  const url = `https://${match[1]}`;
  return validVercelUrl(url) ? url : null;
}

function previewAliasForCommit(repo, sha) {
  try {
    const checks = ghJson(
      `/repos/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`,
    );
    for (const check of checks.check_runs ?? []) {
      if (check.name !== "Vercel Preview Comments") continue;
      const alias = extractVercelPreviewAlias(
        [check.output?.title, check.output?.summary, check.output?.text]
          .filter(Boolean)
          .join("\n"),
      );
      if (alias) return alias;
    }
  } catch {
    // Deployment records remain a valid fallback when check metadata is unavailable.
  }
  return null;
}

function previewAliasFromHistory(repo, history) {
  for (const sha of history) {
    const alias = previewAliasForCommit(repo, sha);
    if (alias) return alias;
    if (commitAffectsBackend(sha)) break;
  }
  return null;
}

function curlBackendProbe(url, timeoutMs) {
  const executable = process.platform === "win32" ? "curl.exe" : "curl";
  const output = execFileSync(
    executable,
    [
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      String(Math.max(1, timeoutMs / 1000)),
      "--header",
      "content-type: application/json",
      "--header",
      "x-trpc-source: expo-backend-resolver",
      "--request",
      "POST",
      "--data-binary",
      BACKEND_PROBE_BODY,
      "--write-out",
      "\n%{http_code}",
      `${url}${BACKEND_PROBE_PATH}`,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const statusMatch = output.match(/\r?\n(\d{3})\s*$/);
  if (!statusMatch || statusMatch.index === undefined) {
    throw new Error("readiness probe did not return an HTTP status");
  }

  return {
    status: Number(statusMatch[1]),
    body: output.slice(0, statusMatch.index),
  };
}

export async function probeBackendAuth(
  url,
  {
    requestImpl = curlBackendProbe,
    timeoutMs = BACKEND_PROBE_TIMEOUT_MS,
    attempts = BACKEND_PROBE_ATTEMPTS,
  } = {},
) {
  let lastFailure = "request failed";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await requestImpl(url, timeoutMs);

      if (response.status !== 401) {
        const reason = `HTTP ${response.status}`;
        if (response.status < 500 || attempt === attempts) {
          return { ok: false, reason };
        }
        lastFailure = reason;
        continue;
      }

      let payload;
      try {
        payload = JSON.parse(response.body);
      } catch {
        return { ok: false, reason: "non-JSON login probe response" };
      }

      const errorData = Array.isArray(payload)
        ? payload[0]?.error?.json?.data
        : undefined;
      if (
        errorData?.path !== "auth.signInWithIdentifier" ||
        errorData?.code !== "UNAUTHORIZED"
      ) {
        return { ok: false, reason: "unexpected login probe payload" };
      }

      return { ok: true };
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr ?? "").trim()
          : "";
      lastFailure =
        stderr || (error instanceof Error ? error.message : String(error));
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }

  return { ok: false, reason: lastFailure || "request failed" };
}

export async function healthyPreviewCandidate(
  deploymentUrl,
  previewAlias,
  { allowAlias = true, probeImpl = probeBackendAuth } = {},
) {
  const candidates =
    allowAlias && previewAlias
      ? [previewAlias]
      : [deploymentUrl].filter(Boolean);
  const failures = [];

  for (const url of candidates) {
    const probe = await probeImpl(url);
    if (probe.ok) {
      return {
        ok: true,
        url,
        source: url === previewAlias ? "alias" : "deployment",
      };
    }
    failures.push(
      `${url === previewAlias ? "alias" : "deployment"}: ${probe.reason}`,
    );
  }

  return {
    ok: false,
    reason: failures.join("; ") || "no preview URL was available",
  };
}

function deploymentState(repo, sha) {
  const deployments = ghJson(
    `/repos/${repo}/deployments?sha=${encodeURIComponent(sha)}&environment=Preview&per_page=20`,
  );
  const deployment = [...deployments]
    .sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    )
    .at(-1);

  if (!deployment) return { kind: "missing" };

  const statuses = ghJson(
    `/repos/${repo}/deployments/${deployment.id}/statuses?per_page=20`,
  );
  const successfulStatus = [...statuses]
    .filter(
      (status) =>
        status.state === "success" &&
        validVercelUrl(String(status.environment_url ?? "").replace(/\/$/, "")),
    )
    .sort((a, b) =>
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    )
    .at(-1);

  if (successfulStatus) {
    return {
      kind: "success",
      url: String(successfulStatus.environment_url).replace(/\/$/, ""),
    };
  }

  const status = latestStatus(statuses);
  if (!status) return { kind: "pending" };

  const description = String(status.description ?? "");
  if (description === "Skipped - Not affected") {
    return { kind: "skipped" };
  }

  if (status.state === "failure" || status.state === "error") {
    return { kind: "failed", description };
  }

  if (status.state === "inactive") return { kind: "skipped" };
  return { kind: "pending" };
}

function branchHistory(targetSha) {
  return git(["rev-list", `--max-count=${DEFAULT_HISTORY_LIMIT}`, targetSha])
    .split(/\r?\n/)
    .filter(Boolean);
}

async function resolveCurrentDeployment(repo, sha, waitMs) {
  const deadline = Date.now() + waitMs;
  let state = deploymentState(repo, sha);

  while (
    (state.kind === "missing" || state.kind === "pending") &&
    Date.now() < deadline
  ) {
    await sleep(POLL_INTERVAL_MS);
    state = deploymentState(repo, sha);
  }

  return state;
}

export async function resolveBackendUrl({
  targetSha = process.env.TARGET_SHA || git(["rev-parse", "HEAD"]),
  productionUrl = process.env.EXPO_PUBLIC_PRODUCTION_API_URL ||
    DEFAULT_PRODUCTION_API_URL,
  waitMs = DEFAULT_WAIT_MS,
} = {}) {
  const normalizedProductionUrl = productionUrl.replace(/\/$/, "");
  if (!validVercelUrl(normalizedProductionUrl)) {
    throw new Error(
      `Invalid production backend URL: ${normalizedProductionUrl}`,
    );
  }

  if (workingTreeAffectsBackend()) {
    throw new Error(
      "Backend-relevant working-tree changes are not deployed yet. Commit and push them so Vercel can create the matching Preview, or set EXPO_API_URL_OVERRIDE to an intentionally chosen backend for this run.",
    );
  }

  if (isProductionRef()) {
    return {
      url: normalizedProductionUrl,
      source: "production",
      sha: targetSha,
    };
  }

  const repo = repositorySlug();
  const history = branchHistory(targetSha);
  const previewAlias = previewAliasFromHistory(repo, history);
  const backendChanged = commitAffectsBackend(targetSha);

  if (!backendChanged && previewAlias) {
    const candidate = await healthyPreviewCandidate(null, previewAlias);
    if (!candidate.ok) {
      throw new Error(
        `Stable Vercel branch alias failed the auth readiness probe; refusing to bundle an ephemeral deployment URL: ${candidate.reason}.`,
      );
    }
    return {
      url: candidate.url,
      source: "preview-alias",
      sha: targetSha,
    };
  }

  const currentState = await resolveCurrentDeployment(repo, targetSha, waitMs);

  if (currentState.kind === "success") {
    const candidate = await healthyPreviewCandidate(
      currentState.url,
      previewAlias,
      { allowAlias: !backendChanged },
    );
    if (candidate.ok) {
      return {
        url: candidate.url,
        source: candidate.source === "alias" ? "preview-alias" : "preview",
        sha: targetSha,
      };
    }
    if (backendChanged) {
      throw new Error(
        `Vercel Preview for backend-changing commit ${targetSha.slice(0, 12)} is marked successful but failed the auth readiness probe: ${candidate.reason}.`,
      );
    }
    console.error(
      `[expo-backend] skipping unhealthy preview ${targetSha.slice(0, 12)}: ${candidate.reason}`,
    );
  }
  if (currentState.kind === "failed") {
    if (backendChanged) {
      throw new Error(
        `Vercel Preview failed for backend-changing commit ${targetSha.slice(0, 12)}: ${currentState.description || "unknown error"}`,
      );
    }
    console.error(
      `[expo-backend] skipping failed preview ${targetSha.slice(0, 12)}: ${currentState.description || "unknown error"}`,
    );
  }

  if (currentState.kind === "skipped" && backendChanged) {
    throw new Error(
      `Vercel skipped backend-changing commit ${targetSha.slice(0, 12)}. Fix the Vercel deployment before running Expo instead of using an older backend.`,
    );
  }

  if (
    (currentState.kind === "missing" || currentState.kind === "pending") &&
    backendChanged
  ) {
    throw new Error(
      `No successful Vercel Preview is available yet for backend-changing commit ${targetSha.slice(0, 12)}. Wait for Vercel to finish instead of using an older backend.`,
    );
  }

  for (const sha of history.slice(1)) {
    const state = deploymentState(repo, sha);
    const ancestorChangedBackend = commitAffectsBackend(sha);
    if (state.kind === "success") {
      const candidate = await healthyPreviewCandidate(state.url, previewAlias, {
        allowAlias: !ancestorChangedBackend,
      });
      if (candidate.ok) {
        return {
          url: candidate.url,
          source:
            candidate.source === "alias"
              ? "preview-ancestor-alias"
              : "preview-ancestor",
          sha,
        };
      }
      if (ancestorChangedBackend) {
        throw new Error(
          `Cannot cross backend-changing commit ${sha.slice(0, 12)} because its successful Vercel Preview failed the auth readiness probe: ${candidate.reason}.`,
        );
      }
      console.error(
        `[expo-backend] skipping unhealthy preview ${sha.slice(0, 12)}: ${candidate.reason}`,
      );
      continue;
    }
    if (state.kind === "failed") {
      if (ancestorChangedBackend) {
        throw new Error(
          `Latest branch backend Preview failed at backend-changing commit ${sha.slice(0, 12)}: ${state.description || "unknown error"}`,
        );
      }
      console.error(
        `[expo-backend] skipping failed preview ${sha.slice(0, 12)}: ${state.description || "unknown error"}`,
      );
      continue;
    }

    if (ancestorChangedBackend) {
      const reason =
        state.kind === "skipped"
          ? "Vercel skipped it"
          : "no successful Vercel Preview exists for it";
      throw new Error(
        `Cannot cross backend-changing commit ${sha.slice(0, 12)} while resolving this branch because ${reason}.`,
      );
    }
  }

  return {
    url: normalizedProductionUrl,
    source: "production-fallback",
    sha: targetSha,
  };
}

async function main() {
  const result = await resolveBackendUrl();
  const shortSha = result.sha.slice(0, 12);
  console.error(`[expo-backend] ${result.source} ${shortSha} -> ${result.url}`);

  if (process.argv.includes("--github-output")) {
    const output = process.env.GITHUB_OUTPUT;
    if (!output) throw new Error("GITHUB_OUTPUT is not set");
    const { appendFileSync } = await import("node:fs");
    appendFileSync(output, `api_url=${result.url}\n`, "utf8");
    appendFileSync(output, `short_sha=${targetShaForOutput(result)}\n`, "utf8");
    appendFileSync(output, `backend_source=${result.source}\n`, "utf8");
    return;
  }

  console.log(result.url);
}

function targetShaForOutput(result) {
  const target = process.env.TARGET_SHA || git(["rev-parse", "HEAD"]);
  return target.slice(0, 12) || result.sha.slice(0, 12);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      `[expo-backend] ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  });
}
