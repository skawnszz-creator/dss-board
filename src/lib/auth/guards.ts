/**
 * 권한 판정은 여기서만 한다.
 *
 * 클라이언트가 보낸 사용자 ID·역할·작성자 ID 는 절대 믿지 않는다.
 * 폼 필드·쿼리스트링·요청 본문에 담겨 온 값으로 권한을 판정하지 않는다.
 * 항상 서버에서 세션을 검증해 얻은 값만 쓴다.
 *
 * 화면에서 버튼을 숨기는 것은 UI 편의일 뿐이고, 실제 차단은 반드시 서버에서 한다.
 *
 * 역할 (이 사이트가 정한 것 — A/S 시스템 역할과 무관하다)
 * - MEMBER : 모든 글 읽기 · 글 쓰기 · 자기 글 수정·삭제
 * - ADMIN  : 위 전부 + 모든 글 수정·삭제 · 직원 역할 변경
 */
import { redirect } from "next/navigation";
import { cache } from "react";

import type { WebUser } from "@/lib/db/schema";
import { getSessionUser } from "./session";

export type Viewer = {
  user: WebUser;
  isAdmin: boolean;
};

/**
 * 돌아갈 주소의 길이 상한(글자 수).
 *
 * 이 값은 로그인을 시작할 때 서명된 상태 쿠키(board_auth_state)에 통째로 담겨
 * 포털을 다녀온다. 쿠키 하나의 한도는 브라우저마다 대략 4096바이트이고, 넘으면
 * 저장 자체가 조용히 실패해 로그인이 이유 없이 끝난다. 아주 긴 값은 응답
 * 머리말(Location)에도 실리지 못해 로그인이 500 으로 끝난 적이 있다(개선요청
 * 시스템의 기록). 512자면 이 사이트의 어떤 주소보다 넉넉히 길다.
 */
const RETURN_TO_MAX_LENGTH = 512;

/** 제어문자의 경계. 0x20(빈칸)은 제어문자가 아니고, 0x7f(DEL)은 맞다. */
const FIRST_PRINTABLE_CODE = 0x20;
const DELETE_CODE = 0x7f;

/**
 * 제어문자가 섞여 있는가.
 *
 * 🔴 브라우저는 주소에서 탭·줄바꿈·복귀를 조용히 지운다. 탭이 하나 끼어 있는
 * "/(탭)/evil.example" 은 탭을 지우고 나면 "//evil.example" 이 되어 바깥
 * 사이트로 나간다. 눈으로 보면 슬래시가 하나뿐이라 안전해 보이는 것이 이 구멍이
 * 오래 살아남는 까닭이다 — 개선요청 시스템에서 실제로 났던 구멍이다.
 *
 * 정규식에 제어문자를 적지 않는 것도 일부러다. 그런 글자는 파일에 눈에 띄지
 * 않게 박혀 읽는 사람이 무엇을 막는지 알 수 없게 된다.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < FIRST_PRINTABLE_CODE || code === DELETE_CODE) return true;
  }
  return false;
}

/**
 * 이 사이트 안이지만 사람이 도착할 곳이 아닌 자리인가.
 *
 * 🔴 /api/auth/login 을 가리키면 로그인을 마치고 다시 로그인을 시작하는 무한
 * 되돌기가 된다. /api/auth/callback 과 /api/auth/backchannel-logout 도 사람이
 * 볼 화면이 아니다. 앞으로 늘어날 통로까지 한 번에 막으려고 /api/auth 아래를
 * 통째로 거절한다. 대소문자를 내려 견주는 것은 규칙을 글자 모양에 기대지
 * 않기 위해서다.
 */
function isLoginPlumbing(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0].toLowerCase();
  return path === "/api/auth" || path.startsWith("/api/auth/");
}

/**
 * 로그인 후 돌아갈 주소를 안전하게 다듬는다 (오픈 리다이렉트 방어).
 * '/'로 시작하고 '//'로 시작하지 않는 경로만 허용한다.
 * '//evil.com' 은 브라우저가 프로토콜 상대 URL 로 읽으므로 반드시 함께 막는다.
 * 역슬래시가 섞인 값도 거절한다.
 *
 * 🔴 2026-10-13 부터 이 판정이 훨씬 중요해졌다. 전에는 미로그인 접근이 게시판
 * 안의 /login 에서 멈췄지만, 이제 requireSession 이 곧장 포털로 보내므로
 * **모든 미로그인 접근이 돌아갈 주소를 싣고 포털을 왕복한다.** 그래서 길이 상한 ·
 * 제어문자 · 로그인 통로 자기 참조 셋을 더했다.
 *
 * 거절해도 잃는 것은 첫 화면에서 한 번 더 누르는 일뿐이지만, 허용을 잘못하면
 * 우리 주소가 피싱의 미끼가 된다. 좁게 허용하고 의심스러우면 거절한다.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  // 🔴 긴 값은 상태 쿠키에도 Location 머리말에도 실리지 못한다(위 상한의 설명).
  if (value.length > RETURN_TO_MAX_LENGTH) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  if (hasControlCharacter(value)) return "/";
  if (isLoginPlumbing(value)) return "/";
  return value;
}

/** 현재 요청의 사용자. 한 요청 안에서는 한 번만 읽는다. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, isAdmin: user.role === "ADMIN" };
});

/**
 * 로그인 필수. 없으면 포털로 곧장 보낸다.
 *
 * /login 화면을 거치지 않는 이유: 이 게시판에는 자체 로그인이 없다. 아이디도
 * 비밀번호도 받지 않으니 그 화면에 있는 것이라고는 "포털로 가세요" 단추
 * 하나뿐이다. 포털 앱 런처에서 타일을 눌러 들어온 사람은 방금 포털에서 왔는데
 * 포털로 가라는 화면을 다시 보게 되고, 그 단추를 눌러도 이미 로그인된 포털을
 * 그대로 통과해 돌아온다. 아무것도 묻지 않는 화면이라면 보여줄 이유가 없다.
 *
 * /login 은 남는다 — 로그인이 **거절됐을 때**(blocked · unknown_role ·
 * not-ready) 이유를 보여줄 자리가 필요하고, 포털에도 등록된 주소다. 그 화면에서
 * 자동으로 다시 보내지 않는 이유는 거기(login/page.tsx)에 적어 두었다.
 */
export async function requireSession(returnTo?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    // 🔴 여기까지 온 값은 무엇이든 safeReturnTo 를 거친다. 부르는 쪽이 주소를
    // 어디서 얻었든(화면·링크·손으로 친 주소) 믿지 않는다.
    const target = safeReturnTo(returnTo);
    redirect(
      target === "/"
        ? "/api/auth/login"
        : `/api/auth/login?returnTo=${encodeURIComponent(target)}`,
    );
  }
  return viewer;
}

/**
 * 관리자 전용 화면.
 *
 * returnTo 는 선택이다. 주면 로그인을 마치고 그 자리로 돌아온다 — 주지 않으면
 * 관리 화면 주소로 바로 들어오려던 사람이 로그인 뒤 첫 화면으로 떨어진다.
 */
export async function requireAdmin(returnTo?: string): Promise<Viewer> {
  const viewer = await requireSession(returnTo);
  if (!viewer.isAdmin) redirect("/");
  return viewer;
}

/**
 * 글을 고치거나 지울 수 있는가 (요구사항 9).
 * 작성자 본인과 관리자만 가능하다.
 */
export function canEditPost(
  viewer: Viewer,
  post: { authorId: string },
): boolean {
  return viewer.isAdmin || post.authorId === viewer.user.id;
}
