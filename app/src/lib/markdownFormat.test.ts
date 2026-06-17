import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { getHeadingToggleChanges, getLinePrefixToggleChanges } from './markdownFormat';

function applyHeading(docText: string, from: number, to: number, level: number) {
  const state = EditorState.create({ doc: docText });
  const changes = getHeadingToggleChanges(state.doc, { from, to }, level);
  return state.update({ changes }).state.doc.toString();
}

function applyPrefix(docText: string, from: number, to: number, mode: 'quote' | 'bullet' | 'ordered') {
  const state = EditorState.create({ doc: docText });
  const changes = getLinePrefixToggleChanges(state.doc, { from, to }, mode);
  return state.update({ changes }).state.doc.toString();
}

describe('getHeadingToggleChanges', () => {
  test('adds a heading marker to a plain line', () => {
    expect(applyHeading('hello', 5, 5, 2)).toBe('## hello');
  });

  test('changes an existing heading level', () => {
    expect(applyHeading('# hello', 3, 3, 3)).toBe('### hello');
  });

  test('removes the heading marker when the same level is toggled', () => {
    expect(applyHeading('### hello', 5, 5, 3)).toBe('hello');
  });

  test('formats every selected line', () => {
    expect(applyHeading('one\ntwo', 0, 7, 1)).toBe('# one\n# two');
  });
});

describe('getLinePrefixToggleChanges', () => {
  test('adds and removes blockquote markers', () => {
    expect(applyPrefix('hello', 0, 0, 'quote')).toBe('> hello');
    expect(applyPrefix('> hello', 0, 0, 'quote')).toBe('hello');
  });

  test('adds bullet markers to multiple selected lines', () => {
    expect(applyPrefix('one\ntwo', 0, 7, 'bullet')).toBe('- one\n- two');
  });

  test('removes bullet markers when every selected line already has one', () => {
    expect(applyPrefix('- one\n- two', 0, 11, 'bullet')).toBe('one\ntwo');
  });

  test('adds ordered markers with line numbers', () => {
    expect(applyPrefix('one\ntwo', 0, 7, 'ordered')).toBe('1. one\n2. two');
  });
});
