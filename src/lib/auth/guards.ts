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
 * 로그인 후 돌아갈 주소를 안전하게 다듬는다 (오픈 리다이렉트 방어).
 * '/'로 시작하고 '//'로 시작하지 않는 경로만 허용한다.
 * '//evil.com' 은 브라우저가 프로토콜 상대 URL 로 읽으므로 반드시 함께 막는다.
 * 역슬래시가 섞인 값도 거절한다.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  return value;
}

/** 현재 요청의 사용자. 한 요청 안에서는 한 번만 읽는다. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  return { user, isAdmin: user.role === "ADMIN" };
});

/** 로그인 필수. 없으면 로그인 화면으로 보낸다. */
export async function requireSession(returnTo?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    const target = safeReturnTo(returnTo);
    redirect(
      target === "/"
        ? "/login"
        : `/login?returnTo=${encodeURIComponent(target)}`,
    );
  }
  return viewer;
}

/** 관리자 전용 화면 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireSession();
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
