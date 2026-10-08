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
