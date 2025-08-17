import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";
import dbConfig from "../config/secretManagerConfig";

export default async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
        const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    
    const decoded = jwt.verify(token, dbData.jwtSecretKey as string) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    console.error("Failed to authenticate user:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
}
