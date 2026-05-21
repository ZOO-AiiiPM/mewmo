import { EditorView } from '@codemirror/view';
import { uploadImage, isImageFile } from './attachments';

function insertAtCursor(view: EditorView, text: string) {
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
  });
}

export async function uploadAndInsert(view: EditorView, files: File[] | FileList) {
  const list = Array.from(files);
  for (const file of list) {
    if (!isImageFile(file)) continue;
    try {
      const path = await uploadImage(file);
      insertAtCursor(view, `\n![](${path})\n`);
    } catch (e) {
      console.error('upload image failed:', e);
    }
  }
}

/** CodeMirror extension：粘贴 / 拖拽图片 → 上传 → 在光标处插入 markdown */
export const imagePasteDrop = EditorView.domEventHandlers({
  paste(event, view) {
    const items = event.clipboardData?.items;
    if (!items) return false;
    const images: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length === 0) return false;
    event.preventDefault();
    uploadAndInsert(view, images);
    return true;
  },
  drop(event, view) {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;
    const images = Array.from(files).filter(isImageFile);
    if (images.length === 0) return false;
    event.preventDefault();
    uploadAndInsert(view, images);
    return true;
  },
});
