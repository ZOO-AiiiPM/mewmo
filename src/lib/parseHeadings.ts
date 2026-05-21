export type Heading = {
  level: number; // 1-6
  text: string;
  line: number; // 1-indexed
};

/** 从 markdown 文本里解析 ATX heading，跳过 ``` 代码块内的 # */
export function parseHeadings(md: string): Heading[] {
  const lines = md.split('\n');
  const out: Heading[] = [];
  let inCodeBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l.trim())) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = l.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      out.push({ level: m[1].length, text: m[2], line: i + 1 });
    }
  }
  return out;
}
