import Link from "next/link";
import { notFound } from "next/navigation";

import { DeletePostButton } from "@/components/delete-post-button";
import { PostContent } from "@/components/post-content";
import { PostViewers } from "@/components/post-viewers";
import { TopicBadge } from "@/components/topic-badge";
import { canEditPost, requireSession } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/limits";
import { getPost, listPostFiles, listPostViewers } from "@/lib/posts/detail";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSession(`/posts/${id}`);

  const post = await getPost(id);
  if (!post) notFound();

  const [files, viewers] = await Promise.all([
    listPostFiles(post.id),
    listPostViewers(post.id),
  ]);

  const canEdit = canEditPost(viewer, post);
  const edited = post.updatedAt.getTime() - post.createdAt.getTime() > 1000;

  return (
    <article>
      {/* 머리 */}
      <header className="border-b-2 border-gray-700 pb-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5">
            <TopicBadge topic={post.topic} />
          </span>
          <h1
            className={`text-lg text-gray-900 ${post.topic === "MUST_READ" ? "font-bold" : "font-semibold"}`}
          >
            {post.title}
          </h1>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
          <p>
            {post.authorName}
            <span className="mx-1.5 text-gray-300">|</span>
            <span className="tabular">{formatDateTime(post.createdAt)}</span>
            {edited && (
              <span className="ml-1.5 text-xs text-gray-400">
                (수정 {formatDateTime(post.updatedAt)})
              </span>
            )}
          </p>

          {/* 작성자와 관리자에게만 보인다. 실제 차단은 서버에서 다시 한다. */}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link
                href={`/posts/${post.id}/edit`}
                className="h-8 rounded border border-gray-300 px-3 text-sm leading-8 text-gray-700 hover:bg-gray-50"
              >
                수정
              </Link>
              <DeletePostButton postId={post.id} />
            </div>
          )}
        </div>
      </header>

      {/* 본문 */}
      <div className="py-6">
        <PostContent content={post.content} />
      </div>

      {/* 첨부파일 */}
      {files.length > 0 && (
        <section className="rounded border border-gray-200">
          <p className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            첨부파일 <span className="tabular">{files.length}</span>개
          </p>
          <ul className="divide-y divide-gray-100">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-gray-800">
                  {file.originalName}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-gray-500 tabular">
                    {formatBytes(file.byteSize)}
                  </span>
                  <a
                    href={`/api/files/${file.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    내려받기
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 열람자 명단 (요구사항 6) */}
      <PostViewers postId={post.id} initialViewers={viewers} />

      <div className="mt-6 flex justify-between border-t border-gray-200 pt-4">
        <Link
          href="/"
          className="h-9 rounded border border-gray-300 px-4 text-sm leading-9 text-gray-700 hover:bg-gray-50"
        >
          목록
        </Link>
        <Link
          href="/posts/new"
          className="h-9 rounded bg-blue-700 px-4 text-sm font-semibold leading-9 text-white hover:bg-blue-800"
        >
          글쓰기
        </Link>
      </div>
    </article>
  );
}

export const dynamic = "force-dynamic";
