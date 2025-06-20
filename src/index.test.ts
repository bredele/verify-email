import test from "node:test";
import assert from "node:assert";
import verify from ".";

test("should reject invalid email format", async () => {
  const result = await verify("invalid-email");
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.confidence, "invalid");
  assert.strictEqual(result.reason, "Invalid email format");
});

test("should reject non-existent domain", async () => {
  const result = await verify("test@nonexistentdomain12345.com");
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.confidence, "invalid");
  assert.strictEqual(result.reason, "Domain does not exist");
});

test("should handle domain with A record but no MX", async () => {
  const result = await verify("test@example.com");
  if (result.confidence === "low") {
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.reason, "No MX record, domain exists");
  }
});

test("should return result structure", async () => {
  const result = await verify("test@gmail.com");
  assert.ok(typeof result.valid === "boolean");
  assert.ok(["high", "medium", "low", "invalid"].includes(result.confidence));
  assert.ok(typeof result.reason === "string");
  assert.ok(typeof result.isCatchAll === "boolean");
});
