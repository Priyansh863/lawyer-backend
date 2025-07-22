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

    console.log("Using local environment configuration");
    
    // Static keys from env.json
    secretManagerKeys = {
      jwtSecretKey: CONFIG.jwtSecretKey,
      crypto_key: CONFIG.crypto_key,
      cryptoKey: CONFIG.cryptoKey,
      apiUrl: CONFIG.apiUrl,
      mongoUri: CONFIG.mongoUri,
      bucket: CONFIG.bucket,
      region: CONFIG.region,
      secretManagerKey: CONFIG.secretManagerKey,
      openaiApiKey: CONFIG.openaiApiKey,
    };

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
