import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
/*
 * 머리말 **안**에 앉는 서비스 오가기 메뉴바(@dss/ui)의 생김새. 그 조각은 CSS 를
 * 스스로 부르지 않는다 — 그러면 번들러 없이는 부를 수 없게 되어 그쪽 시험이
 * 깨진다(그쪽 README 3절). 그래서 쓰는 쪽이 한 번 부른다.
 *
 * 규칙은 전부 .dss-menu 아래에만 있고, 메뉴바는 목록이 있을 때만 그려진다
 * ((internal)/layout.tsx 가 SiteHeader 의 serviceMenu 로 내려보낸다). 로그인
 * 화면에 이 줄이 닿아도 바뀌는 것은 없다.
 *
 * 🔴 그 묶음은 **조각마다 CSS 한 장**이다. 종은 바로 아래 다른 파일로 따로
 * 부른다 — 묶어 두려면 CSS 안에서 @import 를 해야 하는데 그것은 그쪽 시험이
 * 막는다(@dss/ui README 7절).
 */
import "@dss/ui/styles.css";
/*
 * 머리말 오른쪽 끝에 앉는 알림 종(@dss/ui)의 생김새. 🔴 메뉴바의 styles.css 와
 * **다른 파일**이다(바로 위).
 *
 * 규칙은 전부 .dss-bell 아래에만 있고, 종은 그릴 알림이 있을 때만 그려진다
 * ((internal)/layout.tsx 가 SiteHeader 의 notificationBell 로 내려보낸다).
 * 로그인 화면에 이 줄이 닿아도 바뀌는 것은 없다.
 */
import "@dss/ui/notification-bell.css";

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
