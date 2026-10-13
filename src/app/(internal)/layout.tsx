import type { ReactNode } from "react";

import { ServiceMenuBar } from "@dss/ui";

import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth/guards";
import { portalAppsUrl, thisServiceId } from "@/lib/auth/oidc";
import { readServiceMenu } from "@/lib/auth/service-menu-cookie";

/**
 * 사내 구간. 이 아래 모든 화면은 로그인 필수다.
 * 공개 구간((public))에서는 사내 데이터를 조회하지 않는다.
 *
 * 🔴 requireSession 에 돌아갈 주소를 주지 못한다. 서버 레이아웃은 지금 어떤
 * 주소를 보고 있는지 알 수 없고(searchParams 도 pathname 도 받지 않는다),
 * 레이아웃은 자식 화면보다 **먼저** 돌아 여기서 포털로 보내 버린다. 그래서
 * 아래 화면들이 적어 둔 returnTo(posts/[id]/page.tsx 등)는 미로그인 상태에서는
 * 쓰이지 못하고, 깊은 주소로 들어오려던 사람은 로그인 뒤 첫 화면에 선다.
 * 고치려면 middleware 로 주소를 머리말에 실어 내려야 해서 이번 조각에서는
 * 손대지 않았다(지시서 범위 밖).
 */
export default async function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await requireSession();

  // 머리말 **안**에 앉는 서비스 오가기 목록. 포털이 로그인 ID 토큰에 실어
  // 보낸 것을 콜백이 별도 서명 쿠키에 구워 두었다(auth/service-menu-cookie.ts).
  //
  // 쿠키가 없거나 못 믿을 것이면 빈 배열이고, 그때는 아래에서 조각 자체를
  // 만들지 않는다 — 머리말이 예전과 똑같다(빈 자리도 남지 않는다).
  const services = await readServiceMenu();
  // 「지금 여기」로 눌러 그릴 칸을 고르는 열쇠 — 이 시스템의 client_id 다
  // (`dss-board`). 목록이 있을 때만 읽는다: 없으면 그릴 칸 자체가 없고,
  // 설정이 빠진 기계에서 머리말 하나 때문에 모든 화면이 죽으면 안 된다.
  const currentServiceId = services.length > 0 ? thisServiceId() : null;

  return (
    <>
      <SiteHeader
        viewer={viewer}
        // 포털(dss-auth)로 돌아가는 칸의 주소. 🔴 위 services 와 **엮지
        // 않는다** — 포털은 포털의 clients 표에 없어 오가기 목록에 끼지
        // 못하므로(oidc.ts 의 portalAppsUrl), 목록이 비어 메뉴바가 통째로
        // 사라진 사람에게도 이 칸은 남아야 한다. 그래서 services.length 를
        // 보지 않고 늘 넘긴다.
        portalUrl={portalAppsUrl()}
        serviceMenu={
          services.length === 0 ? null : (
            /*
              사내 시스템 오가기 목록(@dss/ui). 머리말 **위**가 아니라 **안**에
              앉는다(variant="inline") — 위에 회색 띠로 따로 두면 화면 맨 위가
              두 층이 되어 답답하고 본문이 한 줄만큼 줄어든다(2026-09-18
              사용자 결정, A/S·계측기·개선요청이 모두 같은 모습이다).

              그 모습은 **드롭다운 단추 하나**다. 단추에는 지금 있는 서비스가
              서고(폰은 아이콘만), 누르면 목록이 단추 아래로 **떠서** 펼쳐진다.
              펼치고 접는 것은 `<details>` 라 **자바스크립트 없이** 된다 —
              로그아웃을 평범한 `<form>` 으로 둔 것과 같은 판단이다. 바깥을
              눌러 접기와 Esc 만 묶음 안의 작은 조각(`DropdownDismiss`, 그것만
              "use client")이 **얹는다** — 아무것도 그리지 않으므로 마크업이
              늘지 않는다. 🔴 그렇다고 이 파일이나 SiteHeader 에 "use client"
              를 붙이지 않는다. 딸려 오는 조각은 묶음 안에 있고 이 파일과
              무관하다.

              🔴 className 을 여기서 넘기는 이유: 이 조각의 className 은
              <nav> 에 붙는데, 머리말이 그것을 래퍼 없이 **flex 항목 그대로**
              그린다(site-header.tsx — 감싸면 메뉴가 없을 때 빈 칸이 남는다).
              그래서 이 <nav> 가 곧 그 줄의 항목이고, 폭을 정하는 클래스가
              여기 붙어야 듣는다. `shrink-0` 은 단추가 제 내용 폭을 지키게
              하고(단추는 white-space: nowrap 이라 눌리면 밖으로 삐져나온다),
              `mr-auto` 는 justify-between 인 그 줄에서 단추가 한가운데로
              밀려나지 않게 제목 옆에 붙들어 둔다.

              🔴 colorScheme 은 넘기지 않는다. 이 사이트는 globals.css 에서
              color-scheme: light 로 고정이고, 기본값 "host" 는 조상에 .dark 가
              있을 때만 어두워지므로 그대로 두는 것이 옳다(@dss/ui README 4절).
            */
            <ServiceMenuBar
              services={services}
              currentServiceId={currentServiceId}
              variant="inline"
              className="shrink-0 mr-auto"
            />
          )
        }
      />
      <main className="mx-auto max-w-[1100px] px-4 py-6">{children}</main>
    </>
  );
}
