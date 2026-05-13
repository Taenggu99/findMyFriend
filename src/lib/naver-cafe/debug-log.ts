/**
 * 네이버 카페 크롤 진행 상황 로그.
 * 끄려면 환경 변수 `NAVER_CAFE_DEBUG=0`
 */
export function naverCafeDebugEnabled(): boolean {
  return process.env.NAVER_CAFE_DEBUG !== "0";
}

export function naverCafeLog(...args: unknown[]): void {
  if (!naverCafeDebugEnabled()) return;
  console.log("[naver-cafe]", new Date().toISOString(), ...args);
}
