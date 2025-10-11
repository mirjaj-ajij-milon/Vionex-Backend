

import { Server } from "socket.io";

let connection = {};
let message = {};
let timeOnline = {};

export const connectToSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      allowedHeaders: ["*"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("New socket connected:", socket.id);

    // ---- JOIN CALL ----
    socket.on("join-call", (path) => {
      if (!connection[path]) {
        connection[path] = [];
      }
      connection[path].push(socket.id);
      timeOnline[socket.id] = new Date();

      // Notify existing users
      for (let i = 0; i < connection[path].length; i++) {
        io.to(connection[path][i]).emit(
          "user-joined",
          socket.id,
          connection[path]
        );
      }

      // Send old chat messages if exist
      if (message[path]) {
        for (let i = 0; i < message[path].length; ++i) {
          io.to(socket.id).emit(
            "chat-message",
            message[path][i]["data"],
            message[path][i]["sender"],
            message[path][i]["socket-id-sender"]
          );
        }
      }
    });

    // ---- SIGNAL ----
    socket.on("signal", (toId, signalMessage) => {
      io.to(toId).emit("signal", socket.id, signalMessage);
    });

    // ---- CHAT MESSAGE ----
    socket.on("chat-message", (data, sender) => {
      const [matchingRoom, found] = Object.entries(connection).reduce(
        ([room, isFound], [roomKey, roomValue]) => {
          if (!isFound && roomValue.includes(socket.id)) {
            return [roomKey, true];
          }
          return [room, isFound];
        },
        ["", false]
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

        console.log("message", matchingRoom, ":", sender, data);

        connection[matchingRoom].forEach((element) => {
          io.to(element).emit("chat-message", data, sender, socket.id);
        });
      }
    });

    // ---- DISCONNECT ----
    socket.on("disconnect", () => {
      const diffTime = Math.abs(timeOnline[socket.id] - new Date());
      console.log(`User ${socket.id} disconnected after ${diffTime / 1000}s`);

      for (const [room, persons] of Object.entries(connection)) {
        if (persons.includes(socket.id)) {
          // Notify other users
          persons.forEach((id) => {
            io.to(id).emit("user-left", socket.id);
          });

          // Remove user
          connection[room] = persons.filter((id) => id !== socket.id);

          // Cleanup empty room
          if (connection[room].length === 0) {
            delete connection[room];
          }
        }
      }
    });
  });

  return io;
};
