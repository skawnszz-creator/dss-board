import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import type { Viewer } from "@/lib/auth/guards";

/**
 * 머리말.
 *
 * 서버 컴포넌트다 — "use client" 를 붙이지 않는다. 로그아웃은 서버 액션을
 * 부르는 평범한 <form> 이라 자바스크립트 없이도 동작한다.
 *
 * ── 이 한 줄에 무엇이 들어가나 ──────────────────────────────────────────
 *
 *   제목 · 사내 시스템 오가기 메뉴바 │ [사용자 관리] · 이름 · [통합 로그인으로] · [로그아웃]
 *
 * 메뉴바(@dss/ui 의 ServiceMenuBar)는 **다 그려진 노드**로 받는다. 이 파일이
 * @dss/ui 도, 목록을 어디서 구하는지도 몰라야 하기 때문이다 — 그리는 자리만
 * 여기가 정한다((internal)/layout.tsx 가 만들어 내려보낸다).
 *
 * 🔴 **래퍼 <div> 로 감싸지 않는다.** 그 조각은 그릴 목록이 없으면 스스로
 * null 이 되는데(@dss/ui — 빈 띠를 남기지 않는다), 감싸 두면 그때도 빈 flex
 * 항목과 그 앞 여백(gap-4 = 16px)이 남아 머리말이 예전과 달라진다. 감싸지
 * 않으면 항목 자체가 사라져 **메뉴바가 없을 때 머리말이 지금과 글자 하나
 * 다르지 않다.** 대신 폭을 정하는 클래스(shrink-0 mr-auto)는 레이아웃이
 * 조각에 직접 넘긴다 — 그 조각의 <nav> 가 곧 이 줄의 flex 항목이다.
 *
 * 🔴 `flex-wrap` 과 `min-h-14` 는 좁은 화면 몫이다. 이 줄은 넓은 화면에서는
 * 늘 한 줄이라(항목 높이가 56px 보다 낮아 min-h-14 는 h-14 와 같은 높이를
 * 낸다) 지금과 똑같이 그려지고, 폰처럼 넷이 한 줄에 못 들어가는 폭에서만
 * 줄이 바뀐다. 없으면 flex 가 칸을 min-content 까지 눌러 단추 안에서 글자가
 * 접히거나 항목이 서로 겹친다.
 *
 * 🔴 나가는 단추 둘(포털 · 로그아웃)이 테두리 단추가 되면서 오른쪽 묶음이
 * 넷이 되었다. 폰(360px, 안쪽 폭 328px)의 셈은 이렇다 — text-sm 한 글자를
 * 14px, 단추 하나의 테두리 + 좌우 여백(px-3)을 26px 로 잡는다:
 *
 *   일반 직원   이름 42 + gap 12 + [포털] 54 + gap 12 + [로그아웃] 82
 *               = 202 ≤ 328 ✔ 제 줄에 넉넉히 들어간다
 *   관리자      + 사용자 관리 74 + gap 12 + 관리자 뱃지 54
 *               = 342 ✘ 14px 넘친다 (390px 폰이면 358px 라 들어간다)
 *
 * 넘치면 **바깥 줄이 먼저** `flex-wrap` 으로 꺾여 오른쪽 묶음이 통째로 둘째
 * 줄로 내려간다. 그래도 14px 이 모자라는 「관리자 + 360px」에서는, 안쪽 묶음에
 * flex-wrap 이 없는 대신 **단추 둘이 `whitespace-nowrap` 이라 줄어들지 못하고**
 * 글자가 접힐 수 있는 「사용자 관리」가 대신 두 줄로 접혀 그 폭을 내준다.
 * 머리말이 한 줄 두꺼워질 뿐 **단추는 온전하고, 없어지거나 못 누르게 되는
 * 것은 없다** — nowrap 을 넣은 목적이 바로 이것이다(「통합 / 로그인으로」처럼
 * 단추 안에서 글자가 접히면 단추가 눌린 것처럼 보인다).
 *
 * 🔵 폰에서 **감추지는 않는다.** 포털로 가기와 로그아웃은 이 사이트를 떠나는
 * 길 전부라 좁은 화면에서도 둘 다 남아야 한다(개선요청 머리말에 같은 문장이
 * 있다). 대신 포털 쪽만 눈에 보이는 글자를 「포털」로 줄인다 — 단추도 링크도
 * 그대로 있고 낭독기는 여전히 「통합 로그인으로」를 읽는다(아래 그 자리의
 * 주석). 「로그아웃」은 줄이지 않아도 들어가고, 말이 온전한 편이 안전하다.
 *
 * 🔴 메뉴바의 펼친 목록은 단추 아래로 **떠서**(position: absolute, z-index 50)
 * 이 <header> 밖으로 나온다. 그래서 여기와 그 조상(body·html)에
 * `overflow: hidden` 을 걸면 **목록이 잘려 아무것도 고를 수 없게 된다.**
 * 지금은 한 곳도 없다 — 그대로 두어야 한다.
 */
/**
 * 머리말 오른쪽 끝에 서는 **나가는 단추 둘**(포털로 가기 · 로그아웃)의 생김새.
 *
 * 🔴 **두 단추가 똑같아야 한다**(2026-10-13 사용자 결정). 나란히 서는 칸이라
 * 한쪽만 테두리가 있으면 더 어색하다 — 개선요청이 같은 판단으로 둘에 같은
 * 클래스를 적어 두었고, 그래서 여기서는 아예 **상수 하나로 묶어** 둘이 어긋날
 * 수 없게 했다. 계측기는 로그아웃만 채운 단추(bg-slate-100)로 달리 두었는데
 * 그쪽은 따르지 않는다.
 *
 * 🔴 색 이름은 **이 저장소 결인 `gray`** 다. 개선요청·계측기는 `slate`,
 * A/S 는 `zinc` 인데 그대로 베끼면 이 머리말 안에서 이 둘만 다른 회색이 된다
 * (옆의 「사용자 관리」·이름·관리자 뱃지가 모두 gray 계열이다).
 *
 * 🔴 `whitespace-nowrap` 이 「통합 / 로그인으로」처럼 단추 **안에서** 글자가
 * 접히는 것을 막는다. A/S·계측기가 둘 다 같은 까닭으로 넣어 두었다.
 *
 * 글자 크기는 따로 적지 않는다 — 감싼 <div> 의 `text-sm` 을 물려받는다.
 * 옆의 「사용자 관리」·이름도 그렇게 하고 있어 이 파일의 결과 같고, A/S·계측기가
 * 쓰는 `text-xs` 를 가져오면 이 머리말에서는 단추 둘만 작아 보인다.
 */
const HEADER_EXIT_BUTTON_CLASS =
  "rounded-md border border-gray-300 px-3 py-1.5 whitespace-nowrap text-gray-700 hover:bg-gray-50";

export function SiteHeader({
  viewer,
  portalUrl,
  serviceMenu = null,
}: {
  viewer: Viewer;
  /**
   * 포털(dss-auth)의 앱 런처 주소. (internal)/layout.tsx 가 portalAppsUrl() 로
   * 만들어 내려보낸다 — 이 파일은 포털 주소를 어디서 구하는지 모른다(메뉴바를
   * 다 그려진 노드로 받는 것과 같은 이유다).
   *
   * 🔴 **선택값으로 두지 않는다.** 아래 serviceMenu 와 달리 이 칸은 늘
   * 그려져야 하므로, 넘기는 것을 빠뜨린 자리는 화면이 아니라 typecheck 가
   * 잡아야 한다.
   */
  portalUrl: string;
  /**
   * 사내 시스템 오가기 메뉴바(@dss/ui 의 ServiceMenuBar). 안 넘기면 머리말은
   * 예전 그대로다 — 자리도 여백도 생기지 않는다.
   */
  serviceMenu?: ReactNode;
}) {
  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex min-h-14 max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-base font-bold text-gray-900 sm:text-lg"
        >
          DSS 사내 게시판
        </Link>

        {/* 제목 바로 옆. 넓은 화면에서 통째로 비어 있던 가운데 자리다. */}
        {serviceMenu}

        <div className="flex items-center gap-3 text-sm">
          {viewer.isAdmin && (
            <Link
              href="/admin/users"
              className="text-blue-700 hover:underline"
            >
              사용자 관리
            </Link>
          )}

          <span className="flex items-center gap-1.5 text-gray-700">
            {viewer.user.displayName}
            {viewer.isAdmin && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                관리자
              </span>
            )}
          </span>

          {/*
            포털로 돌아가는 길.

            🔴 **메뉴바와 무관하게 늘 보인다.** 포털 자신은 포털의 clients 표에
            없어 오가기 목록에 끼지 못하므로(oidc.ts 의 portalAppsUrl), 그
            목록이 비어 메뉴바가 통째로 사라진 사람 — 쓸 수 있는 다른 시스템이
            없는 사람 — 에게도 이 칸은 남아야 한다. 포털을 그 목록에 섞어
            넣으면 바로 그 사람에게 항목 하나짜리 드롭다운 단추가 생긴다.

            🔴 생김새는 **로그아웃과 완전히 같은 테두리 단추**다(다른 사내
            시스템들과 통일 — HEADER_EXIT_BUTTON_CLASS 주석 참조). 바로 위
            「사용자 관리」가 테두리 없는 파란 글자인 것은 이 사이트 **안**의
            화면으로 들어가는 링크라서이고, 이 둘만 단추인 것은 **밖으로
            나가는 길**이기 때문이다.

            평범한 <a> 다. 다른 앱(다른 포트·다른 호스트)으로 가는 주소라
            next/link 의 클라이언트 전환은 뜻이 없고 어차피 전체 이동이 된다
            (@dss/ui 의 메뉴바가 같은 판단을 적어 두었다).
          */}
          <a href={portalUrl} className={HEADER_EXIT_BUTTON_CLASS}>
            {/*
              폰(<768px)에서는 「포털」만 보인다. 「통합 로그인으로」는 단추
              여백까지 128px 이라 그대로 두면 관리자 화면이 한 줄에 들어가지
              못한다(이 파일 머리말의 폭 셈).

              🔴 **없애는 것이 아니다**: 단추는 그대로 있고 눌러서 갈 수 있으며,
              긴 이름이 sr-only 로 남아 **화면 낭독기는 여전히 「통합 로그인으로」
              를 읽는다.** 짧은 쪽은 aria-hidden 이라 두 번 읽히지 않는다.
              A/S(TopBar.tsx)·계측기(AppHeader.tsx)가 쓰는 처방 그대로다.
            */}
            <span className="md:hidden" aria-hidden="true">
              포털
            </span>
            <span className="sr-only md:not-sr-only">통합 로그인으로</span>
          </a>

          {/*
            🔴 <form> 과 action 은 건드리지 않는다 — 이 길이 포털까지 함께
            끊는 길이다(app/actions/auth.ts). 바뀐 것은 단추의 클래스뿐이다.
            링크로 바꾸지도 않는다: 서버 액션을 부르는 POST 라 자바스크립트
            없이도 동작한다(이 파일 머리말).

            🔵 「로그아웃」은 폰에서도 줄이지 않는다. 네 글자(단추 여백까지
            82px)라 줄이지 않아도 들어가고, 누르면 모든 시스템에서 나가는
            칸이라 말이 온전한 편이 안전하다 — 계측기도 같은 까닭으로 이 말만은
            줄이지 않았다. 접히는 것은 nowrap 이 막는다.
          */}
          <form action={logoutAction}>
            <button type="submit" className={HEADER_EXIT_BUTTON_CLASS}>
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
