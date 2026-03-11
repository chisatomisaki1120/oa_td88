/** Session cookie lasts 14 days before requiring re-login */
export const SESSION_DAYS = 14;

/** Touch session lastSeenAt every 60 seconds */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/** Rate limit: max failed login attempts within the window */
export const LOGIN_MAX_ATTEMPTS = 10;

/** Rate limit: window duration in milliseconds (10 minutes) */
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

/** Default attendance record limit per admin query */
export const ATTENDANCE_DEFAULT_LIMIT = 200;

/** Maximum attendance records per admin query */
export const ATTENDANCE_MAX_LIMIT = 500;

/** Valid warning flags for attendance */
export const WARNING_FLAGS = [
  "WC_COUNT_EXCEEDED",
  "SMOKE_COUNT_EXCEEDED",
  "MEAL_COUNT_EXCEEDED",
  "WC_DURATION_EXCEEDED",
  "SMOKE_DURATION_EXCEEDED",
  "MEAL_DURATION_EXCEEDED",
  "EARLY_LEAVE",
  "LATE",
] as const;

/** Time format regex (strict: 00:00 - 23:59) */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Password minimum length */
export const PASSWORD_MIN_LENGTH = 6;
