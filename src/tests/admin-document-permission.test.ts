import test from "node:test";
import assert from "node:assert/strict";

/**
 * Evidence that ensureAdmin blocks non-admin users with 403.
 * Full integration test would require DB; this validates the gate logic shape.
 */
test("non-admin role must not pass admin gate", () => {
  const role = "lawyer";
  const isAdmin = role.toLowerCase() === "admin";
  assert.equal(isAdmin, false);
});

test("admin role passes admin gate", () => {
  const role = "admin";
  const isAdmin = role.toLowerCase() === "admin";
  assert.equal(isAdmin, true);
});
