import { GetSecretValueCommand, SecretsManager } from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";
import { isEmpty } from "lodash";
import envConfig from "./envConfig";
import type { envData } from "../Interfaces/commonInterfaces";

const CONFIG: any = envConfig();

let secretManagerKeys: any;

const secretManagerConnection = async () => {
  try {
    if (!isEmpty(secretManagerKeys)) {
      return secretManagerKeys;
    }

    let credentials;
    if (CONFIG.env === "local") {
      credentials = fromIni({ profile: CONFIG.awsConfigureProfile });
    }

    const client = new SecretsManager({
      region: CONFIG.region,
      credentials,
    });

    try {
      const { SecretString } = await client.send(
        new GetSecretValueCommand({
          SecretId: CONFIG.secretManagerKey,
          VersionStage: "AWSCURRENT",
        })
      );
      
      if (SecretString) {
        console.log("Secret keys fetched successfully from AWS Secrets Manager");
        secretManagerKeys = JSON.parse(SecretString);
        console.log("Secret keys:", secretManagerKeys);
        return secretManagerKeys;
      } else {
        throw new Error("No secret string found in AWS Secrets Manager");
      }
    } catch (error) {
      console.error("Error fetching from AWS Secrets Manager: ", error);
      throw new Error(`Failed to fetch secrets from AWS Secrets Manager: ${error.message}`);
    }

    return secretManagerKeys;
  } catch (error) {
    console.error("Error in secretManagerConnection: ", error);
    throw error;
  }
};

// Export the connection function
export default {
  secretManagerConnection: secretManagerConnection,
};
