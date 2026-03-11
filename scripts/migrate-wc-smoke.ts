import { prisma } from "../lib/prisma";

async function main() {
  const count = await prisma.$executeRawUnsafe(
    `UPDATE BreakSession SET breakType = 'WC' WHERE breakType = 'WC_SMOKE'`
  );
  console.log(`Migrated ${count} WC_SMOKE → WC`);

  // Also update old breakPolicyJson formats
  const users = await prisma.$executeRawUnsafe(
    `UPDATE User SET breakPolicyJson = REPLACE(breakPolicyJson, '"wcSmoke"', '"wc"') WHERE breakPolicyJson LIKE '%"wcSmoke"%'`
  );
  console.log(`Updated ${users} user breakPolicyJson`);

  const shifts = await prisma.$executeRawUnsafe(
    `UPDATE Shift SET breakPolicyJson = REPLACE(breakPolicyJson, '"wcSmoke"', '"wc"') WHERE breakPolicyJson LIKE '%"wcSmoke"%'`
  );
  console.log(`Updated ${shifts} shift breakPolicyJson`);

  await prisma.$disconnect();
}

main();
