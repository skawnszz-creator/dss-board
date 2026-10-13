"use server";

import { redirect } from "next/navigation";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/guards";
import { buildLogoutUrl, oidcConfigured } from "@/lib/auth/oidc";
import { destroySession } from "@/lib/auth/session";

/**
 * 로그인은 여기에 없다. 들어오는 길은 포털(dss-auth)뿐이다 —
 * /api/auth/login → 포털 /authorize → /api/auth/callback.
 */

/**
 * 로그아웃 — 게시판 세션을 끊고 포털 세션까지 끝낸다.
 *
 * 로그아웃은 **이 하나뿐이다.** 예전에는 "이 사이트만"과 "포털까지"가 따로
 * 있었는데, 그러면 어느 쪽이 걸렸는지 화면만 보고 알 수 없다. 그리고 이
 * 사이트 쿠키만 지우면 포털 세션은 그대로 살아 있어서, 로그아웃한 사람이
 * 로그인 버튼을 한 번 누르는 것만으로 누구인지 다시 묻지도 않고 그대로
 * 들어온다. 공용 PC 에서는 그것이 곧 로그아웃이 안 된 것이다.
 *
 * 순서가 중요하다 — 게시판 세션을 **먼저** 끊는다. 포털이 꺼져 있거나
 * discovery 를 읽지 못해도 이 사이트에서는 이미 나가 있어야 한다.
 */
export async function logoutAction(): Promise<void> {
  const viewer = await getViewer();

  // 1) 이 사이트에서 먼저 나간다.
  await destroySession();

  if (viewer) {
    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: "USER",
      targetId: viewer.user.id,
    });
  }

  // 2) 포털까지 보낸다. 못 가면 게시판 로그인 화면으로 물러선다.
  if (!oidcConfigured()) redirect("/login");

  let url: string | null = null;
  try {
    url = await buildLogoutUrl();
  } catch (error) {
    // 상세 사유는 서버 로그에만 남긴다.
    console.warn("[auth] 포털 로그아웃 주소를 읽지 못했습니다", error);
  }

  redirect(url ?? "/login");
}
