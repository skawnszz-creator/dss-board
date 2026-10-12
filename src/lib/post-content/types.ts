/**
 * 서식 본문의 저장 형태 (요구사항 4).
 *
 * HTML 문자열이 아니라 구조화된 문서로 저장한다.
 * 화면에 그릴 때 **우리가 아는 노드만** React 요소로 바꾸므로
 * dangerouslySetInnerHTML 을 쓸 일이 없다.
 */

/** 글자 크기 — 이 목록에 있는 값만 허용한다 */
export const ALLOWED_FONT_SIZES = [
  "12px",
  "14px",
  "16px",
  "18px",
  "24px",
  "32px",
] as const;
export type FontSize = (typeof ALLOWED_FONT_SIZES)[number];

/** 글자 정렬 */
export const ALLOWED_ALIGNMENTS = ["left", "center", "right"] as const;
export type TextAlign = (typeof ALLOWED_ALIGNMENTS)[number];

export type PostMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "link"; attrs: { href: string } }
  | { type: "textStyle"; attrs: { color?: string; fontSize?: FontSize } };

export type PostNode =
  | { type: "text"; text: string; marks?: PostMark[] }
  | { type: "hardBreak" }
  | { type: "image"; attrs: { src: string; alt?: string; width?: number } }
  | {
      type: "paragraph";
      attrs?: { textAlign?: TextAlign };
      content?: PostNode[];
    }
  | { type: "bulletList"; content?: PostNode[] }
  | { type: "orderedList"; content?: PostNode[] }
  | { type: "listItem"; content?: PostNode[] }
  | { type: "blockquote"; content?: PostNode[] };

/** 사진 너비(px). 높이는 저장하지 않고 화면에서 비율대로 맞춘다. */
export const IMAGE_MIN_WIDTH = 50;
export const IMAGE_MAX_WIDTH = 2000;

export type PostDoc = { type: "doc"; content: PostNode[] };

/** 빈 본문 */
export const EMPTY_DOC: PostDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** 글자만으로 간단한 본문을 만든다 (시드·테스트용) */
export function paragraphsDoc(lines: string[]): PostDoc {
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph" as const,
      content: line ? [{ type: "text" as const, text: line }] : undefined,
    })),
  };
}
