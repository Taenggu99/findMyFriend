import type { PrismaClient } from "@prisma/client";
import fs from "node:fs";

import { chromium, type Browser } from "playwright";

import {
  boardUrlOverrides,
  defaultNaverSessionPath
} from "@/lib/naver-cafe/paths";
import {
  GUPPI_LOVE_BOARDS,
  isLoveShareCompletedTitle,
  NAVER_CAFE_MOBILE_HOME,
  type CafeBoardDef
} from "@/lib/naver-cafe/boards";
import { naverCafeLog } from "@/lib/naver-cafe/debug-log";
import {
  clickBoardMenuLink,
  tryExpandBoardParentSection,
  tryOpenMobileCafeMenu
} from "@/lib/naver-cafe/menu-navigation";
import { parseCafeTitle } from "@/lib/naver-cafe/parse-title";
import {
  composeCafeCardDisplaySnippet,
  finalizeCafeStoredSnippet,
  normalizeCafeArticleWhitespace
} from "@/lib/naver-cafe/cafe-listing-summary";
import { NAVER_CAFE_SELECTORS } from "@/lib/naver-cafe/selectors";

export type CrawledCafePostPayload = {
  url: string;
  title: string;
  boardKey: string;
  boardLabel: string;
  postKind: "sharing" | "trade";
  titleRegion: string | null;
  tradeStatus: string | null;
  thumbnailUrl: string | null;
  contentSnippet: string | null;
  /** 카페 글 등록일(ISO 문자열), 상세 페이지에서 추출 */
  postedAt: string | null;
};

export type NaverCafeCrawlResult = {
  ok: boolean;
  error?: string;
  posts: CrawledCafePostPayload[];
  boardErrors: { boardKey: string; message: string }[];
  note?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

/** 목록 링크 텍스트에 붙는 댓글·이미지 개수·새글 표식 제거 */
export function sanitizeCafeListLinkTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "제목 없음";
  t = t.replace(/\s*\d{1,4}\s*[+＋]\s*$/u, "");
  t = t.replace(/\s*(?:사진|이미지|첨부|첨부파일)\s*\d{1,3}\s*$/gi, "");
  t = t.replace(/\s*댓글\s*\d{1,5}\s*$/gi, "");
  t = t.replace(/\s*좋아요\s*\d{1,5}\s*$/gi, "");
  t = t.replace(/\s*(?:새글|[Nn])\s*$/i, "");
  return t.trim() || "제목 없음";
}

function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (!u.hostname.includes("cafe.naver.com")) return null;
    if (!/ArticleRead|\/articles\/|articleId=/i.test(u.href)) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

/** 본문(에디터·iframe 내부)이 실제로 채워질 때까지 대기 */
async function waitForArticleContentReady(page: import("playwright").Page): Promise<void> {
  const selectors = [...NAVER_CAFE_SELECTORS.articleBody];
  try {
    await page.waitForFunction(
      (sels: string[]) => {
        const scoreDoc = (d: Document): number => {
          let max = 0;
          for (const sel of sels) {
            const el = d.querySelector(sel) as HTMLElement | null;
            const n = (el?.innerText ?? el?.textContent ?? "").trim().length;
            if (n > max) max = n;
          }
          const b = (d.body?.innerText ?? "").trim().length;
          return Math.max(max, b);
        };
        const okDoc = (d: Document): boolean => scoreDoc(d) > 40;
        if (okDoc(document)) return true;
        for (const fr of document.querySelectorAll("iframe")) {
          try {
            const id = fr.contentDocument;
            if (id && okDoc(id)) return true;
          } catch {
            /* cross-origin */
          }
        }
        return false;
      },
      selectors,
      { timeout: 22_000 }
    );
    naverCafeLog("article content waitForFunction ok");
    await randomDelay(200, 500);
    return;
  } catch {
    naverCafeLog("warning: waitForFunction timeout, trying selector wait");
  }
  for (const sel of NAVER_CAFE_SELECTORS.articleBody) {
    try {
      await page.waitForSelector(sel, { timeout: 8000, state: "attached" });
      naverCafeLog("article body selector ready", sel);
      return;
    } catch {
      /* try next */
    }
  }
  naverCafeLog("warning: no articleBody selector matched; continuing anyway");
  await randomDelay(500, 1100);
}

/** 상세 본문에서 저장용 스니펫 문자열 생성 */
function buildPersistedSnippet(snippetFull: string | null, snippetAfterImg: string | null): string | null {
  const composed = composeCafeCardDisplaySnippet(snippetFull, snippetAfterImg);
  if (composed?.trim()) return finalizeCafeStoredSnippet(composed);
  const pick =
    snippetAfterImg && snippetAfterImg.trim().length >= 8
      ? snippetAfterImg
      : snippetFull?.trim()
        ? snippetFull
        : null;
  if (!pick) return null;
  const retry = composeCafeCardDisplaySnippet(pick, null);
  if (retry?.trim()) return finalizeCafeStoredSnippet(retry);
  return finalizeCafeStoredSnippet(pick);
}

async function collectListLinks(page: import("playwright").Page, baseUrl: string, limit: number) {
  const hrefs = await page.evaluate(
    (opts: { selectors: string[]; lim: number }) => {
      const { selectors, lim } = opts;
      const out: { href: string; text: string }[] = [];
      const seen = new Set<string>();
      outer: for (const sel of selectors) {
        document.querySelectorAll<HTMLAnchorElement>(sel).forEach((a) => {
          const href = a.href;
          if (!href || seen.has(href)) return;
          if (!/cafe\.naver\.com.*(ArticleRead|\/articles\/|articleId=)/i.test(href)) return;
          seen.add(href);
          const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
          out.push({ href, text });
          if (out.length >= lim) return;
        });
        if (out.length >= lim) break outer;
      }
      return out;
    },
    { selectors: [...NAVER_CAFE_SELECTORS.articleLinks], lim: Math.max(limit * 6, 40) }
  );

  naverCafeLog("collectListLinks evaluate raw count", hrefs.length, "baseUrl", baseUrl);

  const dedup: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const row of hrefs) {
    const url = absolutize(row.href, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    dedup.push({ url, title: sanitizeCafeListLinkTitle(row.text || "") });
    if (dedup.length >= limit) break;
  }
  naverCafeLog("collectListLinks after absolutize+dedup", dedup.length);
  return dedup;
}

async function extractArticleSnippet(page: import("playwright").Page): Promise<string | null> {
  const selectors = [...NAVER_CAFE_SELECTORS.articleBody];

  const grabFromFrame = (frame: import("playwright").Frame) =>
    frame.evaluate<string | null, string[]>((sels) => {
      const collectDocs = (): Document[] => {
        const out: Document[] = [document];
        document.querySelectorAll("iframe").forEach((fr) => {
          try {
            const id = fr.contentDocument;
            if (id && !out.includes(id)) out.push(id);
          } catch {
            /* */
          }
        });
        return out;
      };

      let best = "";
      for (const doc of collectDocs()) {
        for (const sel of sels) {
          const el = doc.querySelector(sel) as HTMLElement | null;
          if (!el) continue;
          const t = (el.innerText ?? el.textContent ?? "").replace(/\r\n/g, "\n").trim();
          if (t.length > best.length) best = t;
        }
        const body = (doc.body?.innerText ?? "").replace(/\r\n/g, "\n").trim();
        if (body.length > best.length) best = body;
      }
      return best.length > 12 ? best.slice(0, 8000) : null;
    }, selectors);

  let best: string | null = null;
  for (const frame of page.frames()) {
    try {
      const t = await grabFromFrame(frame);
      if (t && t.trim().length > (best?.trim().length ?? 0)) best = t;
    } catch {
      /* cross-origin or detached */
    }
  }
  if (!best?.trim()) return null;
  return normalizeCafeArticleWhitespace(best);
}

/** 본문에서 첫 본문용 이미지(또는 그 묶음) 뒤에 오는 글만 — 금액·설명이 보통 여기 */
async function extractArticleTextAfterFirstImage(page: import("playwright").Page): Promise<string | null> {
  const selectors = [...NAVER_CAFE_SELECTORS.articleBody];

  const grabFromFrame = (frame: import("playwright").Frame) =>
    frame.evaluate<string | null, string[]>((sels) => {
      const collectDocs = (): Document[] => {
        const out: Document[] = [document];
        document.querySelectorAll("iframe").forEach((fr) => {
          try {
            const id = fr.contentDocument;
            if (id && !out.includes(id)) out.push(id);
          } catch {
            /* */
          }
        });
        return out;
      };

      const isContentImg = (img: HTMLImageElement) => {
        const s = (img.currentSrc || img.src || img.getAttribute("data-src") || "").trim();
        if (!/^https?:\/\//i.test(s)) return false;
        if (/emoji|icon|favicon|spacer|blank|btn_|profile|emotion|sticker/i.test(s)) return false;
        if (/\.gif(\?|$)/i.test(s) && s.length < 140) return false;
        return (
          /pstatic|postfiles|naver\.net|daumcdn|phinf\.|kakaocdn/i.test(s) ||
          /\.(jpe?g|png|webp)(\?|$)/i.test(s)
        );
      };

      let best: string | null = null;
      const consider = (txt: string | null) => {
        const n = txt?.trim() ?? "";
        if (n.length >= 8 && (!best || n.length > best.length)) best = n.slice(0, 6000);
      };

      for (const doc of collectDocs()) {
        for (const sel of sels) {
          const root = doc.querySelector(sel);
          if (!root) continue;

          const imgs = [...root.querySelectorAll("img")].filter(isContentImg);
          if (imgs.length === 0) continue;

          const first = imgs[0];
          const anchor =
            first.closest("figure.se-image") ||
            first.closest("figure.se-module-image") ||
            first.closest("figure") ||
            first.closest(".se-module-image") ||
            first.closest(".se-image-resource") ||
            first.closest(".se-component") ||
            first.closest("p") ||
            first.parentElement;

          if (!anchor || !root.contains(anchor)) continue;

          try {
            const range = doc.createRange();
            range.setStartAfter(anchor);
            range.setEnd(root, root.childNodes.length);
            const holder = doc.createElement("div");
            holder.appendChild(range.cloneContents());
            consider(holder.innerText.replace(/\r\n/g, "\n").trim());
          } catch {
            /* Range 미지원·DOM 예외 */
          }

          const chunks: string[] = [];
          let sib: Element | null = anchor.nextElementSibling;
          while (sib && chunks.join("\n").length < 6000) {
            const t = (sib as HTMLElement).innerText?.replace(/\r\n/g, "\n").trim();
            if (t) chunks.push(t);
            sib = sib.nextElementSibling;
          }
          if (chunks.length) consider(chunks.join("\n").trim());
        }
      }

      return best;
    }, selectors);

  let best: string | null = null;
  for (const frame of page.frames()) {
    try {
      const t = await grabFromFrame(frame);
      if (t && t.trim().length > (best?.trim().length ?? 0)) best = t;
    } catch {
      /* */
    }
  }
  return best;
}

async function extractArticleTextAfterFirstImageNormalized(
  page: import("playwright").Page
): Promise<string | null> {
  const raw = await extractArticleTextAfterFirstImage(page);
  if (!raw?.trim()) return null;
  return normalizeCafeArticleWhitespace(raw);
}

async function extractArticleThumbnail(page: import("playwright").Page): Promise<string | null> {
  const selectors = [...NAVER_CAFE_SELECTORS.articleBody];

  const grabFromFrame = (frame: import("playwright").Frame) =>
    frame.evaluate<string | null, string[]>((sels) => {
      const collectDocs = (): Document[] => {
        const out: Document[] = [document];
        document.querySelectorAll("iframe").forEach((fr) => {
          try {
            const id = fr.contentDocument;
            if (id && !out.includes(id)) out.push(id);
          } catch {
            /* */
          }
        });
        return out;
      };

      const pick = (raw: string | null | undefined): string | null => {
        const s = raw?.trim();
        if (!s || !/^https?:\/\//i.test(s)) return null;
        return s;
      };

      const isVideoUrl = (u: string): boolean =>
        /\.(mp4|webm|m3u8)(\?|$)/i.test(u) ||
        /\/video\/|vod\.naver|serviceapi\.nmv|\.naver\.com\/.*\.mp4|naver\.net\/.*\.mp4/i.test(u);

      const isBadImg = (u: string): boolean =>
        /emoji|icon|spacer|blank|favicon|btn_|emotion|sticker|profile/i.test(u);

      const pickImg = (el: Element | null | undefined): string | null => {
        if (!el || !(el instanceof HTMLImageElement)) return null;
        const src =
          pick(el.getAttribute("src")) ||
          pick(el.getAttribute("data-src")) ||
          pick(el.getAttribute("data-lazy-src")) ||
          pick(el.getAttribute("data-original"));
        if (!src || isBadImg(src) || isVideoUrl(src)) return null;
        return src;
      };

      const thumbNearVideo = (vid: HTMLVideoElement): string | null => {
        const poster = pick(vid.getAttribute("poster"));
        if (poster && !isVideoUrl(poster)) return poster;

        const wrap = vid.closest(
          ".se-component, .se-module-video, .se-module-oglink, figure, .iframe_wrap, .ContentRenderer, .se-main-container, .se-section, article"
        );
        if (!wrap) return null;

        for (const img of wrap.querySelectorAll("img")) {
          const s = pickImg(img);
          if (s) return s;
        }

        const prev = vid.previousElementSibling;
        if (prev) {
          const nested = prev.querySelector("img");
          const s = nested ? pickImg(nested) : prev instanceof HTMLImageElement ? pickImg(prev) : null;
          if (s) return s;
        }
        return null;
      };

      for (const doc of collectDocs()) {
        for (const sel of sels) {
          const root = doc.querySelector(sel);
          if (!root) continue;
          for (const vid of root.querySelectorAll("video")) {
            const t = thumbNearVideo(vid);
            if (t) return t;
          }
          for (const mod of root.querySelectorAll(
            ".se-module-video, .se-video, [class*='se-module-video'], [class*='Video'], .vod_player, .video_wrap"
          )) {
            const s = pickImg(mod.querySelector("img"));
            if (s) return s;
          }
        }
      }

      for (const doc of collectDocs()) {
        for (const vid of doc.querySelectorAll("video")) {
          const t = thumbNearVideo(vid);
          if (t) return t;
        }
      }

      const rootDoc = document;
      const vThumb =
        pick(rootDoc.querySelector('meta[property="og:video:thumbnail"]')?.getAttribute("content")) ||
        pick(rootDoc.querySelector('meta[name="og:video:thumbnail"]')?.getAttribute("content"));
      if (vThumb && !isVideoUrl(vThumb)) return vThumb;

      const og =
        pick(rootDoc.querySelector('meta[property="og:image"]')?.getAttribute("content")) ||
        pick(rootDoc.querySelector('meta[name="twitter:image"]')?.getAttribute("content"));
      if (og && !isVideoUrl(og)) return og;

      for (const doc of collectDocs()) {
        for (const sel of sels) {
          const root = doc.querySelector(sel);
          if (!root) continue;
          for (const img of root.querySelectorAll("img")) {
            const s = pickImg(img);
            if (s) return s;
          }
        }
      }

      for (const doc of collectDocs()) {
        const fallback = doc.querySelector<HTMLImageElement>(
          "img[src*='cafe.pstatic.net'], img[src*='postfiles'], img[src*='naver.net'], img[src*='pstatic.net']"
        );
        const fb = pickImg(fallback);
        if (fb) return fb;
      }

      const any = rootDoc.querySelector<HTMLImageElement>(
        "main img[src^='http'], article img[src^='http'], #content img[src^='http']"
      );
      return pickImg(any);
    }, selectors);

  /** 광고·타 프레임의 첫 이미지를 피하려면 메인 프레임(+그 안 동일출처 iframe)만 본다 */
  try {
    return await grabFromFrame(page.mainFrame());
  } catch {
    return null;
  }
}

/** 글 본문 페이지에서 등록일 추출 (ISO 또는 null) */
async function extractArticlePostedAt(page: import("playwright").Page): Promise<string | null> {
  return page.evaluate(() => {
    const toIso = (d: Date): string | null =>
      Number.isNaN(d.getTime()) ? null : d.toISOString();

    const tryParseLoose = (raw: string | null | undefined): string | null => {
      if (!raw || typeof raw !== "string") return null;
      let t = raw.trim();
      if (!t) return null;
      t = t.replace(/\s*(오전|오후)\s*[\d:]+\s*$/, "").trim();
      const isoTry = new Date(t);
      if (!Number.isNaN(isoTry.getTime())) return toIso(isoTry);
      const m = t.match(/(\d{4})[.\s/-]+(\d{1,2})[.\s/-]+(\d{1,2})/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return toIso(d);
      }
      const kr = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      if (kr) {
        const d = new Date(Number(kr[1]), Number(kr[2]) - 1, Number(kr[3]));
        return toIso(d);
      }
      return null;
    };

    const metaNames = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="dcterms.created"]',
      'meta[name="dcterms.created"]'
    ];
    for (const sel of metaNames) {
      const v = document.querySelector(sel)?.getAttribute("content");
      const iso = tryParseLoose(v);
      if (iso) return iso;
    }

    const timeEl = document.querySelector("time[datetime]");
    if (timeEl) {
      const iso = tryParseLoose(timeEl.getAttribute("datetime") ?? timeEl.textContent);
      if (iso) return iso;
    }

    for (const sel of [
      ".article_info time[datetime]",
      ".article_info .date",
      ".ArticleInfo time[datetime]",
      ".user_info time[datetime]",
      "[class*='article_info'] time",
      "[class*='ArticleInfo'] time"
    ]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const iso = tryParseLoose(el.getAttribute("datetime") ?? el.textContent);
      if (iso) return iso;
    }

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(script.textContent || "") as unknown;
        const arr = Array.isArray(j) ? j : [j];
        for (const item of arr) {
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            const dp = o.datePublished ?? o.dateCreated ?? o.uploadDate;
            if (typeof dp === "string") {
              const iso = tryParseLoose(dp);
              if (iso) return iso;
            }
          }
        }
      } catch {
        /* */
      }
    }

    const dateHints = document.querySelectorAll(
      "[class*='date'], [class*='Date'], [class*='time'], .article_info, .ArticleInfo, .UserInfo, .user_info"
    );
    for (const el of dateHints) {
      const iso = tryParseLoose(el.textContent);
      if (iso) return iso;
    }

    const head = (document.body?.innerText ?? "").slice(0, 3500);
    const lineMatch = head.match(/(\d{4})[.\s]*(\d{1,2})[.\s]*(\d{1,2})/);
    if (lineMatch) {
      const d = new Date(Number(lineMatch[1]), Number(lineMatch[2]) - 1, Number(lineMatch[3]));
      return toIso(d);
    }

    return null;
  });
}

async function openBoardListPage(
  page: import("playwright").Page,
  board: CafeBoardDef,
  overrides: Record<string, string>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const direct = overrides[board.key]?.trim();
  if (direct) {
    naverCafeLog(`openBoard direct URL [${board.key}]`, direct);
    await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await randomDelay(400, 1200);
    naverCafeLog(`openBoard after goto`, page.url());
    return { ok: true };
  }

  naverCafeLog(`openBoard via menu [${board.key}] "${board.label}"`, NAVER_CAFE_MOBILE_HOME);
  await page.goto(NAVER_CAFE_MOBILE_HOME, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await randomDelay(500, 1400);
  naverCafeLog(`home loaded`, page.url());

  await tryOpenMobileCafeMenu(page);
  await tryExpandBoardParentSection(page);

  let navigated = await clickBoardMenuLink(page, board);
  if (!navigated) {
    naverCafeLog("clickBoardMenuLink: 재시도(메뉴 다시 열기)");
    await tryOpenMobileCafeMenu(page);
    await tryExpandBoardParentSection(page);
    navigated = await clickBoardMenuLink(page, board);
  }

  if (!navigated) {
    return {
      ok: false,
      message: `게시판 "${board.label}" 메뉴를 찾지 못했습니다. NAVER_CAFE_BOARD_URLS_JSON에 목록 URL을 지정해 보세요.`
    };
  }

  await randomDelay(600, 1600);
  naverCafeLog(`after board navigation`, page.url());

  let sawArticleSelector = false;
  for (const sel of NAVER_CAFE_SELECTORS.articleLinks) {
    try {
      await page.waitForSelector(sel, { timeout: 12_000 });
      naverCafeLog(`article list selector matched`, sel);
      sawArticleSelector = true;
      break;
    } catch {
      /* try next */
    }
  }
  if (!sawArticleSelector) {
    naverCafeLog(`warning: no article link selector matched on page (may still have links in DOM)`);
  }

  return { ok: true };
}

/**
 * Playwright로 구피사랑 모바일 카페를 순회합니다. `storage/naver-session.json`이 없으면 실패합니다.
 */
export async function runNaverCafeCrawl(
  prisma: PrismaClient,
  options?: {
    headless?: boolean;
    maxListPerBoard?: number;
    maxNewDetails?: number;
  }
): Promise<NaverCafeCrawlResult> {
  const headless = options?.headless ?? process.env.NAVER_CAFE_HEADLESS !== "false";
  const maxListPerBoard = options?.maxListPerBoard ?? 24;
  const envDetailCap = parseInt(process.env.NAVER_CAFE_MAX_NEW_DETAILS?.trim() ?? "", 10);
  const defaultDetailCap =
    Number.isFinite(envDetailCap) && envDetailCap > 0
      ? Math.min(200, envDetailCap)
      : Math.min(120, Math.max(60, maxListPerBoard * Math.max(3, GUPPI_LOVE_BOARDS.length)));
  const maxNewDetails = options?.maxNewDetails ?? defaultDetailCap;

  const sessionPath = defaultNaverSessionPath();
  naverCafeLog("crawl start", {
    headless,
    maxListPerBoard,
    maxNewDetails,
    sessionPath,
    sessionExists: fs.existsSync(sessionPath)
  });

  if (!fs.existsSync(sessionPath)) {
    naverCafeLog("abort: session file missing", sessionPath);
    return {
      ok: false,
      error: `네이버 세션 파일이 없습니다: ${sessionPath}\n프로젝트 루트에서 npm run naver-cafe:login 을 실행해 로그인·저장 후 다시 시도하세요.`,
      posts: [],
      boardErrors: []
    };
  }

  const overrides = boardUrlOverrides();
  naverCafeLog("board URL overrides", Object.keys(overrides).length ? overrides : "(none)");
  const boardErrors: { boardKey: string; message: string }[] = [];
  const listAcc: { url: string; title: string; board: CafeBoardDef }[] = [];

  let browser: Browser | null = null;
  try {
    naverCafeLog("launching chromium…");
    browser = await chromium.launch({
      headless,
      args: ["--disable-blink-features=AutomationControlled"]
    });
    const context = await browser.newContext({
      storageState: sessionPath,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "ko-KR"
    });
    const page = await context.newPage();
    naverCafeLog("browser context ready (storageState loaded)");

    for (const board of GUPPI_LOVE_BOARDS) {
      naverCafeLog(`— board: ${board.key} / ${board.label} —`);
      const opened = await openBoardListPage(page, board, overrides);
      if (!opened.ok) {
        naverCafeLog(`board FAILED`, board.key, opened.message);
        boardErrors.push({ boardKey: board.key, message: opened.message });
        continue;
      }

      const links = await collectListLinks(page, page.url(), maxListPerBoard);
      naverCafeLog(`collected list links`, { board: board.key, count: links.length, pageUrl: page.url() });
      if (links.length > 0) {
        naverCafeLog(`sample titles`, links.slice(0, 3).map((l) => l.title.slice(0, 60)));
      }
      for (const row of links) {
        if (board.key === "love_share" && isLoveShareCompletedTitle(row.title)) {
          naverCafeLog("skip completed love_share list row", row.title.slice(0, 72));
          continue;
        }
        listAcc.push({ ...row, board });
      }
      await randomDelay(800, 2200);
    }

    const uniqueList: { url: string; title: string; board: CafeBoardDef }[] = [];
    const seen = new Set<string>();
    for (const row of listAcc) {
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      uniqueList.push(row);
    }

    naverCafeLog("list phase done", {
      rawRows: listAcc.length,
      uniqueByUrl: uniqueList.length
    });

    const urls = uniqueList.map((r) => r.url);
    const existingRows = await prisma.cafeCrawledPost.findMany({
      where: { url: { in: urls } },
      select: { url: true }
    });
    const existing = new Set(existingRows.map((r) => r.url));

    /** 목록 순서 상단 N개는 DB에 이미 있어도 상세를 다시 받아 썸네일·요약·업로드일을 갱신한다 */
    const detailRows = uniqueList.slice(0, maxNewDetails);
    const listOnlyRows = uniqueList.slice(maxNewDetails);
    const newInDetailSlice = detailRows.filter((r) => !existing.has(r.url)).length;

    naverCafeLog("DB compare", {
      urlsInList: urls.length,
      alreadyInDb: existing.size,
      detailSliceSize: detailRows.length,
      newUrlsInDetailSlice: newInDetailSlice,
      listOnlyNoDetail: listOnlyRows.length
    });

    const posts: CrawledCafePostPayload[] = [];

    let detailIdx = 0;
    for (const row of detailRows) {
      detailIdx++;
      try {
        naverCafeLog(`detail [${detailIdx}/${detailRows.length}]`, row.url);
        await page.goto(row.url, { waitUntil: "domcontentloaded", timeout: 35_000 });
        await waitForArticleContentReady(page);
        await randomDelay(350, 900);
        const snippetFull = await extractArticleSnippet(page);
        const snippetAfterImg = await extractArticleTextAfterFirstImageNormalized(page);
        const snippet = buildPersistedSnippet(snippetFull, snippetAfterImg);
        const thumb = await extractArticleThumbnail(page);
        const postedAtIso = await extractArticlePostedAt(page);
        const titleFromPage = await page.title().catch(() => row.title);
        const rawTitle = titleFromPage.replace(/\s*:\s*네이버\s*카페.*$/i, "").trim() || row.title;
        const cleanTitle = sanitizeCafeListLinkTitle(rawTitle);
        if (row.board.key === "love_share" && isLoveShareCompletedTitle(cleanTitle)) {
          naverCafeLog("skip completed love_share detail", cleanTitle.slice(0, 72));
          continue;
        }
        const parsed = parseCafeTitle(row.board, cleanTitle);
        posts.push({
          url: row.url,
          title: cleanTitle,
          boardKey: row.board.key,
          boardLabel: row.board.displayLabel,
          postKind: row.board.listingTone,
          titleRegion: parsed.titleRegion,
          tradeStatus: parsed.tradeStatus,
          thumbnailUrl: thumb,
          contentSnippet: snippet,
          postedAt: postedAtIso
        });
        naverCafeLog(
          `detail OK`,
          cleanTitle.slice(0, 80),
          snippet ? `(snippet ${snippet.length} chars)` : "(no snippet)",
          thumb ? `(thumb)` : "(no thumb)"
        );
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        naverCafeLog(`detail FAIL`, row.url, errMsg);
        boardErrors.push({
          boardKey: row.board.key,
          message: `상세 수집 실패 ${row.url}: ${errMsg}`
        });
        if (!(row.board.key === "love_share" && isLoveShareCompletedTitle(row.title))) {
          posts.push(buildPayloadFromListRow(row));
        }
      }
      await randomDelay(700, 2400);
    }

    for (const row of listOnlyRows) {
      if (row.board.key === "love_share" && isLoveShareCompletedTitle(row.title)) {
        continue;
      }
      posts.push(buildPayloadFromListRow(row));
    }
    if (listOnlyRows.length > 0) {
      naverCafeLog(`list-only payloads (no detail fetch)`, listOnlyRows.length);
    }

    const note =
      Object.keys(overrides).length === 0 && boardErrors.length > 0
        ? "일부 게시판만 실패했을 수 있습니다. NAVER_CAFE_BOARD_URLS_JSON으로 목록 URL을 고정하면 안정적입니다."
        : undefined;

    naverCafeLog("crawl finished", {
      payloads: posts.length,
      boardErrors: boardErrors.length,
      note: note ?? null
    });
    if (boardErrors.length > 0) {
      naverCafeLog("boardErrors detail", boardErrors);
    }

    return { ok: true, posts, boardErrors, note };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    naverCafeLog("crawl FATAL", err, e instanceof Error ? e.stack : "");
    return {
      ok: false,
      error: err,
      posts: [],
      boardErrors
    };
  } finally {
    naverCafeLog("closing browser");
    await browser?.close().catch(() => null);
  }
}

/** 목록에서 제목만으로 빠르게 적재할 때(상세 생략) */
export function buildPayloadFromListRow(row: {
  url: string;
  title: string;
  board: CafeBoardDef;
}): CrawledCafePostPayload {
  const parsed = parseCafeTitle(row.board, sanitizeCafeListLinkTitle(row.title));
  return {
    url: row.url,
    title: sanitizeCafeListLinkTitle(row.title),
    boardKey: row.board.key,
    boardLabel: row.board.displayLabel,
    postKind: row.board.listingTone,
    titleRegion: parsed.titleRegion,
    tradeStatus: parsed.tradeStatus,
    thumbnailUrl: null,
    contentSnippet: null,
    postedAt: null
  };
}
