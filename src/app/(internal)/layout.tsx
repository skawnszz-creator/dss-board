import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth/guards";

/**
 * 사내 구간. 이 아래 모든 화면은 로그인 필수다.
 * 공개 구간((public))에서는 사내 데이터를 조회하지 않는다.
 */
export default async function InternalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await requireSession();

  return (
    <>
      <SiteHeader viewer={viewer} />
      <main className="mx-auto max-w-[1100px] px-4 py-6">{children}</main>
    </>
  );
}
