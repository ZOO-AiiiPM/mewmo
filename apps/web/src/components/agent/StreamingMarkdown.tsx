"use client";

import { useMemo, type ReactNode } from "react";

import {
  buildSharedNoteListTree,
  parseSharedNoteMarkdown,
  type SharedNoteMarkdownBlock,
  type SharedNoteMarkdownInline,
  type SharedNoteMarkdownListNode,
} from "../../lib/shared-note-markdown";

interface StreamingMarkdownProps {
  content: string;
  streaming?: boolean;
}

export function StreamingMarkdown({ content, streaming }: StreamingMarkdownProps) {
  const blocks = useMemo(() => parseSharedNoteMarkdown(content), [content]);

  return (
    <div className={`mewmo-md ${streaming ? "mewmo-md--streaming" : ""}`}>
      {blocks.map(renderBlock)}
      {streaming && <span className="mewmo-md__cursor" aria-hidden="true" />}
    </div>
  );
}

/** Map markdown heading level onto the transcript type scale (h3/h4/h5). */
function headingTier(level: number): 1 | 2 | 3 {
  if (level <= 1) return 1;
  if (level === 2) return 2;
  return 3;
}

function renderBlock(block: SharedNoteMarkdownBlock, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const tier = headingTier(block.level);
      const Tag = tier === 1 ? "h3" : tier === 2 ? "h4" : "h5";
      return <Tag key={index} className={`mewmo-md__heading mewmo-md__heading--${tier}`}>{renderInline(block.children)}</Tag>;
    }
    case "paragraph":
      return <p key={index} className="mewmo-md__paragraph">{renderInline(block.children)}</p>;
    case "blockquote":
      return <blockquote key={index} className="mewmo-md__quote">{renderInline(block.children)}</blockquote>;
    case "list":
      return <ListNodes key={index} nodes={buildSharedNoteListTree(block.items)} ordered={block.ordered} />;
    case "code":
      return <pre key={index} className="mewmo-md__code-block"><code>{block.code}</code></pre>;
    case "image":
      return <img key={index} className="mewmo-md__image" src={block.src} alt={block.alt} loading="lazy" />;
    case "divider":
      return <hr key={index} className="mewmo-md__divider" />;
    case "table":
      return (
        <div key={index} className="mewmo-md__table-wrap">
          <table><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody></table>
        </div>
      );
  }
}

function ListNodes({ nodes, ordered }: { nodes: SharedNoteMarkdownListNode[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mewmo-md__list ${ordered ? "mewmo-md__list--ordered" : ""}`}>
      {nodes.map((node, index) => (
        <li key={index} className={node.item.task ? "mewmo-md__task" : undefined}>
          {node.item.task && (
            <input
              type="checkbox"
              className="mewmo-md__task-box"
              checked={node.item.task === "checked"}
              readOnly
              disabled
              aria-hidden="true"
              tabIndex={-1}
            />
          )}
          {renderInline(node.item.children)}
          {node.children.length > 0 && <ListNodes nodes={node.children} ordered={ordered} />}
        </li>
      ))}
    </Tag>
  );
}

function renderInline(items: SharedNoteMarkdownInline[]): ReactNode {
  return items.map((item, index) => {
    switch (item.type) {
      case "text": return item.value;
      case "strong": return <strong key={index}>{renderInline(item.children)}</strong>;
      case "emphasis": return <em key={index}>{renderInline(item.children)}</em>;
      case "strikethrough": return <del key={index}>{renderInline(item.children)}</del>;
      case "code": return <code key={index} className="mewmo-md__inline-code">{item.value}</code>;
      case "link": return <a key={index} href={item.href} target="_blank" rel="noopener noreferrer">{renderInline(item.children)}</a>;
      case "image": return <img key={index} className="mewmo-md__inline-image" src={item.src} alt={item.alt} loading="lazy" />;
    }
  });
}
