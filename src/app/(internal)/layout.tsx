import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth/guards";

/**
 * 사내 구간. 이 아래 모든 화면은 로그인 필수다.
 * 공개 구간((public))에서는 사내 데이터를 조회하지 않는다.
 *
 * 🔴 requireSession 에 돌아갈 주소를 주지 못한다. 서버 레이아웃은 지금 어떤
 * 주소를 보고 있는지 알 수 없고(searchParams 도 pathname 도 받지 않는다),
 * 레이아웃은 자식 화면보다 **먼저** 돌아 여기서 포털로 보내 버린다. 그래서
 * 아래 화면들이 적어 둔 returnTo(posts/[id]/page.tsx 등)는 미로그인 상태에서는
 * 쓰이지 못하고, 깊은 주소로 들어오려던 사람은 로그인 뒤 첫 화면에 선다.
 * 고치려면 middleware 로 주소를 머리말에 실어 내려야 해서 이번 조각에서는
 * 손대지 않았다(지시서 범위 밖).
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
