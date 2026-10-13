/**
 * 실행 환경 값을 한곳에서 읽는다.
 *
 * 규칙: 비밀값이 없으면 조용히 기본값으로 넘어가지 않고 명확히 throw 한다.
 * 인증에서 "설정이 빠졌는데 그럭저럭 동작하는" 상태가 가장 위험하기 때문이다.
 *
 * getter 로 만든 이유: 모듈을 불러오는 시점이 아니라 실제로 값을 쓰는 시점에
 * 검사하기 위해서다. (빌드 중에 불필요하게 터지지 않게)
 */

import { isAutoValue, primaryLanAddress, resolveAutoUrl } from "./lan-address";

/** 포털(dss-auth)의 포트. */
const PORTAL_PORT = 3100;

/**
 * 이 사이트의 포트.
 *
 * 3400 인 이유: 이 개발 PC 에서 A/S 3000 · 통합 로그인 3100 · 회사 홈페이지
 * 3200 · 계측기 3300 이 이미 쓴다. 로그인 왕복을 보려면 포털과 이 사이트가
 * **동시에** 떠 있어야 하므로 겹치면 안 된다.
 */
const OWN_PORT = Number(process.env.PORT ?? 3400);

/**
 * 포털에 등록된 이 시스템 redirect_uri 의 경로 부분.
 * 실제 라우트는 src/app/api/auth/callback/route.ts 다.
 */
const OIDC_CALLBACK_PATH = "/api/auth/callback";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 이(가) 설정되지 않았습니다. .env.local 파일을 확인하세요.`,
    );
  }
  return value.trim();
}

function flag(name: string): boolean {
  return process.env[name] === "true";
}

export const env = {
  /** PostgreSQL 접속 주소 (이 사이트 전용 DB dss_board) */
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  /**
   * 사진·첨부파일을 쌓아두는 폴더의 절대경로.
   * DB 에는 이 루트 아래의 상대경로만 저장한다. NAS 에서는 볼륨으로 붙인 /data 가 된다.
   */
  get storageRoot(): string {
    return required("STORAGE_ROOT");
  },

  /**
   * 세션 쿠키에 secure 를 붙일지.
   * 사내망 HTTP 단계에서 true 로 켜면 쿠키가 저장되지 않아 로그인이 조용히 실패한다.
   */
  get sessionCookieSecure(): boolean {
    return flag("SESSION_COOKIE_SECURE");
  },

  /** 세션 수명(시간). dss-auth SSO 세션의 절대 만료 12시간을 넘기지 않는다. */
  get sessionHours(): number {
    const raw = process.env.SESSION_HOURS;
    const n = raw ? Number(raw) : 12;
    if (!Number.isFinite(n) || n <= 0 || n > 12) return 12;
    return n;
  },

  /**
   * 임시 로그인 사용 여부. 기본값은 반드시 꺼짐.
   * dss-auth 의 OIDC 엔드포인트가 열리면 이 값과 관련 코드를 통째로 폐기한다.
   */
  get devFakeLoginEnabled(): boolean {
    return flag("DEV_FAKE_LOGIN_ENABLED");
  },

  /* ---------------------------------------------------------------- */
  /* OIDC — dss-auth 포털 연결                                          */
  /* ---------------------------------------------------------------- */

  /**
   * 포털의 issuer. ID 토큰의 iss 클레임과 문자 단위로 같아야 한다.
   *
   * `auto` 면 이 기계의 사내망 주소 + 포털 포트(3100)로 푼다 — 개발 중에는
   * 포털도 같은 PC 에 있다. Wi-Fi 가 바뀌어 주소가 달라져도 설정을 고칠
   * 필요가 없다. 운영은 HTTPS 도메인이라 이 기계가 알아낼 수 없으니 직접 적는다.
   *
   * 끝의 슬래시를 떼는 이유: auth/oidc.ts 의 getDiscovery() 는 떼고 쓰지만
   * verifyIdToken() 의 jwtVerify({ issuer }) 에는 이 값이 그대로 들어간다.
   * "http://x/" 와 "http://x" 가 섞이면 iss 대조가 **조용히** 실패하는데,
   * 원인을 찾기가 가장 어려운 종류의 버그다. 여기서 한 번 떼면 둘이 맞는다.
   */
  get oidcIssuer(): string {
    const raw = required("OIDC_ISSUER");
    const resolved = isAutoValue(raw)
      ? resolveAutoUrl(raw, PORTAL_PORT, primaryLanAddress())
      : raw;
    return resolved.replace(/\/+$/, "");
  },

  get oidcClientId(): string {
    return required("OIDC_CLIENT_ID");
  },

  /** 서버에서만 쓴다. NEXT_PUBLIC_ 접두사를 붙이면 브라우저로 새어나간다. */
  get oidcClientSecret(): string {
    return required("OIDC_CLIENT_SECRET");
  },

  /**
   * 포털에 등록한 값과 문자 단위로 정확히 같아야 한다.
   *
   * `auto` 면 이 기계의 사내망 주소 + 이 사이트 포트(3400) + 콜백 경로로 푼다.
   * 운영은 HTTPS 도메인이라 이 기계가 알아낼 수 없으니 직접 적는다.
   *
   * 요청(request.url)에서 만들어 쓰지 않고 환경변수로 두는 이유: LAN 으로
   * 들어온 요청인데도 서버 자신의 바인딩 주소(localhost)가 보이는 경우가
   * A/S 시스템에서 실측되었다. redirect_uri 는 /authorize 와 /token 양쪽에서
   * 문자 단위로 대조되므로, 만들어 쓰면 "어떤 망에서는 되고 어떤 망에서는
   * 안 되는" 형태로 실패한다.
   *
   * auto 는 요청에서 만들어 쓰는 것과 다르다 — 이 기계의 네트워크 인터페이스를
   * 읽으므로 누가 부르든 같은 문자열이 나온다. 위 주석이 배제한 "망에 따라
   * 달라지는" 문제가 생기지 않는다.
   */
  get oidcRedirectUri(): string {
    const raw = required("OIDC_REDIRECT_URI");
    if (!isAutoValue(raw)) return raw;
    return `${resolveAutoUrl(raw, OWN_PORT, primaryLanAddress())}${OIDC_CALLBACK_PATH}`;
  },

  /**
   * code_verifier · state · nonce 를 담는 10분 쿠키의 서명 열쇠.
   * 서명하지 않으면 사용자가 code_verifier 를 바꿔치기해 PKCE 를 무력화할 수 있다.
   */
  get authStateSecret(): string {
    return required("AUTH_STATE_SECRET");
  },
};
