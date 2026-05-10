import "dotenv/config";

import { prisma } from "../src/lib/db";


const today = new Date();
const daysAgo = (days: number) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

async function main() {
  const happyShelter = await prisma.shelter.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "행복동물보호센터",
      phone: "02-1234-5678",
      address: "서울특별시 마포구 월드컵북로 100",
      website: "https://pawinhand.kr/shelter/animal"
    }
  });

  const greenShelter = await prisma.shelter.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: "초록동물구조대",
      phone: "031-987-6543",
      address: "경기도 성남시 분당구 판교로 242",
      website: "https://pawinhand.kr/shelter/animal"
    }
  });

  await prisma.animal.upsert({
    where: { sourceSite_noticeNo: { sourceSite: "pawinhand", noticeNo: "FMF-2026-001" } },
    update: {},
    create: {
      sourceSite: "pawinhand",
      noticeNo: "FMF-2026-001",
      status: "공고중",
      category: "개",
      breed: "푸들",
      gender: "암컷",
      neutered: "O",
      foundLocation: "서울특별시 마포구 상암동 공원 근처",
      foundRegion: "서울특별시",
      foundDate: daysAgo(8),
      noticeStartAt: daysAgo(7),
      noticeEndAt: daysAgo(-3),
      features: "갈색 토이푸들 빨간목줄 겁많음",
      imageUrl:
        "https://images.unsplash.com/photo-1605244863941-3a3ed921c60d?auto=format&fit=crop&w=900&q=80",
      detailUrl: "https://pawinhand.kr/shelter/animal/detail/FMF-2026-001",
      shelterId: happyShelter.id
    }
  });

  await prisma.animal.upsert({
    where: { sourceSite_noticeNo: { sourceSite: "pawinhand", noticeNo: "FMF-2026-002" } },
    update: {},
    create: {
      sourceSite: "pawinhand",
      noticeNo: "FMF-2026-002",
      status: "공고중",
      category: "고양이",
      breed: "코리안숏헤어",
      gender: "수컷",
      neutered: "X",
      foundLocation: "경기도 성남시 분당구 정자동 카페거리",
      foundRegion: "경기도",
      foundDate: daysAgo(18),
      noticeStartAt: daysAgo(17),
      noticeEndAt: daysAgo(2),
      features: "치즈태비 초록눈 사람좋아함",
      imageUrl:
        "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=900&q=80",
      detailUrl: "https://pawinhand.kr/shelter/animal/detail/FMF-2026-002",
      shelterId: greenShelter.id
    }
  });

  await prisma.animal.upsert({
    where: { sourceSite_noticeNo: { sourceSite: "pawinhand", noticeNo: "FMF-2026-003" } },
    update: {},
    create: {
      sourceSite: "pawinhand",
      noticeNo: "FMF-2026-003",
      status: "완료",
      category: "개",
      breed: "믹스견",
      gender: "미상",
      neutered: "미상",
      foundLocation: "부산광역시 해운대구 해변로",
      foundRegion: "부산광역시",
      foundDate: daysAgo(45),
      noticeStartAt: daysAgo(44),
      noticeEndAt: daysAgo(30),
      features: "흰색 갈색반점 파란하네스",
      imageUrl:
        "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80",
      detailUrl: "https://pawinhand.kr/shelter/animal/detail/FMF-2026-003",
      shelterId: happyShelter.id
    }
  });

  await prisma.user.upsert({
    where: { subscriberKey: "demo-subscriber-local" },
    update: {},
    create: {
      subscriberKey: "demo-subscriber-local",
      displayName: "데모 사용자",
      password: null,
      alerts: {
        create: {
          breed: "푸들",
          region: "서울특별시",
          gender: "암컷",
          neutered: "O",
          featureKeywords: "갈색 빨간목줄"
        }
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
