import { TOPIC_LABELS } from "@/lib/labels";
import type { PostTopic } from "@/lib/codes";

const STYLES: Record<PostTopic, string> = {
  MUST_READ: "border-red-200 bg-red-50 text-red-700",
  NOTICE: "border-blue-200 bg-blue-50 text-blue-700",
  GENERAL: "border-gray-200 bg-gray-50 text-gray-600",
};

export function TopicBadge({ topic }: { topic: PostTopic }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs leading-none ${STYLES[topic]}`}
    >
      {TOPIC_LABELS[topic]}
    </span>
  );
}
