import { Request, Response } from "express";

import AuthService from "../services/AuthService";

import { DataFromHeader, ResponseObject } from "../Interfaces/commonInterfaces";

/**
 * Login
 */

export const login = async (req: Request, res: Response) => {
  try {
    const response: ResponseObject = await AuthService.login(req.body);
    res.status(200).send(response);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 *  Signup
 */
export const signup = async (req: Request, res: Response): Promise<any> => {
  const response: ResponseObject = await AuthService.signup(req.body);
  res.status(200).send(response);
};

/**
 *  Reset password
 */
export const resetPassword = async (
  req: Request,
  res: Response
): Promise<any> => {
  const response: ResponseObject = await AuthService.resetPassword(req.body);
  res.status(200).send(response);
};

/**
 *  Forgot password
 */
export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<any> => {
  const response: ResponseObject = await AuthService.forgotPassword(req.body);
  res.status(200).send(response);
};

/**
 *  Verify OTP for signup
 */
export const verifySignupOtp = async (req: Request, res: Response): Promise<any> => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).send({
      success: false,
      message: 'email_and_otp_required'
    });
  }

  const response = await AuthService.verifySignupOtp(email, otp);
  res.status(200).send(response);
};

/**
 *  Resend OTP for signup
 */
export const resendSignupOtp = async (req: Request, res: Response): Promise<any> => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).send({
      success: false,
      message: 'email_required'
    });
  }

  const response = await AuthService.sendSignupOtp(email);
  res.status(200).send(response);
};

/**
 *  OTP verification for password reset
 */
export const otpVerification = async (
  req: Request,
  res: Response
): Promise<any> => {
  const response: ResponseObject = await AuthService.otpVerification(req.body);
  res.status(200).send(response);
};

/**
 * Handling the auth token validation
 * @param req Http Request
 * @param res Http Response
 */

export const matchToken = async (
  req: Request & DataFromHeader,
  res: Response
) => {
  const response: ResponseObject = await AuthService.matchToken({
    id: req.id,
    token: req.token,
  });
  res.status(200).send(response);
};

/**
 *  apple login
 */
export const appleLogin = async (req: Request, res: Response): Promise<any> => {
  const response: any = await AuthService.appleLogin(req.body);
  res.status(200).send(response);
};

/**
 *  Social login
 */
export const socialLogin = async (
  req: Request,
  res: Response
): Promise<any> => {
  const response: any = await AuthService.socialLogin(req.body);
  res.status(200).send(response);
};

/**
 * Validate Token - Check if token is expired
 */
export const validateToken = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { token, tone } = req.body;
    

    const response: ResponseObject = await AuthService.validateToken({
      token,
      tone: tone || "default"
    });
    
    res.status(200).send(response);
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).send({
      success: false,
      message: "Internal server error",
      isExpired: true
    });
  }
};

/**
 * Admin Login
 */
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const response: ResponseObject = await AuthService.adminLogin(req.body);
    res.status(200).send(response);
  } catch (error) {
    console.error("Admin Login error:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

/**
 * Create Client by Lawyer - Client Onboarding
 */
export const createClientByLawyer = async (req: Request, res: Response) => {
  try {
    const { lawyer_id, client_first_name, client_last_name, client_email, client_password, client_phone } = req.body;
    
    // Validate required fields
    if (!lawyer_id || !client_first_name || !client_email || !client_password) {
      return res.status(400).send({
        success: false,
        message: "Missing required fields: lawyer_id, client_first_name, client_email, client_password"
      });
    }

    const response: ResponseObject = await AuthService.createClientByLawyer({
      lawyer_id,
      client_first_name,
      client_last_name,
      client_email,
      client_password,
      client_phone
    });
    
    res.status(200).send(response);
  } catch (error) {
    console.error("Create client error:", error);
    res.status(500).send({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};
