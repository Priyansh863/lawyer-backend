import { NextFunction, Response, Request } from "express";
import * as jwt from "jsonwebtoken";

import { ISecretManagerData } from "../Interfaces/commonInterfaces";

import dbConfig from "../config/secretManagerConfig";


const Auth = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const authHeader = request.headers["auth"] || request.headers["authorization"];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new Error('No authorization header');
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new Error('Invalid token format');
    }

    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const decoded = jwt.verify(token, dbData.jwtSecretKey) as { _id: string };
    
    request["id"] = decoded._id;
    request["token"] = token;
    next();
  } catch (error) {
    console.log("Error in verifying auth ", error);
    response.status(401).send({
      message: "YOUR SESSION HAS EXPIRED. PLEASE LOGIN AGAIN.",
      success: false,
      error: "token-expired",
    });
  }
};

export default Auth;
