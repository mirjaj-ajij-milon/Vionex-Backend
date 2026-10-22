import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.PORT = "8089";

test("Backend Express app and Socket.IO server initialize without errors", async () => {
  const { app, server, io } = await import("../index.js");

  assert.ok(app, "Express app instance exists");
  assert.ok(server, "HTTP server instance exists");
  assert.ok(io, "Socket.IO server instance exists");
});
