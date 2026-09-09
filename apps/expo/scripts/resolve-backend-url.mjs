import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_PRODUCTION_API_URL = "https://c-ampdeliver-nextjs.vercel.app";
const DEFAULT_HISTORY_LIMIT = 30;
const DEFAULT_WAIT_MS = process.env.CI ? 180_000 : 0;
const POLL_INTERVAL_MS = 5_000;
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
  const currentState = await resolveCurrentDeployment(repo, targetSha, waitMs);

  if (currentState.kind === "success") {
    return { url: currentState.url, source: "preview", sha: targetSha };
  }
  if (currentState.kind === "failed") {
    throw new Error(
      `Vercel Preview failed for ${targetSha.slice(0, 12)}: ${currentState.description || "unknown error"}`,
    );
  }

  const backendChanged = commitAffectsBackend(targetSha);
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
    if (state.kind === "success") {
      return { url: state.url, source: "preview-ancestor", sha };
    }
    if (state.kind === "failed") {
      throw new Error(
        `Latest branch backend Preview failed at ${sha.slice(0, 12)}: ${state.description || "unknown error"}`,
      );
    }

    if (commitAffectsBackend(sha)) {
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
