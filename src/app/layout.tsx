import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "DSS 사내 게시판",
  description: "임직원이 자유롭게 글을 쓰고 읽는 사내 게시판",
  // 사내 전용. 검색에 나오지 않게 한다.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
