/**
 * 본문으로 들어온 값을 우리가 아는 모양으로만 남긴다.
 *
 * 모르는 노드·마크·속성은 조용히 버린다. 그래서 본문으로 스크립트가 들어올 길이 없다.
 * 클라이언트가 보낸 것은 무엇도 그대로 믿지 않는다.
 */
import {
  ALLOWED_ALIGNMENTS,
  ALLOWED_FONT_SIZES,
  EMPTY_DOC,
  type FontSize,
  type PostDoc,
  type PostMark,
  type PostNode,
  type TextAlign,
} from "./types";

/** 사진은 이 사이트가 내려주는 주소일 때만 그린다. 외부 주소·data: 는 거부. */
const IMAGE_SRC_RE =
  /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const COLOR_RE = /^#[0-9a-f]{6}$/;

/** 너무 깊거나 너무 큰 본문을 막는다 */
const MAX_DEPTH = 10;
const MAX_NODES = 5000;
const MAX_TEXT_LENGTH = 200_000;

type Ctx = { nodes: number; textLength: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeMarks(input: unknown): PostMark[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const marks: PostMark[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;
    const attrs = isRecord(raw.attrs) ? raw.attrs : {};

    switch (raw.type) {
      case "bold":
      case "italic":
      case "underline":
        marks.push({ type: raw.type });
        break;

      case "link": {
        const href = typeof attrs.href === "string" ? attrs.href.trim() : "";
        // http · https 로 시작하는 것만 허용한다
        if (/^https?:\/\//i.test(href)) {
          marks.push({ type: "link", attrs: { href } });
        }
        break;
      }

      case "textStyle": {
        const style: { color?: string; fontSize?: FontSize } = {};

        if (typeof attrs.color === "string") {
          const color = attrs.color.trim().toLowerCase();
          if (COLOR_RE.test(color)) style.color = color;
        }

        if (typeof attrs.fontSize === "string") {
          const size = attrs.fontSize.trim().toLowerCase();
          if ((ALLOWED_FONT_SIZES as readonly string[]).includes(size)) {
            style.fontSize = size as FontSize;
          }
        }

        if (style.color || style.fontSize) {
          marks.push({ type: "textStyle", attrs: style });
        }
        break;
      }

      default:
        // 모르는 마크는 버린다
        break;
    }
  }

  return marks.length > 0 ? marks : undefined;
}

function sanitizeNodes(input: unknown, depth: number, ctx: Ctx): PostNode[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];

  const out: PostNode[] = [];

  for (const raw of input) {
    if (ctx.nodes >= MAX_NODES) break;
    if (!isRecord(raw)) continue;
    ctx.nodes += 1;

    const attrs = isRecord(raw.attrs) ? raw.attrs : {};

    switch (raw.type) {
      case "text": {
        if (typeof raw.text !== "string" || raw.text === "") break;
        const remaining = MAX_TEXT_LENGTH - ctx.textLength;
        if (remaining <= 0) break;
        const text = raw.text.slice(0, remaining);
        ctx.textLength += text.length;
        out.push({ type: "text", text, marks: sanitizeMarks(raw.marks) });
        break;
      }

      case "hardBreak":
        out.push({ type: "hardBreak" });
        break;

      case "image": {
        const src = typeof attrs.src === "string" ? attrs.src.trim() : "";
        if (!IMAGE_SRC_RE.test(src)) break;
        const alt = typeof attrs.alt === "string" ? attrs.alt.slice(0, 200) : undefined;
        out.push({ type: "image", attrs: alt ? { src, alt } : { src } });
        break;
      }

      case "paragraph": {
        const align =
          typeof attrs.textAlign === "string" &&
          (ALLOWED_ALIGNMENTS as readonly string[]).includes(attrs.textAlign)
            ? (attrs.textAlign as TextAlign)
            : undefined;
        const content = sanitizeNodes(raw.content, depth + 1, ctx);
        out.push({
          type: "paragraph",
          ...(align && align !== "left" ? { attrs: { textAlign: align } } : {}),
          ...(content.length > 0 ? { content } : {}),
        });
        break;
      }

      case "bulletList":
      case "orderedList":
      case "listItem":
      case "blockquote": {
        const content = sanitizeNodes(raw.content, depth + 1, ctx);
        if (content.length === 0) break;
        out.push({ type: raw.type, content });
        break;
      }

      default:
        // 모르는 노드는 버린다
        break;
    }
  }

  return out;
}

/** 저장 전·화면에 그리기 전 양쪽에서 쓴다. */
export function sanitizePostDoc(input: unknown): PostDoc {
  if (!isRecord(input) || input.type !== "doc") return EMPTY_DOC;

  const ctx: Ctx = { nodes: 0, textLength: 0 };
  const content = sanitizeNodes(input.content, 1, ctx);

  return content.length > 0 ? { type: "doc", content } : EMPTY_DOC;
}

/** 검색용으로 글자만 뽑는다 (web_posts.content_text) */
export function extractText(doc: PostDoc): string {
  const parts: string[] = [];

  const walk = (nodes: PostNode[] | undefined) => {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "text") parts.push(node.text);
      else if (node.type === "hardBreak") parts.push("\n");
      else if ("content" in node) walk(node.content);
    }
    };

  walk(doc.content);
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

/** 본문에 실제로 쓰인 사진 id 목록 — 글 저장 때 post_id 를 채우는 데 쓴다 */
export function collectImageIds(doc: PostDoc): string[] {
  const ids = new Set<string>();

  const walk = (nodes: PostNode[] | undefined) => {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "image") {
        const id = node.attrs.src.slice("/api/images/".length);
        ids.add(id);
      } else if ("content" in node) {
        walk(node.content);
      }
    }
  };

  walk(doc.content);
  return [...ids];
}

/** 본문이 사실상 비어 있는가 (글자도 사진도 없는가) */
export function isEmptyDoc(doc: PostDoc): boolean {
  if (extractText(doc).length > 0) return false;
  return collectImageIds(doc).length === 0;
}
