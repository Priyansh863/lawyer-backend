import { NextFunction, Response, Request } from "express";
import * as jwt from "jsonwebtoken";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";
import dbConfig from "../config/secretManagerConfig";

const OptionalAuth = async (request: Request, response: Response, next: NextFunction) => {
    try {
        const authHeader = request.headers["auth"] || request.headers["authorization"];

        if (!authHeader || typeof authHeader !== 'string') {
            return next();
        }

        const token = authHeader.split(" ")[1];
        if (!token || token === "null" || token === "undefined") {
            return next();
        }

        const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
        const decoded = jwt.verify(token, dbData.jwtSecretKey) as { _id: string, account_type: string };

        request["id"] = decoded._id;
        request["role"] = decoded.account_type;
        request["token"] = token;
        console.log(`OptionalAuth: Extracted userId=${decoded._id}, role=${decoded.account_type}`);
        next();
    } catch (error) {
        // If token is invalid, we still allow the request but without user identity
        console.log("Optional auth error (continuing as guest):", error.message);
        next();
    }
};

export default OptionalAuth;
