import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "findMyFriend",
  description: "보호 동물 공고 통합 검색 및 실시간 알림 서비스"
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
