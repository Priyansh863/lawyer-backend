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
import { console } from "inspector";

class AuthServices {
  /**
   * Standard response object
   */
  private response: ResponseObject;


  /**
   * Login
   */
  async login(data: LoginData) {
    const { email, password, pcId } = data;
    const query = { email: email.toLowerCase() };
    console.log("Login data:>>>>>>>>>>>>>>>", data);

    // First check if user exists
    const userInfo = await User.findOne(query);

    if (!userInfo) {
      this.response = {
        success: false,
        message: "no_user_found",
      };
      return this.response;
    }

    // Check if user is active
    if (!userInfo.is_active) {
      this.response = {
        success: false,
        message: "user_not_active",
      };
      return this.response;
    }

    // Check if user is verified
    if (!userInfo.is_verified) {
      // Send OTP for verification
      const otpResponse = await this.sendSignupOtp(email);
      if (otpResponse && otpResponse.success && otpResponse.data) {
        this.response = {
          success: false,
          message: "account_not_verified",
          data: {
            email: email,
            otp_expires: (otpResponse.data as { otp_expires: Date }).otp_expires,
            can_verify: true
          }
        };
      } else {
        this.response = {
          success: false,
          message: "failed_to_send_otp"
        };
      }
      return this.response;
    }

    // Verify password
    if (await bcrypt.compare(password.trim(), userInfo.password as string)) {
      // PC Login Validation: If pcId is provided, validate it against saved pcId
      if (pcId && pcId.trim() !== '') {
        // This is a PC login attempt - validate PC ID and license status

        // Check 1: If pcLicenseStatus is RESET, block login
        if (userInfo.pcLicenseStatus === 'RESET') {
          this.response = {
            success: false,
            message: "Please register your PC on the website",
          };
          return this.response;
        }

        // Check 2: If user doesn't have a saved PC ID, block login
        const savedPcId = userInfo.pcId;
        if (!savedPcId || savedPcId.trim() === '') {
          this.response = {
            success: false,
            message: "PC ID not registered",
          };
          return this.response;
        }

        // Check 3: Compare provided pcId with saved pcId
        if (savedPcId.trim() !== pcId.trim()) {
          // PC ID doesn't match - block login
          this.response = {
            success: false,
            message: "This PC is not authorized",
          };
          return this.response;
        }

        // All checks passed - PC ID matches and license is active
        console.log("PC login validated successfully for user:", email);
      } else {
        // No pcId provided - this is a website login, proceed normally
        console.log("Website login for user:", email);
      }

      // Generate a JWT token
      const dbData = await dbConfig.secretManagerConnection();
      const token = jwt.sign(
        { _id: userInfo._id, email: userInfo.email, account_type: userInfo.account_type },
        dbData.jwtSecretKey as string,
        { expiresIn: "1y" }
      );

      const userData = await User.findOne(query).select("-password");
      return { success: true, message: "login_successful", data: { userData, token } };
    } else {
      this.response = {
        success: false,
        message: "credentials_not_match",
      };
    }

    return this.response;
  }

  /**
   * Admin Login
   */
  async adminLogin(data: LoginData) {
    console.log("Admin Login data:>>>>>>>>>>>>>>>", data);
    const { email, password } = data;
    const query = { email: email.toLowerCase() };

    console.log("Admin Login data:>>>>>>>>>>>>>>>", query);

    // Find user
    const userInfo = await User.findOne(query);
    console.log("Admin Login userInfo:>>>>>>>>>>>>>>>", userInfo);

    if (!userInfo) {
      return { success: false, message: "user_not_found" };
    }

    // Verify password
    if (await bcrypt.compare(password.trim(), userInfo.password as string)) {
      const dbData = await dbConfig.secretManagerConnection();
      const token = jwt.sign(
        { _id: userInfo._id, email: userInfo.email, account_type: userInfo.account_type },
        dbData.jwtSecretKey as string,
        { expiresIn: "1h" }
      );
      const userData = await User.findOne(query).select("-password");
      return { success: true, message: "admin_login_successful", data: { userData, token } };
    } else {
      return { success: false, message: "credentials_not_match" };
    }
  }

  /**
   * Generate a random OTP
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Sign up with OTP
   */
  async signup(data: IUserSchema) {
    const { email, password, first_name, last_name, account_type } = data;

    // Check if user already exists
    const checkUserInfo = await User.findOne({ email: email.toLowerCase() });
    if (checkUserInfo && checkUserInfo._id) {
      // If user exists but is not verified, we can resend OTP
      if (!checkUserInfo.is_verified) {
        return this.sendSignupOtp(email);
      }

      this.response = {
        success: false,
        message: "existing_user_signup_error",
      };
      return this.response;
    }

    // Generate OTP and set expiration (10 minutes from now)
    const otp = this.generateOtp();
    console.log("otp>>>>>>>>>>>>signup", otp);

    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 10);

    // Encrypt the OTP before storing
    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const encryptedOtp = enc.Base64.stringify(
      HmacSHA256(otp, dbData.cryptoKey)
    );

    try {
      // Create user with hashed password and OTP
      const encryptedPassword = await bcrypt.hash(password, 8);
      const userData = await User.create({
        email: email.toLowerCase(),
        password: encryptedPassword,
        first_name,
        last_name,
        account_type,
        is_active: 1,
        is_verified: 0,
        is_profile_completed: 0,
        otp: encryptedOtp,
        otp_expires: otpExpires,
      });

      if (userData) {
        // Generate a token for the new user
        const token = jwt.sign(
          { _id: userData._id, email: userData.email },
          dbData.jwtSecretKey as string,
          { expiresIn: "1y" }
        );

        // Send OTP to user's email
        await sendOtpEmail({
          email: email.toLowerCase(),
          otp: otp,
          type: "signup-otp",
          name: first_name,
        });

        this.response = {
          success: true,
          message: "otp_sent",
          data: {
            email: userData.email,
            otp_expires: otpExpires,
            token,
            otp: otp, // Include OTP for development (since email service may not be working)
          },
        };
      } else {
        this.response = {
          success: false,
          message: "signup_failed",
        };
      }
    } catch (error) {
      console.error("Error during signup:", error);
      this.response = {
        success: false,
        message: "server_error",
      };
    }

    return this.response;
  }

  /**
   * Send OTP for signup
   */
  async sendSignupOtp(email: string) {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      this.response = {
        success: false,
        message: 'user_not_found'
      };
      return this.response;
    }

    // Generate new OTP
    const otp = this.generateOtp();
    console.log("otp>>>>>>>>>>>>", otp);
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 10);

    // Encrypt the OTP before storing
    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const encryptedOtp = enc.Base64.stringify(
      HmacSHA256(otp, dbData.cryptoKey)
    );

    try {
      // Update user with new OTP
      await User.updateOne(
        { email: email.toLowerCase() },
        {
          $set: {
            otp: encryptedOtp,
            otp_expires: otpExpires
          }
        }
      );

      // Send OTP to user's email
      await sendOtpEmail({
        email: email.toLowerCase(),
        otp: otp,
        type: 'signup-otp',
        name: user.first_name || 'User'
      });

      this.response = {
        success: true,
        message: 'otp_sent_successfully',
        data: {
          email: email,
          otp_expires: otpExpires,
          otp: otp, // Include OTP for development (since email service may not be working)
          message: `Your verification OTP is: ${otp}. This OTP will expire in 10 minutes.`
        }
      };
    } catch (error) {
      console.error('Error sending OTP:', error);
      this.response = {
        success: false,
        message: 'failed_to_send_otp'
      };
    }

    return this.response;
  }

  /**
   * Verify OTP for signup
   */
  async verifySignupOtp(email: string, otp: string) {
    // Get the latest user data from the database to ensure we have the most recent OTP
    // Explicitly include otp and otp_expires fields which are normally excluded
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+otp +otp_expires');

    if (!user) {
      this.response = {
        success: false,
        message: 'user_not_found'
      };
      return this.response;
    }

    // Check if OTP exists and is not expired
    const currentTime = new Date();
    if (!user.otp || !user.otp_expires) {
      this.response = {
        success: false,
        message: 'no_otp_found'
      };
      return this.response;
    }

    // Check if OTP is expired
    if (currentTime > user.otp_expires) {
      this.response = {
        success: false,
        message: 'otp_expired',
        data: { canResend: true }
      };
      return this.response;
    }

    // Verify OTP
    const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
    const encryptedOtp = enc.Base64.stringify(
      HmacSHA256(otp, dbData.cryptoKey)
    );

    if (encryptedOtp !== user.otp) {
      this.response = {
        success: false,
        message: 'invalid_otp'
      };
      return this.response;
    }

    try {
      // Update user as verified and clear OTP
      const updatedUser = await User.findOneAndUpdate(
        { email: email.toLowerCase() },
        {
          $set: {
            is_verified: 1,
            is_active: 1,
            otp: null,
            otp_expires: null
          }
        },
        { new: true }
      ).select('-password -otp -otp_expires');

      if (!updatedUser) {
        throw new Error('Failed to update user');
      }

      // Generate auth token
      const jwtData = await dbConfig.secretManagerConnection();
      const token = jwt.sign(
        { _id: updatedUser._id, email: updatedUser.email, account_type: updatedUser.account_type },
        dbData.jwtSecretKey as string,

        { expiresIn: "1y" }
      );

      this.response = {
        success: true,
        message: 'account_verified',
        data: {
          user: updatedUser,
          token
        }
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      this.response = {
        success: false,
        message: 'verification_failed'
      };
    }

    return this.response;
  }

  /**
   * Reset password
   */
  async resetPassword(data: IresetPassword) {
    const { email, newPassword } = data;
    const users = await User.findOne({ email: email });
    if (users) {
      const encryptedNewPassword = await bcrypt.hash(newPassword, 8);
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

        const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
        const encryptedOtp = enc.Base64.stringify(
          HmacSHA256(otp?.toString(), dbData.cryptoKey)
        );

        // Store OTP in user record for verification
        await User.updateOne(
          { email: email.toLowerCase() },
          {
            $set: {
              otp: encryptedOtp,
              otp_expires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
            }
          }
        );

        const info = {
          encOtp: encryptedOtp,
          otp: otp, // Include OTP for development (since SendGrid is not working)
          email: email,
          otp_expires: new Date(Date.now() + 10 * 60 * 1000),
          message: `Your password reset OTP is: ${otp}. This OTP will expire in 10 minutes.`
        };

        this.response = {
          success: true,
          message: "otp_sent_successfully",
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
    const dbData = await dbConfig.secretManagerConnection();
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
            const tokenResult = jwt.sign({ _id: user._id, email: user.email, account_type: user.account_type }, dbData.jwtSecretKey as string,
              { expiresIn: "1y" });
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
        const tokenResult = jwt.sign({ _id: user._id, email: user.email, account_type: user.account_type }, dbData.jwtSecretKey as string, { expiresIn: "1y" });
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
            const tokenResult = jwt.sign({ _id: user._id, email: user.email, account_type: user.account_type }, dbData.jwtSecretKey as string, { expiresIn: "1y" });
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

  /**
   * Validate Token - Check if JWT token is expired
   */
  async validateToken(data: { token: string; tone?: string }) {
    const { token, tone } = data;

    try {
      const dbData = await dbConfig.secretManagerConnection();
      const decoded = jwt.verify(token, dbData.jwtSecretKey) as any;

      // Check if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = decoded.exp < currentTime;

      if (isExpired) {
        return {
          success: false,
          message: tone === 'friendly' ? 'Your session has expired. Please log in again!' : 'Token has expired',
          data: {
            expired: true,
            isExpired: true,
            expiredAt: new Date(decoded.exp * 1000).toISOString()
          }
        };
      } else {
        // Token is valid
        const timeUntilExpiry = decoded.exp - currentTime;
        return {
          success: true,
          message: tone === 'friendly' ? 'Your session is still active!' : 'Token is valid',
          data: {
            expired: false,
            isExpired: false,
            userId: decoded.id,
            expiresAt: new Date(decoded.exp * 1000).toISOString(),
            timeUntilExpiry: timeUntilExpiry,
            issuedAt: new Date(decoded.iat * 1000).toISOString()
          }
        };
      }
    } catch (error: any) {
      // Token is invalid or malformed
      console.error('Token validation error:', error.message);
      return {
        success: false,
        message: tone === 'friendly' ? 'Invalid session. Please log in again!' : 'Invalid token',
        data: {
          expired: true,
          isExpired: true,
          error: error.message
        }
      };
    }
  }

  /**
   * Create Client by Lawyer - Client Onboarding
   */
  async createClientByLawyer(data: {
    lawyer_id: string;
    client_first_name: string;
    client_last_name?: string;
    client_email: string;
    client_password: string;
    client_phone?: string;
  }) {
    try {
      const { lawyer_id, client_first_name, client_last_name, client_email, client_password, client_phone } = data;

      // Check if lawyer exists
      const lawyer = await User.findById(lawyer_id);
      if (!lawyer || lawyer.account_type !== 'lawyer') {
        this.response = {
          success: false,
          message: "Invalid lawyer ID or lawyer not found"
        };
        return this.response;
      }

      // Check if client email already exists
      const existingClient = await User.findOne({ email: client_email.toLowerCase() });
      if (existingClient) {
        this.response = {
          success: false,
          message: "Client with this email already exists"
        };
        return this.response;
      }

      // Get database configuration for password hashing
      const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;

      // Hash the password
      const hashedPassword = enc.Base64.stringify(
        HmacSHA256(client_password, dbData.cryptoKey)
      );

      // Create new client
      const newClient = new User({
        first_name: client_first_name,
        last_name: client_last_name || "",
        email: client_email.toLowerCase(),
        password: hashedPassword,
        phone: client_phone || "",
        account_type: 'client',
        is_active: 1,
        is_verified: 1, // Auto-verify clients created by lawyers
        is_profile_completed: 1,
        created_at: new Date(),
        updated_at: new Date()
      });

      const savedClient = await newClient.save();

      // Generate JWT token for the new client
      const token = jwt.sign(
        {
          _id: savedClient._id,
          email: savedClient.email,
          account_type: savedClient.account_type
        },
        dbData.jwtSecretKey as string,
        { expiresIn: "1y" }
      );

      // Remove password from response
      const clientData = savedClient.toObject();
      delete clientData.password;

      this.response = {
        success: true,
        message: "Client created successfully",
        data: {
          client: clientData,
          token: token,
          created_by_lawyer: lawyer_id
        }
      };

      return this.response;
    } catch (error: any) {
      console.error('Error creating client:', error);
      this.response = {
        success: false,
        message: error.message || "Failed to create client"
      };
      return this.response;
    }
  }

}

export default new AuthServices();
