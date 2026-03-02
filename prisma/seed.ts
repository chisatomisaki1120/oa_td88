import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, Role, WorkMode } from "@prisma/client";
import bcrypt from "bcryptjs";

const dbPath = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: absoluteDbPath,
  }),
});

async function main() {
  const passwordHash = await bcrypt.hash("123456", 10);

  const defaultShift = await prisma.shift.upsert({
    where: { id: "default-shift" },
    update: {},
    create: {
      id: "default-shift",
      name: "Ca hành chính",
      startTime: "08:00",
      endTime: "17:00",
      lateGraceMinutes: 5,
      earlyLeaveGraceMinutes: 5,
      breakPolicyJson: JSON.stringify({
        wcSmoke: { maxCount: 3, maxMinutesEach: 10 },
        meal: { maxCount: 2, maxMinutesEach: 40 },
      }),
      isActive: true,
    },
  });

  const users = [
    { username: "superadmin", fullName: "Super Admin", role: Role.SUPER_ADMIN, department: "IT" },
    { username: "admin", fullName: "Admin", role: Role.ADMIN, department: "HR" },
    { username: "employee", fullName: "Nhân viên mẫu", role: Role.EMPLOYEE, department: "Ops" },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        department: u.department,
        workStartTime: "08:00",
        workEndTime: "17:00",
        lateGraceMinutes: 5,
        earlyLeaveGraceMinutes: 5,
        breakPolicyJson: JSON.stringify({
          wcSmoke: { maxCount: 3, maxMinutesEach: 10 },
          meal: { maxCount: 2, maxMinutesEach: 40 },
        }),
        workMode: WorkMode.OFFLINE,
        isActive: true,
      },
      create: {
        username: u.username,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        department: u.department,
        workStartTime: "08:00",
        workEndTime: "17:00",
        lateGraceMinutes: 5,
        earlyLeaveGraceMinutes: 5,
        breakPolicyJson: JSON.stringify({
          wcSmoke: { maxCount: 3, maxMinutesEach: 10 },
          meal: { maxCount: 2, maxMinutesEach: 40 },
        }),
        workMode: WorkMode.OFFLINE,
        isActive: true,
      },
    });

    await prisma.employeeShiftAssignment.upsert({
      where: { id: `assign-${user.id}` },
      update: {},
      create: {
        id: `assign-${user.id}`,
        userId: user.id,
        shiftId: defaultShift.id,
        effectiveFrom: new Date("2025-01-01T00:00:00.000+07:00"),
      },
    });
  }

  console.log("Seed complete. Default password for seeded users: 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
