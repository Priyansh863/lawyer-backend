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
  socialLogin,
  verifySignupOtp,
  resendSignupOtp,
  validateToken,
  adminLogin
} from "../controllers/AuthController";

import {
  loginValidation,
  signUpValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} from "../validationSchema/validation";

const authRoutes = express.Router();

authRoutes.post("/login", loginValidation, HandleErrors(login));

authRoutes.post("/signup", HandleErrors(signup));

authRoutes.patch("/reset-password", resetPasswordValidation, HandleErrors(resetPassword));

authRoutes.post("/forgot-password", forgotPasswordValidation, HandleErrors(forgotPassword));

authRoutes.post("/apple-login", HandleErrors(appleLogin));

authRoutes.post("/social-login", HandleErrors(socialLogin));

authRoutes.post("/otp-verification", HandleErrors(otpVerification));

authRoutes.get("/match-token", Auth, HandleErrors(matchToken));

authRoutes.post("/verify-otp", HandleErrors(verifySignupOtp));

authRoutes.post("/resend-otp", HandleErrors(resendSignupOtp));

authRoutes.post("/validate-token", HandleErrors(validateToken));

authRoutes.post("/admin-login", loginValidation, HandleErrors(adminLogin));

export default authRoutes;
