import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { cleanSubscriberOrLabel, normalizeCafeAlertWrite } from "@/lib/naver-cafe/cafe-alert-normalize";
import { countCafeMatchesForAlert } from "@/lib/naver-cafe/count-cafe-alert-matches";

export const dynamic = "force-dynamic";

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
    const subscriberKey = cleanSubscriberOrLabel(body.subscriberKey);
    if (!subscriberKey) {
      return NextResponse.json(
        { message: "구독 식별 정보가 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." },
        { status: 400 }
      );
    }

    const norm = normalizeCafeAlertWrite(body);
    if (!norm.ok) {
      return NextResponse.json({ message: norm.message }, { status: 400 });
    }

    const { keysToSave, listingKind, regions, keywordPhrases, label } = norm.data;

    const user = await prisma.user.upsert({
      where: { subscriberKey },
      update: {},
      create: { subscriberKey, password: null }
    });

    const alert = await prisma.cafeUserAlert.create({
      data: {
        userId: user.id,
        label,
        boardKeysJson: JSON.stringify(keysToSave),
        listingKind,
        regionsJson: JSON.stringify(regions),
        keywordPhrasesJson: JSON.stringify(keywordPhrases)
      }
    });

    const matchCount = await countCafeMatchesForAlert(prisma, alert);
    return NextResponse.json({ alert: serialize(alert), matchCount }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
