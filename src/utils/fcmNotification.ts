import Admin, {
  app,
  credential,
  messaging,
  ServiceAccount,
} from "firebase-admin";
import * as keys from "../../amour-dating-1-firebase-adminsdk-x33it-d4b0f5feee.json";

const certKeys = {
  projectId: keys.project_id,
  clientEmail: keys.client_email,
  privateKey: keys.private_key,
};
let firebaseApp: app.App;

interface IMessage {
  notification: { title: string; body: string };
  tokens: string[];
  data?: {
    [key: string]: string;
  };
}

const sendNotification = async (
  tokenList: string[],
  title: string,
  body: string,
  data?: {
    [key: string]: string;
  }
) => {
  if (!firebaseApp) {
    firebaseApp = Admin.initializeApp({
      credential: credential.cert(certKeys as ServiceAccount),
    });
  }

  const message: IMessage = {
    notification: { title, body },
    tokens: tokenList,
  };
  if (data && Object.keys(data).length !== 0) {
    message.data = data;
  }
  const result = await messaging().sendEachForMulticast(message);
  console.log("notification result ", JSON.stringify(result));
};

export default sendNotification;
