import { Server } from "socket.io";

let connection = {};
let message = {};
let timeOnline = {};

const MAX_MESSAGES_PER_ROOM = 200;

const isValidRoomId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(id);
const isValidUsername = (name) =>
  typeof name === "string" && name.trim().length > 0 && name.length <= 40;

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New socket connected:", socket.id);

    // ---- JOIN CALL ----
    socket.on("join-call", (path, userName, video = true, audio = true) => {
      try {
        if (!isValidRoomId(path)) {
          return socket.emit("join-error", "Invalid room id");
        }
        if (!isValidUsername(userName)) {
          return socket.emit("join-error", "Invalid username");
        }

        if (!connection[path]) {
          connection[path] = [];
        }

        // Prevent duplicate join: ignore if this socket is already in the room
        const alreadyJoined = connection[path].some(
          (user) => user.id === socket.id,
        );
        if (alreadyJoined) return;

        connection[path].push({
          id: socket.id,
          username: userName,
          video: !!video,
          audio: !!audio,
        });
        timeOnline[socket.id] = new Date();

        // Notify existing users
        for (let i = 0; i < connection[path].length; i++) {
          io.to(connection[path][i].id).emit(
            "user-joined",
            socket.id,
            connection[path],
            userName,
          );
        }

        // Send old chat messages if exist
        if (message[path]) {
          for (let i = 0; i < message[path].length; ++i) {
            io.to(socket.id).emit(
              "chat-message",
              message[path][i]["data"],
              message[path][i]["sender"],
              message[path][i]["socket-id-sender"],
            );
          }
        }
      } catch (err) {
        console.error("join-call error:", err);
        socket.emit("join-error", "Could not join room");
      }
    });

    // ---- SIGNAL ----
    socket.on("signal", (toId, signalMessage) => {
      try {
        if (typeof toId !== "string" || !signalMessage) return;
        io.to(toId).emit("signal", socket.id, signalMessage);
      } catch (err) {
        console.error("signal error:", err);
      }
    });

    // ---- CHAT MESSAGE ----
    socket.on("chat-message", (data, sender) => {
      try {
        if (typeof data !== "string" || data.trim().length === 0) return;

        const [matchingRoom, found] = Object.entries(connection).reduce(
          ([room, isFound], [roomKey, roomValue]) => {
            if (!isFound && roomValue.some((user) => user.id === socket.id)) {
              return [roomKey, true];
            }
            return [room, isFound];
          },
          ["", false],
        );

        if (found) {
          if (!message[matchingRoom]) {
            message[matchingRoom] = [];
          }

          message[matchingRoom].push({
            sender,
            data,
            "socket-id-sender": socket.id,
          });

          // Cap history so it can't grow forever
          if (message[matchingRoom].length > MAX_MESSAGES_PER_ROOM) {
            message[matchingRoom].shift();
          }

          console.log("message", matchingRoom, ":", sender, data);

          connection[matchingRoom].forEach((element) => {
            io.to(element.id).emit("chat-message", data, sender, socket.id);
          });
        }
      } catch (err) {
        console.error("chat-message error:", err);
      }
    });

    // ---- MEDIA CONTROLS ----
    socket.on("toggle-audio", (payload) => {
      try {
        if (!payload) return;
        const { roomId, audio } = payload;
        if (connection[roomId]) {
          connection[roomId].forEach((user) => {
            if (user.id === socket.id) {
              user.audio = !!audio;
            }
            if (user.id !== socket.id) {
              io.to(user.id).emit("media-toggled", {
                socketId: socket.id,
                type: "audio",
                state: !!audio,
              });
            }
          });
        }
      } catch (err) {
        console.error("toggle-audio error:", err);
      }
    });

    socket.on("toggle-video", (payload) => {
      try {
        if (!payload) return;
        const { roomId, video } = payload;
        if (connection[roomId]) {
          connection[roomId].forEach((user) => {
            if (user.id === socket.id) {
              user.video = !!video;
            }
            if (user.id !== socket.id) {
              io.to(user.id).emit("media-toggled", {
                socketId: socket.id,
                type: "video",
                state: !!video,
              });
            }
          });
        }
      } catch (err) {
        console.error("toggle-video error:", err);
      }
    });

    // ---- DISCONNECT ----
    socket.on("disconnect", () => {
      try {
        const diffTime = Math.abs(timeOnline[socket.id] - new Date());
        console.log(`User ${socket.id} disconnected after ${diffTime / 1000}s`);

        for (const [room, persons] of Object.entries(connection)) {
          if (persons.some((user) => user.id === socket.id)) {
            // Notify other users
            persons.forEach((user) => {
              io.to(user.id).emit("user-left", socket.id);
            });

            // Remove user
            connection[room] = persons.filter((user) => user.id !== socket.id);

            // Cleanup empty room
            if (connection[room].length === 0) {
              delete connection[room];
              delete message[room]; // free chat history for the closed room
            }
          }
        }

        // Clean up per-socket state so it doesn't leak forever
        delete timeOnline[socket.id];
      } catch (err) {
        console.error("disconnect error:", err);
      }
    });

    socket.on("error", (err) =>
      console.error(`Socket ${socket.id} error:`, err),
    );
  });

  return io;
};
