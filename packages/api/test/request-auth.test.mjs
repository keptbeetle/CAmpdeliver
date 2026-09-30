import assert from "node:assert/strict";
import test from "node:test";

import { getRequestAuthSource } from "../src/services/request-auth.ts";

test("public mobile requests without auth material skip user verification", () => {
  assert.equal(getRequestAuthSource(new Headers()), null);
});

test("Bearer authorization is detected and normalized", () => {
  assert.deepEqual(
    getRequestAuthSource(
      new Headers({ authorization: "Bearer   access-token-value   " }),
    ),
    { type: "bearer", token: "access-token-value" },
  );
});

test("cookie-backed web requests still require verified user lookup", () => {
  assert.deepEqual(
    getRequestAuthSource(new Headers({ cookie: "sb-test-auth-token=value" })),
    { type: "cookie" },
  );
});

test("empty or malformed auth headers do not trigger remote verification", () => {
  assert.equal(
    getRequestAuthSource(new Headers({ authorization: "Bearer   " })),
    null,
  );
  assert.equal(
    getRequestAuthSource(new Headers({ authorization: "Basic abc" })),
    null,
  );
  assert.equal(getRequestAuthSource(new Headers({ cookie: "   " })), null);
});
