/**
 * 알림 조건 저장·매칭 API. 매칭이 있으면 Discord Incoming Webhook으로 요약 전송.
 * 환경 변수: DISCORD_WEBHOOK_URL (필수로 보내려면), 선택 DISCORD_WEBHOOK_USERNAME, DISCORD_WEBHOOK_AVATAR_URL
 */
import { NextRequest, NextResponse } from "next/server";

import { serializeAnimal } from "@/lib/animal-serializer";
import {
  buildMatchAlertDiscordBody,
  normalizeWebhookAvatarUrl,
  normalizeWebhookUsername,
  postDiscordWebhook
} from "@/lib/discord-webhook";
import { prisma } from "@/lib/db";
import { calculateMatchScore } from "@/lib/similarity";

export const dynamic = "force-dynamic";

type AlertPayload = {
  /** 브라우저에 저장된 고유 구독 키(UUID 등) */
  subscriberKey?: string;
  /** Discord 메시지에 표시할 이름(선택) */
  displayName?: string;
  breed?: string;
  region?: string;
  gender?: string;
  neutered?: string;
  featureKeywords?: string;
};

function clean(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET() {
  const alerts = await prisma.userAlert.findMany({
    include: {
      user: {
        select: {
          subscriberKey: true,
          displayName: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as AlertPayload;
  const subscriberKey = clean(payload.subscriberKey);

  if (!subscriberKey) {
    return NextResponse.json(
      { message: "구독 식별 정보가 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." },
      { status: 400 }
    );
  }

  const user = await prisma.user.upsert({
    where: { subscriberKey },
    update: {
      displayName: clean(payload.displayName)
    },
    create: {
      subscriberKey,
      displayName: clean(payload.displayName),
      password: null
    }
  });

  const alert = await prisma.userAlert.create({
    data: {
      userId: user.id,
      breed: clean(payload.breed),
      region: clean(payload.region),
      gender: clean(payload.gender),
      neutered: clean(payload.neutered),
      featureKeywords: clean(payload.featureKeywords) ?? ""
    }
  });

  const animals = await prisma.animal.findMany({
    include: {
      shelter: true
    },
    orderBy: {
      foundDate: "desc"
    }
  });

  const matches = animals
    .map((animal) => ({
      animal,
      score: calculateMatchScore(
        {
          breed: alert.breed,
          region: alert.region,
          gender: alert.gender,
          featureKeywords: alert.featureKeywords
        },
        animal
      )
    }))
    .filter((match) => match.score >= 70)
    .sort((left, right) => right.score - left.score);

  await Promise.all(
    matches.map((match) =>
      prisma.alertLog.upsert({
        where: {
          userId_animalId: {
            userId: user.id,
            animalId: match.animal.id
          }
        },
        update: {
          matchedScore: match.score
        },
        create: {
          userId: user.id,
          animalId: match.animal.id,
          matchedScore: match.score
        }
      })
    )
  );

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  const displayLabel = user.displayName?.trim() || `구독자 (${subscriberKey.slice(0, 8)}…)`;

  let discord: { sent: boolean; skippedReason?: string; error?: string } = { sent: false };

  if (!webhookUrl) {
    discord = { sent: false, skippedReason: "DISCORD_WEBHOOK_URL 미설정" };
  } else if (matches.length === 0) {
    discord = { sent: false, skippedReason: "70점 이상 매칭 없음" };
  } else {
    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
    const matchLines = matches.slice(0, 20).map((m, i) => {
      const no = m.animal.noticeNo;
      const line = `${i + 1}. **${no}** · ${m.animal.breed} · ${m.animal.foundRegion} · ${m.score}점`;
      if (appBase) {
        return `${line}\n   ${appBase}/animal/${m.animal.id}`;
      }
      return `${line}\n   ${m.animal.detailUrl}`;
    });

    const body = buildMatchAlertDiscordBody({ displayLabel, matchLines });
    const username = normalizeWebhookUsername(process.env.DISCORD_WEBHOOK_USERNAME);
    const avatarUrl = normalizeWebhookAvatarUrl(process.env.DISCORD_WEBHOOK_AVATAR_URL);

    const posted = await postDiscordWebhook(webhookUrl, {
      ...body,
      username,
      avatar_url: avatarUrl
    });

    if (posted.ok) {
      discord = { sent: true };
    } else {
      discord = { sent: false, error: posted.error };
    }
  }

  return NextResponse.json(
    {
      alert,
      matches: matches.map((match) => ({
        animal: serializeAnimal(match.animal),
        score: match.score
      })),
      discord
    },
    { status: 201 }
  );
}
