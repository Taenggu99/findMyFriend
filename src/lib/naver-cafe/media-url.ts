/** 카페 미디어 URL이 동영상 스트림·파일인지 */
export function cafeMediaIsVideoUrl(url: string): boolean {
  return (
    /\.(mp4|webm|m3u8)(\?|$)/i.test(url) ||
    /\/video\/|vod\.naver|\.naver\.com\/.*\.mp4|serviceapi\.nmv|naver\.net\/.*\.mp4/i.test(url)
  );
}
