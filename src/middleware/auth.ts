import { NextFunction, Response, Request } from "express";
import * as jwt from "jsonwebtoken";
import dbConfig from "../config/secretManagerConfig";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const authHeader = req.headers["auth"] || req.headers["authorization"];
    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({
        success: false,
        message: "No authorization header provided",
        error: "no-auth-header"
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        error: "invalid-token-format"
      });
    }

    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const decoded = jwt.verify(token, dbData.jwtSecretKey) as { 
      _id: string; 
      account_type: string;
    };
    
    // Set user information in request object
    req.user = {
      userId: decoded._id,
      role: decoded.account_type
    };

    // Also set legacy format for backward compatibility
    req["id"] = decoded._id;
    req["role"] = decoded.account_type;
    req["token"] = token;

    next();
  } catch (error) {
    console.log("Error in verifying auth token:", error);
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please login again.",
      error: "token-expired"
    });
  }
};
