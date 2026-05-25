type SanitizeMode = 'rich' | 'highlight';

const RICH_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's',
  'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr',
  'u', 'ul',
]);
const HIGHLIGHT_TAGS = new Set(['mark']);
const DROP_WITH_CONTENT = new Set([
  'base', 'embed', 'iframe', 'link', 'meta', 'object', 'script', 'style',
  'svg', 'math',
]);
const STYLE_PROPS = new Set([
  'background', 'background-color', 'color', 'font-style', 'font-weight',
  'text-align', 'text-decoration',
]);

export function sanitizeHtml(html: string, mode: SanitizeMode = 'rich'): string {
  if (!html) return '';

  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeChildren(template.content, mode);
  return template.innerHTML;
}

function sanitizeChildren(parent: ParentNode, mode: SanitizeMode) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const allowed = mode === 'highlight' ? HIGHLIGHT_TAGS : RICH_TAGS;

    if (DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      continue;
    }

    sanitizeChildren(el, mode);

    if (!allowed.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }

    sanitizeElement(el, tag, mode);
  }
}

function sanitizeElement(el: HTMLElement, tag: string, mode: SanitizeMode) {
  const attrs = new Map(Array.from(el.attributes).map(attr => [attr.name.toLowerCase(), attr.value]));
  for (const attr of Array.from(el.attributes)) {
    el.removeAttribute(attr.name);
  }

  if (mode === 'highlight') return;

  const title = attrs.get('title');
  if (title) el.setAttribute('title', title);

  if (tag === 'a') {
    const href = safeUrl(attrs.get('href') ?? '', false);
    if (href) {
      el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noreferrer noopener');
    }
  }

  if (tag === 'img') {
    const src = safeUrl(attrs.get('src') ?? '', true);
    if (!src) {
      el.remove();
      return;
    }
    el.setAttribute('src', src);
    el.setAttribute('alt', attrs.get('alt') ?? '');
    el.setAttribute('loading', 'lazy');
    el.setAttribute('referrerpolicy', 'no-referrer');
  }

  const style = sanitizeStyle(attrs.get('style') ?? '');
  if (style) el.setAttribute('style', style);
}

function safeUrl(raw: string, image: boolean): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('#')) return value;
  if (image && /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(value)) {
    return value;
  }

  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    if (!image && (url.protocol === 'mailto:' || url.protocol === 'tel:')) return url.href;
    if (image && (url.protocol === 'asset:' || url.protocol === 'blob:')) return value;
  } catch {
    return null;
  }
  return null;
}

function sanitizeStyle(style: string): string {
  const safe: string[] = [];
  for (const chunk of style.split(';')) {
    const [rawProp, ...rest] = chunk.split(':');
    if (!rawProp || rest.length === 0) continue;
    const prop = rawProp.trim().toLowerCase();
    const value = rest.join(':').trim();
    const lower = value.toLowerCase();

    if (!STYLE_PROPS.has(prop)) continue;
    if (
      lower.includes('expression(') ||
      lower.includes('javascript:') ||
      lower.includes('url(') ||
      /[<>"\\]/.test(value)
    ) {
      continue;
    }
    safe.push(`${prop}: ${value}`);
  }
  return safe.join('; ');
}
