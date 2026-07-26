"use client";

import { useMemo, type ReactNode } from "react";

import {
  parseSharedNoteMarkdown,
  type SharedNoteMarkdownBlock,
  type SharedNoteMarkdownInline,
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

function renderBlock(block: SharedNoteMarkdownBlock, index: number): ReactNode {
  switch (block.type) {
    case "heading":
      return <strong key={index} className="mewmo-md__heading">{renderInline(block.children)}</strong>;
    case "paragraph":
      return <p key={index} className="mewmo-md__paragraph">{renderInline(block.children)}</p>;
    case "blockquote":
      return <blockquote key={index} className="mewmo-md__quote">{renderInline(block.children)}</blockquote>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return <Tag key={index} className={`mewmo-md__list ${block.ordered ? "mewmo-md__list--ordered" : ""}`}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</Tag>;
    }
    case "code":
      return <pre key={index} className="mewmo-md__code-block"><code>{block.code}</code></pre>;
    case "image":
      return <img key={index} className="mewmo-md__image" src={block.src} alt={block.alt} loading="lazy" />;
    case "table":
      return (
        <div key={index} className="mewmo-md__table-wrap">
          <table><thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody></table>
        </div>
      );
  }
}

function renderInline(items: SharedNoteMarkdownInline[]): ReactNode {
  return items.map((item, index) => {
    switch (item.type) {
      case "text": return item.value;
      case "strong": return <strong key={index}>{renderInline(item.children)}</strong>;
      case "emphasis": return <em key={index}>{renderInline(item.children)}</em>;
      case "code": return <code key={index} className="mewmo-md__inline-code">{item.value}</code>;
      case "link": return <a key={index} href={item.href} target="_blank" rel="noopener noreferrer">{renderInline(item.children)}</a>;
      case "image": return <img key={index} className="mewmo-md__inline-image" src={item.src} alt={item.alt} loading="lazy" />;
    }
  });
}
