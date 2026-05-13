import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "findMyFriend",
  description: "보호 동물 공고 통합 검색, 네이버 카페 분양 알림"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
