import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/0004_remove_phone_signup_otp.sql", import.meta.url),
  "utf8",
);
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();

test("email auth cleanup removes only legacy phone signup verification storage", () => {
  assert.match(normalized, /^begin;/);
  assert.match(normalized, /drop table if exists public\.phone_verifications;/);
  assert.match(normalized, /commit;$/);
  assert.doesNotMatch(normalized, /drop table[^;]+profiles/);
  assert.doesNotMatch(normalized, /delete from[^;]+profiles/);
});
