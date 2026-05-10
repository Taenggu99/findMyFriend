import { NextRequest, NextResponse } from "next/server";

import { serializeAnimal } from "@/lib/animal-serializer";
import { prisma } from "@/lib/db";
import { calculateMatchScore } from "@/lib/similarity";

export const dynamic = "force-dynamic";

type AlertPayload = {
  email?: string;
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
          email: true
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
  const email = clean(payload.email);

  if (!email) {
    return NextResponse.json({ message: "이메일을 입력해 주세요." }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
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

  return NextResponse.json(
    {
      alert,
      matches: matches.map((match) => ({
        animal: serializeAnimal(match.animal),
        score: match.score
      }))
    },
    { status: 201 }
  );
}
