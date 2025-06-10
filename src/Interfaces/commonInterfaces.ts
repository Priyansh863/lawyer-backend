import { Method } from "axios";
import { IAddress } from "./addressInterface";
import { ISubscriptionPlanSchema } from "./schemaInterfaces";

export declare type Resolve = (value: string | PromiseLike<string>) => void;
export declare type Reject = (reason?: any) => void;

// response object interface
export declare interface ResponseObject {
  success: boolean;
  message: string;
  data?: unknown;
  token?: string;
  type?: string;
  user?: any;
  totalUsers?: number;
  current_count?: number;
  totalUsersSearch?: number;
  todayUsers?: number;
  todayUsersDeleted?: number;
  todayPayments?: any;
  todayReportedUsers?: any;
  totalReport?: number;
  totalRevenue?: number;
  received?: boolean;
  total_count?: number;
  inValidReceipt?: boolean;
  userCurrentPlan?: IUserActivePlan;
  totalActiveLounge?: any,
  totalActiveUserInLounge?: any,
  error?: any
}

// Env data interface
export interface envData {
  accessKeyId: string;
  secretAccessKey: string;
  awsRegion: string;
  secretManagerKey: string;
  awsConfigureProfile: string;
  elastic_master_user: string;
  elastic_master_user_password: string;
  elastic_domain_endpoint: string;
  env: string;
  port: number;
  apiUrl: string;
  jwtSecret: string;
  siteUrl: string;
  crypto_key: string;
  mongoUri: string;
  bucket: string;
  google_api_key: string;
  region: string;
}
// Env data interface
export interface ISecretManagerData {
  jwtSecretKey: string,
  cryptoKey: string,
  bucket: string,
  mongoUri: string,
  sendGridTestApiKey: string,
  sendGridSenderEmail: string,
  AmourAdminEmail: string,
  ElasticSearchDomain: string,
  elasticMasterUser: string,
  elasticMasterUserPassword: string,
  elasticDomainEndpoint: string,
  googleApiKey: string,
  region: string;
  inAppSecretCode: string;
  googleServiceEmail: string;
  googleServicePrivateKey: string
}

// Header interface
export interface DataFromHeader {
  id?: string;
  token?: string;
}
// Header interface
export interface DataForFilters {
  id?: string;
  token?: string;
  ageLower: number;
  ageUpper: number
  distance: number;
  location: { lat: number, lng: number };
  ethnicity: string;
}

// Google Api Params interface
export interface GoogleAPIParams {
  url: string;
  method: Method;
  params: any;
}

// Required skills interface
export interface RequiredSkill {
  value: string;
  label: string;
}

// Location interface
export interface Location {
  latitude: string;
  longitude: string;
  street: string;
  zip: string;
}

// Location Detail interface
export interface LocationDetailParams {
  lat: number;
  lng: number;
}

// Otp email interface
export interface SendOtpEmailResponse {
  response: any;
  otp: number;
}

// user addition email interface
export interface SendAddUserEmailResponse {
  response: any;
  otp: number;
}

// App report email interface
export interface SendAppReportEmailResponse {
  response: any;
}

// Token interface
export interface IToken {
  token: string;
}

// Social Signin interface
export interface ISocialSignIn {
  email: string;
  name: string;
  profile_image_path: string;
  account_type: string;
  password: string;
  fcmToken?: string
}

// Apple login interface
export interface IAppleLoginIn {
  email: string;
  fullName: any;
  identityToken: string;
  fcmToken?: string

}

//Personal info interface
export interface IPersonalInfo {
  fullName: string;
  about: string;
  image: string;
  additionalImages: Array<string>;
  deletedImages?: Array<string>;
  phone: string;
  gender: string;
  isNewImageUpload: boolean;
  userId: string;
  userName: string;
  bodyType: string;
  height: string;
  loveLanguage: string
  religion: string;
  salary: string;
  zodiacSign: string;
  dateOfBirth: Date;
  maritalStatus: string;
  location: IAddress;
  oldLocation: IAddress;
  children: string;
  ethnicity: string;
  body_type: string;
  apiRequestLocation?: string;
}

// Compatibility questionnaire interface
export interface ICompatibilityQuestionnaireRequestBody {
  userId: string;
  travelPreference: string;
  religion: string;
  height: string;
  size: string;
  salary: string;
  gender: string;
  publicAffectionPreference: string;
  communicationPreference: string;
  smokingDrinkingPreference: string
}

// User conection interface
export interface IUserConnection {
  from_user_id: string;
  to_user_id: string;
  matched?: number;
  status: string;
  reported_comment: string;
  updated_ts: string;
  from: string;
}

// Personal questionnaire request interface
export interface IPersonalQuestionnaireRequestObject {
  userId: string;
  availableTimeForDate: string;
  hopeFromApp: string;
  lastRelationship: string;
  personalityType: string;
  loveLanguage: string;
}

// Change profile interface
export interface IChangeProfilePassword {
  email: string;
  password: string;
  old_password: string;
  confirm_password: string;
}

// Login data interface

export interface LoginData {
  email: string;
  password: string;
  fcmToken: string;
}

// Forgot password interface
export interface IforgotPassword {
  email: string;
}

// Reset password interface
export interface IresetPassword {
  email: string;
  password: string;
}

export interface IupdatePassword {
  oldPassword: string;
  password: string;
  confirm_password: string;
}

export interface IupdateUserInformation {
  is_active: number;
}

export interface IPaymentData {
  _id?: string;
  user_id: string;
  plan_id: string;
  transaction_id: string;
  product: string;
  amount: number;
  transaction_date: number;
  mode: string;
  status: string;
}

export interface IPlanData {
  title: string;
  price: number;
  benefits: string;
  slug: string;
  plan_period: number;
}

export interface ITodo {
  title: string;
  description: string;
  date: string;
  time: string;
  is_completed: number;
}

export interface IPaymentsInterface {
  user_id: string;
  product: IAPProduct;
  end_date?: string;
  purchase_date?:string;
  plan_id?: string;
}
export interface IAPProduct {
  id: string;
  alias?: string;
  type: string;
  state: string;
  title: string;
  description: string;
  priceMicros: number;
  price: string;
  currency: string;
  loaded: boolean;
  valid: boolean;
  canPurchase: boolean;
  owned: boolean;
  downloading?: boolean;
  downloaded?: boolean;
  lastRenewalDate?: Date;
  expiryDate?: Date;
  introPrice?: string;
  introPriceMicros?: number;
  introPriceNumberOfPeriods?: number;
  introPriceSubscriptionPeriod?: string;
  introPricePaymentMode?: string;
  ineligibleForIntroPrice?: boolean;
  billingPeriod?: number;
  billingPeriodUnit?: string;
  trialPeriod?: number;
  trialPeriodUnit?: string;
  additionalData?: any;
  transaction?: PlayStoreReceipt | AppStoreReceipt;
  finish(): void;
  verify(): any;
  set(key: string, value: any): void;
  stateChanged(): void;
  on(event: string, callback: VoidFunction): void;
  once(event: string, callback: VoidFunction): void;
  off(callback: VoidFunction): void;
  trigger(action: string, args: any): void;
}
export interface PlayStoreReceipt {
  id: string;
  purchaseState: number;
  purchaseToken: string;
  receipt: string;
  signature: string;
  type: "android-playstore";
}
export interface AppStoreReceipt {
  id: string;
  appStoreReceipt: string;
  original_transaction_id: string;
  type: "ios-appstore";
}

export interface IUserActivePlan {
  _id: string
  user_id: string
  plan_id: string
  transaction_id: string
  transaction_date: number
  end_date: number
  amount: number
  mode: string
  status: string
  __v: number
  plan_info: ISubscriptionPlanSchema
}

export interface IPresignedData {
  filePath: string,
  fileFormat: string,

}

export interface IReportData {
  full_name: string, email: string, report: string
}
export interface IOtpVerificationtData {
  email: string, encOtp: string, password: string, otp: string, accountType: string, otpVerificationType: string
}

export interface ILoveLongeCreate {
  title: string;
  description: string;
  image: string;
  date: string;
  start_time: any;
  end_time: any;
}

export interface ElasticUserData {
  from_user_id: string,
  to_user_id: string,
  rating: number,
  status: number
}

export interface INotificationMessage {
  type: string,
  id?: string,
  content?: string,
  name?: string,
  to_user_id?: string,
  profile_image?: string,
  chatRequestId?: string,

}

export interface IEmailArguments {
  email: string;
  type: string;
}
export interface IReportProblemEmailArguments {
  email: string;
  full_name: string;
  report: string;
}

export interface PromiseReturnedData { status: string, value: ElasticUserData[] }
