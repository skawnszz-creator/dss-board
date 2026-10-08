// dss-auth OIDC 연결 시 폐기 대상
//
// 개발용 임시 로그인. 포털의 /authorize·/token 이 아직 없어서
// 화면을 확인하려면 가짜 사용자가 필요하다.
//
// DEV_FAKE_LOGIN_ENABLED === "true" 일 때만 동작하고, 기본값은 반드시 꺼짐이다.
// 포털이 열리면 이 파일과 /login 의 임시 로그인 영역을 통째로 지운다.
import { env } from "@/lib/env";

export type DevUser = {
  /** 포털의 sub 자리를 대신하는 고정 UUID (테스트용) */
  sub: string;
  name: string;
  email: string | null;
};

/**
 * 테스트용 계정. 실제 사원 명단이 아니다.
 * 역할은 여기서 정하지 않는다 — 진짜 로그인과 똑같이 MEMBER 로 들어오고,
 * 관리자 승격은 `npm run make:admin` 으로 사람이 한다.
 */
export const DEV_USERS: DevUser[] = [
  {
    sub: "11111111-1111-4111-8111-111111111111",
    name: "이남준",
    email: "dss260818@gmail.com",
  },
  {
    sub: "22222222-2222-4222-8222-222222222222",
    name: "김부장(테스트)",
    email: null,
  },
  {
    sub: "33333333-3333-4333-8333-333333333333",
    name: "이과장(테스트)",
    email: null,
  },
  {
    sub: "44444444-4444-4444-8444-444444444444",
    name: "박사원(테스트)",
    email: null,
  },
];

export function devLoginEnabled(): boolean {
  return env.devFakeLoginEnabled;
}

export function findDevUser(sub: string): DevUser | null {
  return DEV_USERS.find((u) => u.sub === sub) ?? null;
}
