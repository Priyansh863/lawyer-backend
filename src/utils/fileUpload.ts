import { S3Client, PutObjectCommand, DeleteObjectsCommand, ObjectCannedACL } from "@aws-sdk/client-s3";
import envConfig from "../config/envConfig";
import { envData } from "../Interfaces/commonInterfaces";

import { fromIni } from "@aws-sdk/credential-providers";


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
    console.log(command, "commandcommandcommandcommand");
    const response = await s3Client.send(command);
    return `https://${CONFIG.bucket}.s3.${CONFIG.awsRegion}.amazonaws.com/${params.Key}`;
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
    console.log("Deleted objects from S3:", response);
  } catch (error) {
    console.error("Error deleting files from S3:", error);
    throw error;
  }
};
