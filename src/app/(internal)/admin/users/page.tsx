import { asc, eq } from "drizzle-orm";

import { setUserActive } from "@/app/actions/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { webUsers } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import type { UserRole } from "@/lib/codes";

const ERRORS: Record<string, string> = {
  "1": "요청을 처리하지 못했습니다.",
  self: "자기 자신의 사용 여부는 바꿀 수 없습니다.",
  "role-locked":
    "역할은 통합 로그인 포털(dss-auth)에서 정합니다. 이 화면에서는 바꿀 수 없습니다.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const message = sp.error ? ERRORS[sp.error] : null;

  const users = await db
    .select()
    .from(webUsers)
    .where(eq(webUsers.isDeleted, false))
    .orderBy(asc(webUsers.displayName));

  return (
    <>
      <h1 className="mb-1 border-b-2 border-gray-700 pb-2 text-lg font-bold text-gray-900">
        사용자 관리
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        계정도 <strong>역할도 통합 로그인 포털(dss-auth)이 정합니다.</strong>{" "}
        역할을 바꾸려면 포털의 관리 화면에서 이 게시판(dss-board) 권한을
        바꾸세요. 바뀐 역할은 그 사람이 <strong>다시 로그인할 때</strong>{" "}
        반영됩니다. 포털에서 역할을 받지 않은 사람은 &lsquo;일반&rsquo;으로
        들어옵니다.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        이 화면에서 할 수 있는 일은 <strong>게시판 사용을 중지·재개</strong>하는
        것뿐입니다. 사용 중지는 이 게시판에만 적용되고 다른 시스템에는 영향이
        없습니다.
      </p>

      {message && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      )}

      <table className="mt-4 w-full border-t border-gray-200 text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="px-2 py-2 text-left font-normal">이름</th>
            <th className="hidden px-2 py-2 text-left font-normal sm:table-cell">
              이메일
            </th>
            <th className="w-24 px-2 py-2 text-center font-normal">역할</th>
            <th className="hidden w-40 px-2 py-2 text-center font-normal sm:table-cell">
              마지막 로그인
            </th>
            <th className="w-28 px-2 py-2 text-center font-normal">
              게시판 사용
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isMe = user.id === admin.user.id;
            const role = user.role as UserRole;

            return (
              <tr key={user.id} className="border-b border-gray-200">
                <td className="px-2 py-2.5">
                  <span className={user.isActive ? "" : "text-gray-400 line-through"}>
                    {user.displayName}
                  </span>
                  {isMe && (
                    <span className="ml-1.5 text-xs text-gray-400">(나)</span>
                  )}
                </td>
                <td className="hidden px-2 py-2.5 text-gray-500 sm:table-cell">
                  {user.email ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span
                    className={
                      role === "ADMIN"
                        ? "rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                        : "rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600"
                    }
                  >
                    {ROLE_LABELS[role]}
                  </span>
                </td>
                <td className="hidden px-2 py-2.5 text-center text-xs text-gray-500 tabular sm:table-cell">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
                </td>
                <td className="px-2 py-2.5">
                  {isMe ? (
                    <p className="text-center text-xs text-gray-400">—</p>
                  ) : (
                    <div className="flex items-center justify-center">
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={user.isActive ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="h-8 rounded border border-gray-300 px-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {user.isActive ? "사용 중지" : "사용 재개"}
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export const dynamic = "force-dynamic";
