import httpStatus from "http-status";
import { createHash } from "node:crypto";
import { User } from "../models/user.model.js";

export const hashToken = (token) => {
  if (typeof token !== "string") return "";
  return createHash("sha256").update(token).digest("hex");
};

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== "string") {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Authentication token is required." });
    }

    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    if (!match || !match[1]) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid authorization header format. Format: Bearer <token>" });
    }

    const token = match[1].trim();
    if (token.length < 16 || token.length > 256) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid or malformed authentication token." });
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    // Check hashed active session with expiration check, or backward-compatible legacy token
    const user = await User.findOne({
      $or: [
        {
          "sessions.tokenHash": tokenHash,
          "sessions.expiresAt": { $gt: now },
        },
        { token: token },
      ],
    });

    if (!user) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid or expired authentication session." });
    }

    req.user = user;
    req.tokenHash = tokenHash;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Authentication server error." });
  }
};
