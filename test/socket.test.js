import test from "node:test";
import assert from "node:assert/strict";

test("Room ID normalization cleans URLs and paths properly", async () => {
  // Simulate the room normalization logic
  const normalizeRoomId = (rawPath) => {
    if (typeof rawPath !== "string") return "";
    try {
      if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
        const url = new URL(rawPath);
        return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "") || "default";
      }
    } catch {
      // fallback
    }
    return rawPath.trim().replace(/^\/+/, "").replace(/\/+$/, "").slice(0, 64);
  };

  assert.equal(normalizeRoomId("http://localhost:5173/my-call-101"), "my-call-101");
  assert.equal(normalizeRoomId("https://vionex.netlify.app/team-meet/"), "team-meet");
  assert.equal(normalizeRoomId("/room-code-xyz/"), "room-code-xyz");
  assert.equal(normalizeRoomId("plain-code"), "plain-code");
  assert.equal(normalizeRoomId(""), "");
  assert.equal(normalizeRoomId(null), "");
});
