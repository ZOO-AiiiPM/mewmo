// @vitest-environment happy-dom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { getTaskToggleChanges, toggleTask } from './livePreview';

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
