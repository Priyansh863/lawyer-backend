import { sendMail, sendProblemMail } from "./twilio";

import { IEmailArguments, IReportProblemEmailArguments, SendAddUserEmailResponse, SendAppReportEmailResponse } from "../Interfaces/commonInterfaces";
import config from "../config/envConfig";



/** Send otp mail
      */
export const sendOtpEmail = async (
  data: IEmailArguments
): Promise<SendAddUserEmailResponse> => {
  const { type, email,otp } = data;
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
              <div style="margin-bottom: 20px;">
              <h1 style="color: blue">Lawgg</h1></div>
                  <h3 style="font-size: 28px;">Dear user</h3>
                  <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;">${message}</p>
                 <h2>Verification Code: </h2> <p style = "font-size: 40px;">${otp}</p>
                  <p style=" max-width: 400px;
                  margin: 0 auto;
                  margin-bottom: 20px;
                  font-size: 20px;">Having Trouble? Please email us at <a href="mailto:infoservifytech@gmail.com">infoservifytech@gmail.com
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
  return { response, otp: otp as unknown as number };
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

/**
 * Send registration invitation email with verification link
 */
export const sendRegistrationEmail = async (
  email: string, 
  verificationToken: string,
  tempPassword: string
): Promise<any> => {
  const envConfig = config();

  const verificationLink = `${envConfig.backendURL}/user/verify-email?token=${verificationToken}`;

  const content = {
    text: `Welcome to Lawgg! Please verify your email to complete registration.`,
    html: `<html>
          <head>
          </head>
          <body>
              <div style="text-align: center; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="margin-bottom: 30px;">
                      <h1 style="color: #2563eb; margin: 0;">Lawgg</h1>
                  </div>
                  
                  <h2 style="color: #1f2937; margin-bottom: 20px;">Welcome to Lawgg!</h2>
                  
                  <p style="font-size: 16px; color: #4b5563; margin-bottom: 20px;">
                      Dear User,
                  </p>
                  
                  <p style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                      You have been invited to join our platform. To complete your registration and activate your account, please click the verification link below:
                  </p>
                  
                  <div style="margin: 30px 0;">
                      <a href="${verificationLink}" 
                         style="background-color: #2563eb; 
                                color: white; 
                                padding: 12px 24px; 
                                text-decoration: none; 
                                border-radius: 6px; 
                                font-weight: bold;
                                display: inline-block;">
                          Verify Email & Complete Registration
                      </a>
                  </div>
                  
                  <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 25px 0;">
                      <h3 style="color: #1f2937; margin-top: 0;">Your Account Details:</h3>
                      <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
                      <p style="margin: 10px 0;"><strong>Temporary Password:</strong> <code style="background-color: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
                      <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
                          <em>You can change your password after verifying your email.</em>
                      </p>
                  </div>
                  
                  <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                      This verification link will expire in 24 hours. If you didn't request this account, please ignore this email.
                  </p>
                  
                  <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
                      Having trouble? Contact us at 
                      <a href="mailto:support@lawgg.com" style="color: #2563eb;">support@lawgg.com</a>
                  </p>
              </div>
          </body>
      </html>`,
    subject: "Welcome to Lawgg - Verify Your Email"
  };
  
  const response = await sendMail(content, email);
  return response;
};

/**
 * Send email verification success notification
 */
export const sendVerificationSuccessEmail = async (
  email: string,
  firstName: string,
  lastName: string
): Promise<any> => {
  const loginLink = `${process.env.FRONTEND_URL}/login`;
  
  const content = {
    text: `Your email has been verified successfully! You can now login to your Lawgg account.`,
    html: `<html>
          <head>
          </head>
          <body>
              <div style="text-align: center; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="margin-bottom: 30px;">
                      <h1 style="color: #2563eb; margin: 0;">Lawgg</h1>
                  </div>
                  
                  <div style="background-color: #10b981; color: white; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
                      <h2 style="margin: 0;">✅ Email Verified Successfully!</h2>
                  </div>
                  
                  <p style="font-size: 16px; color: #4b5563; margin-bottom: 20px;">
                      Dear ${firstName} ${lastName},
                  </p>
                  
                  <p style="font-size: 16px; color: #4b5563; margin-bottom: 25px;">
                      Congratulations! Your email has been verified and your account is now active. You can now access all features of the Lawgg platform.
                  </p>
                  
                  <div style="margin: 30px 0;">
                      <a href="${loginLink}" 
                         style="background-color: #2563eb; 
                                color: white; 
                                padding: 12px 24px; 
                                text-decoration: none; 
                                border-radius: 6px; 
                                font-weight: bold;
                                display: inline-block;">
                          Login to Your Account
                      </a>
                  </div>
                  
                  <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                      Welcome to Lawgg! We're excited to have you on board.
                  </p>
                  
                  <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
                      Need help? Contact us at 
                      <a href="mailto:support@lawgg.com" style="color: #2563eb;">support@lawgg.com</a>
                  </p>
              </div>
          </body>
      </html>`,
    subject: "Email Verified - Welcome to Lawgg!"
  };
  
  const response = await sendMail(content, email);
  return response;
};
