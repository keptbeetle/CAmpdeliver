import assert from "node:assert/strict";
import test from "node:test";

import { hasAdminFinancialConflict } from "../src/services/payment-security.ts";

test("blocks financial self-dealing for an admin who is the buyer", () => {
  assert.equal(
    hasAdminFinancialConflict("admin-1", "admin-1", "student-2"),
    true,
  );
});

test("blocks financial self-dealing for an admin who is the deliverer", () => {
  assert.equal(
    hasAdminFinancialConflict("admin-1", "student-1", "admin-1"),
    true,
  );
});

test("allows an unrelated admin to reconcile the transaction", () => {
  assert.equal(
    hasAdminFinancialConflict("admin-2", "student-1", "admin-1"),
    false,
  );
});
