// import { isEmpty } from "lodash";
// import envConfig from "./envConfig";
// import * as AWS from "@aws-sdk/client-s3";

// let secretManagerKeys;
// const CONFIG = envConfig();

// const secretManagerConnection = async () => {
//   try {
//     if (!isEmpty(secretManagerKeys)) {
//       return secretManagerKeys;
//     }

//     // Static keys
//     secretManagerKeys = {
//       jwtSecretKey: "abc@lawyer@def",
//       crypto_key: "lawyer@otp",
//       cryptoKey: "superStrongKey",
//       apiUrl: "",
//       mongoUri:
//         "mongodb+srv://khandelwalpriyansh36:jXRodk8Rp5unMBnz@cluster0.1eyeed2.mongodb.net/lawyer-dev?retryWrites=true&w=majority",
//       bucket: "lawyer-dev-files",
//       region: "us-east-1",
//       secretManagerKey: "lawyer-dev-keys",
//     };

//     return secretManagerKeys;
//   } catch (error) {
//     console.error("Error fetching secret keys: ", error);
//     throw error;
//   }
// };

// // Export S3 configuration (if needed)
// export default {
//   s3: new AWS.S3({ region: CONFIG.region }),
//   secretManagerConnection: secretManagerConnection,
// };
import {
  GetSecretValueCommand,
  SecretsManager,
} from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";
import { isEmpty } from "lodash";
import envConfig from "./envConfig";
import * as AWS from "@aws-sdk/client-s3";

let secretManagerKeys;
const CONFIG = envConfig();

const secretManagerConnection = async () => {
  try {
    if (!isEmpty(secretManagerKeys)) {
      return secretManagerKeys;
    }

    console.log(CONFIG, "CONFIGCONFIGCONFIGCONFIG");
    let credentials;
    if (CONFIG.env === "local") {
      credentials = fromIni({ profile: CONFIG.awsConfigureProfile });
    }

    const client = new SecretsManager({
      region: CONFIG.awsRegion,
      credentials,
    });

    const { SecretString } = await client.send(
      new GetSecretValueCommand({ SecretId: CONFIG.secretManagerKey })
    );

    if (SecretString) {
      secretManagerKeys = JSON.parse(SecretString);
    }
    return secretManagerKeys;
  } catch (error) {
    console.error("Error fetching secret keys: ", error);
    throw error;
  }
};

// Export S3 configuration (if needed)
export default {
  s3: new AWS.S3({ region: CONFIG.region }),
  secretManagerConnection: secretManagerConnection,
};
