import axios, { AxiosRequestConfig, AxiosPromise } from "axios";
import moment from "moment";

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { Types } from "mongoose";

import config from "../config/envConfig";
import dbConfig from "../config/secretManagerConfig";
import { envData, ISecretManagerData } from "../Interfaces/commonInterfaces";
import { fromIni } from "@aws-sdk/credential-providers";


const { region, bucket, env, awsConfigureProfile }: envData = config();

let credentials;

if (env === "local") {
  credentials = fromIni({ profile: awsConfigureProfile });
}
const s3Client = new S3Client({
  region,
  credentials: credentials,
});


class Helper {
  /**
   * Converts a string to a regular expression
   * @param str
   * @returns
   */
  regex = (str: string) => new RegExp(str, "i");

  /**
   * Call google apis
   * @param data Params
   * @returns
   */
  googleAPI = async (data: any): Promise<AxiosPromise> => {
    const connectionCredentials = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const config: AxiosRequestConfig = {
      url: data.url,
      method: data.method,
      headers: {
        "User-Agent": "Super Agent/0.0.1",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      params: {
        region: region,
        key: connectionCredentials.googleApiKey,
        ...data.params,
      },
    };
    const response = await axios(config);
    return response;
  };

  /*
  * Checking the image is in base 64 format
  */
  isBase64Image = async (image: string): Promise<boolean> => {
    try {
      return /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(
        image.split(",")[1]
      );
    } catch {
      return false;
    }
  };

  /*
  * Convert string to ObjectId format
  */

  stringToObjectId = (id: string): Types.ObjectId => {
    return new Types.ObjectId(id);
  };

  /*
  * Getting presigned url
  */
  gettingPreSignedUrl = async (
    filePath: string,
    fileFormat: any
  ): Promise<any> => {
    console.log("bucketbucketbucket",bucket);
        try {
          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: filePath,
            ContentType: fileFormat,
            ACL: "public-read",
          });
          const url = await getSignedUrl(s3Client, command, {
            expiresIn: 3600,
          });
          return url;
        } catch (error) {
          console.log(
            error,
            "error============================================="
          );
          throw new Error(`Failed to get pre-signed URL: ${error}`);
        }
  };

  /**
  * Calculate age on the basis of user dob
  * @param dob
  * @returns
  */
  calculateAge = (dob: Date) => {
    return moment().diff(dob, "years");
  };

  /**
 * Calculate date and added day on provided date
 * @param dob
 * @returns
 */
  addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  /**
  * Calculate percentage 
  * @param partialValue
  * @param totalValue
  * @returns
  */

  percentage = (partialValue: number, totalValue: number) => {
    if (totalValue >= partialValue)
      return (100 * partialValue) / totalValue;
    else
      return 0;
  };


}

export default new Helper();
