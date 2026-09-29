import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVercelPreviewAlias,
  healthyPreviewCandidate,
  probeBackendAuth,
} from "./resolve-backend-url.mjs";

function successfulLoginProbeResponse() {
  return {
    status: 401,
    body: JSON.stringify([
      {
        error: {
          json: {
            data: {
              code: "UNAUTHORIZED",
              path: "auth.signInWithIdentifier",
            },
          },
        },
      },
    ]),
  };
}

test("extractVercelPreviewAlias reads the stable branch alias from Vercel feedback", () => {
  assert.equal(
    extractVercelPreviewAlias(
      "Go to feedback: https://vercel.live/open-feedback/c-ampdeliver-nextjs-git-fix-android-2a68c5-keptbeetles-projects.vercel.app?via=pr-comment-feedback-link",
    ),
    "https://c-ampdeliver-nextjs-git-fix-android-2a68c5-keptbeetles-projects.vercel.app",
  );
});

test("extractVercelPreviewAlias ignores unrelated Vercel text", () => {
  assert.equal(
    extractVercelPreviewAlias(
      "https://vercel.com/keptbeetles-projects/project",
    ),
    null,
  );
});

test("probeBackendAuth accepts the expected invalid-login response", async () => {
  let request;
  const result = await probeBackendAuth("https://example.vercel.app", {
    requestImpl: async (url, timeoutMs) => {
      request = { url, timeoutMs };
      return successfulLoginProbeResponse();
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, "https://example.vercel.app");
  assert.equal(request.timeoutMs, 8_000);
});

test("probeBackendAuth rejects a missing login procedure", async () => {
  const result = await probeBackendAuth("https://example.vercel.app", {
    requestImpl: async () => ({ status: 404, body: "not found" }),
  });

  assert.deepEqual(result, { ok: false, reason: "HTTP 404" });
});

test("probeBackendAuth rejects an unexpected login error payload", async () => {
  const result = await probeBackendAuth("https://example.vercel.app", {
    requestImpl: async () => ({
      status: 401,
      body: JSON.stringify([
        {
          error: {
            json: {
              data: {
                code: "UNAUTHORIZED",
                path: "auth.someOtherProcedure",
              },
            },
          },
        },
      ]),
    }),
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "unexpected login probe payload",
  });
});

test("probeBackendAuth rejects transport failures", async () => {
  const result = await probeBackendAuth("https://example.vercel.app", {
    requestImpl: async () => {
      throw new TypeError("Network request failed");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "Network request failed",
  });
});

test("healthyPreviewCandidate never falls back from a known stable alias", async () => {
  const probed = [];
  const result = await healthyPreviewCandidate(
    "https://immutable.vercel.app",
    "https://branch-alias.vercel.app",
    {
      probeImpl: async (url) => {
        probed.push(url);
        return { ok: false, reason: "alias temporarily unreachable" };
      },
    },
  );

  assert.deepEqual(probed, ["https://branch-alias.vercel.app"]);
  assert.deepEqual(result, {
    ok: false,
    reason: "alias: alias temporarily unreachable",
  });
});

test("healthyPreviewCandidate ignores the branch alias for backend-changing commits", async () => {
  const probed = [];
  const result = await healthyPreviewCandidate(
    "https://immutable.vercel.app",
    "https://branch-alias.vercel.app",
    {
      allowAlias: false,
      probeImpl: async (url) => {
        probed.push(url);
        return { ok: false, reason: "unhealthy deployment" };
      },
    },
  );

  assert.deepEqual(probed, ["https://immutable.vercel.app"]);
  assert.deepEqual(result, {
    ok: false,
    reason: "deployment: unhealthy deployment",
  });
});

test("probeBackendAuth retries a transient transport failure", async () => {
  let attempts = 0;
  const result = await probeBackendAuth("https://example.vercel.app", {
    requestImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("temporary network failure");
      return successfulLoginProbeResponse();
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { ok: true });
});
