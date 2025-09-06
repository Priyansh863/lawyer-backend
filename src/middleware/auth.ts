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
    // Check for token in both 'auth' and 'authorization' headers
    const authHeader = req.headers["authorization"] || req.headers["auth"];
    
    if (!authHeader || typeof authHeader !== 'string') {
      return res.status(401).json({
        success: false,
        message: "No authorization header provided",
        error: "no-auth-header"
      });
    }

    // Handle both 'Bearer token' and just 'token' formats
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : authHeader;
      
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        error: "invalid-token-format"
      });
    }

    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    
    // Add more detailed error handling for JWT verification
    try {
      const decoded = jwt.verify(token.trim(), dbData.jwtSecretKey) as { 
        _id: string; 
        email: string;
        account_type: string;
      };
      
      console.log('Successfully decoded token:', decoded);
      
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
    } catch (jwtError) {
      console.error("JWT Verification Error:", jwtError);
      let errorMessage = "Invalid or expired token";
      
      if (jwtError.name === 'TokenExpiredError') {
        errorMessage = "Your session has expired. Please login again.";
      } else if (jwtError.name === 'JsonWebTokenError') {
        errorMessage = "Invalid token format";
      }
      
      return res.status(401).json({
        success: false,
        message: errorMessage,
        error: jwtError.name || "token-verification-failed"
      });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during authentication",
      error: "authentication-error"
    });
  }
};
