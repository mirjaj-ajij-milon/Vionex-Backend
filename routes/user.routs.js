import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  register,
  logout,
  addToHistory,
  getUserHistory,
} from "../controlers/user.controler.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// Rate limiter for authentication endpoints (20 attempts per 15 minutes)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many authentication attempts from this IP. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public authentication routes with brute-force protection
router.route("/login").post(authRateLimiter, login);
router.route("/register").post(authRateLimiter, register);

// Protected routes requiring valid Authorization: Bearer token
router.route("/logout").post(authMiddleware, logout);
router.route("/add_to_activity").post(authMiddleware, addToHistory);
router.route("/get_all_activity").get(authMiddleware, getUserHistory);

// Dynamic ICE servers endpoint (STUN + environment-configured TURN)
router.route("/ice_config").get((req, res) => {
  const stunUrls = [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
  ];

  const iceServers = [{ urls: stunUrls }];

  // Optional environment TURN configuration
  if (process.env.TURN_URL) {
    const turnServer = {
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || "",
    };
    iceServers.push(turnServer);
  }

  return res.json({ iceServers });
});

export default router;
