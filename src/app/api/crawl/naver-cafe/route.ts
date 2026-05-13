import { NextResponse } from "next/server";

import { naverCafeLog } from "@/lib/naver-cafe/debug-log";
import { prisma } from "@/lib/db";
import { persistCafePostsAndNotify } from "@/lib/naver-cafe/persist-and-notify";
import { runNaverCafeCrawl } from "@/lib/naver-cafe/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return true;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * 구피사랑 모바일 카페(지정 게시판) Playwright 크롤 → SQLite 저장 → 알림·Discord.
 * 세션: `storage/naver-session.json` (npm run naver-cafe:login)
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      maxListPerBoard?: number;
      maxNewDetails?: number;
    };

    naverCafeLog("API POST /api/crawl/naver-cafe", body);

    const crawl = await runNaverCafeCrawl(prisma, {
      maxListPerBoard: body.maxListPerBoard,
      maxNewDetails: body.maxNewDetails
    });

    if (crawl.error && crawl.posts.length === 0) {
      naverCafeLog("API crawl early exit (error, no posts)", crawl.error);
      return NextResponse.json(
        {
          ok: false,
          error: crawl.error,
          crawl,
          persist: { created: 0, updated: 0, discordSent: 0, skippedExisting: 0, errors: [] as string[] }
        },
        { status: 400 }
      );
    }

    const persist = await persistCafePostsAndNotify(prisma, crawl.posts);

    naverCafeLog("API response summary", {
      postsFound: crawl.posts.length,
      boardErrorCount: crawl.boardErrors.length,
      persist
    });

    return NextResponse.json({
      ok: true,
      crawl: {
        postsFound: crawl.posts.length,
        boardErrors: crawl.boardErrors,
        note: crawl.note
      },
      persist
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    naverCafeLog("API POST failed", message, error instanceof Error ? error.stack : "");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
