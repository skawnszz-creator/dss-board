import { redirect } from "next/navigation";

import { devLoginAction } from "@/app/actions/auth";
import { DEV_USERS, devLoginEnabled } from "@/lib/auth/dev-login";
import { getViewer, safeReturnTo } from "@/lib/auth/guards";
import { oidcConfigured } from "@/lib/auth/oidc";

const ERROR_MESSAGES: Record<string, string> = {
  // 상세 사유는 서버 로그에만 남긴다. 사용자에게는 보여주지 않는다.
  "1": "로그인하지 못했습니다. 다시 시도해 주세요.",
  blocked: "이 계정은 지금 사용할 수 없습니다. 관리자에게 문의하세요.",
  "not-ready": "통합 로그인 포털 연결이 아직 준비되지 않았습니다.",
  "dev-off": "임시 로그인이 꺼져 있습니다.",
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
  const devReady = devLoginEnabled();

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

      {devReady && (
        /* dss-auth OIDC 연결 시 폐기 대상 */
        <div className="mt-6 rounded border border-dashed border-amber-300 bg-amber-50 p-5">
          <p className="text-xs font-semibold text-amber-800">
            개발용 임시 로그인 (테스트 계정)
          </p>
          <p className="mt-1 text-xs text-amber-700">
            포털 연결 전에 화면을 확인하기 위한 것입니다. 실제 사원 명단이 아닙니다.
          </p>
          <ul className="mt-3 space-y-2">
            {DEV_USERS.map((user) => (
              <li key={user.sub}>
                <form action={devLoginAction}>
                  <input type="hidden" name="sub" value={user.sub} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:border-amber-500 hover:bg-amber-100"
                  >
                    {user.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
