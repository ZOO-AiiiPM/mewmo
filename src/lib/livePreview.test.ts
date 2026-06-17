// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { getImageDeleteBackwardRange, getTaskToggleChanges, toggleTask } from './livePreview';

function applyTaskToggle(docText: string, from: number, to = from) {
  const state = EditorState.create({ doc: docText });
  const changes = getTaskToggleChanges(state.doc, { from, to });
  return state.update({ changes }).state.doc.toString();
}

describe('getTaskToggleChanges', () => {
  test('adds an unchecked task marker to an empty line', () => {
    expect(applyTaskToggle('', 0)).toBe('- [ ] ');
  });

  test('adds an unchecked task marker before plain text', () => {
    expect(applyTaskToggle('hello', 5)).toBe('- [ ] hello');
  });

  test('normalizes a misplaced trailing task marker', () => {
    expect(applyTaskToggle('hello- [ ] ', 10)).toBe('- [ ] hello');
  });

  test('removes an unchecked task marker from a task line', () => {
    expect(applyTaskToggle('- [ ] hello', 10)).toBe('hello');
  });

  test('toggles every selected line in a multiline selection', () => {
    expect(applyTaskToggle('hello\nworld', 0, 11)).toBe('- [ ] hello\n- [ ] world');
    expect(applyTaskToggle('- [ ] hello\n- [ ] world', 0, 23)).toBe('hello\nworld');
  });
});

describe('toggleTask', () => {
  test('places the cursor after a new empty task marker before the next input', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: '', selection: { anchor: 0 } }),
      parent,
    });

    try {
      toggleTask(view);

      const head = view.state.selection.main.head;
      view.dispatch({ changes: { from: head, to: head, insert: '看' } });

      expect(view.state.doc.toString()).toBe('- [ ] 看');
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});

describe('getImageDeleteBackwardRange', () => {
  function rangeAt(docText: string, pos: number) {
    const state = EditorState.create({ doc: docText });
    return getImageDeleteBackwardRange(state.doc, pos);
  }

  test('cursor right after an inline image returns the whole image range', () => {
    const doc = '![](a.png)';
    expect(rangeAt(doc, doc.length)).toEqual({ from: 0, to: doc.length });
  });

  test('matches the Obsidian width syntax ![alt|width](src)', () => {
    const doc = '![cat|260](attachments/x.png)';
    expect(rangeAt(doc, doc.length)).toEqual({ from: 0, to: doc.length });
  });

  test('image preceded by text on the same line returns range from the image start', () => {
    const doc = 'see ![](a.png)';
    expect(rangeAt(doc, doc.length)).toEqual({ from: 4, to: doc.length });
  });

  test('cursor at start of the line below a pure-image line deletes image plus newline', () => {
    const doc = '![](a.png)\nX';
    const line2Start = 11; // after '![](a.png)\n'
    expect(rangeAt(doc, line2Start)).toEqual({ from: 0, to: line2Start });
  });

  test('returns null when the previous line has text after the image', () => {
    const doc = '![](a.png) tail\nX';
    const line2Start = 16;
    expect(rangeAt(doc, line2Start)).toBeNull();
  });

  test('returns null when the cursor is after plain text', () => {
    expect(rangeAt('hello', 5)).toBeNull();
  });

  test('returns null when the cursor is not at the image boundary', () => {
    const doc = '![](a.png)extra';
    expect(rangeAt(doc, doc.length)).toBeNull();
  });
});
