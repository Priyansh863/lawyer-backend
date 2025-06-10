import { Request, Response } from "express";

import AuthService from "../services/AuthService";

import { DataFromHeader, ResponseObject } from "../Interfaces/commonInterfaces";

/**
 * Login
 */

export const login = async (req: Request, res: Response) => {
  const response: ResponseObject = await AuthService.login(req.body);

  res.status(200).send(response);
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
 *  otp verification
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
