"use server";

import { redirect } from "next/navigation";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { devLoginEnabled, findDevUser } from "@/lib/auth/dev-login";
import { getViewer, safeReturnTo } from "@/lib/auth/guards";
import { buildLogoutUrl, oidcConfigured } from "@/lib/auth/oidc";
import { upsertUserFromClaims } from "@/lib/auth/provision";
import { createSession, destroySession } from "@/lib/auth/session";

/**
 * 개발용 임시 로그인. dss-auth OIDC 연결 시 폐기 대상.
 * 꺼져 있으면 아무 일도 하지 않는다.
 */
export async function devLoginAction(formData: FormData): Promise<void> {
  if (!devLoginEnabled()) redirect("/login?error=dev-off");

  const devUser = findDevUser(String(formData.get("sub") ?? ""));
  if (!devUser) redirect("/login?error=1");

  const result = await upsertUserFromClaims(devUser);
  if (!result.ok) redirect("/login?error=blocked");

  await createSession(result.user.id);
  await writeAudit({
    actorId: result.user.id,
    action: AUDIT_ACTIONS.LOGIN,
    targetType: "USER",
    targetId: result.user.id,
    detail: { via: "DEV" },
  });

  redirect(safeReturnTo(String(formData.get("returnTo") ?? "/")));
}

/** 이 사이트의 세션만 끊는다. 포털 세션은 그대로 둔다. */
export async function logoutAction(): Promise<void> {
  const viewer = await getViewer();
  await destroySession();

  if (viewer) {
    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: "USER",
      targetId: viewer.user.id,
    });
  }

  redirect("/login");
}

/**
 * 포털까지 함께 로그아웃.
 * 돌아올 주소는 포털의 post_logout_redirect_uris 에 미리 등록해야 한다.
 */
export async function portalLogoutAction(): Promise<void> {
  await logoutActionInternal();

  if (!oidcConfigured()) redirect("/login");

  let url: string | null = null;
  try {
    url = await buildLogoutUrl(
      process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? "http://localhost:3400/",
    );
  } catch (error) {
    console.warn("[auth] 포털 로그아웃 주소를 읽지 못했습니다", error);
  }

  redirect(url ?? "/login");
}

/** redirect 를 던지지 않는 로그아웃 본체 (포털 로그아웃에서 재사용) */
async function logoutActionInternal(): Promise<void> {
  const viewer = await getViewer();
  await destroySession();
  if (viewer) {
    await writeAudit({
      actorId: viewer.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: "USER",
      targetId: viewer.user.id,
      detail: { portal: true },
    });
  }
}
