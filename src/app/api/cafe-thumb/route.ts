import { NextResponse } from "next/server";

import { isAllowedCafeThumbnailFetchHost } from "@/lib/naver-cafe/thumbnail-proxy-allowlist";

export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * 네이버 카페·pstatic 이미지는 Referer 없음/로컬 Referer에서 차단되는 경우가 많아,
 * 카페 모바일 도메인을 붙여 서버에서 받아 같은 출처로 내려줍니다.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u");
  if (!raw?.trim()) {
    return NextResponse.json({ message: "쿼리 u(이미지 URL)가 필요합니다." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ message: "잘못된 URL입니다." }, { status: 400 });
  }

  if (target.protocol !== "https:") {
    return NextResponse.json({ message: "https URL만 허용됩니다." }, { status: 400 });
  }

  if (!isAllowedCafeThumbnailFetchHost(target.hostname)) {
    return NextResponse.json({ message: "허용되지 않은 호스트입니다." }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.href, {
      headers: {
        Referer: "https://m.cafe.naver.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return NextResponse.json({ message: "이미지를 가져오지 못했습니다." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ message: `원본 응답 ${upstream.status}` }, { status: 502 });
  }

  let finalUrl: URL;
  try {
    finalUrl = new URL(upstream.url);
  } catch {
    return NextResponse.json({ message: "리다이렉트 URL이 올바르지 않습니다." }, { status: 502 });
  }

  if (finalUrl.protocol !== "https:" || !isAllowedCafeThumbnailFetchHost(finalUrl.hostname)) {
    return NextResponse.json({ message: "리다이렉트 대상이 허용 목록에 없습니다." }, { status: 403 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ message: "이미지가 아닙니다." }, { status: 502 });
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ message: "이미지가 너무 큽니다." }, { status: 413 });
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType.split(";")[0]?.trim() || "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    }
  });
}
