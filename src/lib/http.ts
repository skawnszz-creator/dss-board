import type { NextRequest } from "next/server";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 상태를 바꾸는 요청(POST 등)의 출처를 확인한다.
 * 브라우저가 Origin 을 보내지 않는 경우가 있어, 보냈을 때만 대조한다.
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  // nextUrl.host 는 내부 주소라 실제 요청 주소와 다를 수 있다.
  // 브라우저가 보낸 Host 를 기준으로 본다. (NAS 에서 앞단 프록시를 두면 x-forwarded-host)
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 실패 응답. DB 오류 원문·스택·테이블명을 내보내지 않는다. */
export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
