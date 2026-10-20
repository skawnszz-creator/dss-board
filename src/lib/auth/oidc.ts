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

import type { NotificationBellItem } from "@dss/ui";

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

/**
 * JWKS 는 캐싱하되 모르는 kid 가 오면 jose 가 알아서 다시 받아온다.
 *
 * 🔵 내보내는 이유: 포털이 우리에게 물으러 올 때 쓰는 서명 토큰도
 * **같은 열쇠 한 벌**로 검증한다(auth/portal-service-token.ts). 거기서 새로
 * 만들면 캐시가 두 벌이 되고, 포털이 열쇠를 바꾸는 날 한쪽만 늦게 따라간다.
 * (동작은 전과 같다 — `export` 한 낱말만 더했다.)
 */
let jwksCache: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null =
  null;

export function getJwks(uri: string) {
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

/**
 * 검증을 마친 ID 토큰에서 꺼내 오는 것 전부.
 *
 * 계정을 잇는 데 쓰는 값(AuthClaims — provision.ts 가 정한다)에 **화면에만
 * 쓰는 값 하나**를 덧댄 모양이다. AuthClaims 자체를 넓히지 않은 이유: 그
 * 타입은 upsertUserFromClaims 가 받는 것이고, 거기 서비스 목록을 섞으면
 * 「계정을 만드는 데 쓰는 값」과 「머리말을 그리는 데 쓰는 값」이 한 묶음이
 * 되어 읽는 사람이 매번 둘을 갈라 봐야 한다. 덧댄 모양이라 그대로 넘겨도
 * provision.ts 는 예전과 똑같이 받는다.
 */
export type VerifiedIdentity = AuthClaims & {
  /**
   * 「이 사람이 들어갈 수 있는 사내 시스템 목록」(포털의 `dss_services` 클레임).
   * 머리말 **안**의 서비스 메뉴바가 그릴 값이고, **권한 판정에는 쓰지 않는다** —
   * 이 게시판에 들어올 수 있는지는 role 하나로만 정한다(provision.ts).
   *
   * 🔴 role 과 같은 이유로 **타입을 단정하지 않는다**: 받는 쪽이 보내는 쪽의
   * 타입을 정할 수 없다. 무엇을 그릴 수 있는 값으로 칠지는 한 곳이 정한다 —
   * service-menu-cookie.ts(와 @dss/ui 의 normalizeServiceMenu).
   *
   * 포털이 이 클레임을 **안 실을 수도 있다.** 없어도 로그인은 예전과 똑같이
   * 끝나야 한다(쿠키만 안 구워진다).
   */
  services: unknown;
};

export async function verifyIdToken(
  idToken: string,
  expectedNonce: string,
): Promise<VerifiedIdentity> {
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
    // 서비스 메뉴바가 그릴 목록. 위 sub·role 과 **같은 서명 · 발급자 ·
    // 수신자 · nonce 보증을 받은** payload 에서 꺼낸다 — 검증이 실패하면
    // 위에서 이미 던졌으므로, 이 클레임이 검증 없이 밖으로 새어 나갈 길은
    // 없다. 거르는 일은 service-menu-cookie.ts 가 한다.
    services: payload.dss_services,
  };
}

/**
 * 포털에 등록된 이 시스템의 식별자(= ID 토큰의 aud, `dss-board`).
 *
 * 서비스 메뉴바가 「지금 여기」 칸을 눌린 상태로 그리는 데 쓴다. 화면에서
 * env 를 직접 읽지 않고 이 파일을 거치는 이유는 파일 머리말과 같다 —
 * 포털과 이야기하는 값을 아는 곳은 이 파일 하나다. 이름이 아니라 식별자로
 * 견주는 이유는 @dss/ui 의 types.ts 에 적혀 있다(이름은 사람이 바꾼다).
 */
export function thisServiceId(): string {
  return env.oidcClientId;
}

/**
 * 포털의 앱 런처 — 이 사람이 쓸 수 있는 다른 사내 시스템으로 가는 곳.
 *
 * 프로토콜 주소가 아니라 **사람이 보는 화면**이다. 아래 buildLogoutUrl 과
 * 헷갈리지 말 것: 여기로 가도 이 게시판의 세션은 그대로 살아 있어서, 돌아오면
 * 다시 로그인하지 않는다.
 *
 * 화면이 env 를 직접 읽지 않고 이 파일을 거치는 이유는 바로 위 thisServiceId
 * 와 같다 — 포털과 이야기하는 값을 아는 곳은 이 파일 하나다.
 *
 * 🔴 이 주소로 가는 칸은 **서비스 메뉴바의 목록과 무관하게 늘 그려진다.**
 * 포털 자신은 포털의 clients 표에 없어서(포털은 클라이언트가 아니다) 그 목록에
 * 끼지 못하고, 목록을 못 받은 사람에게도 포털로 돌아갈 길은 있어야 한다.
 * 그래서 메뉴바 목록에 섞지 않고 머리말에 **별도 칸**으로 둔다
 * (site-header.tsx). 목록에 섞으면 쓸 수 있는 시스템이 없는 사람에게 항목
 * 하나짜리 드롭다운 단추가 생긴다.
 */
export function portalAppsUrl(): string {
  return `${env.oidcIssuer}/apps`;
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

/* ------------------------------------------------------------------ */
/* 다른 시스템들의 알림 — 포털에 **묻는** 쪽                             */
/*                                                                     */
/* 🔴 방향이 반대다. api/integration/notifications 는 포털이 우리에게    */
/*    **오는** 통로(GET · 포털이 RS256 으로 서명한 Bearer 토큰)이고,     */
/*    여기는 우리가 포털에 **가는** 길이다 — POST 이고 자격은 이 시스템의 */
/*    client_secret(Basic)이다. 부르는 법은 dss-auth 의                  */
/*    docs/사이트-알림-통로.md 에 있다.                                  */
/* ------------------------------------------------------------------ */

/**
 * 이 왕복을 얼마나 기다릴지.
 *
 * 🔴 상한이 **반드시** 있어야 한다. 포털이 죽어 연결이 거절되면 fetch 는 곧바로
 * 실패하지만, 주소가 틀렸거나 포털이 멎어 응답이 **오지 않는** 곳을 두드리면
 * 기본값으로는 하염없이 기다린다. 이 종은 머리말에 있어 **모든 화면**에 딸려
 * 오므로, 상한이 없으면 알림 하나 때문에 게시판 전체가 멈춘 것처럼 보인다.
 *
 * 2초인 까닭(개선요청도 같은 값이다):
 *  · 포털은 같은 사내망에 있고 사람마다 **30초 캐시**를 들고 있어 정상이라면
 *    수십 ms 다. 2초를 넘겼다는 것은 이미 정상이 아니라는 뜻이다.
 *  · 🔴 그렇다고 1.5초로 줄이지 않는다. 포털이 각 시스템에 묻는 상한이
 *    **1.5초**(dss-auth 의 gather.ts READ_TIMEOUT_MS)라, 한 시스템이 느려
 *    포털이 그 1.5초를 꽉 채우고 「한 곳이 빠졌다(degraded)」로 답하는 경우가
 *    정상 동작이다. 상한을 1.5초로 두면 바로 그 답을 **도착 직전에** 버린다.
 */
const NOTIFICATIONS_TIMEOUT_MS = 2000;

/**
 * 포털이 **다른 시스템들에** 물어 합쳐 준 알림.
 *
 * 🔴 여기에 **이 게시판의 알림은 없다.** 포털은 부른 사이트 자신에게는 묻지
 *    않는다(dss-auth 의 site-service.ts 머리말 · docs/사이트-알림-통로.md).
 *    까닭 중 가장 중요한 하나: 포털은 30초 캐시를 드는데, 자기 알림까지 거기서
 *    받으면 **방금 열어 본 공지가 30초 동안 종에 남는다** — 사람이 지금 보고
 *    있는 바로 이 게시판에서. 그래서 자기 목록은 우리가 직접 붙인다
 *    (notifications/queries.ts → components/header-notification-bell.tsx).
 *
 * 칸 이름이 @dss/ui 의 `NotificationBellItem` 과 글자 하나까지 같아서 받은
 * 배열을 종에 **그대로** 넘긴다 — 포털 응답이 그 타입의 거울이라고 그쪽 문서에
 * 적혀 있다. 타입을 새로 적지 않고 빌려 오는 이유가 그것이다: 둘 중 하나가
 * 어긋나면 tsc 가 먼저 말해 준다.
 */
export type PortalNotificationFeed = {
  items: NotificationBellItem[];
  /**
   * 배지에 찍을 숫자. 🔴 **포털이 센 값 그대로** 나른다 — 줄 수로 다시 세지
   * 않는다. 세는 규칙은 시스템마다 다르고(A/S 는 같은 대상을 한 번만 센다),
   * 여기서 다시 세면 그 시스템의 종과 이 종이 서로 다른 숫자를 말하게 된다.
   * 이 게시판 자신의 count 도 같은 까닭으로 자르기 전의 진짜 개수다
   * (notifications/bell-items.ts).
   */
  count: number;
  /**
   * 🔴 「한 곳이라도 못 물어봤다」는 표시. **「알림이 없다」와 다른 말이다.**
   * 지금은 화면에 쓰지 않지만(알림이 없는 것과 똑같이 그린다) 값을 버리지는
   * 않는다 — 나중에 「일부를 불러오지 못했습니다」를 보여 주기로 하면 여기 있다.
   */
  degraded: boolean;
  /**
   * 🔴 그 사람이 지운 알림의 열쇠 — **이 게시판 몫만** 온다.
   *
   * 남의 시스템 줄은 포털이 **제 손으로 걸러서** 보낸다(items 에서 빠져 있고
   * count 도 그만큼 줄어 있다). 하지만 **이 게시판 자신의 줄**은 포털이 손댈
   * 수 없다 — 애초에 포털이 보내지 않는 목록이고, 우리가 제 DB 에서 직접
   * 계산해 이어 붙이는 것이기 때문이다(위 머리말). 그 걸러내기에 쓰라고 포털이
   * 함께 보내 주는 것이 이 칸이다.
   *
   * 🔴 **이 칸을 안 쓰면 「게시판에서 지웠는데 게시판 종에만 그대로 뜬다」가
   *    된다** — 다른 시스템에서는 사라지는데 여기서만 남아 제일 헷갈린다.
   *    실제로 거르는 자리는 components/header-notification-bell.tsx 다.
   *
   * 열쇠 모양은 `items[].key` 와 같다(`{client_id}:{id}`). 지운 것이 없으면
   * 빈 배열이고, 포털이 지움 기록을 못 읽으면 빈 배열에 `degraded` 가 선다 —
   * 그때는 지웠던 줄이 다시 뜬다(지움은 보기를 미루는 것이지 자료를 지우는
   * 것이 아니라, 종을 통째로 끄는 것보다 낫다고 포털이 정했다).
   */
  dismissed: string[];
};

/**
 * 못 물어봤을 때의 답. 🔴 **던지지 않는다** — 알림 하나 때문에 머리말이, 곧
 * 게시판 전체가 깨지는 일은 없어야 한다(그쪽 문서: 사이트는 거절을 삼킨다).
 */
const UNREACHABLE: PortalNotificationFeed = {
  items: [],
  count: 0,
  degraded: true,
  // 🔴 **빈 배열**이다. 못 물어봤으니 「지운 것이 없다」가 아니라 「모른다」가
  //    맞지만, 그 둘을 가르는 값을 두는 대신 지웠던 줄이 다시 뜨는 쪽을
  //    고른다 — 포털이 지움 기록만 못 읽었을 때의 답과 같은 모습이다(위 칸
  //    주석). 어느 쪽이든 종은 그려지고 화면은 뜬다.
  dismissed: [],
};

/** 한 줄의 아홉 칸. 하나라도 글자가 아니면 **그 줄만** 버린다. */
function toPortalBellItem(row: unknown): NotificationBellItem | null {
  if (typeof row !== "object" || row === null) return null;
  const { key, sourceId, sourceName, id, kind, kindLabel, subject, detail, href } =
    row as Record<string, unknown>;
  if (
    typeof key !== "string" ||
    typeof sourceId !== "string" ||
    typeof sourceName !== "string" ||
    typeof id !== "string" ||
    typeof kind !== "string" ||
    typeof kindLabel !== "string" ||
    typeof subject !== "string" ||
    typeof detail !== "string" ||
    typeof href !== "string"
  ) {
    return null;
  }
  return { key, sourceId, sourceName, id, kind, kindLabel, subject, detail, href };
}

/**
 * 포털의 답을 그릴 수 있는 모양으로 만든다. **망을 타지 않는 순수 함수**라
 * 그대로 불러 시험할 수 있다.
 *
 * 왜 한 번 더 보나: 포털은 우리 편이지만 그 답에는 **다른 시스템들이 만든
 * 글자**가 실려 온다. 한 시스템이 이상한 줄을 하나 섞어 보냈다고 머리말이
 * 통째로 깨지면 안 된다 — 그래서 모양이 안 맞는 줄은 그 줄만 버린다.
 * (그릴 수 없는 주소는 @dss/ui 가 또 한 번 거른다.)
 */
export function normalizePortalNotificationFeed(body: unknown): PortalNotificationFeed {
  if (typeof body !== "object" || body === null) return UNREACHABLE;
  const answer = body as Record<string, unknown>;

  const items: NotificationBellItem[] = [];
  if (Array.isArray(answer.items)) {
    for (const row of answer.items) {
      const item = toPortalBellItem(row);
      if (item) items.push(item);
    }
  }

  // 🔴 숫자가 아니면 **0** 이다(줄 수로 대신 세지 않는다 — 위 count 주석).
  // 0 이면 배지만 안 그려지고 목록은 그대로 보인다.
  const count =
    typeof answer.count === "number" &&
    Number.isFinite(answer.count) &&
    answer.count > 0
      ? answer.count
      : 0;

  // 🔴 글자인 줄만 담는다 — 줄 걸러내기에 그대로 쓰이는 값이라, 글자가 아닌
  //    것이 섞이면 Set 안에서 영영 아무것과도 안 맞는 쓰레기가 된다. 칸 자체가
  //    없는 포털(아직 안 고친 판)에서는 **빈 배열**이 되어 예전 그대로 돈다.
  const dismissed = Array.isArray(answer.dismissed)
    ? answer.dismissed.filter((key): key is string => typeof key === "string")
    : [];

  return { items, count, degraded: answer.degraded === true, dismissed };
}

/**
 * 포털에 묻는다 — 「이 사람의 **다른 시스템** 알림」.
 *
 * 🔴 **어떤 일이 있어도 던지지 않는다.** 포털이 죽었든(503), 우리를 거절했든
 * (400·401·403·405·429), 망이 멎었든, 답이 JSON 이 아니든, 설정이 빠졌든
 * **빈 목록**이 나간다. 거절 여섯 가지는 전부 아래 한 자리(`!response.ok`)에서
 * 같은 모양으로 삼킨다 — 403 셋(그 사람이 없다 · 정지 · 그 시스템에 못 들어감)
 * 은 포털이 일부러 같은 본문으로 주므로 구분하려 들지 않는다.
 *
 * @param subject 포털의 users.id (= ID 토큰의 sub). 이 게시판은
 *                `web_users.auth_sub` 로 들고 있다(schema.ts). 포털 계정과
 *                이어지지 않은 사람은 물을 수 없고, 그 사람은 이 게시판의
 *                알림만 보게 된다 — 정상이다.
 *
 * 🔴 자격증명은 **머리말(Authorization: Basic)** 로만 보낸다. 주소에 실으면
 *    포털이 400 으로 거절하고, 그 값은 이미 접근 로그에 남아 **다시 발급**해야
 *    한다(docs/사이트-알림-통로.md). 어떤 로그에도 찍지 않는다 — 아래에서
 *    남기는 것은 오류의 **종류**와 **상태 코드**뿐이다.
 */
export async function fetchPortalNotifications(
  subject: string,
): Promise<PortalNotificationFeed> {
  if (!subject) return UNREACHABLE;

  let response: Response;
  try {
    // env 의 getter 는 값이 없으면 던진다 — 그래서 try 안에서 읽는다.
    // 설정이 빠진 것 때문에 머리말이 깨지면 안 된다.
    const credentials = `${encodeURIComponent(env.oidcClientId)}:${encodeURIComponent(
      env.oidcClientSecret,
    )}`;

    response = await fetch(`${env.oidcIssuer}/api/integration/notifications`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ sub: subject }).toString(),
      // 포털의 답은 사람마다 다르고 방금 처리한 일이 바로 빠져야 한다.
      // 포털이 이미 30초 캐시를 들고 있으므로 여기서 또 담아 둘 이유가 없다.
      cache: "no-store",
      signal: AbortSignal.timeout(NOTIFICATIONS_TIMEOUT_MS),
    });
  } catch (error) {
    // 🔴 남기는 것은 오류의 **종류**뿐이다(TimeoutError · TypeError …).
    //    주소도 자격증명도 싣지 않는다.
    console.error("[oidc] 포털에 알림을 묻지 못했습니다:", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return UNREACHABLE;
  }

  if (!response.ok) {
    // 거절 여섯(400·401·403·405·429·503)이 전부 여기로 온다. 거절 본문은
    // 포털의 내부 사정을 설명할 수 있어 상태 코드만 남긴다.
    console.error("[oidc] 포털 알림 통로 거절:", response.status);
    return UNREACHABLE;
  }

  try {
    return normalizePortalNotificationFeed(await response.json());
  } catch {
    // JSON 이 아니거나 중간에 끊겼다(본문 읽기도 시간 상한에 걸릴 수 있다).
    console.error("[oidc] 포털의 알림 응답을 읽지 못했습니다.");
    return UNREACHABLE;
  }
}

/* ------------------------------------------------------------------ */
/* 「이 알림은 그만 보겠다」 — 지움을 포털에 **적는** 쪽                   */
/*                                                                     */
/* 🔴 바로 위(fetchPortalNotifications)와 같은 방향이다 — 우리가 포털에  */
/*    가는 길이고, POST 이고, 자격은 이 시스템의 client_secret(Basic)다. */
/*    주소만 다르다(/api/integration/notification-dismissals).          */
/*                                                                     */
/* 지움이 브라우저가 아니라 포털에 쌓이는 까닭: 브라우저 저장소는 주소   */
/* (포트)별로 갈려서 같은 사람이 시스템마다 다른 목록을 봤다 — A/S(3000) */
/* 에서 지운 줄이 이 게시판(3400)의 종에는 그대로 떴다. 포털 한 곳에     */
/* 모으면 어디서 지우든 사내 시스템 **전부의 종**에서 사라진다.          */
/* 부르는 법은 dss-auth 의 docs/사이트-알림-통로.md 에 있다.             */
/* ------------------------------------------------------------------ */

/**
 * 한 번에 보낼 수 있는 열쇠 수.
 *
 * 🔴 **넘으면 포털이 400 으로 통째로 거절한다 — 앞의 200개만 받아 주지
 *    않는다.** 그래서 자르는 일을 보내는 쪽이 한다. 🔴 여기 값을 올려도 포털이
 *    안 올라가면 소용이 없다 — 이 숫자는 **저쪽을 따라가는 값**이지 우리가
 *    정하는 값이 아니다(dss-auth 의 MAX_DISMISSAL_KEYS_PER_REQUEST).
 */
const DISMISSALS_PER_REQUEST = 200;

/**
 * 열쇠 한 묶음을 포털에 적는다. 🔴 **던지지 않는다** — 돌려주는 것은
 * 「적혔는가」뿐이고, 까닭은 서버 로그에만 남는다.
 *
 * 자격증명을 읽는 자리·머리말에 싣는 방식·시간 상한·no-store 는 모두 묻는
 * 쪽(fetchPortalNotifications)과 **같은 모양**이다. 둘이 어긋나면 「알림은
 * 오는데 지움은 안 먹히는」 상태가 되고, 그 어긋남은 신고로만 드러난다.
 */
async function recordDismissalChunk(
  subject: string,
  keys: readonly string[],
): Promise<boolean> {
  let response: Response;
  try {
    // env 의 getter 는 값이 없으면 던진다 — 그래서 try 안에서 읽는다.
    // 설정이 빠진 것 때문에 ✕ 한 번이 화면을 깨면 안 된다.
    const credentials = `${encodeURIComponent(env.oidcClientId)}:${encodeURIComponent(
      env.oidcClientSecret,
    )}`;

    response = await fetch(
      `${env.oidcIssuer}/api/integration/notification-dismissals`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({ sub: subject, keys: keys.join(",") }).toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(NOTIFICATIONS_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // 🔴 남기는 것은 오류의 **종류**뿐이다. 열쇠에는 글 id 같은 업무 식별자가
    //    들어 있어 그것도 찍지 않는다(포털이 같은 판단을 한다).
    console.error("[oidc] 알림 지움을 적지 못했습니다:", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }

  if (!response.ok) {
    // 거절 본문은 포털의 내부 사정을 설명할 수 있어 상태 코드만 남긴다
    // (묻는 쪽과 같은 거절 여섯이다).
    console.error("[oidc] 알림 지움 통로 거절:", response.status);
    return false;
  }

  return true;
}

/**
 * 「이 알림들은 그만 보겠다」를 포털에 적는다. 🔴 **어떤 일이 있어도 던지지
 * 않는다** — 묻는 쪽과 같은 약속이다. 못 적으면 그 줄이 종에 남을 뿐이고,
 * 그것이 머리말이, 곧 게시판 전체가 깨지는 것보다 훨씬 낫다.
 *
 * @param subject 포털의 users.id (= ID 토큰의 sub). 이 게시판은
 *                `web_users.auth_sub` 로 들고 있다. 🔴 **서버가 제 세션에서
 *                가진 값**이어야 한다 — 브라우저가 보낸 값을 그대로 넘기면
 *                남의 알림을 지울 수 있는 통로가 된다.
 * @param keys    `{client_id}:{id}` 모양. 모양이 틀리거나 모르는 시스템의
 *                것은 포털이 **조용히 버린다** — 한 줄 때문에 묶음이 통째로
 *                실패하지 않는다.
 * @returns 보낸 묶음이 **전부** 적혔는가. 하나라도 거절되면 false 다.
 *
 * 🔵 몇 번을 다시 보내도 안전하다 — 같은 열쇠를 두 번 지우는 것은 한 번
 *    지우는 것과 같다(포털이 이미 있는 열쇠를 조용히 넘긴다).
 */
export async function dismissPortalNotifications(
  subject: string,
  keys: readonly string[],
): Promise<boolean> {
  if (!subject) return false;

  // 같은 열쇠가 두 번 실려 와도 한 번만 보낸다. 포털은 어느 쪽이든 같은 답을
  // 주지만, 겹친 값이 200 칸을 차지해 묶음이 괜히 늘어나지 않게 한다.
  const wanted = Array.from(
    new Set(keys.filter((key): key is string => typeof key === "string" && key !== "")),
  );

  // 🔴 보낼 것이 없으면 **아예 부르지 않는다.** 빈 keys 는 포털이 400
  //    (no_keys)으로 거절하므로, 부르는 것은 거절 한 줄을 로그에 쌓는 일뿐이다.
  if (wanted.length === 0) return false;

  // 🔴 묶음을 **차례로** 보낸다(한꺼번에 던지지 않는다). 한 사람의 ✕ 한 번에
  //    포털로 여러 연결이 동시에 열리면, 인증 실패 세는 통(분당 20번)과 포털의
  //    DB 에 쓸데없는 봉우리를 만든다. 종에 실리는 줄은 많아야 200 이라
  //    (notifications/bell-items.ts) 묶음은 사실상 늘 하나다.
  let recorded = true;
  for (let at = 0; at < wanted.length; at += DISMISSALS_PER_REQUEST) {
    const chunk = wanted.slice(at, at + DISMISSALS_PER_REQUEST);
    if (!(await recordDismissalChunk(subject, chunk))) recorded = false;
  }

  return recorded;
}
