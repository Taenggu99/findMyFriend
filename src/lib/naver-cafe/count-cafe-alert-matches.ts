import type { CafeUserAlert, PrismaClient } from "@prisma/client";

import { cafeAlertMatchesPost } from "@/lib/naver-cafe/match-alert";

/** 최근 크롤 글 기준으로 조건에 맞는 건수(상한 500). */
export async function countCafeMatchesForAlert(
  prisma: PrismaClient,
  alert: Pick<CafeUserAlert, "boardKeysJson" | "listingKind" | "regionsJson" | "keywordPhrasesJson">
): Promise<number> {
  const posts = await prisma.cafeCrawledPost.findMany({
    take: 500,
    orderBy: [{ firstSeenAt: "desc" }]
  });
  let n = 0;
  for (const p of posts) {
    if (cafeAlertMatchesPost(alert, p)) n++;
  }
  return n;
}
