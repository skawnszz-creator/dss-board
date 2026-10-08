import { PostForm } from "@/components/post-form";
import { requireSession } from "@/lib/auth/guards";
import { EMPTY_DOC } from "@/lib/post-content/types";

export default async function NewPostPage() {
  // 임직원 누구나 글을 쓸 수 있다 (요구사항 2)
  await requireSession("/posts/new");

  return (
    <>
      <h1 className="mb-4 border-b-2 border-gray-700 pb-2 text-lg font-bold text-gray-900">
        글쓰기
      </h1>
      <PostForm
        initialTitle=""
        initialTopic="GENERAL"
        initialContent={EMPTY_DOC}
        initialFiles={[]}
        cancelHref="/"
      />
    </>
  );
}
