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
 *   제목 · 사내 시스템 오가기 메뉴바 │ [사용자 관리] · 이름 · [로그아웃]
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
 * 🔴 메뉴바의 펼친 목록은 단추 아래로 **떠서**(position: absolute, z-index 50)
 * 이 <header> 밖으로 나온다. 그래서 여기와 그 조상(body·html)에
 * `overflow: hidden` 을 걸면 **목록이 잘려 아무것도 고를 수 없게 된다.**
 * 지금은 한 곳도 없다 — 그대로 두어야 한다.
 */
export function SiteHeader({
  viewer,
  serviceMenu = null,
}: {
  viewer: Viewer;
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

          <form action={logoutAction}>
            <button
              type="submit"
              className="text-gray-500 hover:text-gray-900 hover:underline"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
