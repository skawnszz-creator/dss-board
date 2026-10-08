"use client";

import { useEffect, useState } from "react";

import { recordPostView } from "@/app/actions/posts";
import type { PostViewer } from "@/lib/posts/detail";

const SHOWN = 12;

/**
 * 열람자 명단 (요구사항 6).
 *
 * 화면이 실제로 열린 뒤에 한 번만 기록한다.
 * 서버에서 그릴 때 기록하면 목록에서 마우스만 올려도(미리 불러오기) 명단에 들어간다.
 */
export function PostViewers({
  postId,
  initialViewers,
}: {
  postId: string;
  initialViewers: PostViewer[];
}) {
  const [viewers, setViewers] = useState<PostViewer[]>(initialViewers);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    recordPostView(postId)
      .then((me) => {
        if (cancelled || !me) return;
        setViewers((prev) =>
          prev.some((v) => v.userId === me.userId) ? prev : [...prev, me],
        );
      })
      .catch(() => {
        // 기록에 실패해도 글을 읽는 데는 문제가 없다
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const shown = expanded ? viewers : viewers.slice(0, SHOWN);
  const hidden = viewers.length - shown.length;

  return (
    <section className="mt-8 rounded border border-gray-200 bg-gray-50 px-3 py-3">
      <p className="text-sm text-gray-700">
        읽음 <span className="font-semibold tabular">{viewers.length}</span>명
      </p>

      {viewers.length === 0 ? (
        <p className="mt-1 text-sm text-gray-500">아직 읽은 사람이 없습니다.</p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          {shown.map((v) => v.name).join(", ")}
          {hidden > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-blue-700 hover:underline"
              >
                외 {hidden}명 더 보기
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
