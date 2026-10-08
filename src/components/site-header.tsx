import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import type { Viewer } from "@/lib/auth/guards";

export function SiteHeader({ viewer }: { viewer: Viewer }) {
  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-base font-bold text-gray-900 sm:text-lg"
        >
          DSS 사내 게시판
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {viewer.isAdmin && (
            <Link
              href="/admin/users"
              className="text-blue-700 hover:underline"
            >
              사용자 관리
            </Link>
          )}

          <span className="flex items-center gap-1.5 text-gray-700">
            {viewer.user.displayName}
            {viewer.isAdmin && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                관리자
              </span>
            )}
          </span>

          <form action={logoutAction}>
            <button
              type="submit"
              className="text-gray-500 hover:text-gray-900 hover:underline"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
