import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { TopicBadge } from "@/components/topic-badge";
import { POST_TOPICS } from "@/lib/codes";
import { formatListDate } from "@/lib/format";
import { TOPIC_LABELS } from "@/lib/labels";
import { listPosts, parsePage, parseTopic } from "@/lib/posts/queries";
import { listHref } from "@/lib/posts/url";

export default async function PostListPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const topic = parseTopic(sp.topic);
  const q = sp.q?.trim() || null;
  const result = await listPosts({ topic, q, page: parsePage(sp.page) });

  const now = new Date();

  return (
    <>
      {/* 주제 필터 (요구사항 11) + 검색 (요구사항 7) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <FilterChip href={listHref({ q })} active={!topic} label="전체" />
          {POST_TOPICS.map((t) => (
            <FilterChip
              key={t}
              href={listHref({ topic: t, q })}
              active={topic === t}
              label={TOPIC_LABELS[t]}
            />
          ))}
        </div>

        <form method="get" action="/" className="flex items-center gap-1">
          {topic && <input type="hidden" name="topic" value={topic} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="제목 · 내용 · 작성자"
            className="h-9 w-44 rounded border border-gray-300 px-2 text-sm outline-none focus:border-blue-700 sm:w-56"
          />
          <button
            type="submit"
            className="h-9 rounded border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            검색
          </button>
        </form>
      </div>

      {q && (
        <p className="mt-3 text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{q}</span> 검색 결과{" "}
          <span className="tabular">{result.total}</span>건
          <Link
            href={listHref({ topic })}
            className="ml-2 text-blue-700 hover:underline"
          >
            검색 해제
          </Link>
        </p>
      )}

      {/* 목록 (요구사항 5·8·10) */}
      <table className="mt-4 w-full border-t-2 border-gray-700 text-sm">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="w-20 px-2 py-2 text-center font-normal">주제</th>
            <th className="px-2 py-2 text-left font-normal">제목</th>
            <th className="w-28 px-2 py-2 text-center font-normal">작성자</th>
            <th className="w-24 px-2 py-2 text-center font-normal">작성일</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="border-b border-gray-200 px-2 py-16 text-center text-sm text-gray-500"
              >
                {q ? "검색 결과가 없습니다." : "아직 글이 없습니다."}
              </td>
            </tr>
          )}

          {result.items.map((post) => {
            const isMustRead = post.topic === "MUST_READ";
            return (
              <tr
                key={post.id}
                className={`border-b border-gray-200 ${isMustRead ? "bg-red-50/60" : ""}`}
              >
                <td className="hidden px-2 py-3 text-center align-top sm:table-cell">
                  <TopicBadge topic={post.topic} />
                </td>
                <td className="px-2 py-3">
                  <div className="mb-1 sm:hidden">
                    <TopicBadge topic={post.topic} />
                  </div>
                  <Link
                    href={`/posts/${post.id}`}
                    className={`text-gray-900 hover:underline ${isMustRead ? "font-bold" : ""}`}
                  >
                    {post.title}
                  </Link>
                  {post.fileCount > 0 && (
                    <span
                      className="ml-1.5 text-xs text-gray-500 tabular"
                      title={`첨부파일 ${post.fileCount}개`}
                    >
                      📎{post.fileCount}
                    </span>
                  )}
                  <div className="mt-1 text-xs text-gray-500 sm:hidden">
                    {post.authorName} · {formatListDate(post.createdAt, now)}
                  </div>
                </td>
                <td className="hidden px-2 py-3 text-center text-gray-600 sm:table-cell">
                  {post.authorName}
                </td>
                <td className="hidden px-2 py-3 text-center text-gray-500 tabular sm:table-cell">
                  {formatListDate(post.createdAt, now)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <Link
          href="/posts/new"
          className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          글쓰기
        </Link>
      </div>

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        topic={topic}
        q={q}
      />
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded border border-blue-700 bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white"
          : "rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      }
    >
      {label}
    </Link>
  );
}

export const dynamic = "force-dynamic";
