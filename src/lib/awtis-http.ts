const AWTIS_SITE = "https://www.animal.go.kr";
const INDEX_URL = `${AWTIS_SITE}/front/index.do`;

function defaultUserAgent(): string {
  return (
    process.env.AWTIS_USER_AGENT?.trim() ||
    "Mozilla/5.0 (compatible; FindMyFriend/1.0; +AWTIS sync; contact site owner)"
  );
}

export function mergeSetCookiesIntoJar(jar: Map<string, string>, res: Response): void {
  const getter = res.headers.getSetCookie?.bind(res.headers);
  const list = typeof getter === "function" ? getter() : [];
  for (const line of list) {
    const first = line.split(";")[0]?.trim();
    if (!first?.includes("=")) continue;
    const i = first.indexOf("=");
    const k = first.slice(0, i).trim();
    const v = first.slice(i + 1).trim();
    if (k) jar.set(k, v);
  }
}

export function cookieHeaderFromJar(jar: Map<string, string>): string | undefined {
  if (jar.size === 0) return undefined;
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export type AwtisHttpContext = {
  jar: Map<string, string>;
  /** 목록·상세 POST 시 Referer */
  listReferer: string;
  userAgent: string;
};

export async function awtisFetch(
  url: string,
  ctx: AwtisHttpContext,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit }
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", ctx.userAgent);
  if (!headers.has("Accept")) {
    headers.set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  }
  const ch = cookieHeaderFromJar(ctx.jar);
  if (ch) headers.set("Cookie", ch);
  const res = await fetch(url, { ...init, headers });
  mergeSetCookiesIntoJar(ctx.jar, res);
  return res;
}

export async function awtisPostForm(
  ctx: AwtisHttpContext,
  url: string,
  body: URLSearchParams
): Promise<Response> {
  return awtisFetch(url, ctx, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: ctx.listReferer
    },
    body: body.toString()
  });
}

/**
 * animal.go.kr 은 세션 쿠키 없이 목록 POST 시 404 페이지를 돌려준다.
 * 메인 → 보호동물 목록 GET 으로 쿠키·폼을 받은 뒤 목록 POST 에 csSignature 를 넣는다.
 */
export async function warmAwtisPublicListSession(menuNoHint: string): Promise<{
  ctx: AwtisHttpContext;
  listHtml: string;
  menuNo: string;
}> {
  const jar = new Map<string, string>();
  const userAgent = defaultUserAgent();
  const ctx: AwtisHttpContext = {
    jar,
    listReferer: INDEX_URL,
    userAgent
  };

  let res = await awtisFetch(INDEX_URL, ctx, { method: "GET" });
  await res.text();

  const listGetUrl = `${AWTIS_SITE}/front/awtis/public/publicList.do?menuNo=${encodeURIComponent(menuNoHint)}`;
  ctx.listReferer = INDEX_URL;
  res = await awtisFetch(listGetUrl, ctx, {
    method: "GET",
    headers: { Referer: INDEX_URL }
  });
  const listHtml = await res.text();
  ctx.listReferer = listGetUrl;

  return { ctx, listHtml, menuNo: menuNoHint };
}
