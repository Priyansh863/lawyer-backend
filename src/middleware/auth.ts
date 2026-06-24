import { NextFunction, Response, Request } from "express";
import * as jwt from "jsonwebtoken";
import dbConfig from "../config/secretManagerConfig";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";
import { User } from "../models/user";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export type AdminAccessResult = "ok" | "unauthorized" | "forbidden";

export function getAuthUserId(req: Request): string | null {
  const authReq = req as AuthenticatedRequest;
  const id = (req as any).id || authReq.user?.userId;
  return id ? String(id) : null;
}

export function getAuthRole(req: Request): string | undefined {
  const authReq = req as AuthenticatedRequest;
  return (req as any).role || authReq.user?.role;
}

/** Resolves admin access from JWT role with DB fallback for legacy tokens. */
export async function resolveAdminAccess(
  userId: string | undefined,
  role: string | undefined,
  lookupAccountType?: (id: string) => Promise<string | null | undefined>
): Promise<AdminAccessResult> {
  if (!userId) return "unauthorized";
  if ((role || "").toLowerCase() === "admin") return "ok";

  const resolveAccountType =
    lookupAccountType ||
    (async (id: string) => {
      const user = await User.findById(id).select("account_type").lean();
      return (user as { account_type?: string } | null)?.account_type;
    });

  const accountType = await resolveAccountType(userId);
  if ((accountType || "").toLowerCase() === "admin") return "ok";
  return "forbidden";
}

export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = getAuthUserId(req);
  const role = getAuthRole(req);
  const access = await resolveAdminAccess(userId || undefined, role);

  if (access === "unauthorized") {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (access === "forbidden") {
    return res.status(403).json({ success: false, message: "Forbidden: admin access required" });
  }
  next();
};

function extractBearerToken(req: Request): string | null {
  const authHeader =
    req.headers["auth"] ||
    req.headers["authorization"] ||
    req.headers["x-access-token"];
  if (!authHeader || typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }
  return trimmed || null;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractBearerToken(req);

    // Check if token is present and valid
    if (!token || token === "null" || token === "undefined") {
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
    if (process.env.NODE_ENV !== "production") {
      console.debug("Error in verifying auth token:", error);
    }

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
