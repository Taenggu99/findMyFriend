/**
 * 네이버 카페(모바일/PC) DOM은 자주 바뀝니다. 실패 시 `NAVER_CAFE_BOARD_URLS_JSON`로 목록 URL을 직접 넣거나
 * 이 셀렉터를 조정하세요.
 */
export const NAVER_CAFE_SELECTORS = {
  articleLinks: [
    'a[href*="ArticleRead.nhn"]',
    'a[href*="/articles/"]',
    'a[href*="articleId="]'
  ],
  articleBody: [
    ".se-main-container",
    ".ArticleViewContent .se-main-container",
    ".article_view .se-main-container",
    "#articleBodyContents",
    ".article_view_area",
    ".ArticleViewContent",
    ".ArticleContentBox",
    "[class*='article_view_area']",
    "[class*='ArticleContent']",
    "#tbody",
    ".article_view",
    ".article-body",
    ".ContentRenderer"
  ]
} as const;
