/**
 * dss-auth(통합 로그인 포털) OIDC 어댑터.
 *
 * 연동 코드를 화면·API 곳곳에 흩지 않고 이 파일에 가둔다.
 * 포털 연동이 달라지면 **이 파일만 손보면** 끝나야 한다.
 *
 * 포털의 /authorize · /token · /jwks 는 2026-08-26 부터 열려 있었고,
 * 2026-10-13 에 이 게시판이 실제로 연결되어 로그인·로그아웃이 돌고 있다.
 * 개발용 임시 로그인은 그날 함께 지웠다 — 포털을 거치지 않고 들어오는 길은
 * 이제 없다.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { AuthClaims } from "./provision";
import { env } from "@/lib/env";

/* ------------------------------------------------------------------ */
/* discovery — 엔드포인트 주소를 하드코딩하지 않는다                      */
/* ------------------------------------------------------------------ */

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
let discoveryCache: { at: number; doc: Discovery } | null = null;

/** 포털 연결에 필요한 값이 모두 설정되었는가 */
export function oidcConfigured(): boolean {
  return Boolean(
    process.env.OIDC_ISSUER &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_CLIENT_SECRET &&
      process.env.OIDC_REDIRECT_URI,
  );
}

export async function getDiscovery(): Promise<Discovery> {
  const now = Date.now();
  if (discoveryCache && now - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.doc;
  }

  // issuer 끝에 슬래시가 있어도 주소가 '//' 로 깨지지 않게 한다.
  // (iss 비교는 env 값 그대로 쓴다 — 3-3 절)
  const base = env.oidcIssuer.replace(/\/+$/, "");
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`discovery 문서를 읽지 못했습니다 (${res.status})`);
  }

  const doc = (await res.json()) as Discovery;
  for (const key of [
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
  ] as const) {
    if (!doc[key]) throw new Error(`discovery 문서에 ${key} 가 없습니다`);
  }

  discoveryCache = { at: now, doc };
  return doc;
}

/** JWKS 는 캐싱하되 모르는 kid 가 오면 jose 가 알아서 다시 받아온다. */
let jwksCache: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null =
  null;

function getJwks(uri: string) {
  if (!jwksCache || jwksCache.uri !== uri) {
    jwksCache = { uri, set: createRemoteJWKSet(new URL(uri)) };
  }
  return jwksCache.set;
}

/* ------------------------------------------------------------------ */
/* PKCE — S256 만 쓴다. plain 은 포털이 거절한다.                        */
/* ------------------------------------------------------------------ */

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/* ------------------------------------------------------------------ */
/* 상태 쿠키 — code_verifier·state·nonce 를 나른다                       */
/*                                                                     */
/* DB 표를 새로 만들지 않고 서명된 짧은 수명 쿠키(10분)를 쓴다.           */
/* 서명하지 않으면 사용자가 code_verifier 를 바꿔치기해                  */
/* PKCE 를 무력화할 수 있다.                                            */
/* ------------------------------------------------------------------ */

export const AUTH_STATE_COOKIE = "board_auth_state";
export const AUTH_STATE_MAX_AGE_SECONDS = 600;

export type AuthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

export function sealState(payload: AuthState): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const mac = createHmac("sha256", env.authStateSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${mac}`;
}

export function openState(raw: string | undefined | null): AuthState | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", env.authStateSecret)
    .update(body)
    .digest("base64url");
  const got = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as AuthState;
    if (!parsed.state || !parsed.nonce || !parsed.verifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 1단계 — 포털로 보내기                                                */
/* ------------------------------------------------------------------ */

export async function buildAuthorizeUrl(
  challenge: string,
  state: string,
  nonce: string,
): Promise<string> {
  const doc = await getDiscovery();
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("client_id", env.oidcClientId);
  // 포털에 등록한 값과 문자 단위로 정확히 같아야 한다.
  url.searchParams.set("redirect_uri", env.oidcRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/* ------------------------------------------------------------------ */
/* 2단계 — code 를 토큰으로 바꾸기                                       */
/* ------------------------------------------------------------------ */

export async function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<{ idToken: string }> {
  const doc = await getDiscovery();

  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.oidcRedirectUri,
      client_id: env.oidcClientId,
      client_secret: env.oidcClientSecret,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`토큰 교환 실패 (${res.status})`);

  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("응답에 id_token 이 없습니다");
  return { idToken: json.id_token };
}

/* ------------------------------------------------------------------ */
/* 3단계 — ID 토큰 검증. 하나라도 빠뜨리면 안 된다 (DESIGN 2절)          */
/* ------------------------------------------------------------------ */

export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<AuthClaims> {
  const doc = await getDiscovery();

  const { payload, protectedHeader } = await jwtVerify(
    idToken,
    getJwks(doc.jwks_uri),
    {
      // iss 는 끝 슬래시 유무까지 정확히 일치해야 한다.
      issuer: env.oidcIssuer,
      audience: env.oidcClientId,
      // none·HS256 을 받아들이지 않는다.
      algorithms: ["RS256"],
      clockTolerance: 30,
      requiredClaims: ["sub", "exp", "iat", "nonce"],
    },
  );

  if (protectedHeader.alg !== "RS256") {
    throw new Error("alg 가 RS256 이 아닙니다");
  }

  const claims = payload as JWTPayload & {
    nonce?: string;
    name?: string;
    preferred_username?: string;
    email?: string;
  };

  if (claims.nonce !== expectedNonce) {
    throw new Error("nonce 가 일치하지 않습니다");
  }
  if (!payload.sub) throw new Error("sub 가 없습니다");

  return {
    // sub = dss-auth users.id (UUID). 사람의 영구 식별자.
    sub: payload.sub,
    name: claims.name ?? claims.preferred_username ?? null,
    email: claims.email ?? null,
    // 역할. 포털은 부여 행이 있을 때만 이 클레임을 싣는다 — "안 왔다" 와
    // "빈 값이 왔다" 를 구분할 수 있어야 해서다. 그래서 타입을 단정하지 않고
    // 검증된 payload 에서 꺼내 그대로 넘긴다. 판정은 provision.ts 가 한다.
    role: payload.role,
  };
}

/* ------------------------------------------------------------------ */
/* 4단계 — 로그아웃 토큰 검증 (OIDC Back-Channel Logout 1.0)             */
/*                                                                     */
/* 포털이 "이 사람 세션 끊어라" 라고 보내오는 토큰이다. 받는 창구는      */
/* app/api/auth/backchannel-logout/route.ts 이고, 그 창구는 인증 없이   */
/* 누구나 두드릴 수 있다 — 이 함수가 유일한 방어선이다.                  */
/* ------------------------------------------------------------------ */

const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

/**
 * 로그아웃 토큰을 검증하고 끊어야 할 사람(sub)을 돌려준다.
 * 하나라도 어긋나면 null — 상세 사유는 서버 로그에만 남긴다.
 *
 * 포털은 sid 를 실을 수도 있고 안 실을 수도 있다(규격 §2.4 — sub 와 sid 중
 * 하나만 있어도 된다). 그래서 sid 를 요구하지 않는다. 이 사이트는 어차피
 * sub 단위로 끊는다(session.ts 의 revokeSessionsForSubject).
 */
export async function verifyLogoutToken(token: string): Promise<string | null> {
  try {
    const doc = await getDiscovery();

    const { payload, protectedHeader } = await jwtVerify(
      token,
      getJwks(doc.jwks_uri),
      {
        // iss 는 끝 슬래시 유무까지 정확히 일치해야 한다.
        issuer: env.oidcIssuer,
        audience: env.oidcClientId,
        // none·HS256 을 받아들이지 않는다.
        algorithms: ["RS256"],
        clockTolerance: 30,
        requiredClaims: ["iss", "aud", "sub", "iat", "exp"],
      },
    );

    if (protectedHeader.alg !== "RS256") {
      console.error("[auth] 로그아웃 토큰의 alg 가 RS256 이 아닙니다");
      return null;
    }

    // nonce 가 있으면 ID 토큰이다. 규격이 로그아웃 토큰에 nonce 를 금지하는
    // 이유가 이것이다 — 로그인 토큰을 이 창구에 들이밀어 남을 로그아웃시키는
    // 것을 막는다.
    if (payload.nonce !== undefined) {
      console.error("[auth] nonce 가 있는 토큰입니다 (ID 토큰일 수 있음)");
      return null;
    }

    const events = payload.events;
    if (
      typeof events !== "object" ||
      events === null ||
      !(LOGOUT_EVENT in (events as Record<string, unknown>))
    ) {
      console.error("[auth] 로그아웃 이벤트 표시가 없습니다");
      return null;
    }

    if (typeof payload.sub !== "string" || payload.sub === "") {
      console.error("[auth] 로그아웃 토큰에 sub 가 없습니다");
      return null;
    }

    return payload.sub;
  } catch (error) {
    console.error("[auth] 로그아웃 토큰 검증 실패", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 포털까지 함께 로그아웃                                               */
/* ------------------------------------------------------------------ */

/**
 * 포털의 로그아웃 주소. 돌아올 곳을 붙이지 않는다.
 *
 * 포털은 `id_token_hint` 와 `post_logout_redirect_uri` 가 **둘 다** 있을 때만
 * 그 주소로 돌려보내고, 아니면 자기 로그인 화면(/signin)에 머물게 한다.
 * 로그아웃한 사람이 있어야 할 곳이 바로 거기다 — 게시판 로그인 화면으로
 * 돌아오면 "포털로 가세요" 한 장을 더 거칠 뿐이고, 공용 PC 에서는 방금
 * 모든 시스템에서 나간 사람을 다시 이 사이트 앞에 세우는 꼴이 된다.
 *
 * 애초에 붙일 수도 없다: 이 사이트는 id_token 을 어디에도 보관하지 않아
 * id_token_hint 를 만들 수 없다(callback/route.ts 는 검증만 하고 버린다).
 */
export async function buildLogoutUrl(): Promise<string | null> {
  const doc = await getDiscovery();
  if (!doc.end_session_endpoint) return null;

  const url = new URL(doc.end_session_endpoint);
  url.searchParams.set("client_id", env.oidcClientId);
  return url.toString();
}
