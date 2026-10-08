import Link from "next/link";

import type { PostTopic } from "@/lib/codes";
import { listHref } from "@/lib/posts/url";

/** 현재 쪽 주변으로 최대 5개의 쪽 번호를 보여준다. */
function pageWindow(page: number, totalPages: number): number[] {
  const size = 5;
  let start = Math.max(1, page - Math.floor(size / 2));
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({
  page,
  totalPages,
  topic,
  q,
}: {
  page: number;
  totalPages: number;
  topic: PostTopic | null;
  q: string | null;
}) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);
  const base = "inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm";

  return (
    <nav className="mt-6 flex items-center justify-center gap-1">
      {page > 1 && (
        <Link
          href={listHref({ topic, q, page: page - 1 })}
          className={`${base} border border-gray-200 text-gray-600 hover:bg-gray-50`}
          aria-label="이전 쪽"
        >
          ‹
        </Link>
      )}

      {pages.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className={`${base} bg-blue-700 font-semibold text-white tabular`}
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={listHref({ topic, q, page: n })}
            className={`${base} border border-gray-200 text-gray-600 tabular hover:bg-gray-50`}
          >
            {n}
          </Link>
        ),
      )}

      {page < totalPages && (
        <Link
          href={listHref({ topic, q, page: page + 1 })}
          className={`${base} border border-gray-200 text-gray-600 hover:bg-gray-50`}
          aria-label="다음 쪽"
        >
          ›
        </Link>
      )}
    </nav>
  );
}
