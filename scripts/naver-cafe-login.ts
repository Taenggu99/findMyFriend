/**
 * 네이버 로그인 후 Enter → storage/naver-session.json 저장
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { chromium } from "playwright";

import { defaultNaverSessionPath } from "../src/lib/naver-cafe/paths";

async function main() {
  const storagePath = defaultNaverSessionPath();
  await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: "ko-KR",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded" });

  console.info("\n브라우저에서 네이버 로그인 후, 구피사랑 카페(https://m.cafe.naver.com/ca-fe/gupilove)에 들어가 본 뒤");
  console.info("이 터미널에서 Enter를 누르면 세션이 저장됩니다:\n ", storagePath, "\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question("", () => resolve()));
  rl.close();

  await context.storageState({ path: storagePath });
  await browser.close();
  console.info("저장 완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
