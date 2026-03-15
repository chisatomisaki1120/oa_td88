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

/** Reusable Prisma select for admin user list/detail responses */
export const USER_ADMIN_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  department: true,
  role: true,
  isActive: true,
  workStartTime: true,
  workEndTime: true,
  lateGraceMinutes: true,
  earlyLeaveGraceMinutes: true,
  workMode: true,
  allowedOffDaysPerMonth: true,
  createdAt: true,
} as const;

/** CSRF cookie options (shared between login and /auth/me) */
export const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};

/** Half-hour time slots for shift/work-time selectors */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});
