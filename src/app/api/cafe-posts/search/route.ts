import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { GUPPI_LOVE_BOARDS, isLoveShareCompletedTitle } from "@/lib/naver-cafe/boards";
import { cafeAlertMatchesPost } from "@/lib/naver-cafe/match-alert";

export const dynamic = "force-dynamic";

type Body = {
  boardKeys?: string[];
  listingKind?: string;
  regions?: string[];
  /** 비어 있으면 키워드 필터 없음(게시판·유형·지역만 적용) */
  keywordPhrases?: string[];
};

const BOARD_KEY_SET = new Set(GUPPI_LOVE_BOARDS.map((b) => b.key));
const BOARD_DISPLAY_LABEL = Object.fromEntries(GUPPI_LOVE_BOARDS.map((b) => [b.key, b.displayLabel])) as Record<
  string,
  string
>;

export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ message: "JSON 본문이 필요합니다." }, { status: 400 });
    }

    const rawBoards = Array.isArray(body.boardKeys) ? body.boardKeys : [];
    const boardKeys = rawBoards.filter((k) => typeof k === "string" && BOARD_KEY_SET.has(k));
    const keysToSearch =
      boardKeys.length > 0 ? boardKeys : GUPPI_LOVE_BOARDS.map((b) => b.key);

    const listingKindRaw = (body.listingKind ?? "any").trim().toLowerCase();
    const listingKind = ["any", "sharing", "trade"].includes(listingKindRaw) ? listingKindRaw : "any";

    const regions = Array.isArray(body.regions)
      ? body.regions.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    const keywordPhrases = Array.isArray(body.keywordPhrases)
      ? body.keywordPhrases
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim())
      : [];

    const synthetic = {
      boardKeysJson: JSON.stringify(keysToSearch),
      listingKind,
      regionsJson: JSON.stringify(regions),
      keywordPhrasesJson: JSON.stringify(keywordPhrases)
    };

    const candidates = await prisma.cafeCrawledPost.findMany({
      where: { boardKey: { in: keysToSearch } },
      orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
      take: 500
    });
    type CrawledRow = (typeof candidates)[number];

    const matched = candidates
      .filter((p: CrawledRow) => {
        if (p.boardKey === "love_share" && isLoveShareCompletedTitle(p.title)) {
          return false;
        }
        return cafeAlertMatchesPost(synthetic, p);
      })
      .slice(0, 100);

    const posts = matched.map((p: CrawledRow) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      boardLabel: BOARD_DISPLAY_LABEL[p.boardKey] ?? p.boardLabel,
      boardKey: p.boardKey,
      postKind: p.postKind,
      titleRegion: p.titleRegion,
      tradeStatus: p.tradeStatus,
      contentSnippet: p.contentSnippet,
      thumbnailUrl: p.thumbnailUrl,
      postedAt: p.postedAt ? p.postedAt.toISOString() : null
    }));

    return NextResponse.json({ total: posts.length, posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message, posts: [], total: 0 }, { status: 500 });
  }
}
