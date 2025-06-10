import { ObjectId } from "mongoose";
import { IAddress } from "./addressInterface";

export interface NotifySchema {
  email: string;
}

export interface Reported {
  reported_comment: string;
  created_at: string;
  user_id: string;
}

export interface IUserSchema {
  _id?: string;
  account_type?: string;
  first_name: string;
  last_name?: string;
  about: string;
  user_name: string;
  email?: string;
  password?: string;
  profile_image?: string;
  additional_images?: Array<string>;
  phone: string;
  is_active?: number;
  is_verified?: number;
  is_profile_completed?: number;
  fcm_token?: string;
  rating_updated_for_self?: boolean;
  rating_updated_for_others?: boolean;
}

// Admin Schema interface
export interface IAdminSchema {
  _id?: string;
  full_name: string;
  email: string;
  password: string;
  profile_image?: string;
  phone: string;
  is_active?: number;
  is_verified?: number;
  contact_number?: number;
  help_line_number?: number;
  help_line_email_id?: string;
}
// backend logs schema
export interface IBackendLogsSchema {
  _id?: string;
  user_id: string;
  error: string;
  data: string;
  created_ts: number;
}
// backend logs schema
export interface IUserRatingCorrectionByLocationSchema {
  user_id: string;
  location: IAddress;
  created_ts: number;
}

// Member Schema interface
export interface IMemberSchema {
  _id?: string;
  plan_id?: string;
  user_id: string;
  subscription_id?: string;
  expiry_date?: Date;
  status?: string;
  plan_benefits?: NonNullable<unknown>;
  reported?: Array<Reported>;
  personal_info?: {
    gender: string;
    date_of_birth: Date;
    marital_status: string;
    location: string;
    height: string;
    body_type: string;
    religion: string;
    ethnicity: string;
    no_of_children: number;
    intimacy_experience: string;
    salary?: number;
    zodiac_sign: string;
  };
  compatibility_questionnaire?: {
    intimacy_preference: string;
    travel_preference: string;
    religious_preference: string;
    height_preference: string;
    size_preference: string;
    salary_preference: string;
    gender_preference: string;
    public_affection_preference: string;
    communication_preference: string;
  };
  personal_questionnaire?: {
    avaliable_time_for_date: string;
    type_of_personality: string;
    hope_from_app: string;
    last_relationship: string;
    love_language: string;
  };
  notification?: number;
  location: IAddress;
  old_location?: IAddress;
}

// Heart Rating Schema interface
export interface IHeartRatingSchema {
  _id: string;
  from_user_id: string;
  to_user_id: string;
  rating: number;
  location: NonNullable<unknown>;
  ethinicity: string;
  age: number;
}
// Subscription plan Schema interface

export interface ISubscriptionPlanSchema {
  _id?: string;
  title: string;
  price: number;
  benefits: IPlanBenefits;
  slug: string;
  plan_period: number;
  is_active: boolean;
}

// Plan Benefits
export interface IPlanBenefits {
  time_period: number;
  message: string;
  send_hearts: string;
  see_who_likes_you: string;
  check_your_loved_one: string;
  see_complete_profile: string;
  love_lounge: string;
  discreet_meet: string;
  giveaway: string;
}
// User Schema interface
export interface IPaymentSchema {
  _id?: string;
  user_id: string;
  plan_id: string;
  product_id: string;
  transaction_id: string;
  user_membership_id: string;
  transaction_date: number;
  amount: number;
  mode: string;
  payment_status: string;
  status: string;
}

// User Complimentary Membership Schema interface
export interface IUserMembershipSchema {
  _id?: string;
  user_id: string;
  plan_id: string;
  product_id?: string;
  subscription_id: string;
  original_subscription_id: string;
  orginal_plan_id: string;
  start_date: number;
  end_date: number;
  status: boolean;
  membership_type: string;
}

// User Connection Schema interface

export interface IUserConnectionSchema {
  from_user_id: string;
  to_user_id: string;
  matched: number;
}

//Chat Schema interface
export interface IChatSchema {
  sender_id: ObjectId;
  receiver_id: ObjectId;
  channel: string;
  sender_last_seen: Date;
  receiver_last_seen: Date;
  unread_messages: {
    [x: string]: string;
  };
  is_active: number;
}

//Chat Request Schema interface
export interface IChatRequestSchema {
  sender_id: ObjectId;
  receiver_id: ObjectId;
  status: string;
}
export interface ITodo {
  title: string;
  description: string;
  date: string;
  time: string;
}

export interface ILoveLonges {
  title: string;
  description: string;
  image?: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface ILoveLongeRooms {
  enrolled_users: string;
  location: string;
  enrolled_counter: string;
  chat_room_id: string;
  love_longe_id: string;
}

export interface ILoveLongeCreate {
  title: string;
  description: string;
  image: string;
  date: string;
  start_time: any;
  end_time: any;
}

export interface IShowLoveLonge {
  title: string;
  description: string;
  image: string;
  date: any;
  start_time: number;
  end_time: number;
  location: string;
}
