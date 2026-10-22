import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { HeaderMenuDismiss } from "@/components/header-menu-dismiss";
import type { Viewer } from "@/lib/auth/guards";

/**
 * 머리말.
 *
 * 서버 컴포넌트다 — "use client" 를 붙이지 않는다. 로그아웃은 서버 액션을
 * 부르는 평범한 <form> 이라 자바스크립트 없이도 동작하고, ☰ 를 여닫는 일도
 * <details> 라 브라우저가 한다(아래 ☰ 주석). 딸려 오는 클라이언트 조각은
 * header-menu-dismiss.tsx 하나뿐이고 그 파일은 아무것도 그리지 않는다.
 *
 * ── 넓은 화면(768px 이상) 이 한 줄에 무엇이 들어가나 ────────────────────
 *
 *   제목 · 사내 시스템 오가기 메뉴바 │ [사용자 관리] · 이름 · [통합 로그인으로] · [로그아웃] · 🔔
 *
 * 🔴 **768px 이상은 2026-10-22 이전과 한 글자도 다르지 않다.** 아래 ☰ 와 서랍은
 * 통째로 `md:hidden` 이고, 오른쪽 묶음은 `hidden md:flex` 라 넓은 화면에서는
 * 예전 그대로 한 줄에 선다. 넓은 화면에 더해진 것은 **머리말 고정 하나**다.
 *
 * ── 좁은 화면(768px 미만) 2026-10-22 ───────────────────────────────────
 *
 *   ☰ · 제목 · 메뉴바 │ 🔔
 *
 * 그 밖의 것(사용자 관리 · 이름 · 통합 로그인으로 · 로그아웃)은 전부 **☰ 서랍
 * 안**으로 들어간다. 사내 시스템 넷(재고관리 · 휴가 관리 · 계측기 · PO/내자)이
 * 같은 날 같은 모양이 되었고 게시판이 마지막이다.
 *
 * 🔴 **☰ 는 맨 왼쪽, 종은 맨 오른쪽**이다. 종의 펼친 목록이 종에 오른쪽 끝을
 * 맞춰 왼쪽으로 펼쳐지므로(@dss/ui 의 `.dss-bell__list` 가 `right: 0`), 종이
 * 맨 오른쪽이 아니면 폰에서 목록 왼쪽이 화면 밖으로 잘린다.
 * 🔴 **메뉴를 두 벌로 베껴 적지 않는다.** 넓은 화면과 서랍이 같은 조각
 * (`ScreenLinks` · `UserIdentity` · `ExitLinks`)을 쓴다 — 베끼면 한쪽을 고칠 때
 * 잊혀 **폰과 컴퓨터가 서로 다른 메뉴를 그리는데 오류는 안 난다.**
 *
 * ── 폰(360px, 안쪽 폭 328px)의 폭 셈 — 2026-10-22 다시 쟀다 ─────────────
 *
 * 그 전에는 나가는 단추 둘과 이름과 종이 모두 이 줄에 있어, 관리자 + 폰에서
 * 66px 이 넘쳤고 「사용자 관리」와 이름이 두 줄로 접혀 그 폭을 내주고 있었다.
 * **지금은 그 넷이 서랍 안이라 이 줄에서 사라졌다.** 남은 넷의 셈은 이렇다
 * (손가락 화면 기준 — 종과 메뉴바가 그때 한 단 커진다):
 *
 *   ☰ 36 + gap 16 + 제목 124 + gap 16 + 메뉴바 54 + gap 16 + 종 40
 *   = 302 ≤ 328 ✔ 26px 남는다. **관리자도 일반 직원도 같다** — 갈리던 칸이
 *     전부 서랍 안이기 때문이다.
 *
 *   메뉴바가 없는 사람(오가기 목록이 빈 사람)  302 − 70 = 232 ✔
 *   알림이 0건인 사람                          302 − 56 = 246 ✔
 *
 * 각 값의 출처: ☰ 는 아래 `<summary>` 의 36px, 제목은 text-base(16px) 굵은
 * 「DSS 사내 게시판」 열 글자, 메뉴바는 @dss/ui 의 `.dss-menu--inline`
 * `.dss-menu__summary`(좌우 여백 12+12 · 아이콘 14 · gap 6 · 삼각형 2+8, 폰에서는
 * 이름이 눈에서 감춰져 아이콘만 남는다), 종은 `.dss-bell__summary`(컴퓨터 36 ·
 * 손가락 40). gap 은 이 줄의 `gap-4` 16px 이다.
 *
 * 🔵 320px 처럼 더 좁은 기기에서는 302 > 288 이라 바깥 줄이 `flex-wrap` 으로
 * 꺾여 **종이 둘째 줄로** 내려간다. 그때 오른쪽 묶음의 `ml-auto` 가 종을 그 줄의
 * 오른쪽 끝에 붙여 둔다 — 그래서 꺾여도 종의 펼친 목록은 잘리지 않는다.
 * `ml-auto` 는 넓은 화면에서는 `justify-between` 과 같은 결과라 아무것도 바꾸지
 * 않는다(남는 자리를 똑같이 다 가져간다).
 *
 * 🔴 메뉴바의 펼친 목록과 **종의 펼친 목록**은 둘 다 제 단추 아래로 **떠서**
 * (position: absolute, z-index 50) 이 <header> 밖으로 나온다. 그래서 여기와
 * 그 조상(body·html)에 `overflow: hidden` 을 걸면 **목록이 잘려 아무것도 고를
 * 수 없게 된다.** 지금은 한 곳도 없다 — 그대로 두어야 한다.
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
 * 🔵 2026-10-22 부터 **☰ 서랍 안의 같은 단추 둘도 이 상수를 쓴다**(아래
 * `ExitLinks`). 서랍에서는 세로로 세우느라 폭만 더 붙인다.
 *
 * 🔴 색 이름은 **이 저장소 결인 `gray`** 다. 개선요청·계측기는 `slate`,
 * A/S 는 `zinc` 인데 그대로 베끼면 이 머리말 안에서 이 둘만 다른 회색이 된다
 * (옆의 「사용자 관리」·이름·관리자 뱃지가 모두 gray 계열이다).
 *
 * 🔴 `whitespace-nowrap` 이 「통합 / 로그인으로」처럼 단추 **안에서** 글자가
 * 접히는 것을 막는다. A/S·계측기가 둘 다 같은 까닭으로 넣어 두었다.
 *
 * 글자 크기는 따로 적지 않는다 — 감싼 <div> 의 `text-sm` 을 물려받는다(넓은
 * 화면의 오른쪽 묶음과 서랍의 계정 묶음 둘 다 `text-sm` 이다). 옆의 「사용자
 * 관리」·이름도 그렇게 하고 있어 이 파일의 결과 같고, A/S·계측기가 쓰는
 * `text-xs` 를 가져오면 이 머리말에서는 단추 둘만 작아 보인다.
 */
const HEADER_EXIT_BUTTON_CLASS =
  "rounded-md border border-gray-300 px-3 py-1.5 whitespace-nowrap text-gray-700 hover:bg-gray-50";

/**
 * 이 사이트 **안**의 화면으로 들어가는 링크(넓은 화면). 테두리 없는 파란 글자다 —
 * 밖으로 나가는 길인 단추 둘과 일부러 다르게 둔 것이다.
 */
const HEADER_SCREEN_LINK_CLASS = "text-blue-700 hover:underline";

/**
 * 같은 링크를 ☰ 서랍 안에 **세로로** 세운 모습. 가는 곳도 자격도 같다 — 바뀌는
 * 것은 생김새뿐이다(손가락으로 누르는 칸이라 높이를 주고, 밑줄 대신 바탕색이
 * 들어온다).
 */
const PANEL_SCREEN_LINK_CLASS =
  "block rounded-md px-2 py-2 whitespace-nowrap text-blue-700 hover:bg-gray-100";

/**
 * 이 사이트 안의 화면 메뉴. 지금은 관리자 전용 「사용자 관리」 하나뿐이다.
 *
 * 🔴 **넓은 화면과 ☰ 서랍이 이 조각 하나를 함께 쓴다** — 생김새(`linkClassName`)만
 * 다르다. 두 벌로 베껴 적으면 여기 달린 자격 규칙(`viewer.isAdmin`)이 갈려
 * **폰과 컴퓨터가 서로 다른 메뉴를 그리는데 아무 오류도 안 난다.**
 *
 * 🔴 누가 무엇을 보는지는 **한 줄도 바꾸지 않았다.** 실제 차단은 여기가 아니라
 * 그 화면의 가드가 한다(lib/auth/guards.ts) — 이 조건은 UI 편의일 뿐이다.
 */
function ScreenLinks({
  viewer,
  linkClassName,
}: {
  viewer: Viewer;
  linkClassName: string;
}) {
  if (!viewer.isAdmin) return null;

  return (
    <Link href="/admin/users" className={linkClassName}>
      사용자 관리
    </Link>
  );
}

/** 이름 + 관리자 뱃지. 넓은 화면의 오른쪽 끝과 ☰ 서랍이 같은 조각을 쓴다. */
function UserIdentity({ viewer }: { viewer: Viewer }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-700">
      {viewer.user.displayName}
      {viewer.isAdmin && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          관리자
        </span>
      )}
    </span>
  );
}

/**
 * 이 사이트를 **떠나는 길 둘**(포털로 가기 · 로그아웃). 넓은 화면의 오른쪽 끝과
 * ☰ 서랍이 같은 조각을 쓴다 — 가는 곳도 끊는 범위도 두 자리가 같아야 한다.
 *
 * `stacked` 는 **서랍에서 세로로 세울 때**만 참이다. 폭을 채우는 클래스 둘이
 * 붙을 뿐이고, 넓은 화면에서는 `HEADER_EXIT_BUTTON_CLASS` 글자 그대로가 나간다.
 */
function ExitLinks({
  portalUrl,
  stacked = false,
}: {
  portalUrl: string;
  stacked?: boolean;
}) {
  const linkClassName = stacked
    ? `${HEADER_EXIT_BUTTON_CLASS} block text-center`
    : HEADER_EXIT_BUTTON_CLASS;
  const buttonClassName = stacked
    ? `${HEADER_EXIT_BUTTON_CLASS} w-full`
    : HEADER_EXIT_BUTTON_CLASS;

  return (
    <>
      {/*
        포털로 돌아가는 길.

        🔴 **메뉴바와 무관하게 늘 보인다.** 포털 자신은 포털의 clients 표에
        없어 오가기 목록에 끼지 못하므로(oidc.ts 의 portalAppsUrl), 그
        목록이 비어 메뉴바가 통째로 사라진 사람 — 쓸 수 있는 다른 시스템이
        없는 사람 — 에게도 이 칸은 남아야 한다. 포털을 그 목록에 섞어
        넣으면 바로 그 사람에게 항목 하나짜리 드롭다운 단추가 생긴다.

        🔴 생김새는 **로그아웃과 완전히 같은 테두리 단추**다(다른 사내
        시스템들과 통일 — HEADER_EXIT_BUTTON_CLASS 주석 참조). 「사용자
        관리」가 테두리 없는 파란 글자인 것은 이 사이트 **안**의 화면으로
        들어가는 링크라서이고, 이 둘만 단추인 것은 **밖으로 나가는 길**이기
        때문이다.

        평범한 <a> 다. 다른 앱(다른 포트·다른 호스트)으로 가는 주소라
        next/link 의 클라이언트 전환은 뜻이 없고 어차피 전체 이동이 된다
        (@dss/ui 의 메뉴바가 같은 판단을 적어 두었다).

        🔵 2026-10-22 에 **「포털」로 줄여 쓰던 처방을 걷어냈다.** 그 전에는
        폰에서 이 칸이 머리말 한 줄에 함께 서 있어 「통합 로그인으로」가
        단추 여백까지 128px 이면 관리자 화면이 넘쳤고, 그래서 짧은 쪽을
        보이고 긴 쪽을 sr-only 로 남겼었다. 이제 이 단추는 폰에서 **☰ 서랍
        안**(폭 256px)에 서므로 줄일 까닭이 없어졌고, 줄여 두면 서랍 안에서
        「포털」만 보인다. 말이 온전한 편이 안전하다.
      */}
      <a href={portalUrl} className={linkClassName}>
        통합 로그인으로
      </a>

      {/*
        🔴 <form> 과 action 은 건드리지 않는다 — 이 길이 포털까지 함께
        끊는 길이다(app/actions/auth.ts). 바뀐 것은 단추의 클래스뿐이다.
        링크로 바꾸지도 않는다: 서버 액션을 부르는 POST 라 자바스크립트
        없이도 동작한다(이 파일 머리말).

        🔵 「로그아웃」은 폰에서도 줄이지 않는다. 누르면 모든 시스템에서
        나가는 칸이라 말이 온전한 편이 안전하다 — 계측기도 같은 까닭으로 이
        말만은 줄이지 않았다. 접히는 것은 nowrap 이 막는다.
      */}
      <form action={logoutAction}>
        <button type="submit" className={buttonClassName}>
          로그아웃
        </button>
      </form>
    </>
  );
}

export function SiteHeader({
  viewer,
  portalUrl,
  serviceMenu = null,
  notificationBell = null,
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
   *
   * 🔴 **래퍼 <div> 로 감싸지 않는다.** 그릴 것이 없으면 조각이 스스로 null 이
   * 되는데(@dss/ui — 빈 띠를 남기지 않는다), 감싸 두면 그때도 빈 flex 항목과
   * 그 앞 여백(왼쪽 묶음 gap-4 = 16px)이 남아 머리말이 예전과 달라진다.
   * 감싸지 않으면 항목 자체가 사라져 **메뉴바가 없을 때 머리말이 지금과 글자
   * 하나 다르지 않다.** 대신 폭을 정하는 클래스(shrink-0)는 레이아웃이 조각에
   * 직접 넘긴다 — 그 조각의 <nav> 가 곧 왼쪽 묶음의 flex 항목이다.
   */
  serviceMenu?: ReactNode;
  /**
   * 알림 종(@dss/ui 의 NotificationBell). 메뉴바와 **같은 방식**으로 받는다 —
   * 다 그려진 노드다. 이 파일은 @dss/ui 도, 알림을 어디서 구하는지도 모른다
   * ((internal)/layout.tsx 가 DB 와 포털에서 읽어 만들어 내려보낸다).
   *
   * 🔴 그릴 알림이 없으면 그 조각이 **스스로 null** 이다(@dss/ui 의 판단 —
   * 눌러도 아무것도 없는 단추를 머리말에 남기지 않는다). 그래서 래퍼 <div> 로
   * 감싸지 않고 오른쪽 묶음의 **flex 항목으로 그대로** 둔다: 감싸면 알림이
   * 0건일 때도 빈 항목과 그 앞 여백(gap-3 12px)이 남는다. 같은 묶음의 다른
   * 항목(넓은 화면 전용 묶음)은 폰에서 `hidden` 이라 자리를 먹지 않으므로,
   * **알림이 0건인 폰에서는 오른쪽 묶음이 통째로 폭 0** 이 된다.
   */
  notificationBell?: ReactNode;
}) {
  return (
    // ── 🔴 머리말은 굴러도 화면 위에 남는다 (2026-10-22) ─────────────────
    //
    // 🔴 `bg-white` 가 함께 붙어야 한다. 그 전에는 바탕색을 적지 않아도 body 의
    //    흰색이 비쳐 같아 보였지만, 고정된 머리말 **밑으로 본문이 지나가면서**
    //    글자가 비쳐 보이게 된다. body 와 같은 #ffffff 라 넓은 화면의 모습은
    //    그대로다(globals.css 의 body 배경).
    //
    // 🔴 `z-30` 은 **이 저장소에서 직접 센 값**이다(src 전체의 z 유틸리티와
    //    globals.css 의 z-index 를 2026-10-22 에 훑었다 — 쌓임 값을 적은 자리가
    //    그 둘뿐이다. 🔵 다시 셀 때 찾을 말은 "z-index" 와 z 유틸리티 이름인데,
    //    그 유틸리티를 대괄호째 적는 정규식을 **주석에 남기지 마라**: Tailwind 가
    //    주석까지 긁어 가짜 클래스를 CSS 로 찍으려 든다).
    //    본문 쪽에서 가장 높은 것은 글 본문 사진 손잡이의
    //    z-index: 1 하나뿐이라 30 이면 한참 위다. 다른 사내 시스템 머리말과 같은
    //    값으로 맞춰 두었다(재고관리는 본문 최대가 20 이라 30 을 골랐다).
    //    🔴 `sticky` 에 z 를 주면 머리말이 **쌓임 맥락**을 만든다. 그 뒤로 머리말
    //    **안**의 z 값(종 목록 50 · 메뉴바 목록 50 — 둘 다 @dss/ui 의 CSS · 아래
    //    서랍 60)은 전부 이 맥락 안에서만 겨루고, 바깥과는 이 30 하나로 겨룬다.
    //    그래서 본문에 30 이상을 더하는 날에는 **이 값도 함께 올려야 한다** —
    //    안 올리면 머리말이 덮이는데 오류는 안 난다.
    //
    // 🔵 `print:static` — 인쇄에서 고정은 방해다(브라우저에 따라 쪽마다 겹쳐
    //    찍히거나 첫 쪽 본문을 가린다). static 으로 돌리면 z-index 도 함께 뜻을
    //    잃어 되돌림이 하나면 된다. 🔴 이 저장소에는 인쇄 규칙이 **한 줄도
    //    없었다.** 그래서 재고관리의 `.no-print` 같은 **남의 낱말을 들여오지
    //    않는다**(여기서는 아무 데도 안 걸리는 죽은 이름이 된다) — 이 한 줄은
    //    새 규칙이 아니라 **바로 위에서 더한 sticky 를 인쇄에서만 되돌리는**
    //    것이다.
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white print:static">
      <div className="mx-auto flex min-h-14 max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4">
        {/*
          왼쪽 묶음. 🔵 2026-10-22 에 생겼다 — 그 전에는 제목과 메뉴바가 이 줄의
          flex 항목 둘이었고, 메뉴바가 `mr-auto` 로 제목 옆에 붙들려 있었다.
          ☰ 가 셋째로 끼면서 묶어 두는 편이 분명해졌고, 묶으니 바깥 줄의 항목이
          둘이 되어 오른쪽 묶음을 `ml-auto` 하나로 끝에 붙일 수 있다(줄이 꺾여도
          종이 오른쪽에 남는 까닭 — 파일 머리말의 320px 셈).
          🔴 넓은 화면의 모습은 그대로다: 안쪽 `gap-4` 가 바깥 줄의 `gap-4` 와
          같은 값이라 제목과 메뉴바 사이가 예전과 똑같이 16px 이다.
        */}
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {/*
            ☰ — 768px 미만에서만 선다. 🔴 **머리말 맨 왼쪽**이다, 시스템 이름보다도
            앞(사내 시스템 넷이 같은 자리다). 🔴 `md:hidden` 이라 넓은 화면에서는
            아예 그려지지 않는다 — 그래서 이 묶음이 통째로 들어와도 768px 이상은
            예전과 글자 하나 다르지 않다.

            🔴 **<details>/<summary> 다 — `useState` 를 쓰지 않는다.** 여는 일은
            브라우저에 맡긴다. 상태로 여닫으려면 이 파일을 클라이언트로 내려야
            하는데, 그러면 서버/클라이언트 경계가 깨지고 그 결함은 **시험이 다
            통과해도 `npm run build` 에서만** 드러난다(이 저장소에는 시험이 아예
            없으니 더더욱 build 가 유일한 그물이다). 로그아웃을 평범한 <form> 으로
            둔 것과 같은 판단이다.
            🔵 그 대가 하나를 아래 <HeaderMenuDismiss /> 가 갚는다 — 서랍 안의
            링크를 눌러 화면을 옮겨도 서랍이 열린 채 남는 것(머리말은 레이아웃이라
            화면을 옮겨도 다시 안 그려지고, 열림 여부는 브라우저가 쥔 값이다).

            🔴 `shrink-0` — 이 줄에서 눌려도 되는 것은 글자뿐이다. 없으면 좁은
            폭에서 flex 가 36px 를 깎아 **손가락에 안 잡히는 크기**가 된다.
            🔴 <summary> 앞의 ▶ 삼각형은 `list-none`(파이어폭스·크롬) 과
            `::-webkit-details-marker`(사파리) **둘 다** 꺼야 사라진다.
            🔴 `data-header-menu` 는 모양이 아니라 **표식**이다 — 아래
            <HeaderMenuDismiss /> 가 「우리 ☰」만 골라 집는 손잡이로 쓴다. 이 칸을
            지우거나 이름을 바꾸면 서랍이 **저절로 안 접히는데 오류도 안 난다.**
            🔵 `print:hidden` 은 서랍이 **열린 채로 인쇄될 때** 검은 바탕이 종이를
            통째로 덮는 것을 막는다. 접혀 있으면 어차피 아무것도 안 나온다.
          */}
          <details
            className="shrink-0 md:hidden print:hidden"
            data-header-menu=""
          >
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-gray-700 select-none hover:bg-gray-100 [&::-webkit-details-marker]:hidden"
              aria-label="메뉴"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ☰
              </span>
            </summary>

            {/* 서랍을 **저절로 접는** 조각. 아무것도 그리지 않는다 — 마크업이 한
                글자도 늘지 않으므로 아래 서랍의 모양과 차례는 그대로다.
                🔵 이 조각이 없어도(스크립트가 아직 안 붙었어도) ☰ 는 눌러서 열리고
                   다시 눌러 접힌다. 더해지는 것은 **접히는 때** 셋뿐이다. */}
            <HeaderMenuDismiss />

            {/*
              서랍 — 왼쪽에서 나온다.

              🔴 `fixed` 는 **화면**에 매달린다 — 머리말에 매달리지 않는다. 위
                 `sticky` 는 position:fixed 의 기준(containing block)을 만들지
                 않으므로(그것을 만드는 것은 transform·filter·contain 같은
                 것들이다) 머리말 안에 적어도 화면 전체를 덮는다.
              🔴 z 는 **머리말 안에서만** 겨룬다(머리말이 쌓임 맥락이다 — 위
                 <header> 주석). 같은 맥락에 종의 펼친 목록과 메뉴바의 펼친 목록이
                 각각 50 으로 들어와 있고, 50 끼리 맞비기면 **뒤에 적힌 쪽**이
                 이긴다(종이 이 서랍보다 뒤에 있다). 서랍은 화면을 덮는 것이므로
                 둘보다 위여야 해서 60 으로 둔다.
              🔵 `md:hidden`·`print:hidden` 을 여기 또 적지 않는다 — 바깥
                 <details> 가 이미 그렇다.
            */}
            <div className="fixed inset-0 z-[60] flex">
              {/*
                검은 바탕. 🔴 **반드시 <button> 이어야 한다** — 모양 때문이 아니라
                **눌러서 닫히게 하려고** 그렇다.

                서랍이라 이 바탕이 <details> **안**이다. 그래서 HeaderMenuDismiss 의
                「바깥 누르기」(pointerdown)에는 **안 걸린다** — 안이니까. 걸리는
                길은 다른 쪽이다: 서랍 **안**은 click 으로 듣고, 눌린 것이 거기
                `PANEL_ACTIONS = "a, button"` 에 걸릴 때만 접는다. 이것이 <button>
                이면 그대로 접히고, 평범한 <div> 면 **눌러도 아무 일이 없는데 오류도
                안 난다.**
                🔴 `type="button"` 을 빠뜨리지 마라. 빠지면 기본값이 `submit` 이고,
                   **같은 서랍 안에 <form action={logoutAction}> 이 있다.** 지금은
                   이 단추가 그 폼 밖이라 당장 로그아웃이 날아가지는 않지만,
                   마크업을 조금만 손대면 **바탕을 누를 때마다 로그아웃되는** 화면이
                   된다.
                🔵 `click` 으로 접히는 것도 일부러다 — pointerdown 에 접으면 서랍
                   안쪽이 display:none 이 되어 눌린 것의 click 이 아예 안 난다.
              */}
              <button
                type="button"
                aria-label="메뉴 닫기"
                className="absolute inset-0 bg-black/40"
              />

              {/*
                서랍 본체. 🔴 아래쪽 인셋 패딩의 까닭: 서랍은 화면 높이를 꽉
                채우므로, 없으면 **맨 아래 칸**(로그아웃)이 홈 인디케이터/제스처
                바에 겹쳐 눌리지 않는다 — A/S 에서 실제로 겪은 일이다.
                🔴 패딩과 인셋은 **한 클래스 안에서 더한다.** 아래위를 한꺼번에
                   주는 클래스를 둔 채 인셋을 따로 걸면 같은 padding-bottom 을 두
                   클래스가 다투고, 지는 날 아이폰에서 인셋이 조용히 사라진다.
                   인셋이 0인 기기에서는 정확히 12px 이다.
                   🔴 이 주석에 그 클래스 이름을 **대괄호째 적지 마라.** Tailwind 는
                      주석까지 긁어 가짜 클래스를 CSS 로 찍으려 들고, 줄임표가
                      섞이면 globals.css 가 통째로 깨져 전 페이지가 500 이 된다.
                🔵 `overflow-y-auto`(+`min-h-0`) — 가로로 눕힌 폰에서는 메뉴가
                   화면보다 길어질 수 있다. `overscroll-contain` 은 끝까지 민
                   스크롤이 뒤 페이지로 새는 것을 막는다.
              */}
              <div className="relative z-50 flex min-h-0 w-64 flex-col overflow-y-auto overscroll-contain border-r border-gray-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-sm">
                {/*
                  이 사이트 안의 화면 메뉴. 🔵 <nav> 로 감싸지 않는다 — 지금 여기
                  설 수 있는 것은 관리자 전용 한 칸뿐이라 **대부분의 사람에게는
                  빈 랜드마크**가 되고, 넓은 화면의 같은 링크도 <nav> 없이 서 있다.
                  칸이 여럿이 되는 날 두 자리에 함께 붙인다.
                */}
                <div className="flex flex-col gap-0.5">
                  <ScreenLinks
                    viewer={viewer}
                    linkClassName={PANEL_SCREEN_LINK_CLASS}
                  />
                </div>

                {/*
                  빈 칸막이 — 아래 계정 묶음을 **서랍 바닥**에 붙인다.

                  🔴 **`mt-auto` 를 쓰지 않은 까닭.** 아래 묶음에 margin-top:auto 를
                     주면 자리가 남을 때는 잘 내려가지만, 메뉴가 **서랍보다 길어지는
                     순간**(가로로 눕힌 폰 · 글자 크기를 키운 기기 · 메뉴가 더 느는
                     날) 남는 자리가 없어 auto 가 **0 으로 풀린다.** 그러면 아래
                     묶음의 구분선 위 12px 간격이 사라져 구분선이 마지막 링크에
                     바짝 달라붙는다 — 간격이 가장 필요한 때에 없어지는데 오류는 한
                     줄도 안 나고 눈에만 드러난다.
                  🔵 칸막이는 두 경우가 모두 옳다. 서랍 본체가 세로 flex 이고 높이가
                     화면에 매여 있으므로(바깥이 fixed inset-0), 자리가 남으면
                     `grow` 가 남는 자리를 전부 가져가 아래 묶음이 바닥에 붙고,
                     내용이 길어지면 칸막이가 **높이 0** 으로 줄어 예전과 같은
                     모양이 된다(스크롤도 그대로 생긴다).
                  🔴 **빈 div 라고 지우지 마라.** 지우면 계정 묶음이 다시 링크 바로
                     밑으로 올라붙는데 오류는 안 난다.
                  🔵 `aria-hidden` — 아무것도 그리지 않으므로 낭독기에 알릴 것이 없다.
                     HeaderMenuDismiss 의 「안쪽을 누르면 접는다」 규칙은 `a, button`
                     만 보므로 칸막이는 거기 안 걸린다(눌러도 아무 일이 없다 — 맞다).
                */}
                <div aria-hidden="true" className="grow" />

                {/*
                  구분선 아래는 넓은 화면에서 오른쪽 끝에 서 있던 것들이다 —
                  **차례도 그대로**(이름 → 통합 로그인으로 → 로그아웃).
                */}
                <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-gray-200 pt-3">
                  <UserIdentity viewer={viewer} />
                  <ExitLinks portalUrl={portalUrl} stacked />
                </div>
              </div>
            </div>
          </details>

          <Link href="/" className="text-base font-bold text-gray-900 sm:text-lg">
            DSS 사내 게시판
          </Link>

          {/* 제목 바로 옆. 넓은 화면에서 통째로 비어 있던 가운데 자리다.
              🔵 **폰에서도 접지 않는다** — 다른 시스템으로 건너가는 길이고, 폰에서는
              @dss/ui 가 단추를 아이콘 하나로 줄여 54px 밖에 안 먹는다. */}
          {serviceMenu}
        </div>

        {/* 🔵 `ml-auto` 는 줄이 꺾였을 때 종을 그 줄의 오른쪽 끝에 붙들어 둔다.
            넓은 화면에서는 `justify-between` 과 결과가 같아 아무것도 바꾸지 않는다
            (파일 머리말의 320px 셈). */}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {/*
            넓은 화면 전용 묶음. 🔴 768px 미만에서는 통째로 **☰ 서랍 안**으로
            들어간다(같은 조각을 서랍이 다시 쓴다 — 베껴 적지 않는다).
            🔴 `hidden md:flex` 라 넓은 화면에서는 예전과 똑같은 flex 한 줄이고,
            안쪽 `gap-3` 도 바깥 묶음의 `gap-3` 과 같은 값이라 칸 사이가 예전
            그대로 12px 이다.
          */}
          <div className="hidden items-center gap-3 md:flex">
            <ScreenLinks
              viewer={viewer}
              linkClassName={HEADER_SCREEN_LINK_CLASS}
            />
            <UserIdentity viewer={viewer} />
            <ExitLinks portalUrl={portalUrl} />
          </div>

          {/*
            알림 종. 🔴 **줄의 맨 오른쪽 끝**이다 — 펼친 목록이 종에 오른쪽
            끝을 맞춰 왼쪽으로 펼쳐지므로(@dss/ui 의 `.dss-bell__list` 가
            `right: 0`), 가운데쯤에 앉으면 폰에서 목록 왼쪽이 화면 밖으로
            잘린다. 개선요청 머리말이 같은 까닭으로 같은 자리에 두었다.
            🔴 **좁은 화면에서도 서랍에 접지 않는다**(사내 시스템 넷과 같은
            결정) — 알림은 접힌 서랍 안에서 기다리면 안 되는 것이고, 이 자리가
            비면 목록이 설 자리도 함께 어긋난다. 2026-10-22 부터 폰에서 이 줄의
            오른쪽 끝에 남는 것은 **종 하나**라, 「종이 맨 오른쪽」이라는 전제가
            오히려 더 분명해졌다. 종 오른쪽에 무언가를 더하면 그때 목록이 잘린다.

            🔴 나가는 단추 둘(포털 · 로그아웃)보다 **뒤**에 둔 것도 그래서다.
            그 둘은 이 사이트를 떠나는 길이라 묶여 있어야 하고(바로 위 묶음),
            종은 그 묶음 바깥의 아이콘 하나다.

            래퍼 <div> 로 감싸지 않는다: 알림이 0건이면 조각이 스스로 null 이라
            항목 자체가 사라져야 하는데, 감싸면 빈 항목과 그 앞 여백이 남는다
            (이 파일의 notificationBell 칸 주석).

            colorScheme 은 넘기는 쪽에서도 안 넘긴다 — 이 사이트는 globals.css
            에서 color-scheme: light 로 고정이고, 기본값 "host" 는 조상에
            .dark 가 있을 때만 어두워지므로 그대로 두는 것이 옳다.
          */}
          {notificationBell}
        </div>
      </div>
    </header>
  );
}
