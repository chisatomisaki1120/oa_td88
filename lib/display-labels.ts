export function roleLabel(role: string) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Siêu quản trị";
    case "ADMIN":
      return "Quản trị viên";
    case "EMPLOYEE":
      return "Nhân viên";
    default:
      return role;
  }
}

export function workModeLabel(mode: string) {
  switch (mode) {
    case "OFFLINE":
      return "Offline";
    case "ONLINE":
      return "Online";
    default:
      return mode;
  }
}

export function attendanceStatusLabel(status: string, hasCheckedOut?: boolean) {
  switch (status) {
    case "PRESENT":
      return hasCheckedOut ? "Đã tan ca" : "Có mặt";
    case "LATE":
      return hasCheckedOut ? "Đã tan ca (muộn)" : "Đi muộn";
    case "EARLY_LEAVE":
      return "Về sớm";
    case "ABSENT":
      return "Vắng mặt";
    case "INCOMPLETE":
      return "Đang làm";
    case "OFF":
      return "Nghỉ";
    default:
      return status;
  }
}

export function breakTypeLabel(type: string) {
  switch (type) {
    case "WC":
      return "Vệ sinh";
    case "SMOKE":
      return "Hút thuốc";
    case "MEAL":
      return "Ăn cơm";
    case "OTHER":
      return "Khác";
    default:
      return type;
  }
}

export function warningLabel(warning: string) {
  switch (warning) {
    case "WC_COUNT_EXCEEDED":
      return "Vượt số lần VS";
    case "SMOKE_COUNT_EXCEEDED":
      return "Vượt số lần hút thuốc";
    case "MEAL_COUNT_EXCEEDED":
      return "Vượt số lần ăn";
    case "WC_DURATION_EXCEEDED":
      return "Vượt thời gian VS";
    case "SMOKE_DURATION_EXCEEDED":
      return "Vượt thời gian hút thuốc";
    case "MEAL_DURATION_EXCEEDED":
      return "Vượt thời gian ăn";
    case "EARLY_LEAVE":
      return "Về sớm";
    case "OFF_DAY_DEDUCTED":
      return "Nghỉ trừ phép";
    case "OFF_DAY_ALLOWED":
      return "Nghỉ có phép";
    case "ANNUAL_LEAVE":
      return "Nghỉ phép năm";
    default:
      return warning;
  }
}

export function parseWarnings(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
