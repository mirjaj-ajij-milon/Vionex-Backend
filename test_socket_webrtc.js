import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:8080";
const ROOM_ID = "test-room-101";

async function testMultiuserFlow() {
  console.log("Starting WebRTC & Socket.IO Multiuser End-to-End Simulation...\n");

  const socketA = io(SERVER_URL, { transports: ["websocket"] });
  const socketB = io(SERVER_URL, { transports: ["websocket"] });

  let chatReceivedA = false;
  let chatReceivedB = false;
  let userJoinedReceivedA = false;
  let mediaToggledReceivedA = false;
  let signalReceivedB = false;

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("[Client A] Connecting & joining room:", ROOM_ID);
  socketA.emit("join-call", ROOM_ID, "Alice", true, true);

  socketA.on("user-joined", (id, clients, name) => {
    console.log(`[Client A] Received 'user-joined': ${name} (${id}). Total in room: ${clients.length}`);
    userJoinedReceivedA = true;
  });

  socketA.on("chat-message", (data, sender, senderId) => {
    console.log(`[Client A] Received chat message from ${sender}: "${data}"`);
    if (data === "Hello from Bob!") chatReceivedA = true;
  });

  socketA.on("media-toggled", (payload) => {
    console.log(`[Client A] Received 'media-toggled':`, payload);
    mediaToggledReceivedA = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("[Client B] Connecting & joining room:", ROOM_ID);
  socketB.emit("join-call", ROOM_ID, "Bob", true, true);

  socketB.on("chat-message", (data, sender, senderId) => {
    console.log(`[Client B] Received chat message from ${sender}: "${data}"`);
    if (data === "Hello from Alice!") chatReceivedB = true;
  });

  socketB.on("signal", (fromId, signalMsg) => {
    console.log(`[Client B] Received WebRTC signal from ${fromId}`);
    signalReceivedB = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 800));

  // Test Chat
  console.log("\n--- Testing Real-Time Chat ---");
  socketA.emit("chat-message", "Hello from Alice!", "Alice");
  await new Promise((resolve) => setTimeout(resolve, 300));
  socketB.emit("chat-message", "Hello from Bob!", "Bob");
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Test Media Controls Toggle
  console.log("\n--- Testing Media Controls Toggle ---");
  socketB.emit("toggle-audio", { roomId: ROOM_ID, audio: false });
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Test WebRTC Signaling Exchange
  console.log("\n--- Testing WebRTC Signal Forwarding ---");
  socketA.emit("signal", socketB.id, JSON.stringify({ sdp: { type: "offer", sdp: "dummy-sdp-offer" } }));
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Summary Results
  console.log("\n================ SIMULATION RESULTS ================");
  console.log("User Joined Event (Client A):", userJoinedReceivedA ? "PASSED" : "FAILED");
  console.log("Alice Received Bob's Chat:", chatReceivedA ? "PASSED" : "FAILED");
  console.log("Bob Received Alice's Chat:", chatReceivedB ? "PASSED" : "FAILED");
  console.log("Alice Received Bob's Mute Toggle:", mediaToggledReceivedA ? "PASSED" : "FAILED");
  console.log("Bob Received Alice's SDP Signal:", signalReceivedB ? "PASSED" : "FAILED");
  console.log("====================================================");

  socketA.disconnect();
  socketB.disconnect();
  process.exit(0);
}

testMultiuserFlow().catch((err) => {
  console.error("Simulation error:", err);
  process.exit(1);
});
