import type { CSSProperties, ReactNode } from "react";

import { sanitizePostDoc } from "@/lib/post-content/sanitize";
import type { PostNode } from "@/lib/post-content/types";

/**
 * 저장된 본문을 화면에 그린다.
 *
 * **dangerouslySetInnerHTML 을 쓰지 않는다.**
 * 우리가 아는 노드만 React 요소로 바꾸므로 본문으로 스크립트가 들어올 길이 없다.
 * 그리기 전에 한 번 더 걸러낸다 (저장 당시의 규칙이 지금과 다를 수 있다).
 */
function renderText(
  node: Extract<PostNode, { type: "text" }>,
  key: string,
): ReactNode {
  let element: ReactNode = node.text;
  const style: CSSProperties = {};
  let href: string | null = null;

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "underline":
        element = <u>{element}</u>;
        break;
      case "textStyle":
        if (mark.attrs.color) style.color = mark.attrs.color;
        if (mark.attrs.fontSize) style.fontSize = mark.attrs.fontSize;
        break;
      case "link":
        href = mark.attrs.href;
        break;
    }
  }

  if (Object.keys(style).length > 0) {
    element = <span style={style}>{element}</span>;
  }
  if (href) {
    element = (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {element}
      </a>
    );
  }

  return <span key={key}>{element}</span>;
}

function renderNodes(nodes: PostNode[] | undefined): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, index) => renderNode(node, String(index)));
}

function renderNode(node: PostNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);

    case "hardBreak":
      return <br key={key} />;

    case "image":
      return (
        // 사진은 /api/images/{id} 로만 내려오고, 서버가 종류를 검사해 둔 것이다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          // 화면보다 넓으면 globals.css 의 max-width:100% 가 줄여 준다
          style={node.attrs.width ? { width: node.attrs.width } : undefined}
        />
      );

    case "paragraph": {
      const align = node.attrs?.textAlign;
      return (
        <p key={key} style={align ? { textAlign: align } : undefined}>
          {renderNodes(node.content)}
        </p>
      );
    }

    case "bulletList":
      return <ul key={key}>{renderNodes(node.content)}</ul>;

    case "orderedList":
      return <ol key={key}>{renderNodes(node.content)}</ol>;

    case "listItem":
      return <li key={key}>{renderNodes(node.content)}</li>;

    case "blockquote":
      return <blockquote key={key}>{renderNodes(node.content)}</blockquote>;
  }
}

export function PostContent({ content }: { content: unknown }) {
  const doc = sanitizePostDoc(content);
  return <div className="post-body">{renderNodes(doc.content)}</div>;
}
