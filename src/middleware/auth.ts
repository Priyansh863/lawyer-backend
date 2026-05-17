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
    // Get authorization header
    const authHeader = req.headers["auth"] || req.headers["authorization"];

    // Check if authorization header is present
    if (!authHeader || typeof authHeader !== 'string') {
      console.log("No authorization header provided");
      return res.status(401).json({
        success: false,
        message: "No authorization header provided",
        error: "no-auth-header"
      });
    }

    // Extract token from authorization header
    const token = authHeader.split(" ")[1];

    // Check if token is present and valid
    if (!token || token === "null" || token === "undefined") {
      console.log("No valid token format provided");
      return res.status(401).json({
        success: false,
        message: "No valid token format provided",
        error: "invalid-token-format"
      });
    }

    // Get secret key from secret manager
    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;

    // Decode token
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

    // Move to next middleware
    next();
  } catch (error) {
    console.log("Error in verifying auth token:", error);

    // Only report session expiry when the JWT is actually expired
    if (error && typeof error === "object" && (error as any).name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please login again.",
        error: "token-expired"
      });
    }

    // For all other JWT issues, return a more generic invalid-token error
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
      error: "invalid-token"
    });
  }
};
