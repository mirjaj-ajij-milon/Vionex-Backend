import { Router } from "express";
import {
  login,
  register,
  addToHistory,
  getUserHistory,
} from "../controlers/user.controler.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.route("/login").post(login);
router.route("/register").post(register);

// Protected routes requiring valid auth token
router.route("/add_to_activity").post(authMiddleware, addToHistory);
router.route("/get_all_activity").get(authMiddleware, getUserHistory);

export default router;
