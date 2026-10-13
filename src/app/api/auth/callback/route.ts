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
import { writeServiceMenuCookie } from "@/lib/auth/service-menu-cookie";
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
      // 거절 사유마다 사람이 할 일이 다르니 화면 문구만 갈라 준다.
      // 무엇이 잘못됐는지 자세히 알리지는 않는다 — 상세 사유는 서버 로그와
      // 감사 기록에만 남는다.
      return {
        ok: false,
        error: result.reason === "UNKNOWN_ROLE" ? "unknown_role" : "blocked",
      };
    }

    await createSession(result.user.id);

    // 머리말 **안**에 앉을 서비스 오가기 목록. 세션과 **별도인 서명 쿠키**에
    // 굽는다(service-menu-cookie.ts 머리말에 왜인지 적어 두었다).
    //
    // 🔴 세션을 만든 **뒤**이고, 거절 경로(blocked · unknown_role)는 위에서
    // 이미 돌아갔다 — 못 들어온 사람의 브라우저에 목록을 남기지 않는다.
    // 포털이 목록을 안 실었거나 그릴 수 있는 칸이 하나도 없으면 굽지 않고
    // 남은 것을 지운다. 그때 머리말은 예전과 똑같다.
    await writeServiceMenuCookie(claims.services);

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
