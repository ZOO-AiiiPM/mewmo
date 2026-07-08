import {
  parseSharedNoteMarkdown,
  type SharedNoteMarkdownBlock,
  type SharedNoteMarkdownInline,
} from "../../lib/shared-note-markdown";

export function SharedNoteMarkdown({ content }: { content: string }) {
  const blocks = parseSharedNoteMarkdown(content.trim());

  if (blocks.length === 0) {
    return <p className="mewmo-clip-prose__empty">这条笔记没有正文。</p>;
  }

  return (
    <div className="mewmo-clip-prose mewmo-shared-note-markdown">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: SharedNoteMarkdownBlock, index: number) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={index}>{renderInline(block.children)}</Tag>;
    }
    case "paragraph":
      return <p key={index}>{renderInline(block.children)}</p>;
    case "blockquote":
      return (
        <blockquote key={index}>
          <p>{renderInline(block.children)}</p>
        </blockquote>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre key={index}>
          <code>{block.code}</code>
        </pre>
      );
    case "image":
      return <img key={index} src={block.src} alt={block.alt} loading="lazy" />;
    case "table":
      return (
        <table key={index}>
          <thead>
            <tr>
              {block.headers.map((cell, cellIndex) => (
                <th key={cellIndex}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

function renderInline(items: SharedNoteMarkdownInline[]) {
  return items.map((item, index) => {
    switch (item.type) {
      case "text":
        return item.value;
      case "strong":
        return <strong key={index}>{renderInline(item.children)}</strong>;
      case "emphasis":
        return <em key={index}>{renderInline(item.children)}</em>;
      case "code":
        return <code key={index}>{item.value}</code>;
      case "link":
        return (
          <a key={index} href={item.href} target="_blank" rel="noreferrer">
            {renderInline(item.children)}
          </a>
        );
      case "image":
        return <img key={index} src={item.src} alt={item.alt} loading="lazy" />;
    }
  });
}
