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

export function attendanceStatusLabel(status: string) {
  switch (status) {
    case "PRESENT":
      return "Có mặt";
    case "LATE":
      return "Đi muộn";
    case "EARLY_LEAVE":
      return "Về sớm";
    case "ABSENT":
      return "Vắng mặt";
    case "INCOMPLETE":
      return "Chưa đủ dữ liệu";
    case "OFF":
      return "Nghỉ";
    default:
      return status;
  }
}

export function breakTypeLabel(type: string) {
  switch (type) {
    case "WC_SMOKE":
      return "Vệ sinh/Hút thuốc";
    case "MEAL":
      return "Ăn cơm";
    case "OTHER":
      return "Khác";
    default:
      return type;
  }
}
