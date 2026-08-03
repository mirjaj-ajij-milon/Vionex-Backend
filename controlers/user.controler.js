import httpStatus from "http-status";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Meeting } from "../models/Meeting.model.js";

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please enter username and password" });
  }

  try {
    const trimmedUsername = username.trim();
    const user = await User.findOne({ username: trimmedUsername });
    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User not found!" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      const token = crypto.randomBytes(32).toString("hex");
      user.token = token;
      await user.save();

      return res.status(httpStatus.OK).json({
        token: token,
        name: user.name,
        username: user.username,
        message: "Login successful!",
      });
    } else {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid username or password!" });
    }
  } catch (err) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${err.message}` });
  }
};

const register = async (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "All fields (name, username, password) are required" });
  }

  try {
    const trimmedUsername = username.trim();
    const trimmedName = name.trim();

    const existingUser = await User.findOne({ username: trimmedUsername });
    if (existingUser) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "User already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: trimmedName,
      username: trimmedUsername,
      password: hashedPassword,
    });

    await newUser.save();
    return res
      .status(httpStatus.CREATED)
      .json({ message: "User Registration Successful!" });
  } catch (err) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: `Registration failed: ${err.message}` });
  }
};

const getUserHistory = async (req, res) => {
  try {
    const meetings = await Meeting.find({ user_id: req.user.username }).sort({
      date: -1,
    });
    return res.status(httpStatus.OK).json(meetings);
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

const addToHistory = async (req, res) => {
  const { meeting_code } = req.body;

  if (!meeting_code || typeof meeting_code !== "string" || !meeting_code.trim()) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Meeting code is required" });
  }

  try {
    const newMeeting = new Meeting({
      user_id: req.user.username,
      meetingCode: meeting_code.trim(),
    });

    await newMeeting.save();
    return res
      .status(httpStatus.CREATED)
      .json({ message: "Added code to history" });
  } catch (e) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Something went wrong: ${e.message}` });
  }
};

export { login, register, getUserHistory, addToHistory };
