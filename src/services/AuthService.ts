import bcrypt from "bcryptjs";
import { HmacSHA256, enc } from "crypto-js";

import jwksClient = require("jwks-rsa");
import jwt from "jsonwebtoken";
import jwt_decode from "jwt-decode";
import { isEmpty } from "lodash";

import dbConfig from "../config/secretManagerConfig";
import createToken from "../middlewares/generate";

import { User } from "../models/user";
import { sendOtpEmail } from "../utils/emailService";

import {
  ResponseObject,
  DataFromHeader,
  ISocialSignIn,
  IAppleLoginIn,
  LoginData,
  IresetPassword,
  IforgotPassword,
  IOtpVerificationtData,
  ISecretManagerData,
} from "../Interfaces/commonInterfaces";
import { IUserSchema } from "../Interfaces/schemaInterfaces";
import { BRACKET_MATCH_REGEX } from "../utils/constant";

class AuthServices {
  /**
   * Standard response object
   */
  private response: ResponseObject;

  /**
   * Login
   */
  async login(data: LoginData) {
    const { email, password } = data;
    const query = { email: email.toLowerCase(), is_active: 1 };
    const userInfo = await User.findOne(query);
    if (userInfo) {
      if (!userInfo.is_active) {
        this.response = {
          success: false,
          message: "user_not_active",
        };
      } else {
        if (
          await bcrypt.compare(password.trim(), userInfo.password as string)
        ) {
          const tokenPayload = {
            _id: userInfo._id,
            email: userInfo.email,
            account_type: userInfo.account_type,
          };
          const tokenResult: string = await createToken(tokenPayload);
          const userData = await User.findOne(query)
            .select("-password")
            console.log("userData", userData);

          this.response = {
            success: true,
            message: "login_successful",
            data: {userData, token: tokenResult},
          };
        } else {
          this.response = {
            success: false,
            message: "credentials_not_match",
          };
        }
      }
    } else {
      this.response = {
        success: false,
        message: "no_user_found",
      };
    }
    return this.response;
  }

  /**
   * Sign up
   */
  async signup(data: IUserSchema) {
    const { email, password, first_name, last_name, account_type } = data;
    const checkUserInfo = await User.findOne({ email: email.toLowerCase() });
    if (checkUserInfo && checkUserInfo._id) {
      this.response = {
        success: false,
        message: "existing_user_signup_error",
      };
    } else {
        const encryptedPassword = await bcrypt.hash(password, 8);
        const createQuery = {
          email: email.toLowerCase(),
          password: encryptedPassword,
          first_name,
          last_name,
          account_type,
          is_active: 1,
          is_verified: 0,
          is_profile_completed: 0,
        };
        const userData = await User.create(createQuery);
        if (userData) {
          this.response = {
            success: true,
            message: "signup_successful",
            data: userData,
          };
        } else {
          this.response = {
            success: false,
            message: "signup_failed",
          };
        }
      
    }
    return this.response;
  }

  /**
   * Reset password
   */
  async resetPassword(data: IresetPassword) {
    const { email, password } = data;
    const users = await User.findOne({ email: email });
    if (users) {
      const encryptedNewPassword = await bcrypt.hash(password, 8);
      const query = { $set: { password: encryptedNewPassword } };
      await User.updateOne({ email: email }, query);
      this.response = {
        success: true,
        message: "password_changed_successfully",
      };
    } else {
      this.response = {
        success: false,
        message: "not_authorize_to_change_password",
      };
    }
    return this.response;
  }

  /**
   * Forgot password
   */
  async forgotPassword(data: IforgotPassword) {
    const { email } = data;
    const checkUserInfo = await User.findOne({ email: email.toLowerCase() });
    if (!checkUserInfo) {
      this.response = {
        success: false,
        message: "user_not_found_error",
      };
    } else {
      if (email) {
        const { otp } = await sendOtpEmail({
          email,
          type: "forgot-password-otp",
        });
        const dbData =
          (await dbConfig.secretManagerConnection()) as ISecretManagerData;
        const encryptedOtp = enc.Base64.stringify(
          HmacSHA256(otp?.toString(), dbData.cryptoKey)
        );
        const info = Object.assign({ encOtp: encryptedOtp });
        this.response = {
          success: true,
          message: "email_sent",
          data: info,
        };
      } else {
        this.response = {
          success: false,
          message: "something_went_wrong",
        };
      }
    }
    return this.response;
  }

  /**
   *
   * send OTP
   */
  async sendOtp(data: { email: string }) {
    const { email } = data;

    const query = { email: email.toLowerCase() };
    if (email) {
      const userDetail = await User.findOne(query);
      if (userDetail && Object.keys(userDetail).length > 0) {
        const { otp } = await sendOtpEmail({
          email,
          type: "forgot-password",
        });
        const dbData =
          (await dbConfig.secretManagerConnection()) as ISecretManagerData;

        const encryptedOtp = enc.Base64.stringify(
          HmacSHA256(otp.toString(), dbData.cryptoKey)
        );
        this.response = {
          success: true,
          message: "otp_send",
          data: encryptedOtp,
        };
      } else {
        this.response = {
          success: false,
          message: "no_user_found",
        };
      }
    } else {
      this.response = {
        success: false,
        message: "input_validation_error",
      };
    }

    return this.response;
  }

  /**
   * Verify otp
   */
  async otpVerification(data: IOtpVerificationtData) {
    const { email, encOtp, password, otp, accountType, otpVerificationType } =
      data;

    if (otp) {
      const dbData =
        (await dbConfig.secretManagerConnection()) as ISecretManagerData;

      const newOtpEncryption = enc.Base64.stringify(
        HmacSHA256(otp.toString(), dbData.cryptoKey)
      );

      if (encOtp === newOtpEncryption) {
        await User.findOne({
          email: email.toLowerCase(),
        });
        if (otpVerificationType === "signup") {
          const createQuery = {
            email: email,
            password: await bcrypt.hash(password, 8),
            account_type: accountType,
            is_active: 1,
            is_verified: 1,
            is_profile_completed: 0,
            rating_updated_for_self: false,
            rating_updated_for_others: false,
          };
          const userData = await User.create(createQuery);
          if (userData) {
            this.response = {
              success: true,
              message: "signup_successful",
              data: userData,
            };
          }
        } else {
          this.response = {
            success: true,
            message: "otp_matched",
          };
        }
      } else {
        this.response = {
          success: false,
          message: "otp_not_match",
        };
      }
    } else {
      this.response = {
        success: false,
        message: "input_validation_failed_msg",
      };
    }
    return this.response;
  }

  /**
   * Validate the auth token
   * @param data DataFromHeader
   * @returns
   */
  async matchToken(data: DataFromHeader) {
    const { id, token } = data;
    const userInfo = (
      await User.findOne({
        _id: id,
      })
        .select("-password")
        .populate({ path: "member_information" })
    ).toJSON();
    if (userInfo) {
      let userCurrentPlan;
      if (userInfo._id) {
        // userCurrentPlan = await getUserCu÷rrentPlan(userInfo._id);
      }
      this.response = {
        success: true,
        message: "token_matched",
        data: userInfo,
        token: token,
        userCurrentPlan: userCurrentPlan,
      };
    } else {
      this.response = {
        success: false,
        message: "user_not_found_error",
      };
    }
    return this.response;
  }

  appleclient = jwksClient({
    jwksUri: "https://appleid.apple.com/auth/keys",
  });

  getAppleSigningKey = async (kid) => {
    const key = await this.appleclient.getSigningKey(kid);
    const signingKey = key.getPublicKey();
    return signingKey;
  };

  verifyJWT = (json, publicKey) => {
    return new Promise((resolve) => {
      jwt.verify(json, publicKey, (err, payload) => {
        if (err) {
          return resolve(null);
        }

        resolve(payload);
      });
    });
  };

  /**
   * Apple signin
   */
  async appleLogin(data: IAppleLoginIn) {
    const { email, identityToken, fullName, fcmToken } = data;
    if (email && fullName && fullName.givenName) {
      const socialIdQuery = { email: email };
      const checkSocialIdExists = await User.findOne(socialIdQuery).populate(
        "member_information"
      );
      console.log("apple login email id", checkSocialIdExists);
      if (checkSocialIdExists && checkSocialIdExists.is_active) {
        const user = checkSocialIdExists;
        const tokenResult = await createToken(user);
        await User.updateOne({ email }, { $set: { fcm_token: fcmToken } });

        const returnOp = {
          status: true,
          statusCode: 200,
          message: "login_succ",
          matched: true,
          token: tokenResult,
          data: user,
        };
        if (returnOp) {
          return returnOp;
        }
      } else {
        const createQuery = {
          email: email,
          full_name: fullName.givenName,
          is_active: true,
          password: "default",
          account_type: "member",
          fcm_token: fcmToken,
          rating_updated_for_self: false,
          rating_updated_for_others: false,
        };
        const socialLoginSignin = await User.create(createQuery);
        if (socialLoginSignin) {
          const socialIdQuery = { email: email };
          const checkSocialIdExists = await User.findOne(
            socialIdQuery
          ).populate("member_information");
          if (checkSocialIdExists && checkSocialIdExists.is_active) {
            const user = checkSocialIdExists;
            const tokenResult = await createToken(user);
            const returnOp = {
              status: true,
              statusCode: 200,
              matched: true,
              message: "sign_succ",
              token: tokenResult,
              data: user,
            };
            if (returnOp) {
              return returnOp;
            }
          }
        }
      }
    } else {
      const json: {
        kid: string;
      } = jwt_decode(identityToken, { header: true });
      console.log(json.kid);
      const kid = json.kid;

      const appleKey = await this.getAppleSigningKey(kid);
      if (!appleKey) {
        const returnOp = {
          status: true,
          statusCode: 400,
          matched: false,
          message: "sign_unable",
          data: {},
        };
        if (returnOp) {
          return returnOp;
        }
      }
      const payload = await this.verifyJWT(identityToken, appleKey);
      if (!payload) {
        const returnOp = {
          status: true,
          statusCode: 400,
          matched: false,
          message: "sign_unable",
          data: {},
        };
        if (returnOp) {
          return returnOp;
        }
      }

      const socialIdQuery = { email: (payload as { email: string }).email };
      const checkSocialIdExists = await User.findOne(socialIdQuery).populate(
        "member_information"
      );
      if (checkSocialIdExists && checkSocialIdExists?.is_active) {
        await User.updateOne({ email }, { $set: { fcm_token: fcmToken } });
        const user = checkSocialIdExists;
        const tokenResult = await createToken(user);
        const returnOp = {
          status: true,
          statusCode: 200,
          matched: true,
          message: "login_succ",
          token: tokenResult,
          data: user,
        };
        if (returnOp) {
          return returnOp;
        }
      } else {
        const createQuery = {
          full_name: (payload as { email: string }).email
            .split("@")[0]
            .replace(BRACKET_MATCH_REGEX, " "),
          email: (payload as { email: string }).email,
          is_active: true,
          password: "default",
          account_type: "member",
          fcm_token: fcmToken,
          rating_updated_for_self: false,
          rating_updated_for_others: false,
        };
        const socialLoginSignin = await User.create(createQuery);
        if (socialLoginSignin) {
          const socialIdQuery = { email: (payload as { email: string }).email };
          const checkSocialIdExists = await User.findOne(
            socialIdQuery
          ).populate("member_information");
          console.log("apple login email id(else)", checkSocialIdExists);
          if (checkSocialIdExists.is_active) {
            const user = checkSocialIdExists;
            const tokenResult = await createToken(user);
            const returnOp = {
              status: true,
              statusCode: 200,
              matched: true,
              message: "login_succ",
              token: tokenResult,
              data: user,
            };
            if (returnOp) {
              return returnOp;
            }
          }
        }
      }
    }
  }

  /**
   * Social login/signup
   */
  socialLogin = async (data: ISocialSignIn) => {
    const { email, name, profile_image_path, account_type, fcmToken } = data;
    let user = {};

    // check socialId exist or not
    const query = { email: email };
    const checkSocialIdExists = await User.findOne(query).populate(
      "member_information"
    );
    let returnOp = {};
    console.log("checksocialid social login", checkSocialIdExists);
    // signup user or user login with social account first time
    if (!isEmpty(checkSocialIdExists)) {
      // sign in for that user
      if (checkSocialIdExists && checkSocialIdExists.is_active) {
        await User.updateOne({ email }, { $set: { fcm_token: fcmToken } });
        user = checkSocialIdExists;
        const tokenResult = await createToken(checkSocialIdExists);
        returnOp = {
          matched: true,
          statusCode: 200,
          token: tokenResult,
          message: "Login successfully.",
          data: user,
        };
      } else {
        returnOp = {
          matched: false,
          message: `User ${checkSocialIdExists.email} has been suspended by Admin.`,
        };
      }
    } else {
      // Check if the login account is a google or a facebook account:
      const createQuery = {
        email: email,
        full_name: name,
        profile_image: profile_image_path,
        account_type: account_type,
        fcm_token: fcmToken,
        rating_updated_for_self: false,
        rating_updated_for_others: false,
      };
      const createData = await User.create(createQuery);

      // Check if the details were inserted into database:
      if (createData) {
        const query = { email: email };
        // let userData: any = await User.findOne(query);
        const userData = await User.findOne(query).populate(
          "member_information"
        );
        // signup user or user login with social account first time
        if (userData) {
          // sign in for that user
          console.log("userdata", userData);
          user = userData;
          const tokenResult = await createToken(userData);
          returnOp = {
            matched: true,
            statusCode: 200,
            token: tokenResult,
            message: "User has been signin successfully.",
            data: user,
          };
        }
      }
    }
    returnOp = {
      ...returnOp,
    };
    return returnOp;
  };
}

export default new AuthServices();
