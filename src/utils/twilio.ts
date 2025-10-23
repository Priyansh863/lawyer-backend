import sgMail from "@sendgrid/mail";
import { isEmpty } from "lodash";

import dbConfig from "../config/secretManagerConfig";
import { ISecretManagerData } from "../Interfaces/commonInterfaces";


/*
 *  Function to initiate the secret manager keys and set in a global object.
 */

let secrectManagerKeys: ISecretManagerData;
const fetchSecretKeys = async () => {
  secrectManagerKeys = await dbConfig.secretManagerConnection() as ISecretManagerData;
  sgMail.setApiKey("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");
};

/*
 *  Function to send otp emails to users
 */

export const sendMail = async (content: any, email: string) => {
  if (isEmpty(secrectManagerKeys)) {
    await fetchSecretKeys();
  }
  const mailData = {
    from: "infoservifytech@gmail.com",
    to: "jhalanipriyansh25@gmail.com",
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
    from: secrectManagerKeys.sendGridSenderEmail,
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
