import { sendMail, sendProblemMail } from "./twilio";

import { IEmailArguments, IReportProblemEmailArguments, SendAddUserEmailResponse, SendAppReportEmailResponse } from "../Interfaces/commonInterfaces";



/** Send otp mail
      */
export const sendOtpEmail = async (
  data: IEmailArguments
): Promise<SendAddUserEmailResponse> => {
  const { type, email } = data;
  const otp = Math.floor(1000 + Math.random() * 9000);
  const message =
    type === "signup-otp"
      ? "Please use the verification code below to verify your email and complete the signup process."
      : "Please use the verification code below to reset your password.";
  const content = {
    text: `Verification Code : ${otp}`,
    html: `<html>
          <head>
          </head>
          <body>
              <div style="text-align: center;">
              <div style="margin-bottom: 20px;"><img  src="https://amour-prod-files.s3.amazonaws.com/APPICON+AND.jpg" alt="amour_logo"><h1 style="color: blue">Amour</h1></div>
                  <h3 style="font-size: 28px;">Dear user</h3>
                  <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;">${message}</p>
                 <h2>Verification Code: </h2> <p style = "font-size: 40px;">${otp}</p>
                  <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;">Having Trouble? Please email us at <a href="mailto:amourdatingapp@gmail.com">amourdatingapp@gmail.com
                  </a></p>
              </div>
          </body>
      </html> `,
    subject:
      type === "signup-otp"
        ? "Verify your email"
        : "Password reset verification code",
  };
  const response = await sendMail(content, email);
  return { response, otp };
};

/**
 *  Reporting a problem email to Admin
*/

export const sendAppProblemEmail = async (
  data: IReportProblemEmailArguments
): Promise<SendAppReportEmailResponse> => {
  const { full_name, email, report } = data;
  const content = {
    text: `${full_name} has reported a problem in app.`,
    html: `<html>
          <head>
          </head>
          <body>
              <div style="text-align: center;">
              <div style="margin-bottom: 20px;"><img  src="https://fetchknack-dev-resources.nyc3.digitaloceanspaces.com/logos.png" alt="amour_logo"><h1 style="color: blue">Amour</h1></div>
                  <h3 style="font-size: 28px;">Dear admin</h3>
                  <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;"><b>${full_name}</b> has reported a problem in app.</p>
                 <h2>User email: </h2> <p style = "font-size: 20px;">${email}</p>
                 <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;">${report}</p>
              </div>
          </body>
      </html> `,
    subject: "App report Problem",
  };
  const response = await sendProblemMail(content, email);
  return { response };
};
