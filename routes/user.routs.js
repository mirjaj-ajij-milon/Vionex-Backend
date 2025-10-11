import { Router } from "express";
import { login, register } from "../controlers/user.controler.js";
import { addToHistory } from "../controlers/user.controler.js";
import { getUserHistory } from "../controlers/user.controler.js";

const router = Router();

router.route("/login").post(login);
router.route("/register").post(register);
router.route("/add_to_activity").post(addToHistory);
router.route("/get_all_activity").get(getUserHistory);
export default router;
