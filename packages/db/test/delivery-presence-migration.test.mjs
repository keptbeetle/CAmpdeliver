import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../migrations/0006_delivery_presence.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();

test("delivery presence migration is transactional", () => {
  assert.match(normalized, /^begin;/);
  assert.match(normalized, /commit;$/);
});

test("delivery presence is nullable and coordinate-paired", () => {
  assert.match(normalized, /delivery_presence_latitude double precision/);
  assert.match(normalized, /delivery_presence_longitude double precision/);
  assert.match(normalized, /delivery_presence_updated_at timestamptz/);
  assert.match(normalized, /profiles_delivery_presence_pair_check/);
  assert.match(normalized, /profiles_delivery_presence_latitude_check/);
  assert.match(normalized, /profiles_delivery_presence_longitude_check/);
});

test("delivery presence has a recency index", () => {
  assert.match(normalized, /idx_profiles_delivery_presence_updated/);
});
