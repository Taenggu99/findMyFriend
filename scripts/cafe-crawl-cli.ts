/**
 * Next 서버 없이 구피사랑 카페 크롤 → Prisma DB 저장 → Discord(알림 매칭 시).
 * 로컬: `npm run cafe:crawl` (`npm run naver-cafe:login`으로 만든 storage/naver-session.json 필요)
 * CI: Secret `NAVER_CAFE_SESSION_JSON`으로 세션 파일을 쓴 뒤 동일 명령
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../src/lib/db";
import { runNaverCafeCrawl } from "../src/lib/naver-cafe/crawler";
import { persistCafePostsAndNotify } from "../src/lib/naver-cafe/persist-and-notify";
import { defaultNaverSessionPath } from "../src/lib/naver-cafe/paths";

function writeSessionFromEnvIfSet(): void {
  const raw = process.env.NAVER_CAFE_SESSION_JSON?.trim();
  if (!raw) return;
  const target = defaultNaverSessionPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, raw, "utf8");
  console.log("[cafe:crawl] wrote session from NAVER_CAFE_SESSION_JSON →", target);
}

async function main(): Promise<void> {
  writeSessionFromEnvIfSet();

  const sessionPath = defaultNaverSessionPath();
  if (!fs.existsSync(sessionPath)) {
    console.error("[cafe:crawl] missing session file:", sessionPath);
    console.error("  Local: npm run naver-cafe:login   CI: set NAVER_CAFE_SESSION_JSON secret");
    process.exit(1);
  }

  const maxList = parseInt(process.env.NAVER_CAFE_CRAWL_MAX_LIST ?? "", 10);
  const maxDetails = parseInt(process.env.NAVER_CAFE_CRAWL_MAX_DETAILS ?? "", 10);

  const crawl = await runNaverCafeCrawl(prisma, {
    maxListPerBoard: Number.isFinite(maxList) && maxList > 0 ? maxList : undefined,
    maxNewDetails: Number.isFinite(maxDetails) && maxDetails > 0 ? maxDetails : undefined
  });

  console.log("[cafe:crawl] crawl summary", {
    ok: crawl.ok,
    posts: crawl.posts.length,
    error: crawl.error ?? null,
    boardErrors: crawl.boardErrors?.length ?? 0
  });

  if (crawl.error && crawl.posts.length === 0) {
    await prisma.$disconnect();
    process.exit(1);
  }

  const persist = await persistCafePostsAndNotify(prisma, crawl.posts);
  console.log("[cafe:crawl] persist", persist);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
