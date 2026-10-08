/**
 * 포털(dss-auth)에서 돌아오는 자리.
 *
 * 검증에 실패하면 예외를 밖으로 던지지 않고 로그인 실패로 처리한다.
 * 사용자에게는 상세 사유를 보여주지 않고 서버 로그에만 남긴다.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { safeReturnTo } from "@/lib/auth/guards";
import {
  AUTH_STATE_COOKIE,
  exchangeCode,
  openState,
  verifyIdToken,
} from "@/lib/auth/oidc";
import { upsertUserFromClaims } from "@/lib/auth/provision";
import { createSession } from "@/lib/auth/session";

type Outcome = { ok: true; returnTo: string } | { ok: false; error: string };

async function handle(request: NextRequest): Promise<Outcome> {
  const params = request.nextUrl.searchParams;
  const store = await cookies();

  const state = openState(store.get(AUTH_STATE_COOKIE)?.value);
  // 한 번 쓴 상태 쿠키는 성공이든 실패든 바로 버린다.
  store.delete(AUTH_STATE_COOKIE);

  if (!state) {
    console.warn("[auth] 상태 쿠키가 없거나 서명이 맞지 않습니다");
    return { ok: false, error: "1" };
  }

  const portalError = params.get("error");
  if (portalError) {
    console.warn("[auth] 포털이 오류를 돌려주었습니다:", portalError);
    return { ok: false, error: "1" };
  }

  const code = params.get("code");
  if (!code) {
    console.warn("[auth] code 가 없습니다");
    return { ok: false, error: "1" };
  }

  // CSRF 방어 — 보낸 state 와 돌아온 state 를 대조한다.
  if (params.get("state") !== state.state) {
    console.warn("[auth] state 가 일치하지 않습니다");
    return { ok: false, error: "1" };
  }

  try {
    const { idToken } = await exchangeCode(code, state.verifier);
    const claims = await verifyIdToken(idToken, state.nonce);

    const result = await upsertUserFromClaims(claims);
    if (!result.ok) {
      await writeAudit({
        action: AUDIT_ACTIONS.LOGIN_BLOCKED,
        detail: { reason: result.reason },
      });
      return { ok: false, error: "blocked" };
    }

    await createSession(result.user.id);
    await writeAudit({
      actorId: result.user.id,
      action: AUDIT_ACTIONS.LOGIN,
      targetType: "USER",
      targetId: result.user.id,
      detail: { via: "OIDC" },
    });

    return { ok: true, returnTo: safeReturnTo(state.returnTo) };
  } catch (error) {
    console.warn("[auth] 로그인 실패", error);
    return { ok: false, error: "1" };
  }
}

export async function GET(request: NextRequest): Promise<never> {
  const outcome = await handle(request);
  redirect(outcome.ok ? outcome.returnTo : `/login?error=${outcome.error}`);
}
