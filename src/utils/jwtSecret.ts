import dbConfig from "../config/secretManagerConfig";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";

let cachedJwtSecret: string | null = null;

export async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret) {
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }

  const dbData = (await dbConfig.secretManagerConnection()) as ISecretManagerData;
  if (!dbData.jwtSecretKey) {
    throw new Error("JWT secret is not configured");
  }

  cachedJwtSecret = dbData.jwtSecretKey;
  return cachedJwtSecret;
}
