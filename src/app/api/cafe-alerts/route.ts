import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { GUPPI_LOVE_BOARDS } from "@/lib/naver-cafe/boards";

export const dynamic = "force-dynamic";

const BOARD_KEYS = new Set(GUPPI_LOVE_BOARDS.map((b) => b.key));

type CafeUserAlertRow = {
  id: number;
  label: string | null;
  boardKeysJson: string;
  listingKind: string;
  regionsJson: string;
  keywordPhrasesJson: string;
  createdAt: Date;
};

function serialize(a: CafeUserAlertRow) {
  let boardKeys: string[] = [];
  let regions: string[] = [];
  let keywordPhrases: string[] = [];
  try {
    boardKeys = JSON.parse(a.boardKeysJson) as string[];
  } catch {
    boardKeys = [];
  }
  try {
    regions = JSON.parse(a.regionsJson) as string[];
  } catch {
    regions = [];
  }
  try {
    keywordPhrases = JSON.parse(a.keywordPhrasesJson) as string[];
  } catch {
    keywordPhrases = [];
  }
  return {
    id: a.id,
    label: a.label,
    boardKeys,
    listingKind: a.listingKind,
    regions,
    keywordPhrases,
    createdAt: a.createdAt.toISOString()
  };
}

function clean(value?: string | null) {
  const t = value?.trim();
  return t ? t : null;
}

type PostBody = {
  subscriberKey?: string;
  label?: string | null;
  boardKeys?: string[];
  listingKind?: string;
  regions?: string[];
  keywordPhrases?: string[];
};

export async function GET(request: NextRequest) {
  try {
    const subscriberKey = request.nextUrl.searchParams.get("subscriberKey")?.trim();
    if (!subscriberKey) {
      return NextResponse.json({ alerts: [] });
    }

    const user = await prisma.user.findUnique({
      where: { subscriberKey },
      select: { id: true }
    });
    if (!user) {
      return NextResponse.json({ alerts: [] });
    }

    const rows = await prisma.cafeUserAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ alerts: rows.map(serialize) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ alerts: [], error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ message: "요청 본문이 JSON이 아닙니다." }, { status: 400 });
  }

  try {
    const subscriberKey = clean(body.subscriberKey);
    if (!subscriberKey) {
      return NextResponse.json(
        { message: "구독 식별 정보가 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." },
        { status: 400 }
      );
    }

    const rawBoards = Array.isArray(body.boardKeys) ? body.boardKeys : [];
    const boardKeys = rawBoards.filter((k) => typeof k === "string" && BOARD_KEYS.has(k));
    const keysToSave =
      boardKeys.length > 0 ? boardKeys : GUPPI_LOVE_BOARDS.map((b) => b.key);

    const listingKindRaw = clean(body.listingKind) ?? "any";
    const listingKind = ["any", "sharing", "trade"].includes(listingKindRaw) ? listingKindRaw : "any";

    const regions = Array.isArray(body.regions)
      ? body.regions.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    const keywordPhrases = Array.isArray(body.keywordPhrases)
      ? body.keywordPhrases
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim())
      : [];

    if (keywordPhrases.length === 0) {
      return NextResponse.json({ message: "keywordPhrases가 비어 있습니다." }, { status: 400 });
    }

    const user = await prisma.user.upsert({
      where: { subscriberKey },
      update: {},
      create: { subscriberKey, password: null }
    });

    const alert = await prisma.cafeUserAlert.create({
      data: {
        userId: user.id,
        label: clean(body.label),
        boardKeysJson: JSON.stringify(keysToSave),
        listingKind,
        regionsJson: JSON.stringify(regions),
        keywordPhrasesJson: JSON.stringify(keywordPhrases)
      }
    });

    return NextResponse.json({ alert: serialize(alert) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
