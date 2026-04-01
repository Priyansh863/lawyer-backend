import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import envConfig from "../config/envConfig";
import { envData } from "../Interfaces/commonInterfaces";

import { fromIni } from "@aws-sdk/credential-providers";
import { compressBase64 } from "./documentUtils";


const { region, env, awsConfigureProfile }: envData = envConfig();

let credentials;

if (env === "local") {
  credentials = fromIni({ profile: awsConfigureProfile });
}
const s3Client = new S3Client({
  region,
  credentials: credentials,
});

const CONFIG: envData = envConfig();

/**
 * Parse a virtual-hosted–style or path-style S3 HTTPS URL into bucket and key.
 * Returns null if the URL is not a recognized S3 object URL.
 */
export function parseS3ObjectUrl(fileUrl: string): { bucket: string; key: string } | null {
  try {
    const u = new URL(fileUrl);
    const host = u.hostname;
    const path = u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;

    const virtualHosted = host.match(/^(.+)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i);
    if (virtualHosted) {
      return { bucket: virtualHosted[1], key: decodeURIComponent(path) };
    }

    if (host.startsWith("s3.") && host.includes("amazonaws.com") && path.includes("/")) {
      const parts = path.split("/");
      const bucket = decodeURIComponent(parts[0]);
      const key = decodeURIComponent(parts.slice(1).join("/"));
      if (bucket && key) return { bucket, key };
    }

    return null;
  } catch {
    return null;
  }
}

export type S3IngestResult = { file_base64: string; link: null };

/**
 * If `fileUrl` points at an object in the configured app bucket, download it,
 * store as compressed base64 (same pipeline as client uploads), delete the S3 object,
 * and return fields to persist. Skips when `file_base64` is already provided.
 */
export async function ingestS3UploadToStoredBase64(
  fileUrl: string | undefined | null,
  existingBase64: string | undefined | null
): Promise<S3IngestResult | null> {
  if (existingBase64 && existingBase64.trim() !== "") {
    return null;
  }
  if (!fileUrl || fileUrl.trim() === "") {
    return null;
  }

  const parsed = parseS3ObjectUrl(fileUrl);
  if (!parsed || parsed.bucket !== CONFIG.bucket) {
    return null;
  }

  try {
    const getCmd = new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key });
    const response = await s3Client.send(getCmd);

    const chunks: Buffer[] = [];
    const body = response.Body;
    if (!body) {
      throw new Error("Empty S3 object body");
    }
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);
    const mime = response.ContentType || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${fileBuffer.toString("base64")}`;
    const file_base64 = compressBase64(dataUrl);

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      })
    );

    console.log(`[S3 ingest] Migrated object to DB and deleted: ${parsed.key}`);
    return { file_base64, link: null };
  } catch (error) {
    console.error("[S3 ingest] Failed to fetch/delete S3 object:", error);
    return null;
  }
}

/**
 * Upload base64 image files to S3
 * @param file base64 file data
 * @param fileName file name
 * @param userId user ID
 * @returns S3 bucket URL of the uploaded image
 */
export const uploadImg = async (file: string, fileName: string, userId: string) => {
  const mimeType = file.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)[0];
  const buf = Buffer.from(file.split(",")[1], "base64");
  
  const params = {
    Bucket: CONFIG.bucket,
    Key: `${userId}/${Date.now()}/${fileName.replace(/ /g, "_")}`,
    Body: buf,
    ContentEncoding: "base64",
    ContentType: mimeType,
    ACL: ObjectCannedACL.public_read,

  };

  try {
    const command = new PutObjectCommand(params);

    const response = await s3Client.send(command);
    return `https://${CONFIG.bucket}.s3.${region}.amazonaws.com/${params.Key}`;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
};

/**
 * Delete files from S3 bucket
 * @param filePathArray Array of file URLs to delete
 */
export const deleteFileFromS3 = async (filePathArray: string[]) => {
  if (!filePathArray.length) return;

  try {
    const objectsToDelete = filePathArray.map((item) => {
      const { pathname } = new URL(item);
      return { Key: decodeURIComponent(pathname.substring(1)) };
    });

    const params = {
      Bucket: CONFIG.bucket,
      Delete: { Objects: objectsToDelete },
    };

    const command = new DeleteObjectsCommand(params);
    const response = await s3Client.send(command);

  } catch (error) {
    console.error("Error deleting files from S3:", error);
    throw error;
  }
};
