import sgMail from "@sendgrid/mail";
import { isEmpty } from "lodash";

import dbConfig from "../config/secretManagerConfig";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";


/*
 *  Function to initiate the secret manager keys and set in a global object.
 */

let secrectManagerKeys: ISecretManagerData;
const SENDGRID_API_KEY = "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";
const SENDGRID_SENDER = "noreply@lawgg.net";
const fetchSecretKeys = async () => {
  secrectManagerKeys = await dbConfig.secretManagerConnection() as ISecretManagerData;
  sgMail.setApiKey(SENDGRID_API_KEY);
};

/*
 *  Function to send otp emails to users
 */

export const sendMail = async (content: any, email: string) => {
  if (isEmpty(secrectManagerKeys)) {
    await fetchSecretKeys();
  }
  const mailData = {
    from: SENDGRID_SENDER,
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
  try {
    const response=await sgMail.send(mailData);
    console.log(response,'responseresponseresponseresponseresponseresponse');
    console.log(`Mail sent successfully to ${email}`);
    return {
      isError: false,
      message: "Email sent successfully.",
    };
  } catch (error) {
    console.log("Mail send failed", JSON.stringify(error));
    return {
      isError: false,
      message: error,
    };
  }
};

/*
 *  Function to send app problems emails to Admin
 */

export const sendProblemMail = async (content: any, email: string) => {
  if (isEmpty(secrectManagerKeys)) {
    await fetchSecretKeys();
  }
  const mailData = {
    from: SENDGRID_SENDER,
    to: secrectManagerKeys.AmourAdminEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
  try {
    await sgMail.send(mailData);
    console.log(`Mail sent successfully to ${email}`);
    return {
      isError: false,
      message: "Email sent successfully.",
    };
  } catch (error) {
    console.log("Mail send failed", JSON.stringify(error));
    return {
      isError: false,
      message: error,
    };
  }
};
