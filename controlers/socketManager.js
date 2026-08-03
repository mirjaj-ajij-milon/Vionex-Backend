import { Server } from "socket.io";

const connection = {};
const message = {};
const timeOnline = {};

const MAX_MESSAGES_PER_ROOM = 200;

// Utility to normalize room IDs (handles raw IDs or full URLs like http://localhost:5173/room-code)
const normalizeRoomId = (rawPath) => {
  if (typeof rawPath !== "string") return "";
  try {
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
      const url = new URL(rawPath);
      return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "") || "default";
    }
  } catch (e) {
    // fallback to string manipulation if URL parsing fails
  }
  return rawPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
};

const isValidUsername = (name) =>
  typeof name === "string" && name.trim().length > 0 && name.length <= 60;

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New socket client connected:", socket.id);

    // ---- JOIN CALL ----
    socket.on("join-call", (rawPath, userName, video = true, audio = true) => {
      try {
        const roomId = normalizeRoomId(rawPath);
        const name = isValidUsername(userName) ? userName.trim() : "Participant";

        if (!roomId) {
          return socket.emit("join-error", "Invalid room code");
        }

        socket.roomId = roomId;

        if (!connection[roomId]) {
          connection[roomId] = [];
        }

        // Prevent duplicate socket entries in the same room
        const alreadyJoined = connection[roomId].some(
          (user) => user.id === socket.id
        );

        if (!alreadyJoined) {
          connection[roomId].push({
            id: socket.id,
            username: name,
            video: !!video,
            audio: !!audio,
          });
        } else {
          // Update flags if re-joining
          connection[roomId] = connection[roomId].map((u) =>
            u.id === socket.id ? { ...u, username: name, video: !!video, audio: !!audio } : u
          );
        }

        timeOnline[socket.id] = new Date();
        socket.join(roomId);

        // Send existing participants & room info to joining user
        const roomUsers = connection[roomId];

        // Broadcast user-joined to all clients in room
        io.in(roomId).emit("user-joined", socket.id, roomUsers, name);

        // Send chat history to newly joined participant
        if (message[roomId] && Array.isArray(message[roomId])) {
          message[roomId].forEach((msg) => {
            socket.emit(
              "chat-message",
              msg.data,
              msg.sender,
              msg["socket-id-sender"]
            );
          });
        }
      } catch (err) {
        console.error("Error in join-call handler:", err);
        socket.emit("join-error", "Could not join room");
      }
    });

    // ---- WEBRTC SIGNALING ----
    socket.on("signal", (toId, signalMessage) => {
      try {
        if (typeof toId !== "string" || !signalMessage) return;
        io.to(toId).emit("signal", socket.id, signalMessage);
      } catch (err) {
        console.error("Error in WebRTC signal handler:", err);
      }
    });

    // ---- CHAT MESSAGES ----
    socket.on("chat-message", (data, sender) => {
      try {
        if (typeof data !== "string" || data.trim().length === 0) return;

        const roomId = socket.roomId;
        if (!roomId || !connection[roomId]) return;

        const senderName = isValidUsername(sender) ? sender.trim() : "Guest";

        if (!message[roomId]) {
          message[roomId] = [];
        }

        const msgObj = {
          sender: senderName,
          data: data.trim(),
          "socket-id-sender": socket.id,
          timestamp: new Date(),
        };

        message[roomId].push(msgObj);

        if (message[roomId].length > MAX_MESSAGES_PER_ROOM) {
          message[roomId].shift();
        }

        // Broadcast to everyone in room
        io.in(roomId).emit("chat-message", msgObj.data, msgObj.sender, socket.id);
      } catch (err) {
        console.error("Error in chat-message handler:", err);
      }
    });

    // ---- MEDIA CONTROLS TOGGLE ----
    socket.on("toggle-audio", (payload) => {
      try {
        const roomId = socket.roomId || normalizeRoomId(payload?.roomId);
        const audioState = !!payload?.audio;

        if (roomId && connection[roomId]) {
          connection[roomId].forEach((user) => {
            if (user.id === socket.id) {
              user.audio = audioState;
            }
          });
          io.in(roomId).emit("media-toggled", {
            socketId: socket.id,
            type: "audio",
            state: audioState,
          });
        }
      } catch (err) {
        console.error("Error in toggle-audio handler:", err);
      }
    });

    socket.on("toggle-video", (payload) => {
      try {
        const roomId = socket.roomId || normalizeRoomId(payload?.roomId);
        const videoState = !!payload?.video;

        if (roomId && connection[roomId]) {
          connection[roomId].forEach((user) => {
            if (user.id === socket.id) {
              user.video = videoState;
            }
          });
          io.in(roomId).emit("media-toggled", {
            socketId: socket.id,
            type: "video",
            state: videoState,
          });
        }
      } catch (err) {
        console.error("Error in toggle-video handler:", err);
      }
    });

    // ---- LEAVE CALL EXPLICIT EVENT ----
    socket.on("leave-call", () => {
      try {
        const roomId = socket.roomId;
        if (roomId && connection[roomId]) {
          io.in(roomId).emit("user-left", socket.id);

          connection[roomId] = connection[roomId].filter(
            (user) => user.id !== socket.id
          );

          if (connection[roomId].length === 0) {
            delete connection[roomId];
            delete message[roomId];
          }
        }
      } catch (err) {
        console.error("Error in leave-call handler:", err);
      }
    });

    // ---- DISCONNECT ----
    socket.on("disconnect", () => {
      try {
        const durationSec = timeOnline[socket.id]
          ? (new Date() - timeOnline[socket.id]) / 1000
          : 0;
        console.log(`Socket ${socket.id} disconnected after ${durationSec.toFixed(1)}s`);

        const roomId = socket.roomId;
        if (roomId && connection[roomId]) {
          // Notify room participants with server io instance
          io.in(roomId).emit("user-left", socket.id);

          // Remove user from room state
          connection[roomId] = connection[roomId].filter(
            (user) => user.id !== socket.id
          );

          // Cleanup empty room
          if (connection[roomId].length === 0) {
            delete connection[roomId];
            delete message[roomId];
          }
        } else {
          // Fallback scan across all rooms if roomId wasn't set directly
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
        console.error("Error in disconnect handler:", err);
      }
    });
  });

  return io;
};
