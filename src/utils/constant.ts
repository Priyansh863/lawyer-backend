export const BRACKET_MATCH_REGEX = /[^a-zA-Z0-9 ]/g;

export const USER_CONNECTION_REQUEST_NOTIFICATION_TEXT =
  ':from_user_name is interested in your profile.';
export const USER_REACTION_DAY_COUNT = 5;
export const USER_OTHER_INFORMATION_INDEX = "user-other-information";
export const ELASTIC_INDEX_NAME_PREFIX = "amour";
export const ELASTIC_INDEX_STATUS_PENDING = 0;
export const ELASTIC_INDEX_STATUS_PROCESSING = 2;
export const ELASTIC_INDEX_STATUS_PROCESSED = 1;

export const ELASTIC_SEARCH_PORT = 443;
export const AWS_API_VERSION = "2010-12-01";

export const COMPLIMENTARY_PLAN_END_DATE = 30;

export const DEFAULT_SEARCH_RADIUS = "100mi";

export const ELASTIC_HAS_PARENT_QUERY = {
  "has_parent": {
    "parent_type": "parent",
    "query": {
      "match_all": {}
    }
  }
};

export const LAST_TIME_THIRTY_MINUTE = 30;
export const MATCH_TEXT_FOR_PUSH_NOTIFICATION = `You have a new match, be the first one to send a message`;
export const DISCREET_MATCH_TEXT_FOR_PUSH_NOTIFICATION = `You have a match for discreet meet. Be the first one to send a message`;
export const DISCREET_LIKE_TEXT_FOR_PUSH_NOTIFICATION = `Someone is interested for discreet meet with you, check now`;
export const MESSAGE_TEXT_FOR_PUSH_NOTIFICATION = `sent you a new message.`;
export const MESSAGE_TITLE_FOR_PUSH_NOTIFICATION = `New Messaage`;
export const MATCH_TITLE_FOR_PUSH_NOTIFICATION = `New Match`;
export const CHAT_REQUEST_TEXT_FOR_PUSH_NOTIFICATION = `You have received a direct message request from Love Lounge`;
export const CHAT_REQUEST_TITLE_FOR_PUSH_NOTIFICATION = `Chat Request`;
export const PAGE_ITEMS_LIMIT = 10;
export const CHAT_REQUEST_ACCEPT_TITLE_FOR_PUSH_NOTIFICATION = `Chat Request Accept`;
export const CHAT_REQUEST_ACCEPT_TEXT_FOR_PUSH_NOTIFICATION = `accepted your message request.`;
export const MESSAGE_TYPE_FOR_PUSH_NOTIFICATION = `message`;
export const MATCH_TYPE_FOR_PUSH_NOTIFICATION = `match`;
export const DISCREET_MATCH_TYPE_FOR_PUSH_NOTIFICATION = `discreet-match`;
export const DISCREET_LIKE_TYPE_FOR_PUSH_NOTIFICATION = "discreet-like";
export const CHAT_REQUEST_TYPE_FOR_PUSH_NOTIFICATION = "chat-requests";
export const CHAT_REQUEST_ACCEPT_TYPE_FOR_PUSH_NOTIFICATION = "chat-request-accept";
export const ADMIN_UPGRADE_PLAN = "admin";






