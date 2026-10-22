import test from "node:test";
import assert from "node:assert/strict";
import { hashToken } from "../middleware/auth.middleware.js";

test("hashToken generates consistent SHA-256 hex string", () => {
  const token = "a".repeat(64);
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);

  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2);
});

test("hashToken handles empty or non-string inputs safely", () => {
  assert.equal(hashToken(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(hashToken(null), "");
  assert.equal(hashToken(undefined), "");
  assert.equal(hashToken(123), "");
});

test("authMiddleware header-only validation logic", async () => {
  let statusResult = null;
  let jsonResult = null;

  const mockRes = {
    status: (code) => {
      statusResult = code;
      return {
        json: (data) => {
          jsonResult = data;
        },
      };
    },
  };

  const { authMiddleware } = await import("../middleware/auth.middleware.js");

  // Case 1: Missing Authorization header
  await authMiddleware({ headers: {} }, mockRes, () => {});
  assert.equal(statusResult, 401);
  assert.match(jsonResult.message, /token is required/i);

  // Case 2: Query-string token is rejected
  statusResult = null;
  jsonResult = null;
  await authMiddleware(
    { headers: {}, query: { token: "secret1234567890123456" } },
    mockRes,
    () => {}
  );
  assert.equal(statusResult, 401);

  // Case 3: Malformed Authorization header format
  statusResult = null;
  jsonResult = null;
  await authMiddleware(
    { headers: { authorization: "Basic dXNlcjpwYXNz" } },
    mockRes,
    () => {}
  );
  assert.equal(statusResult, 401);
  assert.match(jsonResult.message, /invalid authorization header format/i);
});
