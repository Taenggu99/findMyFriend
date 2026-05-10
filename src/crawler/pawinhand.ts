import "dotenv/config";

import { chromium, Page } from "playwright";

import { createPrismaClient } from "../lib/db";

const prisma = createPrismaClient();
const listUrl = "https://pawinhand.kr/shelter/animal";
const sourceSite = "pawinhand";

function pickLine(text: string, labels: string[]) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const label of labels) {
    const index = lines.findIndex((line) => line.includes(label));
    if (index >= 0) {
      const inlineValue = lines[index]?.replace(label, "").replace(/[:：]/, "").trim();
      return inlineValue || lines[index + 1] || "";
    }
  }

  return "";
}

function inferCategory(text: string) {
  if (text.includes("고양이")) return "고양이";
  if (text.includes("조류")) return "조류";
  if (text.includes("파충류")) return "파충류";
  if (text.includes("설치류")) return "설치류";
  if (text.includes("개")) return "개";
  return "기타";
}

function inferGender(text: string) {
  if (text.includes("암컷")) return "암컷";
  if (text.includes("수컷")) return "수컷";
  return "미상";
}

function inferNeutered(text: string) {
  if (text.includes("중성화 O") || text.includes("중성화 완료")) return "O";
  if (text.includes("중성화 X") || text.includes("중성화 안됨")) return "X";
  return "미상";
}

function parseNoticeNo(detailUrl: string) {
  const pathname = new URL(detailUrl).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? crypto.randomUUID());
}

function parseRegion(location: string) {
  return location.split(/\s+/)[0] || "미상";
}

async function collectDetailLinks(page: Page) {
  await page.goto(listUrl, { waitUntil: "networkidle" });
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(1000);

  return page.locator('a[href*="/shelter/animal/detail"]').evaluateAll((anchors) =>
    Array.from(
      new Set(
        anchors
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter((href) => href.includes("/shelter/animal/detail"))
      )
    ).slice(0, 30)
  );
}

async function scrapeAnimal(page: Page, detailUrl: string) {
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  const bodyText = await page.locator("body").innerText();
  const imageUrl =
    (await page
      .locator("img")
      .first()
      .getAttribute("src")
      .catch(() => null)) ?? "";

  const foundLocation = pickLine(bodyText, ["발견장소", "구조장소", "발견 장소"]) || "미상";
  const breed = pickLine(bodyText, ["품종", "축종"]) || inferCategory(bodyText);
  const noticeNo = pickLine(bodyText, ["공고번호", "공고 번호"]) || parseNoticeNo(detailUrl);
  const features = pickLine(bodyText, ["특이사항", "특징"]) || bodyText.slice(0, 180);

  return {
    noticeNo,
    status: bodyText.includes("완료") ? "완료" : "공고중",
    category: inferCategory(bodyText),
    breed,
    gender: inferGender(bodyText),
    neutered: inferNeutered(bodyText),
    foundLocation,
    foundRegion: parseRegion(foundLocation),
    foundDate: new Date(),
    features,
    imageUrl: imageUrl.startsWith("http") ? imageUrl : "https://pawinhand.kr" + imageUrl,
    detailUrl
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const shelter = await prisma.shelter.upsert({
      where: { id: 1 },
      update: {
        website: listUrl
      },
      create: {
        name: "포인핸드",
        phone: "확인 필요",
        address: "확인 필요",
        website: listUrl
      }
    });

    const detailLinks = await collectDetailLinks(page);
    console.log(`수집 대상 상세 페이지: ${detailLinks.length}건`);

    for (const detailUrl of detailLinks) {
      const animal = await scrapeAnimal(page, detailUrl);

      await prisma.animal.upsert({
        where: {
          sourceSite_noticeNo: {
            sourceSite,
            noticeNo: animal.noticeNo
          }
        },
        update: {
          ...animal,
          sourceSite,
          shelterId: shelter.id
        },
        create: {
          ...animal,
          sourceSite,
          shelterId: shelter.id
        }
      });

      console.log(`저장 완료: ${animal.noticeNo} ${animal.breed}`);
      await page.waitForTimeout(700);
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
