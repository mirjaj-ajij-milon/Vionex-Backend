import { Server } from "socket.io";
import { createHash } from "node:crypto";
import { User } from "../models/user.model.js";

// In-memory room state (single-instance architecture)
const connection = {};
const message = {};
const timeOnline = {};

const MAX_MESSAGES_PER_ROOM = 200;
const MAX_PARTICIPANTS_PER_ROOM = 6; // Standard stability threshold for full-mesh WebRTC

const hashToken = (token) => {
  if (typeof token !== "string") return "";
  return createHash("sha256").update(token).digest("hex");
};

// Utility to normalize room IDs (handles raw IDs or full URLs like http://localhost:5173/room-code)
const normalizeRoomId = (rawPath) => {
  if (typeof rawPath !== "string") return "";
  try {
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
      const url = new URL(rawPath);
      return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "") || "default";
    }
  } catch {
    // fallback if URL parsing fails
  }
  return rawPath.trim().replace(/^\/+/, "").replace(/\/+$/, "").slice(0, 64);
};

const sanitizeUsername = (name, fallback = "Participant") => {
  if (typeof name !== "string") return fallback;
  const cleaned = name.trim().slice(0, 50);
  return cleaned.length > 0 ? cleaned : fallback;
};

export const connectToSocket = (server, allowedOrigins = []) => {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const cleanOrigin = origin.replace(/\/+$/, "");
        if (allowedOrigins.includes(cleanOrigin)) {
          return callback(null, true);
        }
        if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket CORS blocked origin: ${origin}`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB payload ceiling
  });

  // Optional socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (token && typeof token === "string" && token.length >= 16) {
        const tokenHash = hashToken(token.trim());
        const now = new Date();
        const user = await User.findOne({
          $or: [
            { "sessions.tokenHash": tokenHash, "sessions.expiresAt": { $gt: now } },
            { token: token.trim() },
          ],
        }).lean();

        if (user) {
          socket.authenticatedUser = {
            username: user.username,
            name: user.name,
          };
        }
      }
      return next();
    } catch (err) {
      console.warn("Socket auth check error:", err.message);
      return next(); // Still allow connection as guest if room permits
    }
  });

  io.on("connection", (socket) => {
    // ---- JOIN CALL ----
    socket.on("join-call", (rawPath, clientUsername, video = true, audio = true) => {
      try {
        const roomId = normalizeRoomId(rawPath);

        if (!roomId || !/^[a-zA-Z0-9_-]+$/.test(roomId)) {
          return socket.emit("join-error", "Invalid meeting room code.");
        }

        // Authoritative display name (authenticated name overrides client-supplied parameter)
        const verifiedName = socket.authenticatedUser?.name || sanitizeUsername(clientUsername, "Participant");

        if (!connection[roomId]) {
          connection[roomId] = [];
        }

        const roomUsers = connection[roomId];

        // Check full-mesh capacity constraint
        const isExistingMember = roomUsers.some((u) => u.id === socket.id);
        if (!isExistingMember && roomUsers.length >= MAX_PARTICIPANTS_PER_ROOM) {
          return socket.emit(
            "join-error",
            `Room is full. Maximum ${MAX_PARTICIPANTS_PER_ROOM} participants allowed in full-mesh mode.`
          );
        }

        socket.roomId = roomId;
        socket.displayName = verifiedName;

        if (!isExistingMember) {
          roomUsers.push({
            id: socket.id,
            username: verifiedName,
            video: Boolean(video),
            audio: Boolean(audio),
          });
        } else {
          connection[roomId] = roomUsers.map((u) =>
            u.id === socket.id
              ? { ...u, username: verifiedName, video: Boolean(video), audio: Boolean(audio) }
              : u
          );
        }

        timeOnline[socket.id] = new Date();
        socket.join(roomId);

        // Notify room members
        io.in(roomId).emit("user-joined", socket.id, connection[roomId], verifiedName);

        // Send existing room chat history to newcomer
        if (message[roomId] && Array.isArray(message[roomId])) {
          message[roomId].forEach((msg) => {
            socket.emit("chat-message", msg.data, msg.sender, msg["socket-id-sender"]);
          });
        }
      } catch (err) {
        console.error("Error in join-call handler:", err.message);
        socket.emit("join-error", "Could not complete room join.");
      }
    });

    // ---- SECURE WEBRTC SIGNALING ----
    socket.on("signal", (toId, signalMessage) => {
      try {
        if (!toId || typeof toId !== "string" || !signalMessage) return;

        const currentRoomId = socket.roomId;
        if (!currentRoomId || !connection[currentRoomId]) {
          return; // Sender has not joined any room
        }

        // Security check: verify both sender and target exist in the same room
        const roomMembers = connection[currentRoomId];
        const isSenderInRoom = roomMembers.some((u) => u.id === socket.id);
        const isTargetInRoom = roomMembers.some((u) => u.id === toId);

        if (!isSenderInRoom || !isTargetInRoom) {
          console.warn(`Blocked unauthorized signal from ${socket.id} to ${toId}`);
          return;
        }

        io.to(toId).emit("signal", socket.id, signalMessage);
      } catch (err) {
        console.error("Error in WebRTC signal handler:", err.message);
      }
    });

    // ---- AUTHORIZED CHAT MESSAGES ----
    socket.on("chat-message", (data) => {
      try {
        if (typeof data !== "string" || !data.trim()) return;

        const roomId = socket.roomId;
        if (!roomId || !connection[roomId]) return;

        // Derive verified sender identity from server-side room registry
        const participant = connection[roomId].find((u) => u.id === socket.id);
        if (!participant) return;

        const senderName = participant.username || "Participant";
        const sanitizedContent = data.trim().slice(0, 500);

        if (!message[roomId]) {
          message[roomId] = [];
        }

        const msgObj = {
          sender: senderName,
          data: sanitizedContent,
          "socket-id-sender": socket.id,
          timestamp: new Date(),
        };

        message[roomId].push(msgObj);
        if (message[roomId].length > MAX_MESSAGES_PER_ROOM) {
          message[roomId].shift();
        }

        io.in(roomId).emit("chat-message", msgObj.data, msgObj.sender, socket.id);
      } catch (err) {
        console.error("Error in chat-message handler:", err.message);
      }
    });

    // ---- MEDIA CONTROLS TOGGLE ----
    socket.on("toggle-audio", (payload) => {
      try {
        const roomId = socket.roomId;
        if (!roomId || !connection[roomId]) return;

        const audioState = Boolean(payload?.audio);
        const user = connection[roomId].find((u) => u.id === socket.id);
        if (user) {
          user.audio = audioState;
          io.in(roomId).emit("media-toggled", {
            socketId: socket.id,
            type: "audio",
            state: audioState,
          });
        }
      } catch (err) {
        console.error("Error in toggle-audio handler:", err.message);
      }
    });

    socket.on("toggle-video", (payload) => {
      try {
        const roomId = socket.roomId;
        if (!roomId || !connection[roomId]) return;

        const videoState = Boolean(payload?.video);
        const user = connection[roomId].find((u) => u.id === socket.id);
        if (user) {
          user.video = videoState;
          io.in(roomId).emit("media-toggled", {
            socketId: socket.id,
            type: "video",
            state: videoState,
          });
        }
      } catch (err) {
        console.error("Error in toggle-video handler:", err.message);
      }
    });

    // ---- LEAVE CALL EXPLICIT EVENT ----
    socket.on("leave-call", () => {
      try {
        const roomId = socket.roomId;
        if (roomId && connection[roomId]) {
          io.in(roomId).emit("user-left", socket.id);
          socket.leave(roomId);

          connection[roomId] = connection[roomId].filter((user) => user.id !== socket.id);
          if (connection[roomId].length === 0) {
            delete connection[roomId];
            delete message[roomId];
          }
        }
        delete socket.roomId;
      } catch (err) {
        console.error("Error in leave-call handler:", err.message);
      }
    });

    // ---- DISCONNECT ----
    socket.on("disconnect", () => {
      try {
        const roomId = socket.roomId;
        if (roomId && connection[roomId]) {
          io.in(roomId).emit("user-left", socket.id);
          connection[roomId] = connection[roomId].filter((user) => user.id !== socket.id);

          if (connection[roomId].length === 0) {
            delete connection[roomId];
            delete message[roomId];
          }
        } else {
          // Fallback scan across all active rooms
          for (const [rId, persons] of Object.entries(connection)) {
            if (persons.some((u) => u.id === socket.id)) {
              io.in(rId).emit("user-left", socket.id);
              connection[rId] = persons.filter((u) => u.id !== socket.id);
              if (connection[rId].length === 0) {
                delete connection[rId];
                delete message[rId];
              }
            }
          }
        }

        delete timeOnline[socket.id];
      } catch (err) {
        console.error("Error in disconnect handler:", err.message);
      }
    });
  });

  return io;
};
