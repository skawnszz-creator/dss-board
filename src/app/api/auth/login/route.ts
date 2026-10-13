/**
 * 포털(dss-auth)로 로그인을 보내는 자리.
 *
 * PKCE 는 필수이고 code_challenge_method 는 S256 만 쓴다.
 * state·nonce·code_verifier 는 서명된 10분 쿠키에 담아 나른다.
 */
import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeReturnTo } from "@/lib/auth/guards";
import {
  AUTH_STATE_COOKIE,
  AUTH_STATE_MAX_AGE_SECONDS,
  buildAuthorizeUrl,
  createPkce,
  oidcConfigured,
  sealState,
} from "@/lib/auth/oidc";
import { clearServiceMenuCookie } from "@/lib/auth/service-menu-cookie";
import { env } from "@/lib/env";

export async function GET(request: NextRequest): Promise<never> {
  if (!oidcConfigured()) redirect("/login?error=not-ready");

  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = createPkce();

  let authorizeUrl: string;
  try {
    authorizeUrl = await buildAuthorizeUrl(challenge, state, nonce);
  } catch (error) {
    // 상세 사유는 서버 로그에만 남긴다.
    console.warn("[auth] /authorize 주소를 만들지 못했습니다", error);
    redirect("/login?error=not-ready");
  }

  const store = await cookies();

  // 🔴 지난 사람의 서비스 목록을 여기서 지운다. 공용 PC 에서 다른 사람으로
  // 다시 들어오는 동안(포털에 다녀오는 몇 초) 앞사람 목록이 머리말에 남아
  // 있으면 안 된다. 콜백에서 새로 굽지만, 포털이 목록을 안 싣는 사람이면
  // 거기서 구울 것이 없으므로 **시작할 때 지우는 이 한 줄**이 그 경우를 맡는다.
  await clearServiceMenuCookie();

  store.set(AUTH_STATE_COOKIE, sealState({ state, nonce, verifier, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 사내망 HTTP 단계에서 켜면 쿠키가 저장되지 않아 로그인이 조용히 실패한다.
    secure: env.sessionCookieSecure,
    maxAge: AUTH_STATE_MAX_AGE_SECONDS,
  });

  redirect(authorizeUrl);
}
