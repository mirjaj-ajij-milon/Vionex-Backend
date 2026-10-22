import test from "node:test";
import assert from "node:assert/strict";
import config from "../config/index.js";

test("Backend config exports valid environment settings", () => {
  assert.ok(config.env, "Environment name is defined");
  assert.equal(typeof config.port, "number", "Port is a valid number");
  assert.ok(config.allowedOrigins.length > 0, "CORS allowed origins populated");
  assert.ok(typeof config.isLocalDb === "boolean", "isLocalDb is boolean");
  assert.ok(config.mongooseOptions, "mongooseOptions object is defined");
});
