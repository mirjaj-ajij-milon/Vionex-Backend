import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { connectToSocket } from "./controlers/socketManager.js";
import UserRoute from "./routes/user.routs.js";

const app = express();
const server = createServer(app); 
const io = connectToSocket(server);

app.set("port", process.env.PORT);
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.use("/api/users", UserRoute);


const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      tls: true,
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB connected");

    server.listen(app.get("port"), () => {
      console.log(`Server is listening on port ${app.get("port")}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
};

start();
