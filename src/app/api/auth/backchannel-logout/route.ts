/**
 * 포털(dss-auth)이 "이 사람 세션 끊어라" 라고 알려오는 곳
 * (OIDC Back-Channel Logout 1.0).
 *
 * 한 곳에서 나가면 어디서든 나가야 한다. 포털에서 로그아웃했는데 이 게시판이
 * 계속 열려 있으면, 공용 PC 에서는 그것이 곧 로그아웃이 안 된 것이다.
 *
 * ⚠️ 이 창구는 인증 없이 누구나 두드릴 수 있다. 서명 검증(verifyLogoutToken)이
 * 이 파일의 전부다 — 건너뛰면 아무나 아무 사람이나 로그아웃시킬 수 있는
 * 창구가 된다. 일하는 사람을 계속 튕겨내는 것만으로도 충분히 성가신 공격이다.
 *
 * 포털은 이 주소를 **등록해야** 부른다(clients.backchannel_logout_uri).
 * 등록하지 않으면 이 파일은 그냥 조용히 놀고, 포털에서 나가도 게시판 세션은
 * 자기 수명(SESSION_HOURS)이 다할 때까지 살아 있다. 등록은 사람이 따로 한다.
 *
 * 경로를 /api/auth/ 아래 둔 이유: 콜백이 /api/auth/callback 이라 포털과
 * 이야기하는 통로를 같은 자리에 모은다.
 */
import { verifyLogoutToken } from "@/lib/auth/oidc";
import { revokeSessionsForSubject } from "@/lib/auth/session";

/**
 * 규격이 요구하는 응답 헤더. 이 응답이 캐시되면 다음 통보가 서버에 닿지 않고
 * 캐시로 처리될 수 있다. **모든** 응답에 붙인다.
 */
const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  let token: string | null = null;
  try {
    const form = await request.formData();
    const value = form.get("logout_token");
    if (typeof value === "string") token = value;
  } catch {
    // 폼(application/x-www-form-urlencoded)이 아니면 규격을 따르지 않는 요청이다.
  }

  if (!token) {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const subject = await verifyLogoutToken(token);
  if (!subject) {
    // 왜 거절했는지는 서버 로그에만 남긴다. 두드리는 쪽에 알려주지 않는다.
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  let revoked: boolean;
  try {
    revoked = await revokeSessionsForSubject(subject);
  } catch (error) {
    // 서명은 맞는데 DB 가 거절한 경우(예: sub 가 UUID 꼴이 아님).
    // 여기서도 no-store 를 붙여야 해서 직접 받아 넘긴다.
    console.error("[auth] 세션을 끊지 못했습니다", error);
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: NO_STORE },
    );
  }

  if (revoked) {
    console.info(`[auth] 세션을 끊었습니다: ${subject}`);
  } else {
    // 끊을 세션이 없어도 성공으로 답한다. 규격이 그렇게 정했다 —
    // 끊을 것이 없는 것도 끊긴 것이다. 이 게시판에 아직 들어온 적 없는
    // 사람일 수 있다(포털에 전 직원 공개로 등록돼 있다).
    console.info(`[auth] 끊을 세션이 없습니다: ${subject}`);
  }

  return new Response(null, { status: 204, headers: NO_STORE });
}
