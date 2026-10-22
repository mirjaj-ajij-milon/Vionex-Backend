import httpStatus from "http-status";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { User } from "../models/user.model.js";
import { Meeting } from "../models/Meeting.model.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SESSIONS_PER_USER = 10;

const hashToken = (token) => {
  return createHash("sha256").update(token).digest("hex");
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please provide both username and password." });
  }

  try {
    const trimmedUsername = username.trim().toLowerCase();
    const user = await User.findOne({ username: trimmedUsername });

    if (!user) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid username or password." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid username or password." });
    }

    // Generate cryptographically secure session token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    // Filter out expired sessions and cap maximum sessions
    const now = new Date();
    const activeSessions = (user.sessions || []).filter(
      (s) => s.expiresAt && new Date(s.expiresAt) > now
    );

    // Keep newest sessions within threshold
    if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
      activeSessions.shift();
    }

    activeSessions.push({
      tokenHash,
      createdAt: now,
      expiresAt,
    });

    user.sessions = activeSessions;
    user.token = tokenHash; // backward compatibility
    await user.save();

    return res.status(httpStatus.OK).json({
      token: rawToken,
      name: user.name,
      username: user.username,
      message: "Login successful!",
    });
  } catch (err) {
    console.error("Login controller error:", err.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Authentication service unavailable. Please try again." });
  }
};

const register = async (req, res) => {
  const { name, username, password } = req.body;

  if (
    !name ||
    typeof name !== "string" ||
    !username ||
    typeof username !== "string" ||
    !password ||
    typeof password !== "string"
  ) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "All fields (name, username, password) are required." });
  }

  const trimmedName = name.trim();
  const trimmedUsername = username.trim().toLowerCase();

  if (trimmedName.length < 2 || trimmedName.length > 60) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Name must be between 2 and 60 characters." });
  }

  if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Username must be between 3 and 30 characters." });
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Username can only contain alphanumeric characters, dots, and underscores." });
  }

  if (password.length < 6 || password.length > 72) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Password must be between 6 and 72 characters." });
  }

  try {
    const existingUser = await User.findOne({ username: trimmedUsername });
    if (existingUser) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "An account with this username already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: trimmedName,
      username: trimmedUsername,
      password: hashedPassword,
      sessions: [],
    });

    await newUser.save();
    return res
      .status(httpStatus.CREATED)
      .json({ message: "User Registration Successful!" });
  } catch (err) {
    console.error("Registration error:", err.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Registration failed. Please try again." });
  }
};

const logout = async (req, res) => {
  try {
    if (req.user && req.tokenHash) {
      req.user.sessions = (req.user.sessions || []).filter(
        (s) => s.tokenHash !== req.tokenHash
      );
      if (req.user.token === req.tokenHash) {
        req.user.token = undefined;
      }
      await req.user.save();
    }
    return res.status(httpStatus.OK).json({ message: "Logged out successfully." });
  } catch (err) {
    console.error("Logout error:", err.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to process logout." });
  }
};

const getUserHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const meetings = await Meeting.find({ user_id: req.user.username })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(httpStatus.OK).json(meetings);
  } catch (e) {
    console.error("getUserHistory error:", e.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Could not retrieve activity history." });
  }
};

const addToHistory = async (req, res) => {
  const { meeting_code } = req.body;

  if (!meeting_code || typeof meeting_code !== "string" || !meeting_code.trim()) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Meeting code is required." });
  }

  const cleanCode = meeting_code.trim().slice(0, 64);

  try {
    const newMeeting = new Meeting({
      user_id: req.user.username,
      meetingCode: cleanCode,
      date: new Date(),
    });

    await newMeeting.save();
    return res
      .status(httpStatus.CREATED)
      .json({ message: "Added code to history" });
  } catch (e) {
    console.error("addToHistory error:", e.message);
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: "Could not save meeting activity." });
  }
};

export { login, register, logout, getUserHistory, addToHistory };
