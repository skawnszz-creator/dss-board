/**
 * 실행 환경 값을 한곳에서 읽는다.
 *
 * 규칙: 비밀값이 없으면 조용히 기본값으로 넘어가지 않고 명확히 throw 한다.
 * 인증에서 "설정이 빠졌는데 그럭저럭 동작하는" 상태가 가장 위험하기 때문이다.
 *
 * getter 로 만든 이유: 모듈을 불러오는 시점이 아니라 실제로 값을 쓰는 시점에
 * 검사하기 위해서다. (빌드 중에 불필요하게 터지지 않게)
 */

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
  /* OIDC — dss-auth 포털 연결. 엔드포인트가 열리면 채운다.             */
  /* ---------------------------------------------------------------- */

  /** 포털의 issuer. 끝 슬래시 유무까지 ID 토큰의 iss 와 정확히 같아야 한다. */
  get oidcIssuer(): string {
    return required("OIDC_ISSUER");
  },

  get oidcClientId(): string {
    return required("OIDC_CLIENT_ID");
  },

  /** 서버에서만 쓴다. NEXT_PUBLIC_ 접두사를 붙이면 브라우저로 새어나간다. */
  get oidcClientSecret(): string {
    return required("OIDC_CLIENT_SECRET");
  },

  /** 포털에 등록한 값과 문자 단위로 정확히 같아야 한다. */
  get oidcRedirectUri(): string {
    return required("OIDC_REDIRECT_URI");
  },

  /**
   * code_verifier · state · nonce 를 담는 10분 쿠키의 서명 열쇠.
   * 서명하지 않으면 사용자가 code_verifier 를 바꿔치기해 PKCE 를 무력화할 수 있다.
   */
  get authStateSecret(): string {
    return required("AUTH_STATE_SECRET");
  },
};
