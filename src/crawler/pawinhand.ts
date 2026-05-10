import "dotenv/config";

import { createPrismaClient } from "../lib/db";
import { importPawinhandFromBridge } from "../lib/pawinhand-crawl";

const prisma = createPrismaClient();

importPawinhandFromBridge(prisma)
  .then((result) => {
    console.log("포인핸드 브리지 반영 완료:", result);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
