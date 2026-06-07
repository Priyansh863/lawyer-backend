import { NextFunction, Response, Request } from "express";
import * as jwt from "jsonwebtoken";

import { ISecretManagerData } from "../Interfaces/commonInterfaces";

import dbConfig from "../config/secretManagerConfig";


function extractBearerToken(request: Request): string | null {
  const authHeader =
    request.headers["auth"] ||
    request.headers["authorization"] ||
    request.headers["x-access-token"];
  if (!authHeader || typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }
  return trimmed || null;
}

const Auth = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(request);
    if (!token || token === "null" || token === "undefined") {
      throw new Error('No valid authorization token provided');
    }

    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const decoded = jwt.verify(token, dbData.jwtSecretKey) as { _id: string, account_type: string };

    request["id"] = decoded._id;
    request["role"] = decoded.account_type;
    request["token"] = token;
    // Also attach a normalized `user` object for consistency with other parts of the codebase.
    (request as any).user = { userId: decoded._id, role: decoded.account_type };
    next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("Error in verifying auth", error);
    }
    response.status(401).send({
      message: "YOUR SESSION HAS EXPIRED. PLEASE LOGIN AGAIN.",
      success: false,
      error: "token-expired",
    });
  }
};

export default Auth;
