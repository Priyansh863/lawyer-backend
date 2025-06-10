import express from "express";

import HandleErrors from "../middlewares/handleError";
import Auth from "../middlewares/auth";

import {
  login,
  signup,
  otpVerification,
  matchToken,
  forgotPassword,
  resetPassword,
  appleLogin,
  socialLogin
} from "../controllers/AuthController";

import {
  loginValidation,
  signUpValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} from "../validationSchema/validation";

const authRoutes = express.Router();

authRoutes.post("/login", loginValidation, HandleErrors(login));

authRoutes.post("/signup", signUpValidation, HandleErrors(signup));

authRoutes.patch("/reset-password", resetPasswordValidation, HandleErrors(resetPassword));

authRoutes.post("/forgot-password", forgotPasswordValidation, HandleErrors(forgotPassword));

authRoutes.post("/apple-login", HandleErrors(appleLogin));

authRoutes.post("/social-login", HandleErrors(socialLogin));

authRoutes.post("/otp-verification", HandleErrors(otpVerification));

authRoutes.get("/match-token", Auth, HandleErrors(matchToken));

export default authRoutes;
