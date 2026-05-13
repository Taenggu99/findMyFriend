import type { Frame, Locator, Page } from "playwright";

import type { CafeBoardDef } from "@/lib/naver-cafe/boards";
import { naverCafeLog } from "@/lib/naver-cafe/debug-log";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function randDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  await new Promise((r) => setTimeout(r, ms));
}

/** 메인 문서 + 모든 iframe (카페 UI가 iframe 안에 있을 수 있음) */
export function menuRootContexts(page: Page): Array<Page | Frame> {
  return [page, ...page.frames().filter((f) => f !== page.mainFrame())];
}

/**
 * 모바일 카페 FE는 첫 진입 시 게시판 링크가 숨겨져 있는 경우가 많음 → 메뉴 버튼을 눌러 패널을 연다.
 */
export async function tryOpenMobileCafeMenu(page: Page): Promise<void> {
  const menuAttempts: { label: string; pick: () => Locator }[] = [
    { label: "button ^메뉴$", pick: () => page.getByRole("button", { name: /^메뉴$/ }).first() },
    { label: "button 메뉴(포함)", pick: () => page.getByRole("button", { name: /메뉴/i }).first() },
    { label: "link 메뉴", pick: () => page.getByRole("link", { name: /메뉴/i }).first() },
    { label: "button 전체/카페메뉴", pick: () => page.getByRole("button", { name: /전체\s*메뉴|카페\s*메뉴/i }).first() },
    {
      label: "header 근처 햄버거",
      pick: () => page.locator("header button, [class*='Header'] button").first()
    }
  ];

  for (const { label, pick } of menuAttempts) {
    try {
      const loc = pick();
      if ((await loc.count()) === 0) continue;
      await loc.waitFor({ state: "visible", timeout: 3500 });
      await loc.click({ timeout: 5000 });
      naverCafeLog("tryOpenMobileCafeMenu: opened via", label);
      await randDelay(700, 1500);
      return;
    } catch {
      /* 다음 시도 */
    }
  }
  naverCafeLog(
    "tryOpenMobileCafeMenu: 버튼을 찾지 못함(이미 메뉴가 열렸거나 DOM이 다름). iframe·부분 매칭으로 계속합니다."
  );
}

/** 스크린샷 기준 상위 카테고리(예: 구사 장터) 펼치기 */
export async function tryExpandBoardParentSection(page: Page): Promise<void> {
  const namePatterns = [/구사\s*장터/i, /장터\s*\(\s*삭제금지\s*\)/i];
  for (const pattern of namePatterns) {
    for (const root of menuRootContexts(page)) {
      try {
        const btn = root.getByRole("button", { name: pattern }).first();
        if ((await btn.count()) === 0) continue;
        await btn.waitFor({ state: "visible", timeout: 3000 });
        await btn.click({ timeout: 5000 });
        naverCafeLog("tryExpandBoardParentSection: clicked", pattern.source);
        await randDelay(450, 1000);
        return;
      } catch {
        /* */
      }
    }
  }
}

/**
 * exact accessible name 대신 정규식·hasText·iframe 순회로 게시판 진입
 */
export async function clickBoardMenuLink(page: Page, board: CafeBoardDef): Promise<boolean> {
  const escaped = escapeRegExp(board.label);
  const namePatterns: RegExp[] = [new RegExp(escaped)];
  if (/\s/.test(board.label)) {
    namePatterns.push(new RegExp(board.label.split(/\s+/).map(escapeRegExp).join("\\s+")));
  }

  const short = board.label.includes("(") ? board.label.split("(")[0].trim() : "";
  if (short && short !== board.label) {
    namePatterns.push(new RegExp(escapeRegExp(short)));
  }

  const roots = menuRootContexts(page);
  naverCafeLog("clickBoardMenuLink: roots", roots.length, "board", board.key);

  for (const root of roots) {
    const ctxLabel = root === page ? "main" : `frame ${(root as Frame).url().slice(0, 72)}`;

    for (const pattern of namePatterns) {
      try {
        const link = root.getByRole("link", { name: pattern }).first();
        if ((await link.count()) === 0) continue;
        await link.waitFor({ state: "visible", timeout: 6000 });
        naverCafeLog("clickBoardMenuLink: getByRole link", ctxLabel, pattern.source);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 35_000 }).catch(() => null),
          link.click({ timeout: 12_000 })
        ]);
        return true;
      } catch {
        /* */
      }
    }

    try {
      let link = root.locator("a", { hasText: board.label }).first();
      if ((await link.count()) === 0 && short) {
        link = root.locator("a", { hasText: short }).first();
      }
      if ((await link.count()) === 0) continue;
      await link.waitFor({ state: "visible", timeout: 5000 });
      naverCafeLog("clickBoardMenuLink: locator a hasText", ctxLabel, board.label);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 35_000 }).catch(() => null),
        link.click({ timeout: 12_000 })
      ]);
      return true;
    } catch {
      /* */
    }
  }

  return false;
}
