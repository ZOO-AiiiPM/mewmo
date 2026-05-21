import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Cmd/Ctrl + 点击链接 → 用系统默认浏览器打开
 *
 * 在编辑器里直接 click 会被 codemirror 当成"放置光标"——
 * 所以我们用 modifier 区分：按住 Cmd（macOS）/ Ctrl 才打开。
 */
function findUrlAt(view: EditorView, pos: number): string | null {
  const tree = syntaxTree(view.state);
  const cursor = tree.cursorAt(pos, 1);
  // 从命中节点往上爬，找到 URL / Autolink / Link 节点
  do {
    const name = cursor.name;
    if (name === 'URL' || name === 'Autolink') {
      let text = view.state.doc.sliceString(cursor.from, cursor.to);
      // CommonMark autolink 会把尖括号包进 Autolink 节点
      if (text.startsWith('<') && text.endsWith('>')) {
        text = text.slice(1, -1);
      }
      return text;
    }
    if (name === 'Link') {
      // [text](url) → 找子节点 URL
      const sub = cursor.node.getChild('URL');
      if (sub) {
        return view.state.doc.sliceString(sub.from, sub.to);
      }
    }
  } while (cursor.parent());
  return null;
}

export const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!(event.metaKey || event.ctrlKey)) return false;
    if (event.button !== 0) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const url = findUrlAt(view, pos);
    if (!url) return false;
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return false;
    event.preventDefault();
    openUrl(url).catch(err => console.error('open url failed:', err));
    return true;
  },
});
