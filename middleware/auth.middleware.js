import httpStatus from "http-status";
import { User } from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;

    if (!token) {
      token = req.headers.token || req.query.token || req.body?.token;
    }

    if (!token || typeof token !== "string" || !token.trim()) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Authentication token is required." });
    }

    const user = await User.findOne({ token: token.trim() });
    if (!user) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid or expired authentication session." });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Authentication server error." });
  }
};
