import { notFound, redirect } from "next/navigation";

import { PostForm } from "@/components/post-form";
import { canEditPost, requireSession } from "@/lib/auth/guards";
import { sanitizePostDoc } from "@/lib/post-content/sanitize";
import { getPost, listPostFiles } from "@/lib/posts/detail";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireSession(`/posts/${id}/edit`);

  const post = await getPost(id);
  if (!post) notFound();

  // 작성자와 관리자만 들어올 수 있다 (요구사항 9).
  // 저장할 때 서버에서 한 번 더 판정한다.
  if (!canEditPost(viewer, post)) redirect(`/posts/${post.id}`);

  const files = await listPostFiles(post.id);

  return (
    <>
      <h1 className="mb-4 border-b-2 border-gray-700 pb-2 text-lg font-bold text-gray-900">
        글 수정
      </h1>
      <PostForm
        postId={post.id}
        initialTitle={post.title}
        initialTopic={post.topic}
        initialContent={sanitizePostDoc(post.content)}
        initialFiles={files}
        cancelHref={`/posts/${post.id}`}
      />
    </>
  );
}

export const dynamic = "force-dynamic";
