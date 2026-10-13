import { redirect } from "next/navigation";

import { getViewer, safeReturnTo } from "@/lib/auth/guards";
import { oidcConfigured } from "@/lib/auth/oidc";

/**
 * 로그인 화면.
 *
 * 이 게시판은 아이디도 비밀번호도 받지 않는다. 단추 하나로 포털(dss-auth)에
 * 넘기고, 포털이 확인해 준 결과만 받는다. 자체 로그인을 만들지 않는 것이 이
 * 저장소의 전제다.
 *
 * ⚠️ 평소에는 이 화면을 거치지 않는다. 세션이 없으면 requireSession 이 곧장
 * /api/auth/login 으로 보낸다(이유는 guards.ts 에 적어 두었다). 이 화면은
 * 로그인이 **거절됐을 때**(blocked · unknown_role · not-ready) 이유를 보여주는
 * 자리로 남는다.
 *
 * 🔴 여기서는 자동으로 다시 보내지 않는다. 보내면 거절 → 자동 재시도 → 거절의
 * 무한 왕복이 되어 사람이 사유를 읽을 틈조차 없어진다. 다시 시도는 사람이
 * 단추를 눌러야 일어난다 — 거절당한 사람이 유일하게 할 수 있는 일이다.
 */

const ERROR_MESSAGES: Record<string, string> = {
  // 상세 사유는 서버 로그에만 남긴다. 사용자에게는 보여주지 않는다.
  "1": "로그인하지 못했습니다. 다시 시도해 주세요.",
  blocked: "이 계정은 지금 사용할 수 없습니다. 관리자에게 문의하세요.",
  unknown_role:
    "계정의 역할 설정에 문제가 있어 들어갈 수 없습니다. 관리자에게 문의하세요.",
  "not-ready": "통합 로그인 포털 연결이 아직 준비되지 않았습니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = safeReturnTo(sp.returnTo);

  // 이미 로그인했으면 들어가 있을 자리로 보낸다.
  const viewer = await getViewer();
  if (viewer) redirect(returnTo);

  const message = sp.error ? ERROR_MESSAGES[sp.error] : null;
  const portalReady = oidcConfigured();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-gray-900">
        DSS 사내 게시판
      </h1>
      <p className="mt-2 text-center text-sm text-gray-500">
        사내 임직원 전용입니다
      </p>

      {message && (
        <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      <div className="mt-8 rounded border border-gray-200 p-6">
        <a
          href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
          aria-disabled={!portalReady}
          className={
            portalReady
              ? "block rounded bg-blue-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-800"
              : "pointer-events-none block rounded bg-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-500"
          }
        >
          DSS 통합 로그인으로 들어가기
        </a>

        {!portalReady && (
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            통합 로그인 포털(dss-auth)의 연결 설정이 아직 비어 있습니다.
            준비되면 이 버튼으로 로그인하게 됩니다.
          </p>
        )}
      </div>
    </main>
  );
}
