/**
 * 서비스 메뉴바가 그릴 목록을 나르는 **세션과 별도인 서명 쿠키**.
 *
 * 포털(dss-auth)이 로그인 ID 토큰의 `dss_services` 클레임에 「이 사람이 들어갈
 * 수 있는 사내 시스템」을 실어 보낸다. 그 값을 여기서 걸러 서명한 쿠키에
 * 담아 두었다가, (internal)/layout.tsx 가 서버에서 풀어 **머리말 안**의
 * 메뉴바로 그린다(SiteHeader 의 serviceMenu prop).
 *
 * ── 왜 세션에 넣지 않나 ─────────────────────────────────────────────────
 * 이 사이트의 세션은 **DB 표**다(session.ts 의 web_sessions — 쿠키에는 무작위
 * 토큰만 들어 있고 사람·역할은 DB 행에서 읽는다). 그 행은 인가 판정에 쓰인다.
 * 메뉴 목록은 **그리는 데만** 쓰는 값이고 시스템 수만큼 길어진다. 섞어 두면
 * 「세션에 무엇이 들었나」를 읽는 사람이 매번 둘을 갈라 봐야 하고, 인가 쪽이
 * 화면 장식 때문에 흔들린다. 그래서 쿠키 한 장을 따로 둔다 —
 * board_session · board_auth_state 와 같은 식구다.
 *
 * ── 왜 서명하나 ─────────────────────────────────────────────────────────
 * 안 하면 사용자가 자기 브라우저에서 값을 고쳐 가짜 링크를 띄울 수 있다.
 * 자기만 속는 일이지만(이 값으로 열리는 권한은 없다) 막는 값이 몇 줄이라
 * 막는 편이 낫다.
 *
 * 🔴 **열쇠는 AUTH_STATE_SECRET 을 함께 쓰되, 서명 입력에 용도 꼬리표를 붙인다.**
 * 이 저장소는 세션이 DB 형이라 따로 둔 세션 서명 열쇠가 없고, 있는 비밀값은
 * 로그인 상태 쿠키(board_auth_state)용 AUTH_STATE_SECRET 하나다. 같은 열쇠로
 * 모양이 다른 두 토큰을 서명하면 한쪽을 다른 쪽 자리에 들이밀 여지가 생기므로,
 * HMAC 입력 앞에 아래 SIGNATURE_PURPOSE 를 붙여 두 서명이 절대 겹치지 않게
 * 한다. 꼬리표는 **이 파일 쪽에만** 있다 — oidc.ts 의 sealState/openState 는
 * 한 글자도 건드리지 않았다(그쪽 서명은 `body` 만 먹는다).
 *
 * 왜 그것으로 충분한가: 양쪽이 서명하는 값은 모두 base64url 문자열로 **시작**
 * 하는데, 꼬리표에 쓴 `:` 와 `.` 은 base64url 알파벳(A-Z a-z 0-9 - _)에 없다.
 * 그래서 한쪽의 서명 입력이 다른 쪽의 서명 입력이 되는 일이 원천적으로 없다.
 *
 * ── 권한을 판정하지 않는다 ──────────────────────────────────────────────
 * 이 파일은 포털이 준 목록을 **그대로** 나를 뿐, 무엇을 더하거나 빼지 않는다
 * (@dss/ui 의 normalizeServiceMenu 도 그릴 수 없는 칸만 버린다). 판정이 두
 * 벌이 되면 포털 타일(/apps)과 이 메뉴바가 서로 다른 말을 하게 된다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { normalizeServiceMenu, type ServiceMenuEntry } from "@dss/ui";
import { env } from "@/lib/env";

/** 이 사이트 고유 쿠키 이름. board_session · board_auth_state 와 같은 식구다. */
export const SERVICE_MENU_COOKIE = "board_service_menu";

/**
 * 서명 입력 앞에 붙는 고정 꼬리표(용도 구분표).
 *
 * AUTH_STATE_SECRET 을 로그인 상태 쿠키와 **함께** 쓰기 때문에 반드시 필요하다.
 * 값을 바꾸면 이미 구워 둔 쿠키가 전부 서명 불일치가 되어 조용히 빈 목록이
 * 된다(메뉴바만 사라지고 로그인은 멀쩡하다). 그래서 `.v1` 을 달아 두었다 —
 * 담는 모양을 바꿀 일이 생기면 꼬리표를 올려 옛 쿠키를 한 번에 무효로 만든다.
 */
const SIGNATURE_PURPOSE = "service-menu.v1";

type ServiceMenuPayload = {
  services: ServiceMenuEntry[];
  /** 유닉스 초 */
  issuedAt: number;
  /** 유닉스 초 */
  expiresAt: number;
};

/**
 * 세션 쿠키와 **같은 수명**.
 *
 * 어긋나면 세션은 살아 있는데 메뉴바만 사라지거나(짧으면) 로그아웃한 사람의
 * 브라우저에 남의 시스템 목록이 남는다(길면).
 */
function maxAgeSeconds(): number {
  return env.sessionHours * 60 * 60;
}

function sign(payloadBase64: string): string {
  return createHmac("sha256", env.authStateSecret)
    .update(`${SIGNATURE_PURPOSE}:${payloadBase64}`)
    .digest("base64url");
}

/**
 * ID 토큰에서 꺼낸 `dss_services` 클레임을 쿠키에 담을 토큰으로 만든다.
 *
 * 🔴 **그릴 것이 없으면 null 이다 — 쿠키를 굽지 않는다.** 클레임이 아예 없는
 * 로그인이 정상적으로 있을 수 있고(포털이 그 사람에게 목록을 안 실었을 때),
 * 그때 머리말은 예전과 같아야 한다 — 빈 띠도, 빈 자리도 남기지 않는다.
 * 「클레임이 없다」와 「값이 이상하다」를 구분하지 않는 이유도 같다: 어느
 * 쪽이든 그릴 수 있는 칸이 없으면 메뉴바는 없는 것이 맞다.
 */
export function createServiceMenuToken(claim: unknown): string | null {
  const services = normalizeServiceMenu(claim);
  if (services.length === 0) return null;

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: ServiceMenuPayload = {
    services,
    issuedAt,
    expiresAt: issuedAt + maxAgeSeconds(),
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${payloadBase64}.${sign(payloadBase64)}`;
}

/**
 * 위조 · 변조 · 만료된 토큰은 모두 **빈 목록**이다(예외를 던지지 않는다).
 *
 * 메뉴바는 곁다리인데 여기서 터지면 본문까지 못 보게 된다 — 메뉴바 하나
 * 때문에 모든 화면이 죽어서는 안 된다. 서명이 맞아도 안에 든 값은 다시
 * 거른다: 옛 토큰이 남아 있거나 포털 쪽이 먼저 바뀐 경우가 있다.
 */
export function parseServiceMenuToken(token: string): ServiceMenuEntry[] {
  const dot = token.indexOf(".");
  if (dot <= 0) return [];

  const payloadBase64 = token.slice(0, dot);
  const presented = token.slice(dot + 1);

  // 문자열 비교는 앞에서부터 다른 지점까지 걸리는 시간이 달라, 서명을 한
  // 글자씩 알아내는 공격이 이론상 가능하다(oidc.ts 의 openState 와 같은 이유).
  const got = Buffer.from(presented);
  const want = Buffer.from(sign(payloadBase64));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate.expiresAt !== "number") return [];
  if (candidate.expiresAt <= Math.floor(Date.now() / 1000)) return [];

  return normalizeServiceMenu(candidate.services);
}

/**
 * 로그인에 성공한 사람에게 이 쿠키를 준다.
 *
 * 속성은 세션 쿠키(session.ts 의 createSession)와 같은 값으로 맞춘다. 그릴
 * 것이 없으면 굽지 않고 **남아 있던 것을 지운다** — 공용 PC 에서 앞사람이
 * 남긴 목록이 뒷사람 화면에 그대로 뜨는 것을 막는 두 번째 자리다(첫 자리는
 * 로그인을 시작하는 /api/auth/login 이다).
 */
export async function writeServiceMenuCookie(claim: unknown): Promise<void> {
  const token = createServiceMenuToken(claim);
  if (!token) {
    await clearServiceMenuCookie();
    return;
  }

  (await cookies()).set(SERVICE_MENU_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 사내망 HTTP 단계에서 켜면 브라우저가 쿠키를 저장하지 않는다(세션과 같다).
    secure: env.sessionCookieSecure,
    maxAge: maxAgeSeconds(),
  });
}

/**
 * 이 브라우저에 남은 목록을 지운다.
 *
 * 🔴 로그인이 **시작되는** 자리와 로그아웃에서 부른다. 안 지우면 공용 PC 에서
 * 앞사람이 남긴 쿠키가 뒷사람 화면에 **남의 시스템 목록**으로 뜬다. 로그아웃
 * 쪽은 그것대로, 「이 사람이 어떤 시스템을 쓰는지」를 브라우저에 남겨 둘 이유가
 * 없다는 뜻이다.
 */
export async function clearServiceMenuCookie(): Promise<void> {
  (await cookies()).set(SERVICE_MENU_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.sessionCookieSecure,
    maxAge: 0,
  });
}

/** 쿠키가 없거나 못 믿을 것이면 빈 목록 — 그때 메뉴바는 그려지지 않는다. */
export async function readServiceMenu(): Promise<ServiceMenuEntry[]> {
  const token = (await cookies()).get(SERVICE_MENU_COOKIE)?.value;
  if (!token) return [];
  return parseServiceMenuToken(token);
}
